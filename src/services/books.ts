import { supabase } from "@/lib/supabase";

export interface BookFilters {
  major?: string;
  track?: "french" | "english" | "both";
  search?: string;
  inStock?: boolean;
}

// ── Books Query ───────────────────────────────────────────────────────────────

export async function getBooks(filters?: BookFilters) {
  let query = supabase
    .from("books")
    .select("*")
    .order("rating", { ascending: false });

  if (filters?.major && filters.major !== "all") {
    query = query.eq("major", filters.major);
  }
  if (filters?.track && filters.track !== "all" as string) {
    query = query.or(`track.eq.${filters.track},track.eq.both`);
  }
  if (filters?.inStock) {
    query = query.eq("in_stock", true);
  }
  if (filters?.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,title_fr.ilike.%${filters.search}%,author.ilike.%${filters.search}%`
    );
  }

  const { data, error } = await query;
  return { data, error };
}

export async function getBookById(id: string) {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("id", id)
    .single();
  return { data, error };
}

export async function getBooksByCourseCode(courseCode: string) {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .contains("related_courses", [courseCode]);
  return { data, error };
}

// ── Cart Operations ──────────────────────────────────────────────────────────

export async function getCartItems(userId: string) {
  const { data, error } = await supabase
    .from("cart_items")
    .select("*, books(*)")
    .eq("user_id", userId)
    .order("created_at");
  return { data, error };
}

export async function addToCart(userId: string, bookId: string, quantity = 1) {
  // Upsert: if item already in cart, increment quantity
  const { data: existing } = await supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from("cart_items")
      .update({ quantity: existing.quantity + quantity })
      .eq("id", existing.id)
      .select("*, books(*)")
      .single();
    return { data, error };
  }

  const { data, error } = await supabase
    .from("cart_items")
    .insert({ user_id: userId, book_id: bookId, quantity })
    .select("*, books(*)")
    .single();
  return { data, error };
}

export async function updateCartQuantity(cartItemId: string, quantity: number) {
  if (quantity <= 0) {
    return removeFromCart(cartItemId);
  }
  const { data, error } = await supabase
    .from("cart_items")
    .update({ quantity })
    .eq("id", cartItemId)
    .select("*, books(*)")
    .single();
  return { data, error };
}

export async function removeFromCart(cartItemId: string) {
  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("id", cartItemId);
  return { error };
}

export async function clearCart(userId: string) {
  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("user_id", userId);
  return { error };
}

// ── Cart Count ────────────────────────────────────────────────────────────────

export async function getCartCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from("cart_items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

// ── Orders ───────────────────────────────────────────────────────────────────

export interface CreateOrderParams {
  userId: string;
  userEmail: string;
  fullName: string;
  phone: string;
  deliveryAddress: string;
  city?: string;
  orderNotes?: string;
  items: Array<{ bookId: string; quantity: number; price: number }>;
}

const DELIVERY_FEE = 5000; // Fixed delivery fee in LBP

export async function createOrder(params: CreateOrderParams) {
  const subtotal = params.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const total = subtotal + DELIVERY_FEE;

  // 1. Create order record
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: params.userId,
      user_email: params.userEmail,
      full_name: params.fullName,
      phone: params.phone,
      delivery_address: params.deliveryAddress,
      city: params.city ?? "",
      order_notes: params.orderNotes ?? "",
      subtotal,
      delivery_fee: DELIVERY_FEE,
      total,
      status: "pending",
    })
    .select()
    .single();

  if (orderError || !order) return { data: null, error: orderError };

  // 2. Create order items
  const orderItems = params.items.map((item) => ({
    order_id: order.id,
    book_id: item.bookId,
    quantity: item.quantity,
    unit_price: item.price,
  }));

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(orderItems);

  if (itemsError) {
    // Attempt to clean up the orphaned order
    await supabase.from("orders").delete().eq("id", order.id);
    return { data: null, error: itemsError };
  }

  // 3. Clear cart
  await clearCart(params.userId);

  return { data: order, error: null };
}

export async function getUserOrders(userId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*, books(id, title, title_fr, cover_image_url, price))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return { data, error };
}

export async function getOrderById(orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*, books(id, title, title_fr, cover_image_url, price))")
    .eq("id", orderId)
    .single();
  return { data, error };
}
