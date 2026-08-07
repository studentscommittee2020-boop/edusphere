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

      print_documents: {
        Row: {
          id: string;
          doctor_id: string;
          title: string;
          course_id: string | null;
          copies: number;
          page_count: number | null;
          notes: string;
          storage_path: string;
          original_name: string;
          mime_type: "application/pdf";
          size_bytes: number;
          status: "requested" | "printing" | "ready" | "completed" | "cancelled";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          title: string;
          course_id?: string | null;
          copies?: number;
          page_count?: number | null;
          notes?: string;
          storage_path: string;
          original_name: string;
          mime_type: "application/pdf";
          size_bytes: number;
          status?: "requested" | "printing" | "ready" | "completed" | "cancelled";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          title?: string;
          course_id?: string | null;
          copies?: number;
          page_count?: number | null;
          notes?: string;
          storage_path?: string;
          original_name?: string;
          mime_type?: "application/pdf";
          size_bytes?: number;
          status?: "requested" | "printing" | "ready" | "completed" | "cancelled";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      assignments: {
        Row: {
          id: string;
          doctor_id: string;
          course_id: string | null;
          title: string;
          description: string;
          target_major: string | null;
          target_semester: string | null;
          target_track: "french" | "english" | null;
          due_at: string | null;
          allow_late: boolean;
          max_submissions: number;
          attachment_path: string | null;
          attachment_name: string | null;
          attachment_mime_type: "application/pdf" | null;
          attachment_size_bytes: number | null;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          /** New assignments are course-backed; nullable rows are legacy-only. */
          course_id: string;
          title: string;
          description?: string;
          target_major?: string | null;
          target_semester?: string | null;
          target_track?: "french" | "english" | null;
          due_at?: string | null;
          allow_late?: boolean;
          max_submissions?: number;
          attachment_path?: string | null;
          attachment_name?: string | null;
          attachment_mime_type?: "application/pdf" | null;
          attachment_size_bytes?: number | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          course_id?: string | null;
          title?: string;
          description?: string;
          target_major?: string | null;
          target_semester?: string | null;
          target_track?: "french" | "english" | null;
          due_at?: string | null;
          allow_late?: boolean;
          max_submissions?: number;
          attachment_path?: string | null;
          attachment_name?: string | null;
          attachment_mime_type?: "application/pdf" | null;
          attachment_size_bytes?: number | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      assignment_submissions: {
        Row: {
          id: string;
          assignment_id: string;
          student_id: string;
          attempt_number: number;
          storage_path: string;
          original_name: string;
          mime_type: "application/pdf";
          size_bytes: number;
          message: string;
          status: "submitted" | "late" | "returned" | "graded";
          grade: number | null;
          feedback: string;
          submitted_at: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          student_id: string;
          attempt_number: number;
          storage_path: string;
          original_name: string;
          mime_type: "application/pdf";
          size_bytes: number;
          message?: string;
          status?: "submitted" | "late" | "returned" | "graded";
          grade?: number | null;
          feedback?: string;
          submitted_at?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          assignment_id?: string;
          student_id?: string;
          attempt_number?: number;
          storage_path?: string;
          original_name?: string;
          mime_type?: "application/pdf";
          size_bytes?: number;
          message?: string;
          status?: "submitted" | "late" | "returned" | "graded";
          grade?: number | null;
          feedback?: string;
          submitted_at?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
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
            | "Audit & Accounting"
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
            | "LS7"
            | "LS8"
            | "LS9"
            | null;
          track: "french" | "english" | null;
          phone: string | null;
          role: "student" | "doctor" | "committee_admin" | "admin";
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
            | "Audit & Accounting"
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
            | "LS7"
            | "LS8"
            | "LS9"
            | null;
          track?: "french" | "english" | null;
          phone?: string | null;
          role?: "student" | "doctor" | "committee_admin" | "admin";
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
            | "Audit & Accounting"
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
            | "LS7"
            | "LS8"
            | "LS9"
            | null;
          track?: "french" | "english" | null;
          phone?: string | null;
          role?: "student" | "doctor" | "committee_admin" | "admin";
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
          semester: "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6" | "LS7" | "LS8" | "LS9";
          major:
            | "Common"
            | "Audit & Accounting"
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
          semester: "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6" | "LS7" | "LS8" | "LS9";
          major:
            | "Common"
            | "Audit & Accounting"
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
          semester?: "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6" | "LS7" | "LS8" | "LS9";
          major?:
            | "Common"
            | "Audit & Accounting"
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
            | "Audit & Accounting"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS";
          semester: "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6" | "LS7" | "LS8" | "LS9";
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
            | "Audit & Accounting"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS";
          semester: "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6" | "LS7" | "LS8" | "LS9";
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
            | "Audit & Accounting"
            | "Finance"
            | "Marketing"
            | "Management"
            | "MIS";
          semester?: "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6" | "LS7" | "LS8" | "LS9";
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

      owner_emails: {
        Row: {
          id: string;
          email: string;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          note?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          note?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      student_enrollments: {
        Row: {
          id: string;
          student_id: string;
          course_id: string;
          academic_year: string;
          semester: Semester;
          status: "enrolled" | "completed" | "withdrawn" | "failed";
          grade: number | null;
          source: "university" | "manual";
          synced_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          course_id: string;
          academic_year: string;
          semester: Semester;
          status?: "enrolled" | "completed" | "withdrawn" | "failed";
          grade?: number | null;
          source?: "university" | "manual";
          synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          course_id?: string;
          academic_year?: string;
          semester?: Semester;
          status?: "enrolled" | "completed" | "withdrawn" | "failed";
          grade?: number | null;
          source?: "university" | "manual";
          synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_enrollments_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_enrollments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      schedule_entries: {
        Row: {
          id: string;
          student_id: string;
          course_id: string | null;
          course_label: string;
          academic_year: string;
          semester: Semester;
          /** ISO-8601: 1 = Monday … 7 = Sunday. */
          day_of_week: number;
          starts_at: string;
          ends_at: string;
          room: string;
          instructor: string;
          kind: "lecture" | "td" | "tp" | "exam" | "other";
          synced_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          course_id?: string | null;
          course_label: string;
          academic_year: string;
          semester: Semester;
          day_of_week: number;
          starts_at: string;
          ends_at: string;
          room?: string;
          instructor?: string;
          kind?: "lecture" | "td" | "tp" | "exam" | "other";
          synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          course_id?: string | null;
          course_label?: string;
          academic_year?: string;
          semester?: Semester;
          day_of_week?: number;
          starts_at?: string;
          ends_at?: string;
          room?: string;
          instructor?: string;
          kind?: "lecture" | "td" | "tp" | "exam" | "other";
          synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_entries_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_entries_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      academic_sync_state: {
        Row: {
          student_id: string;
          last_synced_at: string;
          last_status: "ok" | "failed" | "partial";
          entry_count: number;
          course_count: number;
        };
        Insert: {
          student_id: string;
          last_synced_at?: string;
          last_status?: "ok" | "failed" | "partial";
          entry_count?: number;
          course_count?: number;
        };
        Update: {
          student_id?: string;
          last_synced_at?: string;
          last_status?: "ok" | "failed" | "partial";
          entry_count?: number;
          course_count?: number;
        };
        Relationships: [];
      };

      course_materials: {
        Row: {
          id: string;
          doctor_id: string;
          course_id: string;
          title: string;
          description: string;
          kind: "notes" | "slides" | "reading" | "correction" | "other";
          storage_path: string;
          original_name: string;
          mime_type: "application/pdf";
          size_bytes: number;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          course_id: string;
          title: string;
          description?: string;
          kind?: "notes" | "slides" | "reading" | "correction" | "other";
          storage_path: string;
          original_name: string;
          mime_type: "application/pdf";
          size_bytes: number;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          course_id?: string;
          title?: string;
          description?: string;
          kind?: "notes" | "slides" | "reading" | "correction" | "other";
          storage_path?: string;
          original_name?: string;
          mime_type?: "application/pdf";
          size_bytes?: number;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_materials_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_materials_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      telemetry_events: {
        Row: {
          id: string;
          user_id: string | null;
          anonymous_id: string;
          session_id: string;
          event_name: string;
          path: string;
          referrer: string;
          properties: Json;
          user_agent: string;
          locale: string;
          timezone: string;
          viewport: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          anonymous_id?: string;
          session_id?: string;
          event_name: string;
          path?: string;
          referrer?: string;
          properties?: Json;
          user_agent?: string;
          locale?: string;
          timezone?: string;
          viewport?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          anonymous_id?: string;
          session_id?: string;
          event_name?: string;
          path?: string;
          referrer?: string;
          properties?: Json;
          user_agent?: string;
          locale?: string;
          timezone?: string;
          viewport?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      exam_reports: {
        Row: {
          id: string;
          previous_exam_id: string;
          reporter_id: string;
          kind: "problem" | "quality";
          problem_type:
            | "unreadable"
            | "wrong_course"
            | "wrong_year"
            | "wrong_track"
            | "missing_pages"
            | "duplicate"
            | "corrupt_file"
            | "other"
            | null;
          quality_rating: number | null;
          message: string;
          status: "open" | "reviewing" | "resolved" | "dismissed";
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          previous_exam_id: string;
          reporter_id: string;
          kind: "problem" | "quality";
          problem_type?:
            | "unreadable"
            | "wrong_course"
            | "wrong_year"
            | "wrong_track"
            | "missing_pages"
            | "duplicate"
            | "corrupt_file"
            | "other"
            | null;
          quality_rating?: number | null;
          message?: string;
          status?: "open" | "reviewing" | "resolved" | "dismissed";
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          previous_exam_id?: string;
          reporter_id?: string;
          kind?: "problem" | "quality";
          problem_type?:
            | "unreadable"
            | "wrong_course"
            | "wrong_year"
            | "wrong_track"
            | "missing_pages"
            | "duplicate"
            | "corrupt_file"
            | "other"
            | null;
          quality_rating?: number | null;
          message?: string;
          status?: "open" | "reviewing" | "resolved" | "dismissed";
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_reports_previous_exam_id_fkey";
            columns: ["previous_exam_id"];
            isOneToOne: false;
            referencedRelation: "previous_exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      exam_download_events: {
        Row: {
          id: string;
          user_id: string;
          previous_exam_id: string;
          storage_path: string;
          ip_hash: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          previous_exam_id: string;
          storage_path: string;
          ip_hash?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          previous_exam_id?: string;
          storage_path?: string;
          ip_hash?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_download_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_download_events_previous_exam_id_fkey";
            columns: ["previous_exam_id"];
            isOneToOne: false;
            referencedRelation: "previous_exams";
            referencedColumns: ["id"];
          },
        ];
      };

      impersonation_sessions: {
        Row: {
          id: string;
          owner_id: string;
          target_user_id: string;
          reason: string;
          started_at: string;
          expires_at: string;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          target_user_id: string;
          reason: string;
          started_at?: string;
          expires_at: string;
          ended_at?: string | null;
        };
        Update: {
          id?: string;
          owner_id?: string;
          target_user_id?: string;
          reason?: string;
          started_at?: string;
          expires_at?: string;
          ended_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impersonation_sessions_target_user_id_fkey";
            columns: ["target_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      doctor_courses: {
        Row: {
          id: string;
          doctor_id: string;
          course_id: string;
          academic_year: string;
          semester: Semester;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          course_id: string;
          academic_year: string;
          semester: Semester;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          course_id?: string;
          academic_year?: string;
          semester?: Semester;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doctor_courses_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "doctor_courses_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };

      exam_submissions: {
        Row: {
          id: string;
          uploader_id: string;
          course_id: string | null;
          course_title: string;
          course_title_fr: string;
          major: Major;
          semester: Semester;
          track: Track;
          year: string;
          exam_type: "partiel" | "midterm" | "resit";
          pages: number;
          storage_path: string;
          original_name: string;
          mime_type: "application/pdf";
          size_bytes: number;
          status: "pending" | "approved" | "rejected";
          reviewed_by: string | null;
          reviewed_at: string | null;
          rejection_reason: string;
          approved_exam_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          uploader_id: string;
          course_id?: string | null;
          course_title: string;
          course_title_fr: string;
          major: Major;
          semester: Semester;
          track?: Track;
          year: string;
          exam_type: "partiel" | "midterm" | "resit";
          pages?: number;
          storage_path: string;
          original_name: string;
          mime_type: "application/pdf";
          size_bytes: number;
          status?: "pending" | "approved" | "rejected";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string;
          approved_exam_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          uploader_id?: string;
          course_id?: string | null;
          course_title?: string;
          course_title_fr?: string;
          major?: Major;
          semester?: Semester;
          track?: Track;
          year?: string;
          exam_type?: "partiel" | "midterm" | "resit";
          pages?: number;
          storage_path?: string;
          original_name?: string;
          mime_type?: "application/pdf";
          size_bytes?: number;
          status?: "pending" | "approved" | "rejected";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string;
          approved_exam_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_submissions_uploader_id_fkey";
            columns: ["uploader_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_submissions_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_submissions_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_submissions_approved_exam_id_fkey";
            columns: ["approved_exam_id"];
            isOneToOne: false;
            referencedRelation: "previous_exams";
            referencedColumns: ["id"];
          },
        ];
      };
    };

    Views: {
      /** Read-only union of every resource attached to a course. */
      course_resources: {
        Row: {
          resource_id: string;
          resource_kind: "exam" | "material" | "assignment";
          course_id: string | null;
          title: string;
          subtitle: string;
          track: "french" | "english" | null;
          storage_path: string | null;
          bucket: string;
          created_at: string;
        };
        Relationships: [];
      };

      /** Per-exam average rating and report counts (011). Aggregated only — never exposes reporter identity or report content. */
      exam_quality_summary: {
        Row: {
          previous_exam_id: string;
          avg_rating: number | null;
          quality_report_count: number;
          problem_report_count: number;
        };
        Relationships: [];
      };
    };

    Functions: {
      is_owner: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      sync_student_academics: {
        Args: {
          p_student_id: string;
          p_academic_year: string;
          p_semester: Semester;
          p_enrollments: Json;
          p_schedule: Json;
        };
        Returns: Json;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_doctor: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_committee_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_verified_student: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      log_session_file_access: {
        Args: { p_storage_path: string };
        Returns: undefined;
      };
      submit_assignment: {
        Args: {
          p_assignment_id: string;
          p_storage_path: string;
          p_original_name: string;
          p_mime_type: string;
          p_size_bytes: number;
          p_message?: string;
        };
        Returns: Database["public"]["Tables"]["assignment_submissions"]["Row"];
      };
      require_portal_mfa: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      assignment_visible_to_current_student: {
        Args: { p_assignment_id: string };
        Returns: boolean;
      };
      transition_print_document: {
        Args: {
          p_document_id: string;
          p_status: "printing" | "ready" | "completed" | "cancelled";
        };
        Returns: Database["public"]["Tables"]["print_documents"]["Row"];
      };
      review_assignment_submission: {
        Args: {
          p_submission_id: string;
          p_status: "returned" | "graded";
          p_grade?: number | null;
          p_feedback?: string;
        };
        Returns: Database["public"]["Tables"]["assignment_submissions"]["Row"];
      };
      get_assignment_portal_feed: {
        Args: Record<PropertyKey, never>;
        Returns: AssignmentPortalFeed[];
      };
      authorize_and_log_portal_file_access: {
        Args: { p_bucket_id: string; p_storage_path: string };
        Returns: boolean;
      };
      get_dashboard_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          total_exams: number;
          total_entrance_exams: number;
          total_events: number;
          total_courses: number;
          total_materials: number;
        };
      };
      get_user_dashboard_stats: {
        Args: { p_major?: string | null; p_semester?: string | null };
        Returns: {
          exams_for_major: number;
          exams_for_semester: number;
          upcoming_events: number;
          user_favorites: number;
          enrolled_courses: number;
          pending_assignments: number;
        };
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
      submit_exam_report: {
        Args: {
          p_previous_exam_id: string;
          p_kind: string;
          p_problem_type?: string | null;
          p_quality_rating?: number | null;
          p_message?: string;
        };
        Returns: Database["public"]["Tables"]["exam_reports"]["Row"];
      };
      request_exam_download: {
        Args: { p_exam_id: string };
        Returns: Json;
      };
      effective_user_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      current_impersonation: {
        Args: Record<PropertyKey, never>;
        /** SQL function, non-SETOF, bare SELECT ... LIMIT 1: returns NULL when the caller has no active session — genuinely nullable, not an error path. */
        Returns: Database["public"]["Tables"]["impersonation_sessions"]["Row"] | null;
      };
      start_impersonation: {
        Args: { p_target_user_id: string; p_reason: string };
        Returns: Database["public"]["Tables"]["impersonation_sessions"]["Row"];
      };
      end_impersonation: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      set_doctor_courses: {
        Args: { p_assignments: Json };
        Returns: Database["public"]["Tables"]["doctor_courses"]["Row"][];
      };
      can_read_exam_submission: {
        Args: { p_storage_path: string };
        Returns: boolean;
      };
      submit_exam_for_review: {
        Args: {
          p_course_id: string;
          p_track: string | null;
          p_year: string;
          p_exam_type: string;
          p_pages: number | null;
          p_storage_path: string;
          p_original_name: string;
          p_mime_type: string;
          p_size_bytes: number;
        };
        Returns: Database["public"]["Tables"]["exam_submissions"]["Row"];
      };
      approve_exam_submission: {
        Args: {
          p_submission_id: string;
          p_final_storage_path: string;
          p_final_course_id?: string | null;
          p_final_track?: string | null;
          p_final_year?: string | null;
          p_final_exam_type?: string | null;
          p_final_pages?: number | null;
        };
        Returns: Database["public"]["Tables"]["previous_exams"]["Row"];
      };
      reject_exam_submission: {
        Args: { p_submission_id: string; p_rejection_reason: string };
        Returns: Database["public"]["Tables"]["exam_submissions"]["Row"];
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

/** Extract the Row type for a given view name */
export type ViewRow<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];

// ── Named row type aliases for convenience ──────────────────────────────────

export type Profile = Tables<"profiles">;
export type Course = Tables<"courses">;
export type PreviousExam = Tables<"previous_exams">;
export type EntranceExam = Tables<"entrance_exams">;
export type Event = Tables<"events">;
export type EventRegistration = Tables<"event_registrations">;
export type AdminEmail = Tables<"admin_emails">;
export type Favorite = Tables<"favorites">;
export type PrintDocument = Tables<"print_documents">;
export type Assignment = Tables<"assignments">;
export type AssignmentSubmission = Tables<"assignment_submissions">;
export type AssignmentPortalFeed = {
  assignment_id: string;
  doctor_id: string;
  course_id: string | null;
  title: string;
  description: string;
  target_major: string | null;
  target_semester: string | null;
  target_track: string | null;
  due_at: string | null;
  allow_late: boolean;
  max_submissions: number;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size_bytes: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  submissions: Json;
};
export type AuditLog = Tables<"audit_logs">;
export type OwnerEmail = Tables<"owner_emails">;
export type StudentEnrollment = Tables<"student_enrollments">;
export type ScheduleEntry = Tables<"schedule_entries">;
export type AcademicSyncState = Tables<"academic_sync_state">;
export type CourseMaterial = Tables<"course_materials">;
export type TelemetryEvent = Tables<"telemetry_events">;
export type CourseResource = ViewRow<"course_resources">;
export type ExamReport = Tables<"exam_reports">;
export type ExamDownloadEvent = Tables<"exam_download_events">;
export type ImpersonationSession = Tables<"impersonation_sessions">;
export type DoctorCourse = Tables<"doctor_courses">;
export type ExamSubmission = Tables<"exam_submissions">;
export type ExamQualitySummary = ViewRow<"exam_quality_summary">;

// ── Enum-like constants (matching CHECK constraints) ────────────────────────

export const LANGUAGES = ["fr", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const MAJORS = [
  "Common",
  "Audit & Accounting",
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
  "LS7",
  "LS8",
  "LS9",
] as const;
export type Semester = (typeof SEMESTERS)[number];

export const TRACKS = ["french", "english"] as const;
export type Track = (typeof TRACKS)[number];

export const COURSE_TYPES = ["common", "major"] as const;
export type CourseType = (typeof COURSE_TYPES)[number];

export const EXAM_TYPES = ["partiel", "midterm", "resit"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const EVENT_TYPES = ["upcoming", "past"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const USER_ROLES = ["student", "doctor", "committee_admin", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
