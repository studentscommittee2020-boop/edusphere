import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Flag,
  Loader2,
  Printer,
  RefreshCw,
  Star,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAppStore } from "@/store/appStore";
import { getPrintDocuments, getPrivateFileUrl, updatePrintDocumentStatus } from "@/services/portal";
import {
  approveExamSubmission,
  getLiveExamFileUrl,
  getPendingSubmissionUrl,
  listExamReportsForTriage,
  listExamSubmissions,
  rejectExamSubmission,
  updateExamReportStatus,
  type ApproveExamSubmissionInput,
  type CouncilExamReport,
  type ExamSubmissionStatus,
  type ExamSubmissionWithRelations,
} from "@/services/council";
import { courseTitle } from "@/services/academics";
import { getCourses } from "@/services/courses";
import type { ExamReportProblemType, ExamReportStatus } from "@/services/reports";
import type { Course, ExamType, PrintDocument, Track } from "@/types/database";
import { EXAM_TYPES, TRACKS } from "@/types/database";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────────────

type CouncilTab = "queue" | "submissions" | "reports";

const TABS: { key: CouncilTab; en: string; fr: string; icon: typeof Printer }[] = [
  { key: "queue", en: "Print queue", fr: "File d'impression", icon: Printer },
  { key: "submissions", en: "Exam submissions", fr: "Soumissions d'examens", icon: ClipboardCheck },
  { key: "reports", en: "Reports", fr: "Signalements", icon: Flag },
];

const PRINT_STATUSES: PrintDocument["status"][] = ["requested", "printing", "ready", "completed", "cancelled"];

const SUBMISSION_FILTERS: { key: ExamSubmissionStatus | "all"; en: string; fr: string }[] = [
  { key: "pending", en: "Pending", fr: "En attente" },
  { key: "approved", en: "Approved", fr: "Approuvées" },
  { key: "rejected", en: "Rejected", fr: "Rejetées" },
  { key: "all", en: "All", fr: "Toutes" },
];

const REPORT_FILTERS: { key: ExamReportStatus | "all"; en: string; fr: string }[] = [
  { key: "open", en: "Open", fr: "Ouverts" },
  { key: "reviewing", en: "In review", fr: "En cours" },
  { key: "resolved", en: "Resolved", fr: "Résolus" },
  { key: "dismissed", en: "Dismissed", fr: "Rejetés" },
  { key: "all", en: "All", fr: "Tous" },
];

const REPORT_STATUSES: ExamReportStatus[] = ["open", "reviewing", "resolved", "dismissed"];

const EXAM_TYPE_LABELS: Record<ExamType, { en: string; fr: string }> = {
  partiel: { en: "Partiel", fr: "Partiel" },
  midterm: { en: "Midterm", fr: "Midterm" },
  resit: { en: "Resit", fr: "Rattrapage" },
};

const PROBLEM_LABELS: Record<ExamReportProblemType, { fr: string; en: string }> = {
  unreadable: { fr: "Illisible", en: "Unreadable" },
  wrong_course: { fr: "Mauvais cours", en: "Wrong course" },
  wrong_year: { fr: "Mauvaise année", en: "Wrong year" },
  wrong_track: { fr: "Mauvaise filière", en: "Wrong track" },
  missing_pages: { fr: "Pages manquantes", en: "Missing pages" },
  duplicate: { fr: "Doublon", en: "Duplicate" },
  corrupt_file: { fr: "Fichier corrompu", en: "Corrupt file" },
  other: { fr: "Autre", en: "Other" },
};

const REPORT_STATUS_LABELS: Record<ExamReportStatus, { en: string; fr: string }> = {
  open: { en: "Open", fr: "Ouvert" },
  reviewing: { en: "In review", fr: "En cours" },
  resolved: { en: "Resolved", fr: "Résolu" },
  dismissed: { en: "Dismissed", fr: "Rejeté" },
};

const REPORT_STATUS_STYLES: Record<ExamReportStatus, string> = {
  open: "bg-red-300/15 text-red-300",
  reviewing: "bg-white/[0.08] text-foreground",
  resolved: "bg-green-500/15 text-green-400",
  dismissed: "bg-white/[0.06] text-muted-foreground",
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PrintDesk() {
  const { user } = useAuth();
  const { language } = useAppStore();
  const isFr = language === "fr";

  const [tab, setTab] = useState<CouncilTab>("queue");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // ── Print queue (unchanged behaviour) ───────────────────────────────────
  const [documents, setDocuments] = useState<PrintDocument[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [updatingDocumentId, setUpdatingDocumentId] = useState<string | null>(null);

  // ── Exam submissions ─────────────────────────────────────────────────────
  const [submissions, setSubmissions] = useState<ExamSubmissionWithRelations[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [submissionFilter, setSubmissionFilter] = useState<ExamSubmissionStatus | "all">("pending");
  const [courses, setCourses] = useState<Course[]>([]);
  const [mutatingSubmissionId, setMutatingSubmissionId] = useState<string | null>(null);
  const [reviewingSubmission, setReviewingSubmission] = useState<ExamSubmissionWithRelations | null>(null);
  const [rejectingSubmission, setRejectingSubmission] = useState<ExamSubmissionWithRelations | null>(null);

  // ── Reports ──────────────────────────────────────────────────────────────
  const [reports, setReports] = useState<CouncilExamReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [reportFilter, setReportFilter] = useState<ExamReportStatus | "all">("open");
  const [mutatingReportId, setMutatingReportId] = useState<string | null>(null);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    const { data, error } = await getPrintDocuments();
    if (error) toast.error(isFr ? "Impossible de charger la file d'impression." : "Could not load the print queue.");
    setDocuments(data);
    setLoadingQueue(false);
  }, [isFr]);

  const loadCourses = useCallback(async () => {
    const { data } = await getCourses();
    if (data) setCourses(data);
  }, []);

  const loadSubmissions = useCallback(async () => {
    setLoadingSubmissions(true);
    const { data, error } = await listExamSubmissions(
      submissionFilter === "all" ? undefined : { status: submissionFilter },
    );
    if (error) toast.error(isFr ? "Impossible de charger les soumissions." : "Could not load submissions.");
    setSubmissions(data);
    setLoadingSubmissions(false);
  }, [submissionFilter, isFr]);

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    const { data, error } = await listExamReportsForTriage(
      reportFilter === "all" ? undefined : { status: reportFilter },
    );
    if (error) toast.error(isFr ? "Impossible de charger les signalements." : "Could not load reports.");
    setReports(data);
    setLoadingReports(false);
  }, [reportFilter, isFr]);

  useEffect(() => {
    void loadQueue();
    void loadCourses();
  }, [loadQueue, loadCourses]);

  useEffect(() => {
    if (tab === "submissions") void loadSubmissions();
  }, [tab, loadSubmissions]);

  useEffect(() => {
    if (tab === "reports") void loadReports();
  }, [tab, loadReports]);

  async function refreshActiveTab() {
    if (tab === "queue") await loadQueue();
    else if (tab === "submissions") await loadSubmissions();
    else await loadReports();
  }

  // ── Print queue actions (unchanged behaviour) ───────────────────────────

  async function openDocument(document: PrintDocument) {
    const { url, error } = await getPrivateFileUrl("print-documents", document.storage_path);
    if (error || !url) {
      toast.error(isFr ? "Impossible d'ouvrir ce document." : "Could not open this document.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function updateDocumentStatus(document: PrintDocument, status: PrintDocument["status"]) {
    setUpdatingDocumentId(document.id);
    const { error } = await updatePrintDocumentStatus(document.id, status);
    setUpdatingDocumentId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await loadQueue();
  }

  // ── Exam submission actions ─────────────────────────────────────────────

  async function openPendingPdf(submission: ExamSubmissionWithRelations) {
    const { url, error } = await getPendingSubmissionUrl(submission.storage_path);
    if (error || !url) {
      toast.error(isFr ? "Impossible d'ouvrir ce fichier." : "Could not open this file.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleApprove(
    submission: ExamSubmissionWithRelations,
    overrides: Omit<ApproveExamSubmissionInput, "submissionId">,
  ) {
    setMutatingSubmissionId(submission.id);
    const { error } = await approveExamSubmission({ submissionId: submission.id, ...overrides });
    setMutatingSubmissionId(null);
    if (error) {
      toast.error(
        error.message || (isFr ? "Impossible d'approuver cette soumission." : "Could not approve that submission."),
      );
      return;
    }
    toast.success(isFr ? "Examen approuvé et publié dans les archives." : "Exam approved and published to the archive.");
    setReviewingSubmission(null);
    await loadSubmissions();
  }

  async function handleReject(submission: ExamSubmissionWithRelations, reason: string) {
    setMutatingSubmissionId(submission.id);
    const { error } = await rejectExamSubmission(submission.id, reason);
    setMutatingSubmissionId(null);
    if (error) {
      toast.error(
        error.message || (isFr ? "Impossible de rejeter cette soumission." : "Could not reject that submission."),
      );
      return;
    }
    toast.success(isFr ? "Soumission rejetée." : "Submission rejected.");
    setRejectingSubmission(null);
    await loadSubmissions();
  }

  // ── Report actions ───────────────────────────────────────────────────────

  async function openLiveFile(report: CouncilExamReport) {
    const path = report.previous_exams?.file_url;
    if (!path) {
      toast.error(isFr ? "Aucun fichier disponible." : "No file available.");
      return;
    }
    const { url, error } = await getLiveExamFileUrl(path);
    if (error || !url) {
      toast.error(isFr ? "Impossible d'ouvrir ce fichier." : "Could not open this file.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleReportStatusChange(report: CouncilExamReport, status: ExamReportStatus) {
    if (!user) return;
    setMutatingReportId(report.id);
    const { error } = await updateExamReportStatus(report.id, status, user.id);
    setMutatingReportId(null);
    if (error) {
      toast.error(error.message || (isFr ? "Mise à jour refusée." : "Could not update that report."));
      return;
    }
    toast.success(isFr ? "Statut mis à jour." : "Status updated.");
    await loadReports();
  }

  // ── Tab keyboard navigation (WAI-ARIA tabs pattern: roving tabindex) ─────

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    setTab(TABS[nextIndex].key);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-mesh pointer-events-none" />
      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface-raised rounded-[2rem] p-7 sm:p-9 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-5"
        >
          <div>
            <span className="eyebrow">
              <Printer className="w-3.5 h-3.5" />
              {isFr ? "Comité étudiant" : "Student committee"}
            </span>
            <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-gradient-chrome mt-3">
              {isFr ? "Espace du Conseil" : "Council Workspace"}
            </h1>
            <p className="text-sm text-muted-foreground mt-3 max-w-xl">
              {isFr
                ? "Gérez la file d'impression, examinez les soumissions d'examens des enseignants et triez les signalements des étudiants — le tout au même endroit."
                : "Manage the print queue, review doctors' exam submissions, and triage student reports — all from one place."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshActiveTab()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {isFr ? "Actualiser" : "Refresh"}
          </button>
        </motion.header>

        <div
          role="tablist"
          aria-label={isFr ? "Sections du conseil" : "Council sections"}
          className="flex items-center gap-1 surface p-1 mt-6 overflow-x-auto"
        >
          {TABS.map((item, index) => {
            const Icon = item.icon;
            const selected = tab === item.key;
            return (
              <button
                key={item.key}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${item.key}`}
                aria-selected={selected}
                aria-controls={`panel-${item.key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(item.key)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-display font-bold whitespace-nowrap transition-colors duration-200",
                  selected ? "bg-gradient-red text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-4 h-4" />
                {isFr ? item.fr : item.en}
              </button>
            );
          })}
        </div>

        <div className="rule-glow my-6" />

        {/* ── Print queue ─────────────────────────────────────────────────── */}
        {tab === "queue" && (
          <div role="tabpanel" id="panel-queue" aria-labelledby="tab-queue" tabIndex={0}>
            <section className="grid gap-4">
              {loadingQueue ? (
                <div className="grid gap-4">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="skeleton h-24 rounded-[1.6rem]" />
                  ))}
                </div>
              ) : documents.length === 0 ? (
                <div className="surface flex flex-col items-center text-center rounded-[1.6rem] px-6 py-16">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Printer className="w-7 h-7 text-primary" />
                  </div>
                  <h2 className="font-display font-extrabold text-xl text-foreground">
                    {isFr ? "La file d'impression est vide." : "The print queue is clear."}
                  </h2>
                </div>
              ) : (
                documents.map((document) => (
                  <article
                    key={document.id}
                    className="surface rounded-[1.6rem] p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-5"
                  >
                    <span className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-300 flex items-center justify-center shrink-0">
                      <Printer className="w-6 h-6" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <h2 className="font-display font-bold text-lg text-foreground truncate">{document.title}</h2>
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {document.original_name} · {document.copies} {isFr ? "copies" : "copies"}
                      </p>
                      {document.notes && <p className="text-xs text-muted-foreground mt-3">{document.notes}</p>}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void openDocument(document)}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.06] text-sm text-foreground hover:bg-white/[0.1] transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        {isFr ? "Ouvrir le PDF" : "Open PDF"}
                      </button>
                      <select
                        value={document.status}
                        disabled={updatingDocumentId === document.id}
                        onChange={(event) =>
                          void updateDocumentStatus(document, event.target.value as PrintDocument["status"])
                        }
                        className="px-3.5 py-2.5 rounded-xl bg-input border border-border text-sm text-foreground focus:outline-none focus:border-primary/50"
                      >
                        {PRINT_STATUSES.map((status) => (
                          <option key={status} value={status} className="bg-card">
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                ))
              )}
            </section>
          </div>
        )}

        {/* ── Exam submissions ────────────────────────────────────────────── */}
        {tab === "submissions" && (
          <div role="tabpanel" id="panel-submissions" aria-labelledby="tab-submissions" tabIndex={0} className="space-y-4">
            <div className="flex items-center gap-1 surface p-1 w-fit overflow-x-auto">
              {SUBMISSION_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setSubmissionFilter(filter.key)}
                  aria-pressed={submissionFilter === filter.key}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-display font-bold whitespace-nowrap transition-colors duration-200",
                    submissionFilter === filter.key
                      ? "bg-gradient-red text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isFr ? filter.fr : filter.en}
                </button>
              ))}
            </div>

            {loadingSubmissions ? (
              <div className="grid gap-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="skeleton h-32 rounded-[1.6rem]" />
                ))}
              </div>
            ) : submissions.length === 0 ? (
              <div className="surface flex flex-col items-center text-center rounded-[1.6rem] px-6 py-16">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <ClipboardCheck className="w-7 h-7 text-primary" />
                </div>
                <h2 className="font-display font-extrabold text-xl text-foreground">
                  {isFr ? "Aucune soumission à afficher." : "No submissions to show."}
                </h2>
              </div>
            ) : (
              <div className="grid gap-4">
                {submissions.map((submission) => (
                  <SubmissionCard
                    key={submission.id}
                    submission={submission}
                    isFr={isFr}
                    isMutating={mutatingSubmissionId === submission.id}
                    onOpenPdf={() => void openPendingPdf(submission)}
                    onReview={() => setReviewingSubmission(submission)}
                    onReject={() => setRejectingSubmission(submission)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Reports ──────────────────────────────────────────────────────── */}
        {tab === "reports" && (
          <div role="tabpanel" id="panel-reports" aria-labelledby="tab-reports" tabIndex={0} className="space-y-4">
            <div className="flex items-center gap-1 surface p-1 w-fit overflow-x-auto">
              {REPORT_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setReportFilter(filter.key)}
                  aria-pressed={reportFilter === filter.key}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-display font-bold whitespace-nowrap transition-colors duration-200",
                    reportFilter === filter.key
                      ? "bg-gradient-red text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isFr ? filter.fr : filter.en}
                </button>
              ))}
            </div>

            {loadingReports ? (
              <div className="grid gap-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="skeleton h-28 rounded-[1.6rem]" />
                ))}
              </div>
            ) : reports.length === 0 ? (
              <div className="surface flex flex-col items-center text-center rounded-[1.6rem] px-6 py-16">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Flag className="w-7 h-7 text-primary" />
                </div>
                <h2 className="font-display font-extrabold text-xl text-foreground">
                  {isFr ? "Aucun signalement à afficher." : "No reports to show."}
                </h2>
              </div>
            ) : (
              <div className="grid gap-4">
                {reports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    isFr={isFr}
                    isUpdating={mutatingReportId === report.id}
                    onOpenFile={() => void openLiveFile(report)}
                    onStatusChange={(status) => void handleReportStatusChange(report, status)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {reviewingSubmission && (
        <SubmissionReviewDialog
          submission={reviewingSubmission}
          courses={courses}
          isFr={isFr}
          isSubmitting={mutatingSubmissionId === reviewingSubmission.id}
          onCancel={() => setReviewingSubmission(null)}
          onApprove={(overrides) => void handleApprove(reviewingSubmission, overrides)}
        />
      )}

      {rejectingSubmission && (
        <RejectReasonDialog
          submission={rejectingSubmission}
          isFr={isFr}
          isSubmitting={mutatingSubmissionId === rejectingSubmission.id}
          onCancel={() => setRejectingSubmission(null)}
          onConfirm={(reason) => void handleReject(rejectingSubmission, reason)}
        />
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SubmissionStatusBadge({ status, isFr }: { status: ExamSubmissionStatus; isFr: boolean }) {
  const styles: Record<ExamSubmissionStatus, string> = {
    pending: "bg-red-300/15 text-red-300",
    approved: "bg-green-500/15 text-green-400",
    rejected: "bg-red-500/15 text-red-400",
  };
  const labels: Record<ExamSubmissionStatus, { en: string; fr: string }> = {
    pending: { en: "Pending", fr: "En attente" },
    approved: { en: "Approved", fr: "Approuvée" },
    rejected: { en: "Rejected", fr: "Rejetée" },
  };
  return (
    <span className={cn("shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide", styles[status])}>
      {isFr ? labels[status].fr : labels[status].en}
    </span>
  );
}

function SubmissionCard({
  submission,
  isFr,
  isMutating,
  onOpenPdf,
  onReview,
  onReject,
}: {
  submission: ExamSubmissionWithRelations;
  isFr: boolean;
  isMutating: boolean;
  onOpenPdf: () => void;
  onReview: () => void;
  onReject: () => void;
}) {
  const title = courseTitle({
    title: submission.course_title,
    title_fr: submission.course_title_fr,
    track: submission.track,
  });

  return (
    <article className="surface rounded-[1.6rem] p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-5">
      <span
        className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
          submission.status === "approved"
            ? "bg-green-500/10 text-green-400"
            : submission.status === "rejected"
              ? "bg-red-500/10 text-red-400"
              : "bg-red-300/10 text-red-300",
        )}
      >
        <FileText className="w-6 h-6" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-display font-bold text-lg text-foreground truncate">{title}</h2>
          <SubmissionStatusBadge status={submission.status} isFr={isFr} />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {submission.uploader?.full_name ?? (isFr ? "Enseignant inconnu" : "Unknown doctor")} · {submission.semester}{" "}
          · {submission.year} · {EXAM_TYPE_LABELS[submission.exam_type][isFr ? "fr" : "en"]} · {submission.pages}{" "}
          pages · {formatFileSize(submission.size_bytes)}
        </p>
        <p className="text-xs text-muted-foreground mt-1 truncate">{submission.original_name}</p>
        {submission.status === "rejected" && submission.rejection_reason && (
          <p className="text-xs text-red-400 mt-2 leading-relaxed">
            {isFr ? "Motif : " : "Reason: "}
            {submission.rejection_reason}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenPdf}
          className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.06] text-sm text-foreground hover:bg-white/[0.1] transition-colors"
        >
          <Download className="w-4 h-4" />
          {isFr ? "Ouvrir le PDF" : "Open PDF"}
        </button>
        {submission.status === "pending" && (
          <>
            <button
              type="button"
              onClick={onReview}
              disabled={isMutating}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-green text-white text-sm font-display font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {isMutating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {isFr ? "Examiner" : "Review"}
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={isMutating}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-red-500/30 text-red-400 text-sm font-display font-semibold hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <XCircle className="w-4 h-4" />
              {isFr ? "Rejeter" : "Reject"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function QualityStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={cn("w-4 h-4", value <= rating ? "fill-primary text-primary" : "text-muted-foreground")}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground tabular-nums">{rating}/5</span>
    </div>
  );
}

function ReportCard({
  report,
  isFr,
  isUpdating,
  onOpenFile,
  onStatusChange,
}: {
  report: CouncilExamReport;
  isFr: boolean;
  isUpdating: boolean;
  onOpenFile: () => void;
  onStatusChange: (status: ExamReportStatus) => void;
}) {
  const exam = report.previous_exams;
  const title = exam
    ? courseTitle({ title: exam.course_title, title_fr: exam.course_title_fr, track: exam.track })
    : isFr
      ? "Examen introuvable"
      : "Exam not found";

  return (
    <article className="surface rounded-[1.6rem] p-5 sm:p-6 flex flex-col lg:flex-row lg:items-start gap-5">
      <span
        className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
          report.kind === "problem" ? "bg-red-300/10 text-red-300" : "bg-green-500/10 text-green-400",
        )}
      >
        {report.kind === "problem" ? <Flag className="w-6 h-6" /> : <Star className="w-6 h-6" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-display font-bold text-base text-foreground truncate">{title}</h2>
          <span
            className={cn(
              "shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide",
              REPORT_STATUS_STYLES[report.status],
            )}
          >
            {isFr ? REPORT_STATUS_LABELS[report.status].fr : REPORT_STATUS_LABELS[report.status].en}
          </span>
        </div>

        {exam && (
          <p className="text-xs text-muted-foreground mt-1">
            {exam.year} · {EXAM_TYPE_LABELS[exam.exam_type][isFr ? "fr" : "en"]} · {exam.track === "french" ? "FR" : "EN"}
          </p>
        )}

        <div className="mt-2">
          {report.kind === "problem" && report.problem_type ? (
            <p className="text-sm text-foreground font-display font-semibold">
              {PROBLEM_LABELS[report.problem_type][isFr ? "fr" : "en"]}
            </p>
          ) : report.kind === "quality" && report.quality_rating !== null ? (
            <QualityStars rating={report.quality_rating} />
          ) : (
            <p className="text-sm text-muted-foreground">{isFr ? "Sans détail" : "No detail"}</p>
          )}
        </div>

        {report.message && <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{report.message}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenFile}
          disabled={!exam?.file_url}
          className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.06] text-sm text-foreground hover:bg-white/[0.1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="w-4 h-4" />
          {isFr ? "Ouvrir le fichier" : "Open file"}
        </button>
        <select
          value={report.status}
          disabled={isUpdating}
          onChange={(event) => onStatusChange(event.target.value as ExamReportStatus)}
          className="px-3.5 py-2.5 rounded-xl bg-input border border-border text-sm text-foreground focus:outline-none focus:border-primary/50 disabled:opacity-40"
        >
          {REPORT_STATUSES.map((status) => (
            <option key={status} value={status} className="bg-card">
              {isFr ? REPORT_STATUS_LABELS[status].fr : REPORT_STATUS_LABELS[status].en}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

/**
 * Review dialog for a pending exam submission: open the PDF, optionally
 * correct its metadata, then approve or cancel. Reject lives on the card
 * itself (RejectReasonDialog below), not in here — the two actions have
 * different shapes (approve carries override fields, reject only a reason)
 * and nesting one modal inside another is worse UX than two independent
 * entry points.
 *
 * Approve is disabled until the reviewer has opened the PDF at least once in
 * THIS dialog session (hasOpenedFile) — approving blind is the failure mode
 * this is designed against, so the capability to read the file first is
 * turned into a soft requirement rather than just being available.
 */
function SubmissionReviewDialog({
  submission,
  courses,
  isFr,
  isSubmitting,
  onCancel,
  onApprove,
}: {
  submission: ExamSubmissionWithRelations;
  courses: Course[];
  isFr: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onApprove: (overrides: Omit<ApproveExamSubmissionInput, "submissionId">) => void;
}) {
  const headingId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [courseId, setCourseId] = useState(submission.course_id ?? "");
  const [track, setTrack] = useState<Track>(submission.track);
  const [year, setYear] = useState(submission.year);
  const [examType, setExamType] = useState<ExamType>(submission.exam_type);
  const [pages, setPages] = useState(submission.pages);
  const [hasOpenedFile, setHasOpenedFile] = useState(false);
  const [isOpeningPdf, setIsOpeningPdf] = useState(false);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  async function handleOpenPdf() {
    setIsOpeningPdf(true);
    const { url, error } = await getPendingSubmissionUrl(submission.storage_path);
    setIsOpeningPdf(false);
    if (error || !url) {
      toast.error(isFr ? "Impossible d'ouvrir ce fichier." : "Could not open this file.");
      return;
    }
    setHasOpenedFile(true);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const canApprove =
    hasOpenedFile && !isSubmitting && courseId.trim() !== "" && year.trim() !== "" && pages > 0;

  function handleApproveClick() {
    if (!canApprove) return;
    onApprove({
      finalCourseId: courseId,
      finalTrack: track,
      finalYear: year.trim(),
      finalExamType: examType,
      finalPages: pages,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onCancel();
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descId}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="surface-raised w-full max-w-lg p-6 space-y-5 outline-none max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={headingId} className="font-display font-extrabold text-lg text-foreground">
              {isFr ? "Examiner la soumission" : "Review submission"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">
              {submission.uploader?.full_name ?? (isFr ? "Enseignant inconnu" : "Unknown doctor")} ·{" "}
              {submission.original_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={isFr ? "Fermer" : "Close"}
            className="shrink-0 p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p id={descId} className="text-xs text-muted-foreground leading-relaxed">
          {isFr
            ? "Ouvrez le PDF pour vérifier son contenu avant d'approuver. Vous pouvez corriger les informations ci-dessous si nécessaire."
            : "Open the PDF to check its contents before approving. You can correct the details below if needed."}
        </p>

        <div className="surface px-4 py-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            {isFr ? "Soumis comme" : "Submitted as"}
          </p>
          <p className="text-sm font-display font-semibold text-foreground">
            {courseTitle({
              title: submission.course_title,
              title_fr: submission.course_title_fr,
              track: submission.track,
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {submission.major} · {submission.semester} · {submission.track === "french" ? "FR" : "EN"} ·{" "}
            {submission.year} · {EXAM_TYPE_LABELS[submission.exam_type][isFr ? "fr" : "en"]} · {submission.pages} pages
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleOpenPdf()}
          disabled={isOpeningPdf}
          className={cn(
            "w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-display font-bold transition-colors disabled:opacity-60",
            hasOpenedFile ? "bg-white/[0.06] text-foreground hover:bg-white/[0.1]" : "bg-gradient-red text-white",
          )}
        >
          {isOpeningPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {hasOpenedFile ? (isFr ? "Rouvrir le PDF" : "Reopen PDF") : isFr ? "Ouvrir le PDF" : "Open PDF"}
        </button>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5 col-span-2">
            <span className="text-xs font-semibold text-muted-foreground">{isFr ? "Cours" : "Course"}</span>
            <select
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-input border border-border text-foreground text-sm focus:border-primary/50"
            >
              <option value="" className="bg-card">
                {isFr ? "— Choisir —" : "— Choose —"}
              </option>
              {courses.map((course) => (
                <option key={course.id} value={course.id} className="bg-card">
                  {courseTitle(course)} ({course.code ?? course.semester})
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">{isFr ? "Filière" : "Track"}</span>
            <select
              value={track}
              onChange={(event) => setTrack(event.target.value as Track)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-input border border-border text-foreground text-sm focus:border-primary/50"
            >
              {TRACKS.map((value) => (
                <option key={value} value={value} className="bg-card">
                  {value === "french" ? "FR" : "EN"}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">{isFr ? "Type" : "Exam type"}</span>
            <select
              value={examType}
              onChange={(event) => setExamType(event.target.value as ExamType)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-input border border-border text-foreground text-sm focus:border-primary/50"
            >
              {EXAM_TYPES.map((value) => (
                <option key={value} value={value} className="bg-card">
                  {EXAM_TYPE_LABELS[value][isFr ? "fr" : "en"]}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">{isFr ? "Année" : "Year"}</span>
            <input
              type="text"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-input border border-border text-foreground text-sm focus:border-primary/50"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">{isFr ? "Pages" : "Pages"}</span>
            <input
              type="number"
              min={1}
              step={1}
              value={pages}
              onChange={(event) => setPages(Math.max(1, Math.round(Number(event.target.value)) || 1))}
              className="w-full px-3.5 py-2.5 rounded-lg bg-input border border-border text-foreground text-sm focus:border-primary/50"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {!hasOpenedFile && (isFr ? "Ouvrez le PDF avant d'approuver." : "Open the PDF before approving.")}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-sm font-display font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              {isFr ? "Annuler" : "Cancel"}
            </button>
            <button
              type="button"
              onClick={handleApproveClick}
              disabled={!canApprove}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-green text-white font-display font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isFr ? "Approuver" : "Approve"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Mandatory-reason rejection dialog. Independent from SubmissionReviewDialog
 * (see that component's doc comment) so this stays a small, focused modal
 * with its own focus trap rather than a nested one.
 */
function RejectReasonDialog({
  submission,
  isFr,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  submission: ExamSubmissionWithRelations;
  isFr: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const headingId = useId();
  const reasonId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const trimmedReason = reason.trim();
  const canConfirm = trimmedReason.length > 0 && !isSubmitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onCancel();
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="surface-raised w-full max-w-md p-6 space-y-5 outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={headingId} className="font-display font-extrabold text-lg text-foreground">
              {isFr ? "Rejeter la soumission" : "Reject submission"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{submission.original_name}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={isFr ? "Fermer" : "Close"}
            className="shrink-0 p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {isFr
            ? "Ce motif sera visible par l'enseignant qui a soumis ce fichier."
            : "This reason will be shown to the doctor who submitted this file."}
        </p>

        <div className="space-y-1.5">
          <label htmlFor={reasonId} className="block text-xs font-semibold text-muted-foreground">
            {isFr ? "Motif du rejet" : "Rejection reason"}
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, 2000))}
            rows={4}
            maxLength={2000}
            placeholder={isFr ? "Expliquez pourquoi ce fichier est rejeté…" : "Explain why this file is being rejected…"}
            className="w-full px-3.5 py-2.5 rounded-lg bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-sm font-display font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            {isFr ? "Annuler" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => canConfirm && onConfirm(trimmedReason)}
            disabled={!canConfirm}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-red text-white font-display font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isFr ? "Rejeter" : "Reject"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
