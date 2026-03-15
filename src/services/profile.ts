import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types/database";

// ── Profile Fetch ─────────────────────────────────────────────────────────────

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return { data, error };
}

// ── Profile Update ────────────────────────────────────────────────────────────

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();
  return { data, error };
}

// ── Avatar Upload ─────────────────────────────────────────────────────────────

export async function uploadAvatar(userId: string, file: File) {
  const ext = file.name.split(".").pop();
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true });

  if (uploadError) return { url: null, error: uploadError };

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  // Update profile with new avatar URL
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", userId);

  return { url: publicUrl, error: updateError };
}

// ── Dashboard Stats ───────────────────────────────────────────────────────────

export interface DashboardStats {
  total_exams: number;
  total_entrance_exams: number;
  total_books: number;
  total_events: number;
  total_courses: number;
}

export async function getDashboardStats() {
  const { data, error } = await supabase.rpc("get_dashboard_stats");
  return { data: data as DashboardStats | null, error };
}

export interface UserDashboardStats {
  exams_for_major: number;
  exams_for_semester: number | null;
  books_for_major: number;
  upcoming_events: number;
  user_favorites: number;
  user_orders: number;
}

export async function getUserDashboardStats(
  major?: string | null,
  semester?: string | null
) {
  const { data, error } = await supabase.rpc("get_user_dashboard_stats", {
    p_major: major ?? null,
    p_semester: semester ?? null,
  });
  return { data: data as UserDashboardStats | null, error };
}

// ── Recommended Exams ─────────────────────────────────────────────────────────

export async function getRecommendedExams(
  major: string,
  semester?: string | null,
  limit = 8
) {
  const { data, error } = await supabase.rpc("get_recommended_exams", {
    p_major: major,
    p_semester: semester ?? null,
    p_limit: limit,
  });
  return { data, error };
}

// ── Upcoming Events (for dashboard) ──────────────────────────────────────────

export async function getUpcomingEvents(limit = 3) {
  const { data, error } = await supabase
    .from("events")
    .select("id, title, date, time, location, tag, attendees")
    .eq("type", "upcoming")
    .order("date", { ascending: true })
    .limit(limit);
  return { data, error };
}

// ── Recently Added Exams (for dashboard) ─────────────────────────────────────

export async function getRecentExams(
  major?: string | null,
  limit = 4
) {
  let query = supabase
    .from("previous_exams")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (major && major !== "all") {
    query = query.eq("major", major);
  }

  const { data, error } = await query;
  return { data, error };
}
