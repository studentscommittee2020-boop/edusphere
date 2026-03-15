import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FileText, Download, ChevronDown, ChevronRight, Search, FolderOpen } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import FilterChips, { ActiveFilter } from "@/components/FilterChips";
import { toast } from "sonner";

const MAJORS = ["All", "Common", "Audit & Accounting", "Finance", "Marketing", "Management", "MIS"];
const SEMESTERS = ["All", "LS1", "LS2", "LS3", "LS4", "LS5", "LS6", "LS7", "LS8", "LS9"];
const EXAM_TYPES = ["All", "midterms", "final", "resit"];
const YEARS = ["All", "2025", "2024", "2023"];
const TRACKS = ["All", "french", "english"];

const majorColors: Record<string, string> = {
  Common: "bg-gray-500/15 text-gray-300 border-gray-500/30",
  "Audit & Accounting": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  Finance: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  Marketing: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Management: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  MIS: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
};

const examTypeColors: Record<string, string> = {
  final: "bg-primary/15 text-primary border-primary/30",
  midterms: "bg-secondary/15 text-secondary border-secondary/30",
  resit: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const examTypeLabels: Record<string, { fr: string; en: string }> = {
  final: { fr: "Final", en: "Final" },
  midterms: { fr: "Midterms", en: "Midterms" },
  resit: { fr: "Rattrapage", en: "Resit" },
};

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

export default function Sessions() {
  const { previousExams, language } = useAppStore();

  const [search, setSearch] = useState("");
  const [major, setMajor] = useState("All");
  const [semester, setSemester] = useState("All");
  const [examType, setExamType] = useState("All");
  const [year, setYear] = useState("All");
  const [track, setTrack] = useState("All");

  const filtered = useMemo(() => {
    return previousExams.filter((exam) => {
      const title = language === "fr" ? exam.courseTitleFr : exam.courseTitle;
      const searchMatch = !search || title.toLowerCase().includes(search.toLowerCase());
      const majorMatch = major === "All" || exam.major === major;
      const semesterMatch = semester === "All" || exam.semester === semester;
      const typeMatch = examType === "All" || exam.examType === examType;
      const yearMatch = year === "All" || exam.year === year;
      const trackMatch = track === "All" || exam.track === track;
      return searchMatch && majorMatch && semesterMatch && typeMatch && yearMatch && trackMatch;
    });
  }, [previousExams, search, major, semester, examType, year, track, language]);

  const activeFilters: ActiveFilter[] = [
    ...(major !== "All" ? [{ key: "major", label: language === "fr" ? "Filière" : "Major", value: major }] : []),
    ...(semester !== "All" ? [{ key: "semester", label: language === "fr" ? "Semestre" : "Semester", value: semester }] : []),
    ...(examType !== "All" ? [{ key: "examType", label: language === "fr" ? "Type" : "Type", value: examType }] : []),
    ...(year !== "All" ? [{ key: "year", label: language === "fr" ? "Année" : "Year", value: year }] : []),
    ...(track !== "All" ? [{ key: "track", label: language === "fr" ? "Filière" : "Track", value: track }] : []),
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

      <div className="relative px-6 py-8 max-w-7xl mx-auto">
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
            {language === "fr" ? "Examens Précédents" : "Previous Exams"}
          </span>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-red flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-display font-extrabold text-3xl text-foreground">
              {language === "fr" ? "Examens Précédents" : "Previous Exams"}
            </h1>
          </div>
          <p className="text-muted-foreground text-sm ml-13">
            {language === "fr"
              ? `${filtered.length} examens trouvés`
              : `${filtered.length} exams found`}
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
              placeholder={language === "fr" ? "Rechercher un cours..." : "Search courses..."}
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

        <div className="flex gap-6">
          {/* Sidebar Filters */}
          <motion.aside
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="hidden md:block w-56 shrink-0"
          >
            <div className="rounded-2xl border border-border bg-card overflow-hidden sticky top-6">
              <div className="px-4 py-3 bg-muted/50 border-b border-border">
                <p className="font-display font-semibold text-sm text-foreground">
                  {language === "fr" ? "Filtres" : "Filters"}
                </p>
              </div>
              <FilterGroup
                title={language === "fr" ? "Filière" : "Major"}
                options={MAJORS}
                value={major}
                onChange={setMajor}
              />
              <FilterGroup
                title={language === "fr" ? "Semestre" : "Semester"}
                options={SEMESTERS}
                value={semester}
                onChange={setSemester}
              />
              <FilterGroup
                title={language === "fr" ? "Type d'examen" : "Exam Type"}
                options={EXAM_TYPES}
                value={examType}
                onChange={setExamType}
              />
              <FilterGroup
                title={language === "fr" ? "Année" : "Year"}
                options={YEARS}
                value={year}
                onChange={setYear}
              />
              <FilterGroup
                title={language === "fr" ? "Filière linguistique" : "Track"}
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
                  {language === "fr" ? "Aucun résultat" : "No results found"}
                </h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {language === "fr"
                    ? "Essayez d'ajuster vos filtres"
                    : "Try adjusting your filters"}
                </p>
                <button
                  onClick={clearAllFilters}
                  className="px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                >
                  {language === "fr" ? "Réinitialiser les filtres" : "Reset filters"}
                </button>
              </motion.div>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((exam, i) => (
                  <motion.div
                    key={exam.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.4 }}
                    className="group rounded-2xl border border-border bg-card card-glow overflow-hidden hover:-translate-y-0.5 transition-all duration-300"
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
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${examTypeColors[exam.examType] ?? "bg-muted text-muted-foreground border-border"}`}>
                          {examTypeLabels[exam.examType]?.[language === "fr" ? "fr" : "en"] ?? exam.examType}
                        </span>
                      </div>

                      {/* Course title */}
                      <h3 className="font-display font-bold text-base text-foreground leading-tight mb-1 group-hover:text-primary transition-colors">
                        {language === "fr" ? exam.courseTitleFr : exam.courseTitle}
                      </h3>

                      {/* Meta row */}
                      <div className="flex items-center gap-3 text-muted-foreground text-xs mb-4">
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

                      {/* Download */}
                      <div className="flex items-center justify-end pt-3 border-t border-border/50">
                        <button
                          onClick={() => {
                            if (exam.fileUrl) {
                              window.open(exam.fileUrl, "_blank");
                            } else {
                              toast.info(language === "fr" ? "Fichier non disponible" : "File not available yet");
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-display font-semibold hover:bg-primary/20 transition-colors"
                          aria-label={`Download ${exam.courseTitle} exam`}
                        >
                          <Download className="w-3.5 h-3.5" />
                          {language === "fr" ? "Télécharger" : "Download"}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
