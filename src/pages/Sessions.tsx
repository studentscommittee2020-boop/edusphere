import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Flag,
  FolderOpen,
  Loader2,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAppStore } from "@/store/appStore";
import FilterChips, { ActiveFilter } from "@/components/FilterChips";
import ExamReportDialog from "@/components/ExamReportDialog";
import { courseTitle } from "@/services/academics";
import { getPreviousExams } from "@/services/exams";
import {
  getExamQualitySummaries,
  getExamQualitySummary,
  requestExamDownload,
  type ExamQualitySummary,
} from "@/services/reports";

const MAJORS = ["All", "Common", "Audit & Accounting", "Finance", "Marketing", "Management", "MIS"];
const SEMESTERS = ["All", "LS1", "LS2", "LS3", "LS4", "LS5", "LS6", "LS7", "LS8", "LS9"];
const EXAM_TYPES = ["All", "partiel", "midterm", "resit"];
const YEARS = ["All", "2025", "2024", "2023"];
const TRACKS = ["All", "french", "english"];

const majorColors: Record<string, string> = {
  Common: "bg-gray-500/15 text-gray-300 border-gray-500/30",
  "Audit & Accounting": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  Finance: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  Marketing: "bg-red-500/15 text-red-300 border-red-500/30",
  Management: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  MIS: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
};

// Exam type labels + colors — keyed on the real DB values (previous_exams.exam_type
// is a CHECK constraint of partiel | midterm | resit — see migration 006). Index
// everything with the raw DB value, matching Index.tsx's convention site-wide —
// never mock-store-style values ("final" / "midterms"), and never a second,
// separate mapping in this file.
const examTypeLabel: Record<string, { fr: string; en: string }> = {
  partiel: { fr: "Partiel", en: "Final" },
  midterm: { fr: "Midterm", en: "Midterm" },
  resit: { fr: "Rattrapage", en: "Resit" },
};
const examTypeBadge: Record<string, string> = {
  partiel: "bg-red-500/15 text-red-400 border-red-500/25",
  midterm: "bg-green-500/15 text-green-400 border-green-500/25",
  resit: "bg-red-300/15 text-red-300 border-red-300/25",
};

/**
 * Local shape adapted from the previous_exams Supabase row — see Index.tsx
 * for the same DB-row -> UI-shape adaptation pattern. Deliberately not the
 * `PreviousExam` type from store/appStore.ts (mock-store-style examType
 * values that don't match the DB) or the generated one from
 * types/database.ts (raw row, no UI-facing conveniences).
 */
interface SessionExamCard {
  id: string;
  courseId: string;
  courseTitle: string;
  courseTitleFr: string;
  major: string;
  semester: string;
  year: string;
  examType: "partiel" | "midterm" | "resit";
  pages: number;
  track: "french" | "english";
  fileUrl?: string;
}

interface FilterGroupProps {
  title: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}

function FilterGroup({ title, options, value, onChange }: FilterGroupProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-display font-semibold text-foreground hover:bg-muted/50 transition-colors"
      >
        {title}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-1">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={`text-left px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                value === opt
                  ? "bg-primary/15 text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {opt === "All" ? "All" : opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Try again in a minute" / "Try again in 3 min" — never a raw second count. */
function formatRetry(seconds: number, isFr: boolean): string {
  if (seconds <= 90) {
    return isFr ? "Réessayez dans une minute." : "Try again in a minute.";
  }
  const minutes = Math.ceil(seconds / 60);
  return isFr ? `Réessayez dans ${minutes} min.` : `Try again in ${minutes} min.`;
}

export default function Sessions() {
  const { language } = useAppStore();
  const { user } = useAuth();
  const isFr = language === "fr";

  const [previousExams, setPreviousExams] = useState<SessionExamCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [qualityByExam, setQualityByExam] = useState<Record<string, ExamQualitySummary>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [reportingExam, setReportingExam] = useState<SessionExamCard | null>(null);

  const [search, setSearch] = useState("");
  const [major, setMajor] = useState("All");
  const [semester, setSemester] = useState("All");
  const [examType, setExamType] = useState("All");
  const [year, setYear] = useState("All");
  const [track, setTrack] = useState("All");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getPreviousExams().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        toast.error("Could not load the protected session library.");
        setPreviousExams([]);
        setIsLoading(false);
        return;
      }

      const mapped: SessionExamCard[] = (data ?? []).map((exam) => ({
        id: exam.id,
        courseId: exam.course_id,
        courseTitle: exam.course_title,
        courseTitleFr: exam.course_title_fr,
        major: exam.major,
        semester: exam.semester,
        year: exam.year,
        examType: exam.exam_type,
        pages: exam.pages,
        track: exam.track,
        fileUrl: exam.file_url ?? undefined,
      }));
      setPreviousExams(mapped);
      setIsLoading(false);

      // Aggregate quality is a second, dependent fetch — it needs the exam
      // ids the call above just resolved, so it deliberately runs after
      // rather than in a Promise.all with it. Not on the critical path: the
      // list is already rendered by the time this resolves, cards just gain
      // their rating a moment later.
      const ids = mapped.map((exam) => exam.id);
      if (ids.length > 0) {
        getExamQualitySummaries(ids).then(({ data: summaries }) => {
          if (!isMounted) return;
          const byId: Record<string, ExamQualitySummary> = {};
          for (const summary of summaries) byId[summary.previous_exam_id] = summary;
          setQualityByExam(byId);
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  function refreshQuality(examId: string) {
    getExamQualitySummary(examId).then(({ data }) => {
      if (!data) return;
      setQualityByExam((prev) => ({ ...prev, [examId]: data }));
    });
  }

  async function handleDownload(exam: SessionExamCard) {
    if (downloadingId) return; // one in-flight download at a time
    if (!exam.fileUrl) {
      toast.info(isFr ? "Fichier non disponible pour l'instant." : "File not available yet.");
      return;
    }

    setDownloadingId(exam.id);
    const { data, error, denied } = await requestExamDownload(exam.id);
    setDownloadingId(null);

    if (denied) {
      if (denied.reason === "not_found") {
        toast.info(isFr ? "Fichier non disponible pour l'instant." : "File not available yet.");
        return;
      }
      // hourly_limit / daily_limit / burst_limit / unknown all read the same
      // way to a student: a calm, non-alarming "you're going fast, here's
      // when you can retry" — not an error. Someone cramming before finals
      // must never think the site is broken.
      const retryCopy = formatRetry(denied.retryAfterSeconds, isFr);
      toast.info(
        isFr
          ? `Limite de téléchargement atteinte pour l'instant. ${retryCopy}`
          : `Download limit reached for now. ${retryCopy}`,
        {
          description: isFr
            ? "Cette limite protège les archives contre l'extraction en masse — ce n'est pas un bug."
            : "This protects the archive from bulk scraping — it isn't a bug.",
        },
      );
      return;
    }

    if (error || !data) {
      toast.error(isFr ? "Impossible d'ouvrir ce fichier." : "Could not open this file.");
      return;
    }

    // Surface the quota before it becomes a surprise, not after.
    const lowestRemaining = Math.min(data.remainingHour, data.remainingDay);
    if (lowestRemaining <= 5) {
      toast.info(
        isFr
          ? `Il vous reste ${lowestRemaining} téléchargement${lowestRemaining === 1 ? "" : "s"} pour l'instant.`
          : `${lowestRemaining} download${lowestRemaining === 1 ? "" : "s"} left for now.`,
      );
    }

    window.open(data.url, "_blank", "noopener,noreferrer");
  }

  const filtered = useMemo(() => {
    return previousExams.filter((exam) => {
      // Searched title follows the course's track, never the interface
      // language — see docs/LANGUAGE-AND-TRACK.md. `language` is correctly
      // absent from this memo's dependencies: courseTitle() doesn't use it,
      // so toggling the interface no longer reshuffles search results.
      const title = courseTitle({ title: exam.courseTitle, title_fr: exam.courseTitleFr, track: exam.track });
      const searchMatch = !search || title.toLowerCase().includes(search.toLowerCase());
      const majorMatch = major === "All" || exam.major === major;
      const semesterMatch = semester === "All" || exam.semester === semester;
      const typeMatch = examType === "All" || exam.examType === examType;
      const yearMatch = year === "All" || exam.year === year;
      const trackMatch = track === "All" || exam.track === track;
      return searchMatch && majorMatch && semesterMatch && typeMatch && yearMatch && trackMatch;
    });
  }, [previousExams, search, major, semester, examType, year, track]);

  const activeFilters: ActiveFilter[] = [
    ...(major !== "All" ? [{ key: "major", label: isFr ? "Filière" : "Major", value: major }] : []),
    ...(semester !== "All" ? [{ key: "semester", label: isFr ? "Semestre" : "Semester", value: semester }] : []),
    ...(examType !== "All"
      ? [
          {
            key: "examType",
            label: isFr ? "Type" : "Type",
            value: examTypeLabel[examType]?.[isFr ? "fr" : "en"] ?? examType,
          },
        ]
      : []),
    ...(year !== "All" ? [{ key: "year", label: isFr ? "Année" : "Year", value: year }] : []),
    ...(track !== "All" ? [{ key: "track", label: isFr ? "Filière" : "Track", value: track }] : []),
  ];

  const handleRemoveFilter = (key: string) => {
    if (key === "major") setMajor("All");
    if (key === "semester") setSemester("All");
    if (key === "examType") setExamType("All");
    if (key === "year") setYear("All");
    if (key === "track") setTrack("All");
  };

  const clearAllFilters = () => {
    setMajor("All");
    setSemester("All");
    setExamType("All");
    setYear("All");
    setTrack("All");
    setSearch("");
  };

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-mesh pointer-events-none" />

      <div className="relative px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
        {/* Breadcrumb */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-muted-foreground mb-6"
        >
          <Link to="/" className="hover:text-foreground transition-colors">
            {isFr ? "Accueil" : "Home"}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground font-medium">
            {isFr ? "Examens Précédents" : "Previous Exams"}
          </span>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <span className="eyebrow">
            <FileText className="w-3.5 h-3.5" />
            {isFr ? "Bibliothèque de séances" : "Session library"}
          </span>
          <h1 className="mt-2 font-display font-extrabold text-3xl lg:text-4xl text-gradient-chrome">
            {isFr ? "Examens Précédents" : "Previous Exams"}
          </h1>
          <p className="mt-1.5 text-muted-foreground text-sm">
            {isFr ? `${filtered.length} examens trouvés` : `${filtered.length} exams found`}
          </p>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={isFr ? "Rechercher un cours..." : "Search courses..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
            />
          </div>
        </motion.div>

        {/* Active Filter Chips */}
        {activeFilters.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-5"
          >
            <FilterChips
              filters={activeFilters}
              onRemove={handleRemoveFilter}
              onClearAll={clearAllFilters}
            />
          </motion.div>
        )}

        {/* Mobile filter button */}
        <div className="md:hidden mb-5">
          <button
            onClick={() => setMobileFiltersOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border text-sm font-display font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {isFr ? "Filtres" : "Filters"}
            {activeFilters.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold">
                {activeFilters.length}
              </span>
            )}
          </button>
        </div>

        {/* Mobile filter drawer */}
        <AnimatePresence>
          {mobileFiltersOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileFiltersOpen(false)}
                className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              />
              <motion.div
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="md:hidden fixed left-0 top-0 h-full w-72 bg-card border-r border-border z-50 overflow-y-auto shadow-2xl"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <p className="font-display font-semibold text-sm text-foreground">
                    {isFr ? "Filtres" : "Filters"}
                  </p>
                  <button
                    onClick={() => setMobileFiltersOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
                <FilterGroup title={isFr ? "Filière" : "Major"} options={MAJORS} value={major} onChange={setMajor} />
                <FilterGroup title={isFr ? "Semestre" : "Semester"} options={SEMESTERS} value={semester} onChange={setSemester} />
                <FilterGroup title={isFr ? "Type d'examen" : "Exam Type"} options={EXAM_TYPES} value={examType} onChange={setExamType} />
                <FilterGroup title={isFr ? "Année" : "Year"} options={YEARS} value={year} onChange={setYear} />
                <FilterGroup title={isFr ? "Filière linguistique" : "Track"} options={TRACKS} value={track} onChange={setTrack} />
                {activeFilters.length > 0 && (
                  <div className="px-4 py-3">
                    <button
                      onClick={() => { clearAllFilters(); setMobileFiltersOpen(false); }}
                      className="w-full py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                    >
                      {isFr ? "Réinitialiser" : "Reset All"}
                    </button>
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <div className="flex gap-6">
          {/* Sidebar Filters */}
          <motion.aside
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="hidden md:block w-56 shrink-0"
          >
            <div className="surface overflow-hidden sticky top-6">
              <div className="px-4 py-3 bg-muted/50 border-b border-border">
                <p className="font-display font-semibold text-sm text-foreground">
                  {isFr ? "Filtres" : "Filters"}
                </p>
              </div>
              <FilterGroup
                title={isFr ? "Filière" : "Major"}
                options={MAJORS}
                value={major}
                onChange={setMajor}
              />
              <FilterGroup
                title={isFr ? "Semestre" : "Semester"}
                options={SEMESTERS}
                value={semester}
                onChange={setSemester}
              />
              <FilterGroup
                title={isFr ? "Type d'examen" : "Exam Type"}
                options={EXAM_TYPES}
                value={examType}
                onChange={setExamType}
              />
              <FilterGroup
                title={isFr ? "Année" : "Year"}
                options={YEARS}
                value={year}
                onChange={setYear}
              />
              <FilterGroup
                title={isFr ? "Filière linguistique" : "Track"}
                options={TRACKS}
                value={track}
                onChange={setTrack}
              />
            </div>
          </motion.aside>

          {/* Cards Grid */}
          <div className="flex-1 min-w-0">
            {filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-24 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <FolderOpen className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-display font-bold text-lg text-foreground mb-2">
                  {isFr ? "Aucun résultat" : "No results found"}
                </h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {isFr ? "Essayez d'ajuster vos filtres" : "Try adjusting your filters"}
                </p>
                <button
                  onClick={clearAllFilters}
                  className="px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                >
                  {isFr ? "Réinitialiser les filtres" : "Reset filters"}
                </button>
              </motion.div>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((exam, i) => {
                  const title = courseTitle({
                    title: exam.courseTitle,
                    title_fr: exam.courseTitleFr,
                    track: exam.track,
                  });
                  const quality = qualityByExam[exam.id];
                  const isDownloading = downloadingId === exam.id;

                  return (
                    <motion.div
                      key={exam.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.4 }}
                      className="group surface-interactive overflow-hidden"
                    >
                      {/* Card top accent */}
                      <div className="h-1 w-full bg-gradient-red" />

                      <div className="p-5">
                        {/* Badges row */}
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${majorColors[exam.major] ?? "bg-muted text-muted-foreground border-border"}`}>
                            {exam.major}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                            {exam.semester}
                          </span>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${examTypeBadge[exam.examType] ?? "bg-muted text-muted-foreground border-border"}`}>
                            {examTypeLabel[exam.examType]?.[isFr ? "fr" : "en"] ?? exam.examType}
                          </span>
                        </div>

                        {/* Course title — follows the course's track (teaching
                            language), never the interface language. See
                            docs/LANGUAGE-AND-TRACK.md. */}
                        <h3 className="font-display font-bold text-base text-foreground leading-tight mb-1 group-hover:text-primary transition-colors">
                          {title}
                        </h3>

                        {/* Meta row */}
                        <div className="flex items-center gap-3 text-muted-foreground text-xs mb-3 flex-wrap">
                          <span>{exam.year}</span>
                          <span>•</span>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card">
                            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-foreground text-xs font-semibold">{exam.pages}</span>
                            <span className="text-muted-foreground text-xs uppercase font-semibold">pages</span>
                          </div>
                          <span>•</span>
                          <span className="capitalize">{exam.track}</span>
                        </div>

                        {/* Aggregate quality — exam_quality_summary is
                            aggregated-only by design (migration 011): average
                            + counts, never who reported what. */}
                        <div className="flex items-center gap-3 text-xs mb-4 min-h-[1.25rem]">
                          {quality?.avg_rating != null && quality.quality_report_count > 0 && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                              <span className="text-foreground font-semibold tabular-nums">
                                {quality.avg_rating.toFixed(1)}
                              </span>
                              <span>({quality.quality_report_count})</span>
                            </span>
                          )}
                          {quality && quality.problem_report_count > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-red-300"
                              title={isFr ? "Signalé par d'autres étudiants" : "Flagged by other students"}
                            >
                              <Flag className="w-3.5 h-3.5" />
                              {quality.problem_report_count}
                            </span>
                          )}
                        </div>

                        {/* Report + Download */}
                        <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                          <button
                            type="button"
                            onClick={() => {
                              if (!user) {
                                toast.info(isFr ? "Connectez-vous pour signaler un examen." : "Sign in to report an exam.");
                                return;
                              }
                              setReportingExam(exam);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground text-xs font-display font-semibold hover:text-foreground hover:bg-white/[0.06] transition-colors"
                          >
                            <Flag className="w-3.5 h-3.5" />
                            {isFr ? "Signaler" : "Report"}
                          </button>

                          <button
                            type="button"
                            disabled={isDownloading}
                            onClick={() => void handleDownload(exam)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-display font-semibold hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            aria-label={`Download ${title} exam`}
                          >
                            {isDownloading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            {isFr ? "Télécharger" : "Download"}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {reportingExam && user && (
        <ExamReportDialog
          previousExamId={reportingExam.id}
          reporterId={user.id}
          examTitle={courseTitle({
            title: reportingExam.courseTitle,
            title_fr: reportingExam.courseTitleFr,
            track: reportingExam.track,
          })}
          language={language}
          onClose={() => setReportingExam(null)}
          onSubmitted={() => refreshQuality(reportingExam.id)}
        />
      )}
    </div>
  );
}
