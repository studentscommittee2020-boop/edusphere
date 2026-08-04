import { supabase } from "@/lib/supabase";
import type { Course, CourseMaterial } from "@/types/database";

/**
 * Course materials — documents a doctor publishes *to the students of a
 * course*.
 *
 * Distinct from `print_documents`, which are the PDFs a doctor sends to the
 * student committee for printing and which students must never see. The two
 * are separate tables with separate buckets and separate policies precisely so
 * that one cannot leak into the other.
 */

const PDF_MIME_TYPE = "application/pdf";
const MAX_BYTES = 25 * 1024 * 1024;
const BUCKET = "course-materials";

export type MaterialWithCourse = CourseMaterial & { courses: Course | null };

function validatePdf(file: File): Error | null {
  if (file.type !== PDF_MIME_TYPE) return new Error("Only PDF files are accepted.");
  if (file.size === 0 || file.size > MAX_BYTES) {
    return new Error("Files must be between 1 byte and 25 MB.");
  }
  return null;
}

/**
 * Uploads then inserts. The storage policy requires the first path segment to
 * be the doctor's own user id, so the path shape here is load-bearing, not
 * cosmetic.
 */
export async function publishMaterial(
  doctorId: string,
  courseId: string,
  file: File,
  details: {
    title: string;
    description?: string;
    kind?: CourseMaterial["kind"];
    publishNow?: boolean;
  },
) {
  const validationError = validatePdf(file);
  if (validationError) return { data: null, error: validationError };

  const path = `${doctorId}/${crypto.randomUUID()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: PDF_MIME_TYPE, upsert: false });

  if (uploadError) return { data: null, error: uploadError };

  const { data, error } = await supabase
    .from("course_materials")
    .insert({
      doctor_id: doctorId,
      course_id: courseId,
      title: details.title,
      description: details.description ?? "",
      kind: details.kind ?? "notes",
      storage_path: path,
      original_name: file.name,
      mime_type: PDF_MIME_TYPE,
      size_bytes: file.size,
      published_at: details.publishNow === false ? null : new Date().toISOString(),
    })
    .select()
    .single();

  // Don't leave an orphaned object in the bucket if the row insert fails.
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { data: null, error };
  }

  return { data: data as CourseMaterial, error: null };
}

export async function getMaterialsForDoctor(doctorId: string) {
  const { data, error } = await supabase
    .from("course_materials")
    .select("*, courses(*)")
    .eq("doctor_id", doctorId)
    .order("created_at", { ascending: false });

  return { data: (data ?? []) as MaterialWithCourse[], error };
}

export async function setMaterialPublished(id: string, published: boolean) {
  const { data, error } = await supabase
    .from("course_materials")
    .update({ published_at: published ? new Date().toISOString() : null })
    .eq("id", id)
    .select()
    .single();

  return { data: data as CourseMaterial | null, error };
}

export async function deleteMaterial(material: Pick<CourseMaterial, "id" | "storage_path">) {
  const { error } = await supabase.from("course_materials").delete().eq("id", material.id);
  if (error) return { error };

  // Best-effort: the row is the source of truth, so a stale object is
  // inaccessible even if this cleanup fails.
  await supabase.storage.from(BUCKET).remove([material.storage_path]);
  return { error: null };
}

export async function getMaterialUrl(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  return { url: data?.signedUrl ?? null, error };
}

/** Courses a doctor can publish to — the full catalogue, newest first. */
export async function getCourseOptions() {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .order("semester", { ascending: true })
    .order("title", { ascending: true });

  return { data: (data ?? []) as Course[], error };
}
