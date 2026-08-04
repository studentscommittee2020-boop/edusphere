import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidFileNumber(value: string) {
  return /^[A-Za-z0-9/-]{4,40}$/.test(value);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const universityUrl = Deno.env.get("UNIVERSITY_VERIFICATION_URL");
  const universityApiKey = Deno.env.get("UNIVERSITY_VERIFICATION_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_FROM_EMAIL");

  if (!universityUrl || !universityApiKey || !supabaseUrl || !serviceRoleKey || !resendApiKey || !resendFrom) {
    console.error("student_otp_configuration_missing");
    return json({ error: "Student login is not configured yet." }, 503);
  }

  let payload: { email?: unknown; fileNumber?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const fileNumber = typeof payload.fileNumber === "string" ? payload.fileNumber.trim() : "";
  if (!isValidEmail(email) || !isValidFileNumber(fileNumber)) {
    return json({ error: "Enter a valid student email and file number." }, 400);
  }

  let universityRecord: Record<string, unknown>;
  try {
    const verificationResponse = await fetch(universityUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${universityApiKey}`,
      },
      body: JSON.stringify({ email, file_number: fileNumber }),
    });

    if (!verificationResponse.ok) {
      console.warn("student_otp_university_unavailable", { status: verificationResponse.status });
      return json({ error: "The university verification service is unavailable. Try again shortly." }, 503);
    }
    universityRecord = await verificationResponse.json();
  } catch {
    console.warn("student_otp_university_request_failed");
    return json({ error: "The university verification service is unavailable. Try again shortly." }, 503);
  }

  const verified = universityRecord.verified === true || universityRecord.valid === true;
  const student = universityRecord.student as Record<string, unknown> | undefined;
  const canonicalEmail = typeof universityRecord.email === "string"
    ? universityRecord.email.trim().toLowerCase()
    : typeof student?.email === "string"
      ? student.email.trim().toLowerCase()
      : null;

  if (!verified || (canonicalEmail && canonicalEmail !== email)) {
    console.info("student_otp_verification_denied");
    return json({ error: "We could not verify those student details." }, 403);
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
    return json({ error: "Could not create a sign-in code. Try again." }, 500);
  }

  const { error: metadataError } = await admin.auth.admin.updateUserById(linkData.user.id, {
    app_metadata: { ...linkData.user.app_metadata, student_verified: true },
  });
  if (metadataError) {
    console.error("student_otp_claim_update_failed", { code: metadataError.code });
    return json({ error: "Could not prepare student access. Try again." }, 500);
  }

  const emailResponse = await fetch("https://api.resend.com/emails", {
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
  });

  if (!emailResponse.ok) {
    console.error("student_otp_resend_failed", { status: emailResponse.status });
    return json({ error: "Could not send the sign-in code. Try again." }, 502);
  }

  // Never log email addresses, file numbers, or university responses.
  console.info("student_otp_sent");
  return json({ ok: true });
});
