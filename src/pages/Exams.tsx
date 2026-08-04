import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { BookOpen, Download, ChevronRight, FolderOpen } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import FilterChips, { ActiveFilter } from "@/components/FilterChips";
import { toast } from "sonner";
import { getEntranceExams, getExamDownloadUrl } from "@/services/exams";

const SUBJECTS = ["All", "French", "English", "Math", "Economics"];
const LANGS = ["All", "French", "English", "Arabic"];
const YEARS = ["All", "2025", "2024", "2023"];

const subjectColors: Record<string, string> = {
  French: "bg-blue-500/15 text-blue-300",
  English: "bg-purple-500/15 text-purple-300",
  Math: "bg-primary/15 text-primary",
  Economics: "bg-secondary/15 text-secondary",
};

// Local shape adapted from the entrance_exams Supabase row (see Sessions.tsx
// for the same DB-row -> UI-shape adaptation pattern). Only the fields this
// page actually renders are carried over.
interface EntranceExamCard {
  id: string;
  title: string;
  titleFr: string;
  subject: string;
  examLang: string;
  year: string;
  pages: number;
  description: string;
  descriptionFr: string;
  fileUrl: string | null;
}

export default function Exams() {
  const { language } = useAppStore();

  const [exams, setExams] = useState<EntranceExamCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [subject, setSubject] = useState("All");
  const [lang, setLang] = useState("All");
  const [year, setYear] = useState("All");

  // Live data load — entrance exams are a global catalog (not scoped to a
  // signed-in student), matching the getPreviousExams() pattern in
  // Sessions.tsx. Errors degrade to an empty list rather than a crash.
  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const { data, error } = await getEntranceExams();
        if (!isMounted) return;
        if (error) console.error("[Exams] getEntranceExams failed", error);
        setExams(
          (data ?? []).map((exam) => ({
            id: exam.id,
            title: exam.title,
            titleFr: exam.title_fr,
            subject: exam.subject,
            examLang: exam.exam_lang,
            year: exam.year,
            pages: exam.pages,
            description: exam.description,
            descriptionFr: exam.description_fr,
            fileUrl: exam.file_url,
          })),
        );
      } catch (err) {
        if (!isMounted) return;
        console.error("[Exams] entrance exams load failed", err);
        setExams([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return exams.filter((exam) => {
      const subjectMatch = subject === "All" || exam.subject === subject;
      const langMatch = lang === "All" || exam.examLang === lang;
      const yearMatch = year === "All" || exam.year === year;
      return subjectMatch && langMatch && yearMatch;
    });
  }, [exams, subject, lang, year]);

  const activeFilters: ActiveFilter[] = [
    ...(subject !== "All" ? [{ key: "subject", label: language === "fr" ? "Matière" : "Subject", value: subject }] : []),
    ...(lang !== "All" ? [{ key: "lang", label: language === "fr" ? "Langue" : "Language", value: lang }] : []),
    ...(year !== "All" ? [{ key: "year", label: language === "fr" ? "Année" : "Year", value: year }] : []),
  ];

  const handleRemoveFilter = (key: string) => {
    if (key === "subject") setSubject("All");
    if (key === "lang") setLang("All");
    if (key === "year") setYear("All");
  };

  const clearAll = () => {
    setSubject("All");
    setLang("All");
    setYear("All");
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
            {language === "fr" ? "Accueil" : "Home"}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground font-medium">
            {language === "fr" ? "Examens d'Entrée" : "Entrance Exams"}
          </span>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <span className="eyebrow">
            <BookOpen className="w-3.5 h-3.5" />
            {language === "fr" ? "Préparation" : "Preparation"}
          </span>
          <h1 className="mt-2 font-display font-extrabold text-3xl lg:text-4xl text-gradient-chrome">
            {language === "fr" ? "Examens d'Entrée" : "Entrance Exams"}
          </h1>
          <p className="mt-1.5 text-muted-foreground text-sm">
            {language === "fr"
              ? `${filtered.length} examens disponibles`
              : `${filtered.length} exams available`}
          </p>
        </motion.div>

        {/* Subject Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-5"
        >
          <p className="text-muted-foreground text-xs font-medium mb-3">
            {language === "fr" ? "Matière" : "Subject"}
          </p>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <button
                key={s}
                onClick={() => setSubject(s)}
                className={`px-4 py-2 rounded-xl font-display font-semibold text-sm transition-all duration-200 border ${
                  subject === s
                    ? "bg-gradient-green text-white border-transparent shadow-[0_0_20px_-5px_hsla(145,63%,42%,0.4)]"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Language and Year Filter Chips Row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-wrap items-center gap-4 mb-6"
        >
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium whitespace-nowrap">
              {language === "fr" ? "Langue:" : "Language:"}
            </span>
            <div className="flex gap-1.5">
              {LANGS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-3 py-1 rounded-lg text-xs font-display font-semibold transition-all duration-200 ${
                    lang === l
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium whitespace-nowrap">
              {language === "fr" ? "Année:" : "Year:"}
            </span>
            <div className="flex gap-1.5">
              {YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className={`px-3 py-1 rounded-lg text-xs font-display font-semibold transition-all duration-200 ${
                    year === y
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Active Filter Chips */}
        {activeFilters.length > 0 && (
          <div className="mb-5">
            <FilterChips
              filters={activeFilters}
              onRemove={handleRemoveFilter}
              onClearAll={clearAll}
            />
          </div>
        )}

        {/* Cards */}
        {isLoading ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="surface overflow-hidden">
                <div className="h-1 w-full bg-muted" />
                <div className="p-5">
                  <div className="flex flex-wrap gap-2 mb-3">
                    <div className="skeleton h-5 w-20 rounded-full" />
                    <div className="skeleton h-5 w-16 rounded-full" />
                  </div>
                  <div className="skeleton h-4 w-3/4 rounded mb-2" />
                  <div className="skeleton h-3.5 w-full rounded mb-1.5" />
                  <div className="skeleton h-3.5 w-2/3 rounded mb-4" />
                  <div className="flex items-center justify-between pt-3 border-t border-border/50">
                    <div className="skeleton h-3 w-12 rounded" />
                    <div className="skeleton h-7 w-28 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : exams.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="surface flex flex-col items-center text-center px-6 py-16"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <BookOpen className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-display font-extrabold text-xl text-foreground">
              {language === "fr" ? "Aucun examen d'entrée disponible" : "No entrance exams available"}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
              {language === "fr"
                ? "Les examens d'entrée apparaîtront ici dès qu'ils seront ajoutés."
                : "Entrance exams will appear here once they're added."}
            </p>
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-display font-bold text-lg text-foreground mb-2">
              {language === "fr" ? "Aucun résultat" : "No results found"}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              {language === "fr" ? "Essayez d'ajuster vos filtres" : "Try adjusting your filters"}
            </p>
            <button
              onClick={clearAll}
              className="px-4 py-2 rounded-xl bg-secondary/10 text-secondary text-sm font-medium hover:bg-secondary/20 transition-colors"
            >
              {language === "fr" ? "Réinitialiser" : "Reset filters"}
            </button>
          </motion.div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map((exam, i) => {
              return (
                <motion.div
                  key={exam.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                  className="group surface card-glow-green overflow-hidden hover:-translate-y-0.5 transition-all duration-300"
                >
                  {/* Top accent — green */}
                  <div className="h-1 w-full bg-gradient-green" />

                  <div className="p-5">
                    {/* Badges */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${subjectColors[exam.subject] ?? "bg-muted text-muted-foreground"}`}>
                        {exam.subject}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        {exam.examLang}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-display font-bold text-base text-foreground leading-tight mb-1 group-hover:text-secondary transition-colors">
                      {language === "fr" ? exam.titleFr : exam.title}
                    </h3>

                    {/* Description */}
                    <p className="text-muted-foreground text-sm leading-relaxed mb-4 line-clamp-2">
                      {language === "fr" ? exam.descriptionFr : exam.description}
                    </p>

                    {/* Meta + Download */}
                    <div className="flex items-center justify-between pt-3 border-t border-border/50">
                      <div className="flex items-center gap-3 text-muted-foreground text-xs">
                        <span>{exam.year}</span>
                        <span>{exam.pages}p</span>
                      </div>
                      <button
                        onClick={async () => {
                          if (!exam.fileUrl) {
                            toast.info(language === "fr" ? "Fichier non disponible" : "File not available yet");
                            return;
                          }
                          // file_url is a private Supabase Storage path (same
                          // "exam-papers" bucket previous_exams uses — see
                          // services/admin.ts), not a public URL, so it must
                          // be exchanged for a signed URL before opening.
                          // Same pattern as Sessions.tsx's download handler.
                          const { url, error } = await getExamDownloadUrl(exam.fileUrl);
                          if (error || !url) {
                            toast.error(language === "fr" ? "Impossible d'ouvrir le fichier" : "Could not open this file");
                            return;
                          }
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary text-xs font-display font-semibold hover:bg-secondary/20 transition-colors"
                        aria-label={`Download ${exam.title}`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        {language === "fr" ? "Télécharger" : "Download"}
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
  );
}
