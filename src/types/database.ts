/**
 * EduSphere v2 -- Supabase Database Types
 * Auto-generated to match 001_initial_schema.sql
 *
 * Usage with supabase-js:
 *   import { createClient } from '@supabase/supabase-js'
 *   import type { Database } from '@/types/database'
 *   const supabase = createClient<Database>(url, key)
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      admin_emails: {
        Row: {
          id: string;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      profiles: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string;
          language: "fr" | "en";
          major:
            | "Common"
            | "Audit"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS"
            | null;
          semester:
            | "LS1"
            | "LS2"
            | "LS3"
            | "LS4"
            | "LS5"
            | "LS6"
            | null;
          track: "french" | "english" | null;
          role: "student" | "admin";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          avatar_url?: string;
          language?: "fr" | "en";
          major?:
            | "Common"
            | "Audit"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS"
            | null;
          semester?:
            | "LS1"
            | "LS2"
            | "LS3"
            | "LS4"
            | "LS5"
            | "LS6"
            | null;
          track?: "french" | "english" | null;
          role?: "student" | "admin";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          avatar_url?: string;
          language?: "fr" | "en";
          major?:
            | "Common"
            | "Audit"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS"
            | null;
          semester?:
            | "LS1"
            | "LS2"
            | "LS3"
            | "LS4"
            | "LS5"
            | "LS6"
            | null;
          track?: "french" | "english" | null;
          role?: "student" | "admin";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };

      courses: {
        Row: {
          id: string;
          code: string | null;
          title: string;
          title_fr: string;
          credits: number;
          semester: "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6";
          major:
            | "Common"
            | "Audit"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS";
          type: "common" | "major";
          track: "french" | "english";
          description: string;
          description_fr: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code?: string | null;
          title: string;
          title_fr: string;
          credits?: number;
          semester: "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6";
          major:
            | "Common"
            | "Audit"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS";
          type?: "common" | "major";
          track?: "french" | "english";
          description?: string;
          description_fr?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string | null;
          title?: string;
          title_fr?: string;
          credits?: number;
          semester?: "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6";
          major?:
            | "Common"
            | "Audit"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS";
          type?: "common" | "major";
          track?: "french" | "english";
          description?: string;
          description_fr?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      previous_exams: {
        Row: {
          id: string;
          course_id: string;
          course_title: string;
          course_title_fr: string;
          major:
            | "Common"
            | "Audit"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS";
          semester: "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6";
          year: string;
          exam_type: "partiel" | "midterm" | "resit";
          pages: number;
          rating: number;
          track: "french" | "english";
          file_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          course_title: string;
          course_title_fr: string;
          major:
            | "Common"
            | "Audit"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS";
          semester: "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6";
          year: string;
          exam_type: "partiel" | "midterm" | "resit";
          pages?: number;
          rating?: number;
          track?: "french" | "english";
          file_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          course_title?: string;
          course_title_fr?: string;
          major?:
            | "Common"
            | "Audit"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS";
          semester?: "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6";
          year?: string;
          exam_type?: "partiel" | "midterm" | "resit";
          pages?: number;
          rating?: number;
          track?: "french" | "english";
          file_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "previous_exams_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };

      entrance_exams: {
        Row: {
          id: string;
          title: string;
          title_fr: string;
          subject: string;
          exam_lang: string;
          year: string;
          difficulty: "Easy" | "Medium" | "Hard";
          pages: number;
          rating: number;
          description: string;
          description_fr: string;
          file_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          title_fr: string;
          subject: string;
          exam_lang?: string;
          year: string;
          difficulty?: "Easy" | "Medium" | "Hard";
          pages?: number;
          rating?: number;
          description?: string;
          description_fr?: string;
          file_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          title_fr?: string;
          subject?: string;
          exam_lang?: string;
          year?: string;
          difficulty?: "Easy" | "Medium" | "Hard";
          pages?: number;
          rating?: number;
          description?: string;
          description_fr?: string;
          file_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      books: {
        Row: {
          id: string;
          title: string;
          title_fr: string;
          author: string;
          price: number;
          rating: number;
          major:
            | "Common"
            | "Audit"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS";
          semesters: string;
          in_stock: boolean;
          related_courses: string[];
          track: "french" | "english" | "both";
          cover_image_url: string | null;
          description: string;
          description_fr: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          title_fr: string;
          author: string;
          price?: number;
          rating?: number;
          major:
            | "Common"
            | "Audit"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS";
          semesters?: string;
          in_stock?: boolean;
          related_courses?: string[];
          track?: "french" | "english" | "both";
          cover_image_url?: string | null;
          description?: string;
          description_fr?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          title_fr?: string;
          author?: string;
          price?: number;
          rating?: number;
          major?:
            | "Common"
            | "Audit"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS";
          semesters?: string;
          in_stock?: boolean;
          related_courses?: string[];
          track?: "french" | "english" | "both";
          cover_image_url?: string | null;
          description?: string;
          description_fr?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      events: {
        Row: {
          id: string;
          title: string;
          date: string;
          time: string;
          location: string;
          attendees: number;
          tag: string;
          description: string;
          type: "upcoming" | "past";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          date: string;
          time?: string;
          location?: string;
          attendees?: number;
          tag?: string;
          description?: string;
          type?: "upcoming" | "past";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          date?: string;
          time?: string;
          location?: string;
          attendees?: number;
          tag?: string;
          description?: string;
          type?: "upcoming" | "past";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      event_registrations: {
        Row: {
          id: string;
          user_id: string;
          event_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          event_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_registrations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_registrations_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };

      cart_items: {
        Row: {
          id: string;
          user_id: string;
          book_id: string;
          quantity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          book_id: string;
          quantity?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          book_id?: string;
          quantity?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cart_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cart_items_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
        ];
      };

      orders: {
        Row: {
          id: string;
          user_id: string;
          status:
            | "pending"
            | "confirmed"
            | "processing"
            | "shipped"
            | "delivered"
            | "cancelled";
          total: number;
          subtotal: number;
          delivery_fee: number;
          user_email: string;
          full_name: string;
          phone: string;
          delivery_address: string;
          city: string;
          order_notes: string;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?:
            | "pending"
            | "confirmed"
            | "processing"
            | "shipped"
            | "delivered"
            | "cancelled";
          total?: number;
          subtotal?: number;
          delivery_fee?: number;
          user_email?: string;
          full_name?: string;
          phone?: string;
          delivery_address?: string;
          city?: string;
          order_notes?: string;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?:
            | "pending"
            | "confirmed"
            | "processing"
            | "shipped"
            | "delivered"
            | "cancelled";
          total?: number;
          subtotal?: number;
          delivery_fee?: number;
          user_email?: string;
          full_name?: string;
          phone?: string;
          delivery_address?: string;
          city?: string;
          order_notes?: string;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      favorites: {
        Row: {
          id: string;
          user_id: string;
          item_type: "previous_exam" | "entrance_exam" | "book" | "event";
          item_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          item_type: "previous_exam" | "entrance_exam" | "book" | "event";
          item_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          item_type?: "previous_exam" | "entrance_exam" | "book" | "event";
          item_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      order_items: {
        Row: {
          id: string;
          order_id: string;
          book_id: string;
          quantity: number;
          unit_price: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          book_id: string;
          quantity?: number;
          unit_price?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          book_id?: string;
          quantity?: number;
          unit_price?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
        ];
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      get_dashboard_stats: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_user_dashboard_stats: {
        Args: { p_major?: string | null; p_semester?: string | null };
        Returns: Json;
      };
      get_recommended_exams: {
        Args: { p_major: string; p_semester?: string | null; p_limit?: number };
        Returns: Database["public"]["Tables"]["previous_exams"]["Row"][];
      };
      increment_event_attendees: {
        Args: { event_id: string };
        Returns: undefined;
      };
      decrement_event_attendees: {
        Args: { event_id: string };
        Returns: undefined;
      };
    };

    Enums: {
      [_ in never]: never;
    };

    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// ── Convenience type helpers ────────────────────────────────────────────────

/** Extract the Row type for a given table name */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

/** Extract the Insert type for a given table name */
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

/** Extract the Update type for a given table name */
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

// ── Named row type aliases for convenience ──────────────────────────────────

export type Profile = Tables<"profiles">;
export type Course = Tables<"courses">;
export type PreviousExam = Tables<"previous_exams">;
export type EntranceExam = Tables<"entrance_exams">;
export type Book = Tables<"books">;
export type Event = Tables<"events">;
export type EventRegistration = Tables<"event_registrations">;
export type CartItem = Tables<"cart_items">;
export type Order = Tables<"orders">;
export type OrderItem = Tables<"order_items">;
export type AdminEmail = Tables<"admin_emails">;
export type Favorite = Tables<"favorites">;

// ── Enum-like constants (matching CHECK constraints) ────────────────────────

export const LANGUAGES = ["fr", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const MAJORS = [
  "Common",
  "Audit",
  "Finance",
  "Marketing",
  "Management",
  "MIS",
] as const;
export type Major = (typeof MAJORS)[number];

export const SEMESTERS = [
  "LS1",
  "LS2",
  "LS3",
  "LS4",
  "LS5",
  "LS6",
] as const;
export type Semester = (typeof SEMESTERS)[number];

export const TRACKS = ["french", "english"] as const;
export type Track = (typeof TRACKS)[number];

export const BOOK_TRACKS = ["french", "english", "both"] as const;
export type BookTrack = (typeof BOOK_TRACKS)[number];

export const COURSE_TYPES = ["common", "major"] as const;
export type CourseType = (typeof COURSE_TYPES)[number];

export const EXAM_TYPES = ["partiel", "midterm", "resit"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const EVENT_TYPES = ["upcoming", "past"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const USER_ROLES = ["student", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
