/**
 * Mints a short-lived signed URL for a previous-exam PDF.
 *
 * Migration 011 removed the standing "any verified student may SELECT any
 * object in exam-papers" storage policy — that was a self-service mint loop
 * away from becoming a bucket-wide scrape. Every download now goes through
 * request_exam_download() first, which enforces a per-user quota (hourly,
 * daily, and a burst-of-distinct-exams guard) before anything gets signed.
 *
 * The quota check below runs as the CALLER (the anon client, forwarding the
 * caller's own bearer token) rather than the service role, on purpose:
 * request_exam_download() keys the quota off auth.uid(), and a service-role
 * call has no such identity to key against — calling it as service role
 * would silently disable the quota for every request. Only once that RPC
 * returns allowed:true do we switch to the service-role client to actually
 * sign the URL, because students have no direct storage grant on this
 * bucket (see migration 011, section 4).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Long enough for the browser to start the download immediately after this
// call returns; short enough that a copied/leaked URL is worthless a minute
// later. Not a tunable-in-the-usual-sense — bump it here if that tradeoff
// ever needs to move.
const SIGNED_URL_TTL_SECONDS = 60;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidExamId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

interface QuotaResult {
  allowed: boolean;
  storage_path?: string;
  remaining_hour?: number;
  remaining_day?: number;
  reason?: string;
  retry_after_seconds?: number;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("exam_download_configuration_missing");
    return json({ error: "Downloads are not configured yet." }, 503);
  }

  // ── Authenticate the caller ───────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Sign in first." }, 401);
  }

  // Anon client carrying the caller's own JWT — request_exam_download() reads
  // auth.uid() from this, which is the entire basis for the quota. Never
  // swap this for the service-role client.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "Sign in first." }, 401);
  }

  // ── Read the request ──────────────────────────────────────────────────────
  let payload: { examId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const examId = typeof payload.examId === "string" ? payload.examId.trim() : "";
  if (!isValidExamId(examId)) {
    return json({ error: "A valid exam id is required." }, 400);
  }

  // ── Quota check, as the user ──────────────────────────────────────────────
  const { data: quota, error: quotaError } = await userClient.rpc("request_exam_download", {
    p_exam_id: examId,
  });

  if (quotaError) {
    console.error("exam_download_quota_rpc_failed", { code: quotaError.code });
    return json({ error: "Could not check your download quota. Try again." }, 500);
  }

  const result = quota as QuotaResult;

  if (!result.allowed) {
    if (result.reason === "not_found") {
      return json({ error: "That exam could not be found." }, 404);
    }
    // reason is one of hourly_limit / daily_limit / burst_limit — safe to
    // return as-is, it's the caller's own quota status, not upstream data.
    console.warn("exam_download_denied", { reason: result.reason });
    return json(
      {
        error: "Download limit reached. Try again shortly.",
        reason: result.reason,
        retry_after_seconds: result.retry_after_seconds ?? 60,
      },
      429,
    );
  }

  if (!result.storage_path) {
    console.error("exam_download_missing_storage_path");
    return json({ error: "Could not prepare that download. Try again." }, 500);
  }

  // ── Sign the URL, as the service role ─────────────────────────────────────
  // Only reachable after an explicit allow — this client never touches
  // exam-papers on the strength of the caller's own credentials.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: signed, error: signError } = await admin.storage
    .from("exam-papers")
    .createSignedUrl(result.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    console.error("exam_download_sign_failed");
    return json({ error: "Could not prepare that download. Try again." }, 500);
  }

  // Never log storage paths or emails — counts and status only.
  console.info("exam_download_ok");
  return json({
    url: signed.signedUrl,
    remaining_hour: result.remaining_hour,
    remaining_day: result.remaining_day,
  });
});
