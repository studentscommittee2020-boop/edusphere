import { supabase } from "@/lib/supabase";
import type { Major, Semester } from "@/types/database";

// ── Admin Check ──────────────────────────────────────────────────────────────

export async function isAdminEmail(email: string): Promise<boolean> {
  const { data } = await supabase
    .from("admin_emails")
    .select("email")
    .eq("email", email)
    .single();
  return !!data;
}

// ── Admin Stats ───────────────────────────────────────────────────────────────

export async function getAdminStats() {
  const [
    { count: examCount },
    { count: entranceCount },
    { count: materialCount },
    { count: eventCount },
    { count: enrollmentCount },
    { count: userCount },
  ] = await Promise.all([
    supabase.from("previous_exams").select("*", { count: "exact", head: true }),
    supabase.from("entrance_exams").select("*", { count: "exact", head: true }),
    supabase.from("course_materials").select("*", { count: "exact", head: true }),
    supabase.from("events").select("*", { count: "exact", head: true }),
    supabase.from("student_enrollments").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  return {
    exams: examCount ?? 0,
    entranceExams: entranceCount ?? 0,
    materials: materialCount ?? 0,
    events: eventCount ?? 0,
    enrollments: enrollmentCount ?? 0,
    users: userCount ?? 0,
  };
}

// ── Admin CRUD: Courses ──────────────────────────────────────────────────────

export async function createCourse(course: {
  title: string;
  title_fr: string;
  credits: number;
  semester: Semester;
  major: Major;
  type: "common" | "major";
  track: "french" | "english";
  code?: string;
  description?: string;
  description_fr?: string;
}) {
  const { data, error } = await supabase
    .from("courses")
    .insert(course)
    .select()
    .single();
  return { data, error };
}

export async function updateCourse(
  id: string,
  updates: Partial<{
    title: string;
    title_fr: string;
    credits: number;
    semester: Semester;
    major: Major;
    type: "common" | "major";
    track: "french" | "english";
    description: string;
    description_fr: string;
  }>
) {
  const { data, error } = await supabase
    .from("courses")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  return { data, error };
}

export async function deleteCourse(id: string) {
  const { error } = await supabase.from("courses").delete().eq("id", id);
  return { error };
}

// ── Admin CRUD: Previous Exams ───────────────────────────────────────────────

export async function createPreviousExam(exam: {
  course_id: string;
  course_title: string;
  course_title_fr: string;
  major: Major;
  semester: Semester;
  year: string;
  exam_type: "partiel" | "midterm" | "resit";
  pages: number;
  track: "french" | "english";
  file_url?: string;
}) {
  const { data, error } = await supabase
    .from("previous_exams")
    .insert({ ...exam, rating: 0 })
    .select()
    .single();
  return { data, error };
}

export async function updatePreviousExam(
  id: string,
  updates: Partial<{
    course_id: string;
    course_title: string;
    course_title_fr: string;
    major: Major;
    semester: Semester;
    year: string;
    exam_type: "partiel" | "midterm" | "resit";
    pages: number;
    track: "french" | "english";
    file_url: string | null;
  }>
) {
  const { data, error } = await supabase
    .from("previous_exams")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  return { data, error };
}

export async function deletePreviousExam(id: string) {
  const { error } = await supabase
    .from("previous_exams")
    .delete()
    .eq("id", id);
  return { error };
}

// ── Admin CRUD: Events ───────────────────────────────────────────────────────

export async function createEvent(event: {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  tag: string;
  type?: "upcoming" | "past";
}) {
  const { data, error } = await supabase
    .from("events")
    .insert({ ...event, attendees: 0, type: event.type ?? "upcoming" })
    .select()
    .single();
  return { data, error };
}

export async function updateEvent(
  id: string,
  updates: Partial<{
    title: string;
    description: string;
    date: string;
    time: string;
    location: string;
    tag: string;
    type: "upcoming" | "past";
  }>
) {
  const { data, error } = await supabase
    .from("events")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  return { data, error };
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from("events").delete().eq("id", id);
  return { error };
}

// ── Admin CRUD: Entrance Exams ───────────────────────────────────────────────

export async function createEntranceExam(exam: {
  title: string;
  title_fr: string;
  subject: string;
  exam_lang: string;
  year: string;
  difficulty: "Easy" | "Medium" | "Hard";
  pages: number;
  description: string;
  description_fr: string;
  file_url?: string;
}) {
  const { data, error } = await supabase
    .from("entrance_exams")
    .insert({ ...exam, rating: 0 })
    .select()
    .single();
  return { data, error };
}

export async function updateEntranceExam(
  id: string,
  updates: Partial<{
    title: string;
    title_fr: string;
    subject: string;
    exam_lang: string;
    year: string;
    difficulty: "Easy" | "Medium" | "Hard";
    pages: number;
    description: string;
    description_fr: string;
    file_url: string | null;
  }>
) {
  const { data, error } = await supabase
    .from("entrance_exams")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  return { data, error };
}

export async function deleteEntranceExam(id: string) {
  const { error } = await supabase
    .from("entrance_exams")
    .delete()
    .eq("id", id);
  return { error };
}

// ── File Upload ──────────────────────────────────────────────────────────────

const ALLOWED_MIME: Record<string, string[]> = {
  "exam-papers": ["application/pdf"],
  avatars: ["image/jpeg", "image/png", "image/webp"],
};
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function uploadFile(
  bucket: "exam-papers" | "book-covers" | "avatars",
  path: string,
  file: File
) {
  if (file.size > MAX_FILE_SIZE) {
    return { url: null, error: new Error("File exceeds 10 MB limit") };
  }
  const allowed = ALLOWED_MIME[bucket];
  if (allowed && !allowed.includes(file.type)) {
    return { url: null, error: new Error(`Invalid file type. Allowed: ${allowed.join(", ")}`) };
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true });

  if (error) return { url: null, error };

  if (bucket === "exam-papers") {
    return { url: data.path, error: null };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return { url: publicUrl, error: null };
}

// ── Admin Emails CRUD ────────────────────────────────────────────────────────

export async function getAdminEmails() {
  const { data, error } = await supabase
    .from("admin_emails")
    .select("*")
    .order("created_at");
  return { data, error };
}

export async function addAdminEmail(email: string) {
  const { data, error } = await supabase
    .from("admin_emails")
    .insert({ email })
    .select()
    .single();
  return { data, error };
}

export async function removeAdminEmail(id: string) {
  const { error } = await supabase.from("admin_emails").delete().eq("id", id);
  return { error };
}
