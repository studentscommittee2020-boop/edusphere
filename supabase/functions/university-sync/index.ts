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
    const semester: Semester =
      normaliseSemester(payload.semester) ?? identity.semester ?? "LS1";

    const [schedulePayload, coursesPayload] = await Promise.all([
      callUniversity("schedule", {
        email,
        file_number: fileNumber,
        academic_year: academicYear,
        semester,
      }),
      callUniversity("courses", { email, file_number: fileNumber }),
    ]);

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
    });

    if (syncError) {
      console.error("university_sync_rpc_failed", { code: syncError.code });
      return json({ error: "Could not save your academic data. Try again." }, 500);
    }

    // Keep the profile in step with what the university reports.
    if (identity.major || identity.semester || identity.track || identity.fullName) {
      await admin
        .from("profiles")
        .update({
          ...(identity.fullName ? { full_name: identity.fullName } : {}),
          ...(identity.major ? { major: identity.major } : {}),
          ...(identity.semester ? { semester: identity.semester } : {}),
          ...(identity.track ? { track: identity.track } : {}),
        })
        .eq("id", user.id);
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
