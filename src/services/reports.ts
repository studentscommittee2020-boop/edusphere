import { supabase } from "@/lib/supabase";

/**
 * Exam reports (migration 011): student-filed problem reports and quality
 * ratings on previous_exams files, triaged by the student committee — an
 * archive-curation workflow, unrelated to course teaching. Also wraps the
 * quota-checked download flow the same migration introduces.
 *
 * src/types/database.ts now carries exam_reports, exam_quality_summary and
 * submit_exam_report() (added once migrations 011/012 were folded into the
 * hand-maintained `Database` type), so every call below goes through the
 * ordinary typed `supabase` client — the schema-erased `db` cast that used
 * to live here is gone. The interfaces below (ExamReport,
 * ExamQualitySummary, etc.) stay hand-declared rather than re-exporting
 * `Tables<"exam_reports">` etc. from database.ts, so this file's existing
 * exported names stay stable for current importers; their shapes have been
 * checked field-for-field against database.ts's generated Row types and
 * match exactly.
 */

// ── Types — mirror supabase/migrations/011_exam_reports_and_download_limits.sql ──

export type ExamReportKind = "problem" | "quality";

export type ExamReportProblemType =
  | "unreadable"
  | "wrong_course"
  | "wrong_year"
  | "wrong_track"
  | "missing_pages"
  | "duplicate"
  | "corrupt_file"
  | "other";

/** The exam_reports.problem_type CHECK list, in the migration's own order. */
export const EXAM_REPORT_PROBLEM_TYPES: readonly ExamReportProblemType[] = [
  "unreadable",
  "wrong_course",
  "wrong_year",
  "wrong_track",
  "missing_pages",
  "duplicate",
  "corrupt_file",
  "other",
];

export type ExamReportStatus = "open" | "reviewing" | "resolved" | "dismissed";

export interface ExamReport {
  id: string;
  previous_exam_id: string;
  reporter_id: string;
  kind: ExamReportKind;
  problem_type: ExamReportProblemType | null;
  quality_rating: number | null;
  message: string;
  status: ExamReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** exam_quality_summary — aggregated only; never exposes reporter identity or message content. */
export interface ExamQualitySummary {
  previous_exam_id: string;
  avg_rating: number | null;
  quality_report_count: number;
  problem_report_count: number;
}

// ── Submit (student's own report — insert-or-update via submit_exam_report) ────

export interface SubmitExamReportInput {
  previousExamId: string;
  kind: ExamReportKind;
  problemType?: ExamReportProblemType | null;
  qualityRating?: number | null;
  message?: string;
}

/**
 * Files (or edits) the signed-in student's own report on an exam file.
 *
 * Thin wrapper over submit_exam_report(p_previous_exam_id, p_kind,
 * p_problem_type, p_quality_rating, p_message) — a SECURITY DEFINER RPC that
 * upserts on (previous_exam_id, reporter_id, kind). Calling this twice for
 * the same exam + kind UPDATES the student's existing row (and reopens it if
 * it had been resolved/dismissed) instead of raising a unique-constraint
 * error — see the RPC body for the ON CONFLICT DO UPDATE.
 */
export async function submitExamReport(input: SubmitExamReportInput) {
  const { data, error } = await supabase.rpc("submit_exam_report", {
    p_previous_exam_id: input.previousExamId,
    p_kind: input.kind,
    p_problem_type: input.problemType ?? null,
    p_quality_rating: input.qualityRating ?? null,
    p_message: input.message ?? "",
  });
  if (error) return { data: null, error };
  return { data: data as ExamReport, error: null };
}

/** Convenience wrapper over submitExamReport for the `problem` kind. */
export async function reportExamProblem(input: {
  previousExamId: string;
  problemType: ExamReportProblemType;
  message?: string;
}) {
  return submitExamReport({
    previousExamId: input.previousExamId,
    kind: "problem",
    problemType: input.problemType,
    message: input.message,
  });
}

/** Convenience wrapper over submitExamReport for the `quality` kind (1-5 stars). */
export async function rateExamQuality(input: {
  previousExamId: string;
  qualityRating: number;
  message?: string;
}) {
  return submitExamReport({
    previousExamId: input.previousExamId,
    kind: "quality",
    qualityRating: input.qualityRating,
    message: input.message,
  });
}

// ── Read the student's own reports (pre-fill instead of looking empty on re-report) ──

/**
 * Both of the signed-in student's own reports for one exam — at most one
 * `problem` row and one `quality` row, per the table's UNIQUE
 * (previous_exam_id, reporter_id, kind) constraint.
 *
 * RLS already restricts a plain student's SELECT to reporter_id =
 * auth.uid(), but reporterId is still passed and filtered on explicitly:
 * exam_reports also grants committee/admin a SELECT-all policy, and this
 * helper must return only "mine" even when the signed-in caller happens to
 * hold one of those roles, so the report dialog always pre-fills with the
 * caller's own report — never someone else's.
 */
export async function getMyExamReports(previousExamId: string, reporterId: string) {
  const { data, error } = await supabase
    .from("exam_reports")
    .select("*")
    .eq("previous_exam_id", previousExamId)
    .eq("reporter_id", reporterId);

  if (error) return { data: [] as ExamReport[], error };
  return { data: (data ?? []) as ExamReport[], error: null };
}

// ── Read the anonymous aggregate ─────────────────────────────────────────────

/** Average rating + report counts for one exam. `data` is null once nobody has reported yet. */
export async function getExamQualitySummary(previousExamId: string) {
  const { data, error } = await supabase
    .from("exam_quality_summary")
    .select("*")
    .eq("previous_exam_id", previousExamId)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data: data as ExamQualitySummary | null, error: null };
}

/** Same as getExamQualitySummary, batched for a page of exam cards in one round trip. */
export async function getExamQualitySummaries(previousExamIds: string[]) {
  if (previousExamIds.length === 0) {
    return { data: [] as ExamQualitySummary[], error: null };
  }

  const { data, error } = await supabase
    .from("exam_quality_summary")
    .select("*")
    .in("previous_exam_id", previousExamIds);

  if (error) return { data: [] as ExamQualitySummary[], error };
  return { data: (data ?? []) as ExamQualitySummary[], error: null };
}

// ── Quota-checked download ───────────────────────────────────────────────────

export interface ExamDownloadResult {
  url: string;
  remainingHour: number;
  remainingDay: number;
}

export type ExamDownloadDeniedReason =
  | "not_found"
  | "hourly_limit"
  | "daily_limit"
  | "burst_limit"
  | "unknown";

export interface ExamDownloadDenied {
  reason: ExamDownloadDeniedReason;
  retryAfterSeconds: number;
}

interface ExamDownloadFunctionBody {
  url?: string;
  remaining_hour?: number;
  remaining_day?: number;
  error?: string;
  reason?: string;
  retry_after_seconds?: number;
}

const KNOWN_DENY_REASONS: readonly ExamDownloadDeniedReason[] = [
  "not_found",
  "hourly_limit",
  "daily_limit",
  "burst_limit",
];

/**
 * Requests a short-lived signed URL for a previous-exam PDF through the
 * exam-download Edge Function (supabase/functions/exam-download), which
 * runs request_exam_download()'s per-user quota check server-side, as the
 * caller, before signing anything. There is deliberately no client-side
 * path to a signed URL any more — migration 011 dropped the storage policy
 * that used to allow one (see its section 4).
 *
 * Returns a three-way result instead of the usual {data, error}: a quota
 * deny (HTTP 429, or 404 for "no file yet") is an expected, everyday
 * outcome for a student cramming before finals, not a failure. Giving it
 * its own `denied` branch lets callers show a calm "try again shortly"
 * message instead of a generic error toast.
 */
export async function requestExamDownload(
  examId: string,
): Promise<
  | { data: ExamDownloadResult; error: null; denied: null }
  | { data: null; error: null; denied: ExamDownloadDenied }
  | { data: null; error: Error; denied: null }
> {
  const { data, error, response } = await supabase.functions.invoke<ExamDownloadFunctionBody>(
    "exam-download",
    { body: { examId } },
  );

  if (error) {
    // A non-2xx response (401/404/429/500/503) leaves `data` null and
    // surfaces as a FunctionsHttpError; invoke() hands back the raw Response
    // alongside it as `response` (see @supabase/functions-js's
    // FunctionsClient), which is the only place the JSON body — where 429's
    // `reason` / `retry_after_seconds` live — is reachable from here.
    const body = response ? await response.json().catch(() => null) : null;

    if (response?.status === 429) {
      const rawReason = body?.reason;
      return {
        data: null,
        error: null,
        denied: {
          reason: KNOWN_DENY_REASONS.includes(rawReason)
            ? (rawReason as ExamDownloadDeniedReason)
            : "unknown",
          retryAfterSeconds: Number(body?.retry_after_seconds ?? 60),
        },
      };
    }

    if (response?.status === 404) {
      return { data: null, error: null, denied: { reason: "not_found", retryAfterSeconds: 0 } };
    }

    return {
      data: null,
      error: new Error(body?.error ?? "Could not prepare that download."),
      denied: null,
    };
  }

  if (!data?.url) {
    return { data: null, error: new Error("Could not prepare that download."), denied: null };
  }

  return {
    data: {
      url: data.url,
      remainingHour: data.remaining_hour ?? 0,
      remainingDay: data.remaining_day ?? 0,
    },
    error: null,
    denied: null,
  };
}
