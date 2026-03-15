import { supabase } from "@/lib/supabase";
import type { Favorite } from "@/types/database";

type FavoriteItemType = "previous_exam" | "entrance_exam" | "book" | "event";

// ── Get All Favorites for User ────────────────────────────────────────────────

export async function getUserFavorites(userId: string) {
  const { data, error } = await supabase
    .from("favorites")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return { data, error };
}

// ── Get Favorites by Type ─────────────────────────────────────────────────────

export async function getFavoritesByType(
  userId: string,
  itemType: FavoriteItemType
) {
  const { data, error } = await supabase
    .from("favorites")
    .select("*")
    .eq("user_id", userId)
    .eq("item_type", itemType)
    .order("created_at", { ascending: false });
  return { data, error };
}

// ── Check if Item is Favorited ────────────────────────────────────────────────

export async function isFavorited(
  userId: string,
  itemType: FavoriteItemType,
  itemId: string
) {
  const { data, error } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", userId)
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .single();
  return { favorited: !!data && !error, favoriteId: data?.id ?? null };
}

// ── Get Favorited Item IDs (set) for quick lookup ────────────────────────────

export async function getFavoritedIds(
  userId: string,
  itemType: FavoriteItemType
): Promise<Set<string>> {
  const { data } = await supabase
    .from("favorites")
    .select("item_id")
    .eq("user_id", userId)
    .eq("item_type", itemType);
  return new Set((data ?? []).map((f) => f.item_id));
}

// ── Add Favorite ──────────────────────────────────────────────────────────────

export async function addFavorite(
  userId: string,
  itemType: FavoriteItemType,
  itemId: string
) {
  const { data, error } = await supabase
    .from("favorites")
    .insert({ user_id: userId, item_type: itemType, item_id: itemId })
    .select()
    .single();
  return { data, error };
}

// ── Remove Favorite ───────────────────────────────────────────────────────────

export async function removeFavorite(
  userId: string,
  itemType: FavoriteItemType,
  itemId: string
) {
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  return { error };
}

// ── Toggle Favorite ───────────────────────────────────────────────────────────

export async function toggleFavorite(
  userId: string,
  itemType: FavoriteItemType,
  itemId: string
): Promise<{ favorited: boolean; error: unknown }> {
  const { favorited } = await isFavorited(userId, itemType, itemId);

  if (favorited) {
    const { error } = await removeFavorite(userId, itemType, itemId);
    return { favorited: false, error };
  } else {
    const { error } = await addFavorite(userId, itemType, itemId);
    return { favorited: true, error };
  }
}

// ── Get Favorite Counts ───────────────────────────────────────────────────────

export async function getFavoriteCounts(userId: string) {
  const { data, error } = await supabase
    .from("favorites")
    .select("item_type")
    .eq("user_id", userId);

  if (error || !data) return { counts: null, error };

  const counts = {
    previous_exam: 0,
    entrance_exam: 0,
    book: 0,
    event: 0,
    total: data.length,
  };

  for (const row of data) {
    const key = row.item_type as FavoriteItemType;
    if (key in counts) {
      counts[key]++;
    }
  }

  return { counts, error: null };
}
