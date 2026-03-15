import { supabase } from "@/lib/supabase";
import { escapeLike } from "@/lib/utils";

// ── Events Query ──────────────────────────────────────────────────────────────

export interface EventFilters {
  tag?: string;
  search?: string;
}

/**
 * Gets events. The `type` field in the DB is "upcoming" | "past".
 * Events are stored with a `date` field as an ISO date string (YYYY-MM-DD)
 * for proper ordering. Human-readable display is handled on the frontend.
 */
export async function getEvents(type?: "upcoming" | "past", filters?: EventFilters) {
  let query = supabase.from("events").select("*");

  if (type === "upcoming") {
    query = query.eq("type", "upcoming").order("date", { ascending: true });
  } else if (type === "past") {
    query = query.eq("type", "past").order("date", { ascending: false });
  } else {
    query = query.order("date", { ascending: false });
  }

  if (filters?.tag && filters.tag !== "all") {
    query = query.eq("tag", filters.tag);
  }
  if (filters?.search) {
    const q = escapeLike(filters.search);
    query = query.or(
      `title.ilike.%${q}%,description.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  return { data, error };
}

export async function getEventById(id: string) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();
  return { data, error };
}

export async function getUpcomingEvents(limit = 3) {
  const { data, error } = await supabase
    .from("events")
    .select("id, title, date, time, location, tag, attendees")
    .eq("type", "upcoming")
    .order("date", { ascending: true })
    .limit(limit);
  return { data, error };
}

// ── Event Registration ────────────────────────────────────────────────────────

export async function registerForEvent(userId: string, eventId: string) {
  const { data, error } = await supabase
    .from("event_registrations")
    .insert({ user_id: userId, event_id: eventId })
    .select()
    .single();

  if (!error) {
    // Best-effort attendee count increment (fire-and-forget)
    supabase.rpc("increment_event_attendees", { event_id: eventId }).then(
      () => null,
      () => null
    );
  }

  return { data, error };
}

export async function unregisterFromEvent(userId: string, eventId: string) {
  const { error } = await supabase
    .from("event_registrations")
    .delete()
    .eq("user_id", userId)
    .eq("event_id", eventId);

  if (!error) {
    supabase.rpc("decrement_event_attendees", { event_id: eventId }).then(
      () => null,
      () => null
    );
  }

  return { error };
}

export async function getUserRegistrations(userId: string): Promise<{
  data: string[];
  error: unknown;
}> {
  const { data, error } = await supabase
    .from("event_registrations")
    .select("event_id")
    .eq("user_id", userId);
  return {
    data: (data ?? []).map((r) => r.event_id),
    error,
  };
}

export async function isRegisteredForEvent(
  userId: string,
  eventId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("event_registrations")
    .select("id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .single();
  return !!data;
}

// ── Event Tags (for filter UI) ────────────────────────────────────────────────

export const EVENT_TAGS = [
  "Academic",
  "Workshop",
  "Cultural",
  "Networking",
  "Lecture",
  "Sports",
  "Science",
] as const;

export type EventTag = (typeof EVENT_TAGS)[number];
