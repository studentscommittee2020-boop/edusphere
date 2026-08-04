import { supabase } from "@/lib/supabase";
import type {
  Assignment,
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
  const { data, error } = await supabase
    .from("print_documents")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  return { data: data as PrintDocument | null, error };
}

export async function createAssignment(assignment: {
  doctor_id: string;
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
  const { data, error } = await supabase
    .from("assignments")
    .insert(assignment)
    .select()
    .single();
  return { data: data as Assignment | null, error };
}

export async function getAssignmentsForCurrentUser() {
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .order("due_at", { ascending: true, nullsFirst: false });
  return { data: (data ?? []) as Assignment[], error };
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

  return { data: data as AssignmentSubmission | null, error };
}

export async function reviewSubmission(
  id: string,
  updates: Pick<AssignmentSubmission, "status" | "feedback" | "grade">,
  reviewerId: string,
) {
  const { data, error } = await supabase
    .from("assignment_submissions")
    .update({ ...updates, reviewed_at: new Date().toISOString(), reviewed_by: reviewerId })
    .eq("id", id)
    .select()
    .single();
  return { data: data as AssignmentSubmission | null, error };
}

export async function getPrivateFileUrl(bucket: string, path: string) {
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
