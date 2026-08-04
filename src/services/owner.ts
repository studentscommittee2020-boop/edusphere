import { supabase } from "@/lib/supabase";
import type { AuditLog, ImpersonationSession, Profile, TelemetryEvent } from "@/types/database";

/**
 * Owner-only data access.
 *
 * None of this is enforced here — every call below is an ordinary PostgREST
 * request, and it succeeds only because migration 009 grants the owner an
 * unconditional ALL policy on each table. A non-owner calling these gets an
 * empty result or a permission error from the database, which is the point:
 * the client is never the thing standing between a user and the data.
 *
 * Every owner write fires the audit_owner_write trigger, which records the full
 * before/after row. That trail is append-only and the owner cannot edit it.
 */

/**
 * Tables the console can browse. audit_logs and exam_download_events are
 * read-only by design (see WRITABLE below). impersonation_sessions is
 * deliberately NOT included here at all — migration 012 excludes it from
 * grant_owner_full_access entirely (no owner FOR ALL policy, no INSERT/
 * UPDATE/DELETE grant for anyone), the same accountability-trail treatment
 * audit_logs gets, so it must stay unreachable from this generic browser
 * rather than merely read-only.
 */
export const OWNER_TABLES = [
  "profiles",
  "courses",
  "previous_exams",
  "entrance_exams",
  "events",
  "event_registrations",
  "favorites",
  "print_documents",
  "assignments",
  "assignment_submissions",
  "course_materials",
  "student_enrollments",
  "schedule_entries",
  "academic_sync_state",
  "telemetry_events",
  "admin_emails",
  "audit_logs",
  "doctor_courses",
  "exam_submissions",
  "exam_reports",
  "exam_download_events",
] as const;

export type OwnerTable = (typeof OWNER_TABLES)[number];

/**
 * Tables the owner may mutate from the console. audit_logs is the
 * accountability trail itself. exam_download_events is an append-only
 * download-quota ledger — migration 011 caps its table GRANT at SELECT for
 * every role including the owner (no INSERT/UPDATE/DELETE grant exists at
 * all), so it stays tamper-proof even here; RLS's owner FOR ALL policy on it
 * is unreachable through that ceiling regardless of what this set says, but
 * excluding it keeps the console's own read-only labeling honest.
 */
const WRITABLE: ReadonlySet<string> = new Set(
  OWNER_TABLES.filter((table) => table !== "audit_logs" && table !== "exam_download_events"),
);

export function isWritable(table: OwnerTable): boolean {
  return WRITABLE.has(table);
}

// ── Accounts ─────────────────────────────────────────────────────────────────

export async function getAllProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  return { data: (data ?? []) as Profile[], error };
}

export async function setProfileRole(userId: string, role: Profile["role"]) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select()
    .single();
  return { data: data as Profile | null, error };
}

export async function updateProfileAsOwner(userId: string, updates: Partial<Profile>) {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();
  return { data: data as Profile | null, error };
}

/**
 * Deletes the profile row. The auth.users row is NOT removed — that requires
 * the service role and is deliberately out of reach of a browser session.
 */
export async function deleteProfile(userId: string) {
  const { error } = await supabase.from("profiles").delete().eq("id", userId);
  return { error };
}

// ── "View as" ────────────────────────────────────────────────────────────────

export interface AccountSnapshot {
  profile: Profile | null;
  enrollments: number;
  scheduleEntries: number;
  submissions: number;
  favorites: number;
  lastSyncedAt: string | null;
}

/**
 * Everything the owner can see about one account, without assuming that
 * account's identity. This is inspection, not impersonation: no token is
 * minted and no action can be taken as the user.
 */
export async function getAccountSnapshot(userId: string): Promise<AccountSnapshot> {
  const [profile, enrollments, schedule, submissions, favorites, syncState] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("student_enrollments")
        .select("*", { count: "exact", head: true })
        .eq("student_id", userId),
      supabase
        .from("schedule_entries")
        .select("*", { count: "exact", head: true })
        .eq("student_id", userId),
      supabase
        .from("assignment_submissions")
        .select("*", { count: "exact", head: true })
        .eq("student_id", userId),
      supabase
        .from("favorites")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("academic_sync_state")
        .select("last_synced_at")
        .eq("student_id", userId)
        .maybeSingle(),
    ]);

  return {
    profile: (profile.data as Profile | null) ?? null,
    enrollments: enrollments.count ?? 0,
    scheduleEntries: schedule.count ?? 0,
    submissions: submissions.count ?? 0,
    favorites: favorites.count ?? 0,
    lastSyncedAt: syncState.data?.last_synced_at ?? null,
  };
}

// ── "Act as" (impersonation) ────────────────────────────────────────────────
//
// Distinct from "View as" above: getAccountSnapshot() reads without minting
// anything. The three RPCs below (migration 012, section 1) mint a real,
// time-boxed (30 min) session — while one is active, effective_user_id()
// swaps the acting identity for RPCs that call it, and every write the audit
// triggers see is cross-referenced against both identities via
// impersonated_by (audit_portal_change()/audit_owner_write()). All three are
// SECURITY DEFINER; impersonation_sessions itself has no owner grant at all
// (see OWNER_TABLES' comment above) — these RPCs are the only door in or out.

/**
 * Starts (or replaces) the calling owner's impersonation session. Owner-only
 * and target-must-exist are enforced server-side; `reason` is re-validated
 * there too (NOT NULL, 3–500 chars after trim) — the 3–500 check here is
 * only for a fast client-side message, never the real gate.
 */
export async function startImpersonation(targetUserId: string, reason: string) {
  const { data, error } = await supabase.rpc("start_impersonation", {
    p_target_user_id: targetUserId,
    p_reason: reason,
  });
  return { data: data as ImpersonationSession | null, error };
}

/** Idempotent — safe to call with nothing active (the RPC just no-ops). */
export async function endImpersonation() {
  const { error } = await supabase.rpc("end_impersonation");
  return { error };
}

/**
 * The calling owner's active, non-expired session, or null if none.
 * current_impersonation() is a non-SETOF SQL function over a bare
 * `SELECT ... LIMIT 1` — Postgres returns NULL when that query matches no
 * row, so `data: null, error: null` is the normal "nothing active" answer,
 * not a failure.
 */
export async function getCurrentImpersonation() {
  const { data, error } = await supabase.rpc("current_impersonation");
  return { data: data as ImpersonationSession | null, error };
}

/**
 * Resolves the impersonated target's profile for display (name in the
 * banner/console). Plain read through the owner's existing bypass — not
 * part of the RPC contract above.
 */
export async function getImpersonationTargetProfile(targetUserId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", targetUserId)
    .maybeSingle();
  return { data: data as Profile | null, error };
}

export interface ActiveImpersonation {
  session: ImpersonationSession;
  targetProfile: Profile | null;
}

/**
 * Convenience for callers (the banner) that need both the active session and
 * its target's profile. Deliberately sequential, not Promise.all'd — the
 * profile lookup depends on the session's target_user_id, so there is
 * nothing to parallelise until the first call resolves.
 */
export async function getActiveImpersonation(): Promise<{
  data: ActiveImpersonation | null;
  error: unknown;
}> {
  const { data: session, error } = await getCurrentImpersonation();
  if (error || !session) return { data: null, error };

  const { data: targetProfile } = await getImpersonationTargetProfile(session.target_user_id);
  return { data: { session, targetProfile }, error: null };
}

// ── Generic table browser ────────────────────────────────────────────────────

export interface TablePage {
  rows: Record<string, unknown>[];
  total: number;
}

export async function browseTable(
  table: OwnerTable,
  page = 0,
  pageSize = 50,
): Promise<{ data: TablePage; error: unknown }> {
  const from = page * pageSize;

  const { data, error, count } = await supabase
    // The union of table names is wider than any single PostgREST overload;
    // the runtime call is a plain string either way.
    .from(table as never)
    .select("*", { count: "exact" })
    .range(from, from + pageSize - 1);

  return {
    data: { rows: (data ?? []) as Record<string, unknown>[], total: count ?? 0 },
    error,
  };
}

export async function deleteRow(table: OwnerTable, id: string) {
  if (!isWritable(table)) {
    return { error: new Error(`${table} is read-only.`) };
  }
  const { error } = await supabase.from(table as never).delete().eq("id", id);
  return { error };
}

export async function updateRow(
  table: OwnerTable,
  id: string,
  updates: Record<string, unknown>,
) {
  if (!isWritable(table)) {
    return { error: new Error(`${table} is read-only.`) };
  }
  const { error } = await supabase.from(table as never).update(updates as never).eq("id", id);
  return { error };
}

// ── Audit + telemetry ────────────────────────────────────────────────────────

export async function getAuditTrail(limit = 200, actorId?: string) {
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (actorId) query = query.eq("actor_id", actorId);

  const { data, error } = await query;
  return { data: (data ?? []) as AuditLog[], error };
}

export async function getRecentTelemetry(limit = 200) {
  const { data, error } = await supabase
    .from("telemetry_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return { data: (data ?? []) as TelemetryEvent[], error };
}

export interface OwnerOverview {
  users: number;
  students: number;
  doctors: number;
  admins: number;
  enrollments: number;
  submissions: number;
  materials: number;
  telemetryEvents: number;
}

export async function getOwnerOverview(): Promise<OwnerOverview> {
  const countOf = async (table: string, filter?: [string, string]) => {
    let query = supabase.from(table as never).select("*", { count: "exact", head: true });
    if (filter) query = query.eq(filter[0], filter[1]);
    const { count } = await query;
    return count ?? 0;
  };

  const [users, students, doctors, admins, enrollments, submissions, materials, telemetryEvents] =
    await Promise.all([
      countOf("profiles"),
      countOf("profiles", ["role", "student"]),
      countOf("profiles", ["role", "doctor"]),
      countOf("profiles", ["role", "admin"]),
      countOf("student_enrollments"),
      countOf("assignment_submissions"),
      countOf("course_materials"),
      countOf("telemetry_events"),
    ]);

  return { users, students, doctors, admins, enrollments, submissions, materials, telemetryEvents };
}
