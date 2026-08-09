// Course-book upload is deliberately server-mediated. Browser clients never
// receive INSERT permission on the private bucket: this function authenticates
// the caller, checks the real file signature and size, stores it with a
// non-guessable name, then invokes the database workflow as that caller.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 150 * 1024 * 1024;
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const LEGACY_PPT = "application/vnd.ms-powerpoint";
const PDF = "application/pdf";

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extensionFor(type: string) {
  return type === PDF ? "pdf" : type === PPTX ? "pptx" : "ppt";
}

function signatureMatches(bytes: Uint8Array, type: string) {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (type === PDF) return starts(0x25, 0x50, 0x44, 0x46, 0x2d); // %PDF-
  if (type === PPTX) return starts(0x50, 0x4b, 0x03, 0x04); // OOXML is a ZIP container
  return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1); // OLE compound document
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = request.headers.get("Authorization");
  if (!url || !serviceRole || !anonKey || !authHeader) return reply({ error: "Upload service is not configured" }, 503);

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return reply({ error: "Unauthenticated" }, 401);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const title = String(form?.get("title") ?? "").trim();
  const courseId = String(form?.get("courseId") ?? "").trim();
  const originalBookId = String(form?.get("originalBookId") ?? "").trim();
  const doctorCourseId = String(form?.get("doctorCourseId") ?? "").trim();
  const doctorCourseIdsRaw = String(form?.get("doctorCourseIds") ?? "").trim();
  const rejectionReason = String(form?.get("rejectionReason") ?? "").trim();

  if (!(file instanceof File) || title.length < 2 || title.length > 200) {
    return reply({ error: "Attach a valid file and use a title between 2 and 200 characters" }, 400);
  }
  if (![PDF, PPTX, LEGACY_PPT].includes(file.type) || file.size < 1 || file.size > MAX_BYTES) {
    return reply({ error: "Only PDF or PowerPoint files up to 150 MB are accepted" }, 400);
  }
  const sample = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!signatureMatches(sample, file.type)) {
    return reply({ error: "The file contents do not match the declared PDF or PowerPoint format" }, 400);
  }
  let doctorCourseIds: string[] = [];
  if (doctorCourseIdsRaw) {
    try {
      const parsed = JSON.parse(doctorCourseIdsRaw);
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
        doctorCourseIds = [...new Set(parsed.map((value) => value.trim()).filter(Boolean))];
      }
    } catch {
      doctorCourseIds = [];
    }
  }
  if ((originalBookId && !doctorCourseId) || (!originalBookId && (!courseId || doctorCourseIds.length < 1))) {
    return reply({ error: "Invalid book upload request" }, 400);
  }

  const admin = createClient(url, serviceRole);
  const path = `${authData.user.id}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
  const { error: storageError } = await admin.storage.from("course-books").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (storageError) return reply({ error: "Could not store the file" }, 502);

  const rpc = originalBookId
    ? await userClient.rpc("submit_doctor_book_replacement", {
        p_book_id: originalBookId,
        p_doctor_course_id: doctorCourseId,
        p_title: title,
        p_storage_path: path,
        p_original_name: file.name,
        p_mime_type: file.type,
        p_size_bytes: file.size,
        p_rejection_reason: rejectionReason,
      })
    : await userClient.rpc("upload_course_book_for_assignments", {
        p_course_id: courseId,
        p_doctor_course_ids: doctorCourseIds,
        p_title: title,
        p_storage_path: path,
        p_original_name: file.name,
        p_mime_type: file.type,
        p_size_bytes: file.size,
      });

  if (rpc.error || !rpc.data) {
    await admin.storage.from("course-books").remove([path]);
    return reply({ error: rpc.error?.message ?? "Could not register the book" }, 400);
  }
  return reply({ book: rpc.data });
});
