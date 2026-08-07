import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REQUEST_BODY_LIMIT_BYTES = 2_048;
const UNIVERSITY_TIMEOUT_MS = 8_000;
const RESEND_TIMEOUT_MS = 8_000;
const EMAIL_LIMIT = { attempts: 3, windowMs: 15 * 60 * 1_000 };
const IP_LIMIT = { attempts: 15, windowMs: 15 * 60 * 1_000 };

type RateLimit = { attempts: number; windowMs: number };
type RateLimitEntry = { count: number; resetAt: number };
type UnknownRecord = Record<string, unknown>;

const allowedOrigins = new Set(
  (Deno.env.get("APP_ORIGINS") ?? Deno.env.get("APP_ORIGIN") ?? "")
    .split(",")
    .map((value) => normaliseOrigin(value))
    .filter((value): value is string => value !== null),
);
const rateLimitEntries = new Map<string, RateLimitEntry>();

function normaliseOrigin(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;

  try {
    const parsed = new URL(candidate);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.origin === candidate.replace(/\/+$/, "")
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

function isAllowedBrowserOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !origin || allowedOrigins.has(origin);
}

function json(request: Request, body: UnknownRecord, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      ...extraHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function isValidFileNumber(value: string) {
  return /^[A-Za-z0-9/-]{4,40}$/.test(value);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function consumeRateLimit(key: string, limit: RateLimit): number | null {
  const now = Date.now();
  const entry = rateLimitEntries.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitEntries.set(key, { count: 1, resetAt: now + limit.windowMs });
    return null;
  }

  if (entry.count >= limit.attempts) {
    return Math.max(1, Math.ceil((entry.resetAt - now) / 1_000));
  }

  entry.count += 1;
  return null;
}

function clientIp(request: Request): string | null {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || null;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestPayload(request: Request): Promise<UnknownRecord | null> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > REQUEST_BODY_LIMIT_BYTES) return null;

  const body = await request.text();
  if (body.length === 0 || body.length > REQUEST_BODY_LIMIT_BYTES) return null;

  try {
    const parsed: unknown = JSON.parse(body);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (!isAllowedBrowserOrigin(request)) {
    return json(request, { error: "Unable to process this request." }, 403);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json(request, { error: "Unable to process this request." }, 405);
  }

  const universityUrl = Deno.env.get("UNIVERSITY_VERIFICATION_URL");
  const universityApiKey = Deno.env.get("UNIVERSITY_VERIFICATION_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_FROM_EMAIL");

  if (
    allowedOrigins.size === 0 ||
    !universityUrl || !universityApiKey || !supabaseUrl || !serviceRoleKey || !resendApiKey || !resendFrom
  ) {
    console.error("student_otp_configuration_missing");
    return json(request, { error: "Student sign-in is temporarily unavailable." }, 503);
  }

  const payload = await requestPayload(request);
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  const fileNumber = typeof payload?.fileNumber === "string" ? payload.fileNumber.trim() : "";
  if (!isValidEmail(email) || !isValidFileNumber(fileNumber)) {
    return json(request, { error: "Unable to send a sign-in code. Check your details and try again." }, 400);
  }

  const emailKey = await fingerprint(`email:${email}`);
  const emailRetryAfter = consumeRateLimit(`email:${emailKey}`, EMAIL_LIMIT);
  const ip = clientIp(request);
  const ipRetryAfter = ip ? consumeRateLimit(`ip:${await fingerprint(`ip:${ip}`)}`, IP_LIMIT) : null;
  const retryAfter = emailRetryAfter ?? ipRetryAfter;
  if (retryAfter !== null) {
    return json(
      request,
      { error: "Too many sign-in code requests. Try again later." },
      429,
      { "Retry-After": String(retryAfter) },
    );
  }

  let universityRecord: UnknownRecord;
  try {
    const verificationResponse = await fetchWithTimeout(
      universityUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${universityApiKey}`,
        },
        body: JSON.stringify({ email, file_number: fileNumber }),
      },
      UNIVERSITY_TIMEOUT_MS,
    );

    if (!verificationResponse.ok) {
      console.warn("student_otp_university_unavailable", { status: verificationResponse.status });
      return json(request, { error: "Student sign-in is temporarily unavailable." }, 503);
    }

    const responsePayload: unknown = await verificationResponse.json();
    if (!isRecord(responsePayload)) throw new Error("invalid_university_response");
    universityRecord = responsePayload;
  } catch {
    console.warn("student_otp_university_request_failed");
    return json(request, { error: "Student sign-in is temporarily unavailable." }, 503);
  }

  const verified = universityRecord.verified === true || universityRecord.valid === true;
  const student = isRecord(universityRecord.student) ? universityRecord.student : null;
  const canonicalEmail = typeof universityRecord.email === "string"
    ? universityRecord.email.trim().toLowerCase()
    : typeof student?.email === "string"
      ? student.email.trim().toLowerCase()
      : null;

  if (!verified || (canonicalEmail && canonicalEmail !== email)) {
    console.info("student_otp_verification_denied");
    return json(request, { error: "Unable to send a sign-in code. Check your details and try again." }, 403);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkError || !linkData.user || !linkData.properties.email_otp) {
    console.error("student_otp_generation_failed", { code: linkError?.code ?? "missing_otp" });
    return json(request, { error: "Unable to send a sign-in code. Try again later." }, 502);
  }

  try {
    const emailResponse = await fetchWithTimeout(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [email],
          subject: "Your EduSphere student sign-in code",
          html: `<p>Your EduSphere code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${linkData.properties.email_otp}</p><p>This code expires shortly. Do not share it.</p>`,
        }),
      },
      RESEND_TIMEOUT_MS,
    );

    if (!emailResponse.ok) {
      console.error("student_otp_resend_failed", { status: emailResponse.status });
      return json(request, { error: "Unable to send a sign-in code. Try again later." }, 502);
    }
  } catch {
    console.error("student_otp_resend_request_failed");
    return json(request, { error: "Unable to send a sign-in code. Try again later." }, 502);
  }

  // Auth metadata changes only after Resend accepts the message. A delivery
  // provider can still fail after acceptance; Supabase exposes no atomic
  // transaction or OTP revocation API spanning those two systems.
  const { error: metadataError } = await admin.auth.admin.updateUserById(linkData.user.id, {
    app_metadata: { ...linkData.user.app_metadata, student_verified: true },
  });
  if (metadataError) {
    console.error("student_otp_claim_update_failed", { code: metadataError.code });
    return json(request, { error: "Unable to prepare student access. Try again later." }, 502);
  }

  // Never log email addresses, file numbers, OTPs, or university responses.
  console.info("student_otp_sent");
  return json(request, { ok: true });
});
