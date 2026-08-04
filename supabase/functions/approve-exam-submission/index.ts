/**
 * Approves a pending exam submission: copies the file from the private
 * exam-submissions-pending bucket into the live exam-papers bucket, then
 * calls approve_exam_submission() to atomically create the previous_exams
 * row and close out the submission.
 *
 * Why this exists as an Edge Function instead of being pure SQL: the two
 * storage operations (download from the pending bucket, upload to
 * exam-papers) cannot happen inside the RPC's own transaction — a Postgres
 * function can move rows between tables, but it cannot move bytes between
 * Storage buckets, only the Storage API can. So this function does the
 * storage move first, then calls approve_exam_submission() as the reviewer,
 * exactly the same "privileged step, then RPC" shape as exam-download
 * (quota RPC as the caller, then sign as service role) and university-sync
 * (external API call, then RPC as service role). If the RPC then refuses the
 * request (already reviewed under us, unknown submission, bad reviewer
 * role, ...), the just-uploaded copy in exam-papers is deleted so a failed
 * approval never leaves an orphaned live file with no previous_exams row
 * pointing at it.
 *
 * Rejection does not need this function at all: reject_exam_submission() is
 * pure DB state and the client calls it directly as an ordinary RPC.
 *
 * UNVERIFIED — this file has never been deployed or executed. It has not
 * been type-checked by `deno check`, run against a real Storage bucket, or
 * exercised against the RPC it calls. It was written to mirror the exact
 * shape of exam-download/index.ts and university-sync/index.ts (both read
 * in full before writing this), reusing their auth pattern, their {data,
 * error} destructuring (Supabase JS storage/RPC calls resolve with an error
 * field rather than throwing), and their no-PII logging convention. Smoke-
 * test explicitly: a real doctor upload -> real committee approval ->
 * confirm the file is fetchable via exam-download afterwards.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PENDING_BUCKET = "exam-submissions-pending";
const LIVE_BUCKET = "exam-papers";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function normaliseUuid(value: unknown): string | null {
  return typeof value === "string" && isValidUuid(value) ? value : null;
}

function normaliseString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function normaliseInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

interface ApprovePayload {
  submissionId?: unknown;
  finalCourseId?: unknown;
  finalTrack?: unknown;
  finalYear?: unknown;
  finalExamType?: unknown;
  finalPages?: unknown;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("approve_exam_submission_configuration_missing");
    return json({ error: "Review approval is not configured yet." }, 503);
  }

  // ── Authenticate the caller ───────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Sign in first." }, 401);
  }

  // Anon client carrying the caller's own JWT. approve_exam_submission()
  // reads auth.uid() from this to record reviewed_by — never swap this for
  // the service-role client when calling the RPC.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "Sign in first." }, 401);
  }

  // ── Read the request ──────────────────────────────────────────────────────
  let payload: ApprovePayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const submissionId = typeof payload.submissionId === "string" ? payload.submissionId.trim() : "";
  if (!isValidUuid(submissionId)) {
    return json({ error: "A valid submission id is required." }, 400);
  }

  // ── Load the submission as the caller ─────────────────────────────────────
  // RLS-gated: only a committee/admin reviewer, the owner, or the submission's
  // own uploader can see this row (exam_submissions_select_own /
  // exam_submissions_select_committee_or_admin / the owner bypass). A
  // successful read here is necessary context, not the authorization
  // decision itself — approve_exam_submission() independently re-checks
  // is_committee_admin()/is_admin() below and is the real gate, so a doctor
  // reading their own pending submission through this same endpoint still
  // cannot approve it.
  const { data: submission, error: fetchError } = await userClient
    .from("exam_submissions")
    .select("id, status, storage_path, original_name")
    .eq("id", submissionId)
    .maybeSingle();

  if (fetchError) {
    console.error("approve_exam_submission_fetch_failed", { code: fetchError.code });
    return json({ error: "Could not load that submission. Try again." }, 500);
  }
  if (!submission) {
    return json({ error: "That submission could not be found." }, 404);
  }
  if (submission.status !== "pending") {
    return json({ error: "That submission has already been reviewed." }, 409);
  }

  // ── Move the file, as the service role ────────────────────────────────────
  // Only reachable after the RLS-gated fetch above succeeded — this client
  // never touches storage on the strength of the caller's own credentials.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Namespaced by submissionId (globally unique), so a collision in
  // exam-papers is not expected — upload below intentionally does not
  // upsert, so an unexpected collision fails loudly instead of silently
  // overwriting a live file.
  const destinationPath = `review/${submissionId}/${submission.original_name}`;

  const { data: fileBlob, error: downloadError } = await admin.storage
    .from(PENDING_BUCKET)
    .download(submission.storage_path);

  if (downloadError || !fileBlob) {
    console.error("approve_exam_submission_download_failed");
    return json({ error: "Could not read the submitted file. Try again." }, 500);
  }

  const { error: uploadError } = await admin.storage
    .from(LIVE_BUCKET)
    .upload(destinationPath, fileBlob, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    console.error("approve_exam_submission_upload_failed");
    return json({ error: "Could not publish the exam file. Try again." }, 500);
  }

  // ── Finalize, as the caller ────────────────────────────────────────────────
  // approve_exam_submission() re-validates the reviewer role and the
  // submission's status (with a row lock) independently of the checks above
  // — this call is the actual authorization boundary, not the fetch earlier.
  const { data: examRow, error: rpcError } = await userClient.rpc("approve_exam_submission", {
    p_submission_id: submissionId,
    p_final_storage_path: destinationPath,
    p_final_course_id: normaliseUuid(payload.finalCourseId),
    p_final_track: normaliseString(payload.finalTrack),
    p_final_year: normaliseString(payload.finalYear),
    p_final_exam_type: normaliseString(payload.finalExamType),
    p_final_pages: normaliseInteger(payload.finalPages),
  });

  if (rpcError) {
    // The DB refused the approval — the live copy just uploaded has no
    // previous_exams row pointing at it, so remove it rather than leak an
    // orphaned file into a bucket students can read from. Best-effort: if
    // this cleanup itself fails, the orphan is a storage-cost problem, not a
    // security one (nothing in previous_exams references it).
    console.error("approve_exam_submission_rpc_failed", { code: rpcError.code });
    const { error: cleanupError } = await admin.storage.from(LIVE_BUCKET).remove([destinationPath]);
    if (cleanupError) console.error("approve_exam_submission_cleanup_failed");
    return json({ error: "Could not finalize the approval. Try again." }, 500);
  }

  // Best-effort cleanup of the pending original. Non-fatal: the live copy
  // and the DB row are already correct and consistent even if this fails,
  // and the pending bucket stays unreachable by students either way.
  const { error: pendingCleanupError } = await admin.storage
    .from(PENDING_BUCKET)
    .remove([submission.storage_path]);
  if (pendingCleanupError) console.warn("approve_exam_submission_pending_cleanup_failed");

  console.info("approve_exam_submission_ok");
  return json({ ok: true, exam: examRow });
});
