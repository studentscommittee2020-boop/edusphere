/**
 * Refreshes the signed-in student's schedule and enrolment history from the
 * university API.
 *
 * The file number is required on every call and is held in memory only — it is
 * never written to the database, never logged, and never returned. That is why
 * this cannot be a background job: we deliberately have no stored credential to
 * replay. See docs/UNIVERSITY-API.md.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callUniversity,
  normaliseSemester,
  parseEnrollments,
  parseIdentity,
  parseSchedule,
  UniversityUnavailableError,
  type Semester,
} from "../_shared/university.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidFileNumber(value: string) {
  return /^[A-Za-z0-9/-]{4,40}$/.test(value);
}

/** Falls back to the Sep–Aug academic year containing today. */
function currentAcademicYear(): string {
  const now = new Date();
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error("university_sync_configuration_missing");
    return json({ error: "Sync is not configured yet." }, 503);
  }

  // ── Authenticate the caller ───────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Sign in first." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "Sign in first." }, 401);
  }

  const user = userData.user;
  const email = (user.email ?? "").trim().toLowerCase();
  const isVerifiedStudent = user.app_metadata?.student_verified === true;

  if (!email || !isVerifiedStudent) {
    return json({ error: "Verified student access is required." }, 403);
  }

  // ── Read the request ──────────────────────────────────────────────────────
  let payload: { fileNumber?: unknown; semester?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const fileNumber = typeof payload.fileNumber === "string" ? payload.fileNumber.trim() : "";
  if (!isValidFileNumber(fileNumber)) {
    return json({ error: "Enter your student file number to refresh." }, 400);
  }

  // ── Re-verify, then pull schedule and courses ─────────────────────────────
  try {
    const verifyPayload = await callUniversity("verify", {
      email,
      file_number: fileNumber,
    });

    const verified = verifyPayload.verified === true || verifyPayload.valid === true;
    const canonicalEmail =
      typeof verifyPayload.email === "string" ? verifyPayload.email.trim().toLowerCase() : null;

    if (!verified || (canonicalEmail && canonicalEmail !== email)) {
      console.info("university_sync_verification_denied");
      return json({ error: "We could not verify those student details." }, 403);
    }

    const identity = parseIdentity(verifyPayload);
    const academicYear = identity.academicYear ?? currentAcademicYear();
    // The freshly-verified university identity wins over whatever the client
    // suggested. This used to be the other way around (client hint checked
    // first), which was harmless when the client always sourced its hint
    // from a live re-render of the student's own profile — but see the
    // profile-write comment below: profiles.semester now deliberately stops
    // tracking the university once first set, specifically to stop a routine
    // sync from silently revoking a student's in-progress assignments. If
    // the client kept forwarding that now-frozen value and it were allowed
    // to win here, every *future* sync would keep re-requesting the
    // student's FIRST-EVER semester forever, defeating the sync entirely.
    // identity.semester has no such staleness problem — it is re-verified on
    // every call — so it must take priority. The client hint survives only
    // as a last-resort fallback for the rare response that omits semester
    // entirely.
    const semester: Semester =
      identity.semester ?? normaliseSemester(payload.semester) ?? "LS1";

    const [schedulePayload, coursesPayload] = await Promise.all([
      callUniversity("schedule", {
        email,
        file_number: fileNumber,
        academic_year: academicYear,
        semester,
      }),
      callUniversity("courses", { email, file_number: fileNumber }),
    ]);

    // Business-logic audit fix (defects #1 and #3): computed from the RAW
    // response shape, before parseSchedule()/parseEnrollments() below
    // collapse "the key is missing" and "the key is a genuinely empty array"
    // into the identical `[]`. An `entries`/`courses` array being PRESENT —
    // even empty — means the university positively answered ("you have zero
    // sessions this week"); the key being absent or non-array means the
    // response was reshaped or broken (outage, maintenance window, contract
    // change) and must not be trusted to replace or retire anything. This is
    // exactly the distinction sync_student_academics() cannot recover once
    // it only sees the parsed, already-collapsed arrays — see its parameter
    // comment in migration 009.
    const scheduleAuthoritative = Array.isArray(schedulePayload.entries);
    const enrollmentsAuthoritative = Array.isArray(coursesPayload.courses);

    const entries = parseSchedule(schedulePayload);
    const enrollments = parseEnrollments(coursesPayload, semester, academicYear);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: syncResult, error: syncError } = await admin.rpc("sync_student_academics", {
      p_student_id: user.id,
      p_academic_year: academicYear,
      p_semester: semester,
      p_enrollments: enrollments,
      p_schedule: entries,
      p_schedule_authoritative: scheduleAuthoritative,
      p_enrollments_authoritative: enrollmentsAuthoritative,
    });

    if (syncError) {
      console.error("university_sync_rpc_failed", { code: syncError.code });
      return json({ error: "Could not save your academic data. Try again." }, 500);
    }

    // Business-logic audit fix (defect #5): profiles.major/semester/track
    // feed migration 008's assignment_visible_to_current_student(), which
    // matches published assignments against exactly those three fields.
    // Overwriting them on every sync — as this used to do unconditionally —
    // meant a routine semester rollover (or any transient/incorrect value
    // from the university) could silently make an assignment a student was
    // mid-submission-on disappear from their own view, with no error and no
    // warning.
    //
    // Trade-off, stated plainly: "profile always mirrors the university" is
    // in real tension with "a student never loses access to work already
    // assigned to them". We choose the student's in-progress work: each of
    // these three fields is written only the FIRST time it is learned (the
    // stored value is currently null); once populated, this Edge Function
    // never overwrites it again. full_name has no such coupling to
    // assignment visibility and keeps updating every sync as before.
    //
    // This is a stopgap, not the durable fix, and it has a real cost of its
    // own: a student who is legitimately promoted to a new semester will NOT
    // have profiles.semester follow them here after the first sync, so they
    // will not automatically see assignments newly targeted at their real
    // current semester either — until an admin corrects the profile by hand.
    // That is a visible, correctable failure (staff can fix a wrong field);
    // silently vanishing in-progress work was not. The durable fix is to
    // decouple assignment visibility from live mutable profile state
    // entirely — e.g. snapshot eligibility at publish time, or grandfather
    // access once granted — inside migration 008's
    // assignment_visible_to_current_student(). That migration is already
    // APPLIED, so this belongs in a NEW migration, not an edit to 008 in
    // place, and it is NOT implemented here — it is out of this change's
    // scope (supabase/migrations/009, this file, src/pages/Schedule.tsx,
    // src/services/academics.ts only). Flagging it loudly rather than
    // quietly deciding it myself.
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("major, semester, track")
      .eq("id", user.id)
      .maybeSingle();

    const profilePatch: Record<string, string> = {};
    if (identity.fullName) profilePatch.full_name = identity.fullName;
    if (identity.major && !existingProfile?.major) profilePatch.major = identity.major;
    if (identity.semester && !existingProfile?.semester) profilePatch.semester = identity.semester;
    if (identity.track && !existingProfile?.track) profilePatch.track = identity.track;

    // Field names only — never the value, never the file number, never the
    // raw university payload — so ops can see that the university reported
    // a change we intentionally did not apply, without persisting anything
    // sensitive.
    const lockedFields = (["major", "semester", "track"] as const).filter(
      (field) => identity[field] && existingProfile?.[field] && identity[field] !== existingProfile[field],
    );
    if (lockedFields.length > 0) {
      console.info("university_sync_profile_fields_locked", { fields: lockedFields });
    }

    if (Object.keys(profilePatch).length > 0) {
      await admin.from("profiles").update(profilePatch).eq("id", user.id);
    }

    // Counts only — never the file number, never the university payload.
    console.info("university_sync_ok");
    return json({
      ok: true,
      academic_year: academicYear,
      semester,
      ...(syncResult as Record<string, unknown> ?? {}),
    });
  } catch (error) {
    if (error instanceof UniversityUnavailableError) {
      console.warn("university_sync_upstream_unavailable", { endpoint: error.endpoint });
      return json(
        { error: "The university service is unavailable. Try again shortly." },
        503,
      );
    }
    console.error("university_sync_unexpected_failure");
    return json({ error: "Could not refresh your academic data." }, 500);
  }
});
