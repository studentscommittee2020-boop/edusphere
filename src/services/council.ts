import { supabase } from "@/lib/supabase";
import type {
  Course,
  ExamReport,
  ExamSubmission,
  ExamType,
  PreviousExam,
  Profile,
  Track,
} from "@/types/database";
import type { ExamReportKind, ExamReportProblemType, ExamReportStatus } from "@/services/reports";

/**
 * Student council workspace (migrations 011 + 012): the committee-facing
 * review queue for doctor-submitted exams (exam_submissions, 012 §3) and the
 * triage queue for student-filed exam reports (exam_reports's
 * committee-facing half — the student-facing submit/read-own half already
 * lives in services/reports.ts and is untouched by this file).
 *
 * TYPES — src/types/database.ts has been regenerated since migrations
 * 011/012 landed, so exam_submissions, exam_reports and the RPCs this file
 * calls are all properly typed now (ExamSubmission, ExamReport, etc., with
 * real Relationships). This file therefore uses the real `supabase` client
 * throughout — no scoped/erased-client cast, unlike services/reports.ts's
 * `db`, which predates codegen catching up on these tables.
 *
 * EMBED SHAPE — read this before touching a `.select()` string below.
 * uploader_id/course_id (exam_submissions) and previous_exam_id
 * (exam_reports) are all forward FKs with no UNIQUE constraint on the
 * referencing column (many rows can share one parent), so their generated
 * `Relationships` entries carry `isOneToOne: false`. PostgREST itself always
 * returns a forward (child -> parent) embed as a single object or null,
 * never an array — but postgrest-js's compile-time embed-type parser types
 * the embed as an array here, keyed off that same `isOneToOne` flag without
 * regard to which side of the relationship is being queried (confirmed by
 * `tsc`: it infers `previous_exams` as an array on exam_reports, the same
 * pattern that would hit `uploader`/`courses` on exam_submissions).
 * `toOneEmbed()` below normalises whatever actually comes back — object,
 * null, or a one-element array — so the result is correct regardless of
 * which the client hands back, without trusting (or fighting) that inference
 * either way.
 *
 * APPROVAL SHAPE — read this before wiring a new caller. Postgres can move
 * rows between tables but cannot move bytes between Storage buckets. A
 * pending submission's PDF sits in the private exam-submissions-pending
 * bucket, while every live exam — and exam-download, unconditionally — reads
 * from exam-papers. approve_exam_submission() (the RPC) only ever touches
 * public.previous_exams and public.exam_submissions; it does not touch
 * storage.objects at all (see its own header comment in migration 012).
 * supabase/functions/approve-exam-submission/index.ts is what actually copies
 * the file first (service role, after an RLS-gated fetch of the submission
 * under the caller's own JWT), then calls the RPC as the reviewer. Its
 * request body is `{ submissionId, finalCourseId, finalTrack, finalYear,
 * finalExamType, finalPages }` (camelCase — read at the top of that file) and
 * its response is `{ ok: true, exam }` on success or `{ error: string }` with
 * a non-2xx status otherwise. approveExamSubmission() below is therefore a
 * thin wrapper over exactly that Edge Function, never over the RPC directly:
 * calling `.rpc("approve_exam_submission", ...)` straight from the browser
 * would create a live previous_exams row pointing at a file that is still
 * sitting in the private pending bucket, and every student download of it
 * would fail through exam-download. Rejection has no such problem —
 * reject_exam_submission() is pure DB state — so rejectExamSubmission() below
 * calls that RPC directly.
 */

/**
 * Normalises a PostgREST "to-one" embed to a single object or null,
 * regardless of whether the client typed (or returned) it as an array — see
 * the EMBED SHAPE note above. Used on every embedded relation this file reads.
 */
function toOneEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ── Exam submissions — doctor -> council review queue (migration 012 §3) ────

export type ExamSubmissionStatus = ExamSubmission["status"];

export type ExamSubmissionUploader = Pick<Profile, "id" | "full_name" | "avatar_url">;
export type ExamSubmissionCourseRef = Pick<Course, "id" | "title" | "title_fr" | "code" | "track">;

/** A submission joined to its uploader and course, ready for the review list. */
export interface ExamSubmissionWithRelations extends ExamSubmission {
  uploader: ExamSubmissionUploader | null;
  courses: ExamSubmissionCourseRef | null;
}

export interface ExamSubmissionFilters {
  status?: ExamSubmissionStatus;
}

// uploader_id and reviewed_by both reference profiles(id), so the embed below
// must disambiguate which FK it means or PostgREST rejects the query as
// ambiguous — `!uploader_id` is the referencing-column hint. course_id is
// exam_submissions' only FK to courses, so `courses(...)` needs no hint (same
// unaliased-embed shape services/academics.ts already uses for
// student_enrollments -> courses).
const SUBMISSION_SELECT =
  "*, uploader:profiles!uploader_id(id, full_name, avatar_url), courses(id, title, title_fr, code, track)";

/**
 * Every exam_submissions row visible to the caller (RLS: uploader sees their
 * own, committee/admin/owner see all), newest first, joined to the uploading
 * doctor's profile and the course. Pass `{ status: "pending" }` for the
 * review queue proper; omit filters for the full history (approved +
 * rejected included), which is what lets a rejection reason stay visible
 * after the fact instead of disappearing from the UI the moment it's acted on.
 */
export async function listExamSubmissions(filters?: ExamSubmissionFilters) {
  let query = supabase
    .from("exam_submissions")
    .select(SUBMISSION_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) return { data: [] as ExamSubmissionWithRelations[], error };

  const rows: ExamSubmissionWithRelations[] = (data ?? []).map((row) => ({
    ...row,
    uploader: toOneEmbed(row.uploader),
    courses: toOneEmbed(row.courses),
  }));
  return { data: rows, error: null };
}

/**
 * Short-lived signed URL for a still-pending submission's PDF, read from the
 * private exam-submissions-pending bucket. Gated server-side by
 * can_read_exam_submission() (012): the submission's own uploader, or a
 * committee/admin reviewer — nobody else. Once a submission is approved the
 * file has already moved to exam-papers (see approveExamSubmission below)
 * and this path stops resolving; that's expected, not a bug, since a
 * reviewer only ever needs this for an item still awaiting a decision.
 */
export async function getPendingSubmissionUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from("exam-submissions-pending")
    .createSignedUrl(storagePath, 60);
  return { url: data?.signedUrl ?? null, error };
}

export interface ApproveExamSubmissionInput {
  submissionId: string;
  /** Final values the Edge Function writes into the new previous_exams row. Send the
   * submission's own current value for anything the reviewer didn't change —
   * approve_exam_submission() COALESCEs against the original either way, so
   * an unchanged value round-trips as a no-op. */
  finalCourseId: string | null;
  finalTrack: Track | null;
  finalYear: string | null;
  finalExamType: ExamType | null;
  finalPages: number | null;
}

interface ApproveExamSubmissionResponseBody {
  ok?: boolean;
  exam?: PreviousExam;
  error?: string;
}

/**
 * Approves a pending submission through the Edge Function — see the file
 * header for why this must never be a direct `.rpc("approve_exam_submission")`
 * call. Returns the newly-created live previous_exams row on success.
 */
export async function approveExamSubmission(input: ApproveExamSubmissionInput) {
  const { data, error, response } = await supabase.functions.invoke<ApproveExamSubmissionResponseBody>(
    "approve-exam-submission",
    {
      body: {
        submissionId: input.submissionId,
        finalCourseId: input.finalCourseId,
        finalTrack: input.finalTrack,
        finalYear: input.finalYear,
        finalExamType: input.finalExamType,
        finalPages: input.finalPages,
      },
    },
  );

  if (error) {
    // Mirrors requestExamDownload() in services/reports.ts: invoke() leaves
    // `data` null on a non-2xx response and hands back the raw Response as
    // `response` — the JSON body (where the Edge Function's real `error`
    // message lives) is only reachable from there.
    const body = response ? await response.json().catch(() => null) : null;
    return { data: null, error: new Error(body?.error ?? "Could not approve that submission.") };
  }

  if (!data?.ok || !data.exam) {
    return { data: null, error: new Error(data?.error ?? "Could not approve that submission.") };
  }

  return { data: data.exam, error: null };
}

/**
 * Rejects a pending submission. Pure DB state — reject_exam_submission() is
 * called directly as an ordinary RPC, no Edge Function involved (contrast
 * approveExamSubmission above). `rejectionReason` is required by the RPC
 * itself (RAISE EXCEPTION on empty/whitespace-only input); this wrapper does
 * not pre-validate so the DB's own message surfaces if that ever changes.
 */
export async function rejectExamSubmission(submissionId: string, rejectionReason: string) {
  const { data, error } = await supabase.rpc("reject_exam_submission", {
    p_submission_id: submissionId,
    p_rejection_reason: rejectionReason,
  });
  if (error) return { data: null, error };
  return { data, error: null };
}

// ── Exam reports — committee triage (migration 011) ─────────────────────────

export interface ExamReportExamContext {
  id: string;
  course_title: string;
  course_title_fr: string;
  track: Track;
  year: string;
  exam_type: ExamType;
  file_url: string | null;
}

/**
 * A report row for committee triage. Deliberately omits reporter_id even
 * though exam_reports_select_committee_or_admin (011) technically allows a
 * reviewer to SELECT it — the job here is "is the FILE fine", not "who
 * complained", so the reporter's identity is left off the wire entirely
 * rather than fetched and then hidden in the UI. Joined to the previous_exams
 * row being reported on so triage has enough context to act (which course,
 * which year, and a way to open the actual file) without that meaning
 * exposing anything about the reporter.
 *
 * Based on the real generated ExamReport row type (Omit reporter_id); kind/
 * problem_type/status are re-pinned to services/reports.ts's named unions
 * (identical literal values to the generated inline unions) purely so this
 * file and the student-facing half in reports.ts share one vocabulary.
 */
export type CouncilExamReport = Omit<ExamReport, "reporter_id" | "kind" | "problem_type" | "status"> & {
  kind: ExamReportKind;
  problem_type: ExamReportProblemType | null;
  status: ExamReportStatus;
  previous_exams: ExamReportExamContext | null;
};

export interface ExamReportTriageFilters {
  status?: ExamReportStatus;
}

// reporter_id is intentionally not in this column list — see the
// CouncilExamReport doc comment above. previous_exam_id is exam_reports'
// only FK into previous_exams, so the embed needs no disambiguation hint.
const REPORT_TRIAGE_SELECT =
  "id, previous_exam_id, kind, problem_type, quality_rating, message, status, resolved_by, resolved_at, created_at, updated_at, previous_exams(id, course_title, course_title_fr, track, year, exam_type, file_url)";

/** Every exam_reports row visible to the caller for triage, newest first. */
export async function listExamReportsForTriage(filters?: ExamReportTriageFilters) {
  let query = supabase
    .from("exam_reports")
    .select(REPORT_TRIAGE_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) return { data: [] as CouncilExamReport[], error };

  const rows: CouncilExamReport[] = (data ?? []).map((row) => ({
    ...row,
    previous_exams: toOneEmbed(row.previous_exams),
  }));
  return { data: rows, error: null };
}

/**
 * Moves a report through triage (open -> reviewing -> resolved/dismissed).
 * Writes ONLY status/resolved_by/resolved_at — restrict_exam_report_review_fields_trigger
 * (011) raises an exception if a non-owner reviewer touches anything else on
 * a report they didn't file, so this must never spread other fields into the
 * update payload. resolved_by/resolved_at are cleared back to null when
 * moving to a non-terminal status (open/reviewing), matching how
 * submit_exam_report() itself clears them when a student reopens a report by
 * re-filing it.
 */
export async function updateExamReportStatus(
  reportId: string,
  status: ExamReportStatus,
  resolverId: string,
) {
  const isTerminal = status === "resolved" || status === "dismissed";
  const { data, error } = await supabase
    .from("exam_reports")
    .update({
      status,
      resolved_by: isTerminal ? resolverId : null,
      resolved_at: isTerminal ? new Date().toISOString() : null,
    })
    .eq("id", reportId)
    .select(REPORT_TRIAGE_SELECT)
    .single();

  if (error) return { data: null, error };

  const row: CouncilExamReport = { ...data, previous_exams: toOneEmbed(data.previous_exams) };
  return { data: row, error: null };
}

/**
 * Signed URL for the LIVE exam file (exam-papers bucket) a report is about —
 * lets a reviewer open the actual file while triaging, not just read the
 * report text. Committee/admin already has direct bucket read access via the
 * `session_files_staff_read` storage policy (011 §4), so this needs no
 * quota-checked RPC the way a student's own download does
 * (requestExamDownload in services/reports.ts).
 */
export async function getLiveExamFileUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from("exam-papers").createSignedUrl(storagePath, 60);
  return { url: data?.signedUrl ?? null, error };
}
