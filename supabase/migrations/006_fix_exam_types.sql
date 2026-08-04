-- ============================================================================
-- EduSphere v2 -- Fix Exam Types
-- Standardizes exam_type to match app expectations: partiel, midterm, resit
-- Created: 2026-04-23
-- ============================================================================

-- First, update existing data to map old values to new ones
-- 'midterms' -> 'midterm'
-- 'final' -> 'partiel' (final exam ~ partiel in French educational context)

UPDATE public.previous_exams
SET exam_type = 'midterm'
WHERE exam_type = 'midterms';

UPDATE public.previous_exams
SET exam_type = 'partiel'
WHERE exam_type = 'final';

-- Now update the constraint on the previous_exams table
ALTER TABLE public.previous_exams
DROP CONSTRAINT IF EXISTS previous_exams_exam_type_check;

ALTER TABLE public.previous_exams
ADD CONSTRAINT previous_exams_exam_type_check
  CHECK (exam_type IN ('partiel', 'midterm', 'resit'));

-- ============================================================================
-- END OF MIGRATION 006
-- ============================================================================
