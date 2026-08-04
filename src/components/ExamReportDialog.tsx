import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Star, X } from "lucide-react";
import { toast } from "sonner";
import {
  EXAM_REPORT_PROBLEM_TYPES,
  getMyExamReports,
  rateExamQuality,
  reportExamProblem,
  type ExamReport,
  type ExamReportProblemType,
} from "@/services/reports";
import { cn } from "@/lib/utils";

const MESSAGE_MAX_LENGTH = 2000;

type Mode = "problem" | "quality";

interface ExamReportDialogProps {
  /** previous_exams.id this report/rating is about. */
  previousExamId: string;
  /** The signed-in student's profile id — reports are always filed as themselves. */
  reporterId: string;
  /** Course title, already resolved through courseTitle() by the caller — shown for context. */
  examTitle: string;
  language: "fr" | "en";
  onClose: () => void;
  /** Fires after a successful submit, so the caller can refresh that exam's aggregate. */
  onSubmitted?: () => void;
}

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

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * "Report a problem" / "Rate quality" modal for a previous_exams file.
 *
 * Both modes write through submit_exam_report() (see src/services/reports.ts),
 * which upserts on (previous_exam_id, reporter_id, kind) — re-opening this on
 * an exam the student already reported pre-fills from their existing row
 * (fetched on mount) and re-submitting UPDATES it rather than erroring.
 *
 * Always considered "open" while mounted — the caller controls visibility by
 * conditionally rendering this component, matching Schedule.tsx's sync
 * dialog. Unlike that simpler dialog, this one adds Escape-to-close, a Tab
 * focus trap and initial/returned focus, per this feature's accessibility bar.
 */
export default function ExamReportDialog({
  previousExamId,
  reporterId,
  examTitle,
  language,
  onClose,
  onSubmitted,
}: ExamReportDialogProps) {
  const isFr = language === "fr";
  const headingId = useId();
  const descId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [mode, setMode] = useState<Mode>("problem");
  const [problemType, setProblemType] = useState<ExamReportProblemType | null>(null);
  const [qualityRating, setQualityRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [message, setMessage] = useState("");
  const [existing, setExisting] = useState<ExamReport[]>([]);
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existingForMode = useMemo(
    () => existing.find((report) => report.kind === mode) ?? null,
    [existing, mode],
  );

  // Remember what had focus before opening, return it there on close.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, []);

  // Focus the dialog itself as soon as it mounts, so its accessible name
  // (aria-labelledby) is announced immediately.
  useEffect(() => {
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  // Load the student's own existing reports (both kinds, one round trip) so
  // the dialog pre-fills instead of looking empty on a re-report.
  useEffect(() => {
    let isMounted = true;
    setIsLoadingExisting(true);
    getMyExamReports(previousExamId, reporterId).then(({ data }) => {
      if (!isMounted) return;
      setExisting(data);
      setIsLoadingExisting(false);
    });
    return () => {
      isMounted = false;
    };
  }, [previousExamId, reporterId]);

  // Sync the visible fields to whichever kind is active, every time the mode
  // changes or the fetch above resolves — pre-fills an existing report, or
  // clears back to a blank draft when there isn't one for that kind.
  useEffect(() => {
    setProblemType(existingForMode?.problem_type ?? null);
    setQualityRating(existingForMode?.quality_rating ?? 0);
    setMessage(existingForMode?.message ?? "");
  }, [mode, existingForMode]);

  // Escape-to-close + a Tab focus trap cycling within the dialog's current
  // focusable elements (recomputed live: which buttons exist changes with mode).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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
  }, [onClose]);

  const canSubmit =
    !isSubmitting &&
    !isLoadingExisting &&
    message.length <= MESSAGE_MAX_LENGTH &&
    (mode === "problem" ? problemType !== null : qualityRating >= 1);

  async function handleSubmit() {
    if (!canSubmit) return;

    setIsSubmitting(true);
    const result =
      mode === "problem" && problemType
        ? await reportExamProblem({ previousExamId, problemType, message: message.trim() })
        : mode === "quality" && qualityRating >= 1
          ? await rateExamQuality({ previousExamId, qualityRating, message: message.trim() })
          : null;
    setIsSubmitting(false);

    if (!result) return; // canSubmit already guards this — narrows the type, never actually hit
    if (result.error) {
      toast.error(isFr ? "Impossible d'envoyer votre signalement." : "Could not send your report.");
      return;
    }

    toast.success(
      existingForMode
        ? isFr
          ? "Votre signalement a été mis à jour."
          : "Your report was updated."
        : isFr
          ? "Merci, votre signalement a été envoyé au comité étudiant."
          : "Thanks — your report was sent to the student committee.",
    );
    onSubmitted?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
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
        className="surface-raised w-full max-w-md p-6 space-y-5 outline-none max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={headingId} className="font-display font-extrabold text-lg text-foreground">
              {isFr ? "Signaler cet examen" : "Report this exam"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{examTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isFr ? "Fermer" : "Close"}
            className="shrink-0 p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 surface p-1">
          <button
            type="button"
            onClick={() => setMode("problem")}
            aria-pressed={mode === "problem"}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors duration-200",
              mode === "problem" ? "bg-gradient-red text-white" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isFr ? "Signaler un problème" : "Report a problem"}
          </button>
          <button
            type="button"
            onClick={() => setMode("quality")}
            aria-pressed={mode === "quality"}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors duration-200",
              mode === "quality" ? "bg-gradient-red text-white" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isFr ? "Noter la qualité" : "Rate quality"}
          </button>
        </div>

        <p id={descId} className="text-xs text-muted-foreground leading-relaxed">
          {isFr
            ? "Envoyé au comité étudiant, qui curate les archives d'examens. Personne d'autre ne voit qui a signalé quoi."
            : "Sent to the student committee, who curate the exam archive. No one else can see who reported what."}
        </p>

        {isLoadingExisting ? (
          <div className="skeleton h-32 rounded-xl" />
        ) : (
          <>
            {existingForMode && (
              <p className="text-[11px] text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 leading-relaxed">
                {isFr
                  ? "Vous avez déjà envoyé ce type de signalement pour cet examen. L'enregistrer ci-dessous mettra à jour votre signalement existant."
                  : "You've already sent this type of report for this exam. Saving below will update your existing one."}
              </p>
            )}

            {mode === "problem" ? (
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-muted-foreground mb-2">
                  {isFr ? "Quel est le problème ?" : "What's wrong?"}
                </legend>
                <div
                  role="radiogroup"
                  aria-label={isFr ? "Type de problème" : "Problem type"}
                  className="grid grid-cols-2 gap-2"
                >
                  {EXAM_REPORT_PROBLEM_TYPES.map((type) => {
                    const selected = problemType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setProblemType(type)}
                        className={cn(
                          "px-3 py-2 rounded-lg text-xs font-display font-semibold text-left border transition-colors duration-200",
                          selected
                            ? "bg-primary/15 border-primary/40 text-primary"
                            : "bg-input border-border text-muted-foreground hover:text-foreground hover:border-border-strong",
                        )}
                      >
                        {PROBLEM_LABELS[type][isFr ? "fr" : "en"]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  {isFr ? "Votre note" : "Your rating"}
                </p>
                <div
                  role="radiogroup"
                  aria-label={isFr ? "Note de qualité" : "Quality rating"}
                  className="flex items-center gap-1.5"
                  onMouseLeave={() => setHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map((value) => {
                    const filled = value <= (hoverRating || qualityRating);
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={qualityRating === value}
                        aria-label={
                          isFr
                            ? `${value} étoile${value > 1 ? "s" : ""}`
                            : `${value} star${value > 1 ? "s" : ""}`
                        }
                        onMouseEnter={() => setHoverRating(value)}
                        onFocus={() => setHoverRating(value)}
                        onBlur={() => setHoverRating(0)}
                        onClick={() => setQualityRating(value)}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                            event.preventDefault();
                            setQualityRating((prev) => Math.min(5, (prev || 0) + 1));
                          } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                            event.preventDefault();
                            setQualityRating((prev) => Math.max(1, (prev || 1) - 1));
                          }
                        }}
                        className="p-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        <Star
                          className={cn(
                            "w-7 h-7 transition-colors",
                            filled ? "fill-primary text-primary" : "text-muted-foreground",
                          )}
                        />
                      </button>
                    );
                  })}
                  <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                    {qualityRating > 0 ? `${qualityRating}/5` : isFr ? "Aucune note" : "No rating"}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={messageId} className="block text-xs font-semibold text-muted-foreground">
                  {isFr ? "Message (facultatif)" : "Message (optional)"}
                </label>
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    message.length > MESSAGE_MAX_LENGTH ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {message.length}/{MESSAGE_MAX_LENGTH}
                </span>
              </div>
              <textarea
                id={messageId}
                value={message}
                onChange={(event) => setMessage(event.target.value.slice(0, MESSAGE_MAX_LENGTH))}
                rows={3}
                maxLength={MESSAGE_MAX_LENGTH}
                placeholder={isFr ? "Des détails utiles pour le comité…" : "Details that help the committee…"}
                className="w-full px-3.5 py-2.5 rounded-lg bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 resize-none"
              />
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-display font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {isFr ? "Annuler" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-red text-white font-display font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {existingForMode
              ? isFr
                ? "Mettre à jour"
                : "Update report"
              : isFr
                ? "Envoyer"
                : "Submit report"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
