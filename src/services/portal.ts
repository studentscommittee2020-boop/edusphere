import { assertWritable, supabase } from "@/lib/supabase";
import type {
  Assignment,
  AssignmentPortalFeed,
  AssignmentSubmission,
  AuditLog,
  PrintDocument,
} from "@/types/database";

const PDF_MIME_TYPE = "application/pdf";
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

function validatePdf(file: File) {
  if (file.type !== PDF_MIME_TYPE) {
    return new Error("Only PDF files are accepted.");
  }
  if (file.size === 0 || file.size > MAX_DOCUMENT_BYTES) {
    return new Error("Files must be between 1 byte and 25 MB.");
  }
  return null;
}

function fileExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "pdf" ? "pdf" : "pdf";
}

export async function uploadDoctorPrintDocument(userId: string, file: File) {
  assertWritable("upload a print document");
  const validationError = validatePdf(file);
  if (validationError) return { path: null, error: validationError };

  const path = `${userId}/${crypto.randomUUID()}.${fileExtension(file)}`;
  const { error } = await supabase.storage
    .from("print-documents")
    .upload(path, file, { contentType: PDF_MIME_TYPE, upsert: false });

  return { path: error ? null : path, error };
}

export async function createPrintDocument(document: {
  doctor_id: string;
  title: string;
  copies: number;
  page_count?: number | null;
  notes?: string;
  storage_path: string;
  original_name: string;
  mime_type: "application/pdf";
  size_bytes: number;
}) {
  assertWritable("create a print request");
  const { data, error } = await supabase
    .from("print_documents")
    .insert(document)
    .select()
    .single();
  return { data: data as PrintDocument | null, error };
}

export async function getPrintDocuments() {
  const { data, error } = await supabase
    .from("print_documents")
    .select("*")
    .order("created_at", { ascending: false });
  return { data: (data ?? []) as PrintDocument[], error };
}

export async function updatePrintDocumentStatus(
  id: string,
  status: PrintDocument["status"],
) {
  if (status === "requested") {
    return {
      data: null,
      error: new Error("A print request cannot transition back to requested."),
    };
  }

  assertWritable("update a print request");
  const { data, error } = await supabase.rpc("transition_print_document", {
    p_document_id: id,
    p_status: status,
  });
  return { data: data as PrintDocument | null, error };
}

export async function createAssignment(assignment: {
  doctor_id: string;
  course_id: string;
  title: string;
  description: string;
  target_major?: string | null;
  target_semester?: string | null;
  target_track?: "french" | "english" | null;
  due_at?: string | null;
  allow_late?: boolean;
  max_submissions?: number;
  published_at?: string | null;
}) {
  assertWritable("publish an assignment");
  const { data, error } = await supabase
    .from("assignments")
    .insert(assignment)
    .select()
    .single();
  return { data: data as Assignment | null, error };
}

function assignmentFromFeed(row: AssignmentPortalFeed): Assignment {
  return {
    id: row.assignment_id,
    doctor_id: row.doctor_id,
    course_id: row.course_id,
    title: row.title,
    description: row.description,
    target_major: row.target_major,
    target_semester: row.target_semester,
    target_track: row.target_track as Assignment["target_track"],
    due_at: row.due_at,
    allow_late: row.allow_late,
    max_submissions: row.max_submissions,
    attachment_path: row.attachment_path,
    attachment_name: row.attachment_name,
    attachment_mime_type: row.attachment_mime_type as Assignment["attachment_mime_type"],
    attachment_size_bytes: row.attachment_size_bytes,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getAssignmentPortalFeed() {
  return supabase.rpc("get_assignment_portal_feed");
}

export async function getAssignmentsForCurrentUser() {
  const { data, error } = await getAssignmentPortalFeed();
  return { data: (data ?? []).map(assignmentFromFeed), error };
}

export async function getAssignmentSubmissions(assignmentId: string) {
  const { data, error } = await supabase
    .from("assignment_submissions")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("submitted_at", { ascending: false });
  return { data: (data ?? []) as AssignmentSubmission[], error };
}

export async function uploadAssignmentSubmission(
  userId: string,
  assignmentId: string,
  file: File,
  message: string,
) {
  assertWritable("upload an assignment submission");
  const validationError = validatePdf(file);
  if (validationError) return { data: null, error: validationError };

  const path = `${userId}/${assignmentId}/${crypto.randomUUID()}.${fileExtension(file)}`;
  const { error: uploadError } = await supabase.storage
    .from("assignment-submissions")
    .upload(path, file, { contentType: PDF_MIME_TYPE, upsert: false });

  if (uploadError) return { data: null, error: uploadError };

  const { data, error } = await supabase.rpc("submit_assignment", {
    p_assignment_id: assignmentId,
    p_storage_path: path,
    p_original_name: file.name,
    p_mime_type: file.type,
    p_size_bytes: file.size,
    p_message: message,
  });

  if (error) {
    await supabase.storage.from("assignment-submissions").remove([path]);
  }

  return { data: data as AssignmentSubmission | null, error };
}

export async function reviewSubmission(
  id: string,
  updates: Pick<AssignmentSubmission, "status" | "feedback" | "grade">,
) {
  assertWritable("review an assignment submission");
  const { data, error } = await supabase.rpc("review_assignment_submission", {
    p_submission_id: id,
    p_status: updates.status === "graded" ? "graded" : "returned",
    p_grade: updates.status === "graded" ? updates.grade : null,
    p_feedback: updates.feedback ?? "",
  });
  return { data: data as AssignmentSubmission | null, error };
}

export async function getPrivateFileUrl(bucket: string, path: string) {
  const { data: authorized, error: authorizationError } = await supabase.rpc(
    "authorize_and_log_portal_file_access",
    { p_bucket_id: bucket, p_storage_path: path },
  );
  if (authorizationError || authorized !== true) {
    return {
      url: null,
      error: authorizationError ?? new Error("You are not allowed to open this file."),
    };
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  return { url: data?.signedUrl ?? null, error };
}

export async function getAuditLogs() {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(150);
  return { data: (data ?? []) as AuditLog[], error };
}
