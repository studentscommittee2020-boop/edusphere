import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  FileText,
  BookOpen,
  Calendar,
  ShoppingCart,
  ArrowRight,
  GraduationCap,
  MapPin,
  Clock,
  Tag,
} from "lucide-react";
import { useAppStore } from "@/store/appStore";

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const fadeIn = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.07 } },
};

// ---------------------------------------------------------------------------
// Bilingual helpers
// ---------------------------------------------------------------------------

const t = (lang: string, fr: string, en: string) =>
  lang === "fr" ? fr : en;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Section header with title + "View all" link */
function SectionHeader({
  title,
  linkLabel,
  to,
}: {
  title: string;
  linkLabel: string;
  to: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-display font-bold text-lg text-white">{title}</h2>
      <Link
        to={to}
        className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-300 transition-colors group"
      >
        {linkLabel}
        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}

// Exam type labels + colors
const examTypeLabel: Record<string, { fr: string; en: string }> = {
  partiel: { fr: "Partiel", en: "Final" },
  midterm: { fr: "Midterm", en: "Midterm" },
  resit: { fr: "Rattrapage", en: "Resit" },
};
const examTypeBadge: Record<string, string> = {
  partiel: "bg-red-500/15 text-red-400 border-red-500/25",
  midterm: "bg-green-500/15 text-green-400 border-green-500/25",
  resit: "bg-amber-500/15 text-amber-400 border-amber-500/25",
};

// Tag colors reused from Events page
const tagColors: Record<string, string> = {
  Science: "bg-blue-500/15 text-blue-300",
  Workshop: "bg-purple-500/15 text-purple-300",
  Cultural: "bg-amber-500/15 text-amber-300",
  Tech: "bg-cyan-500/15 text-cyan-300",
  Academic: "bg-red-500/15 text-red-400",
  Networking: "bg-green-500/15 text-green-400",
  Lecture: "bg-violet-500/15 text-violet-300",
  Sports: "bg-orange-500/15 text-orange-300",
  Art: "bg-pink-500/15 text-pink-300",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Index() {
  const { previousExams, exams, books, events, language } = useAppStore();

  // ---- Derived data ----

  const upcomingEvents = useMemo(
    () => events.filter((e) => e.type === "upcoming"),
    [events],
  );

  const recentExams = useMemo(
    () =>
      [...previousExams]
        .sort((a, b) => Number(b.year) - Number(a.year))
        .slice(0, 5),
    [previousExams],
  );

  const topBooks = useMemo(
    () =>
      [...books]
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 5),
    [books],
  );

  const stats = [
    {
      label: t(language, "Examens Precedents", "Previous Exams"),
      value: previousExams.length,
      icon: <FileText className="w-5 h-5" />,
      color: "red" as const,
    },
    {
      label: t(language, "Evenements a Venir", "Upcoming Events"),
      value: upcomingEvents.length,
      icon: <Calendar className="w-5 h-5" />,
      color: "green" as const,
    },
    {
      label: t(language, "Livres Disponibles", "Books Available"),
      value: books.filter((b) => b.inStock).length,
      icon: <ShoppingCart className="w-5 h-5" />,
      color: "red" as const,
    },
    {
      label: t(language, "Examens d'Entree", "Entrance Exams"),
      value: exams.length,
      icon: <BookOpen className="w-5 h-5" />,
      color: "green" as const,
    },
  ];

  // ---- Render ----

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-10">
      {/* ------------------------------------------------------------------ */}
      {/* WELCOME HEADER                                                     */}
      {/* ------------------------------------------------------------------ */}
      <motion.section {...fadeIn}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-white leading-tight">
              {t(language, "Bienvenue, Etudiant!", "Welcome, Student!")}
            </h1>
            <p className="text-neutral-500 text-sm mt-1">
              {t(
                language,
                "Votre portail de ressources academiques",
                "Your academic resource hub",
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-white/[0.06] text-xs text-neutral-400">
              <GraduationCap className="w-3.5 h-3.5 text-neutral-500" />
              {t(language, "Semestre:", "Semester:")} <span className="text-neutral-300 font-medium">--</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-white/[0.06] text-xs text-neutral-400">
              {t(language, "Filiere:", "Major:")} <span className="text-neutral-300 font-medium">--</span>
            </span>
          </div>
        </div>
      </motion.section>

      {/* ------------------------------------------------------------------ */}
      {/* STAT CARDS                                                         */}
      {/* ------------------------------------------------------------------ */}
      <motion.section
        variants={stagger}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            variants={fadeIn}
            whileHover={{ y: -4 }}
            className="bg-neutral-900/80 border border-white/[0.06] rounded-xl p-5 flex flex-col gap-3 transition-shadow duration-300 hover:shadow-lg"
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${
                stat.color === "red" ? "bg-gradient-red" : "bg-gradient-green"
              }`}
            >
              {stat.icon}
            </div>
            <div>
              <p className="font-display font-bold text-3xl text-white leading-none">
                {stat.value}
              </p>
              <p className="text-sm text-neutral-400 mt-1">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </motion.section>

      {/* ------------------------------------------------------------------ */}
      {/* RECENTLY ADDED EXAMS                                               */}
      {/* ------------------------------------------------------------------ */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        <SectionHeader
          title={t(language, "Examens Recents", "Recently Added Exams")}
          linkLabel={t(language, "Voir tout", "Browse All")}
          to="/sessions"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {recentExams.map((exam) => (
            <div
              key={exam.id}
              className="bg-neutral-900/80 border border-white/[0.06] rounded-xl p-4 flex flex-col gap-3 hover:-translate-y-0.5 transition-all duration-300 card-glow"
            >
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-800 text-neutral-300 border border-white/[0.06]">
                  {exam.semester}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                    examTypeBadge[exam.examType] ?? "bg-neutral-800 text-neutral-400 border-white/[0.06]"
                  }`}
                >
                  {examTypeLabel[exam.examType]?.[language] ?? exam.examType}
                </span>
              </div>

              {/* Title */}
              <h3 className="font-display font-bold text-sm text-white leading-snug line-clamp-2">
                {language === "fr" ? exam.courseTitleFr : exam.courseTitle}
              </h3>

              {/* Year */}
              <div className="mt-auto">
                <span className="text-xs text-neutral-500">{exam.year}</span>
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ------------------------------------------------------------------ */}
      {/* UPCOMING EVENTS (compact list)                                     */}
      {/* ------------------------------------------------------------------ */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4 }}
      >
        <SectionHeader
          title={t(language, "Evenements a Venir", "Upcoming Events")}
          linkLabel={t(language, "Voir tout", "View All")}
          to="/events"
        />

        <div className="flex flex-col gap-3">
          {upcomingEvents.slice(0, 3).map((event) => (
            <div
              key={event.id}
              className="bg-neutral-900/80 border border-white/[0.06] rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-white/[0.12] transition-colors duration-200"
            >
              {/* Date badge */}
              <div className="shrink-0 w-14 h-14 rounded-xl bg-gradient-red flex flex-col items-center justify-center text-white">
                <span className="text-[11px] font-semibold uppercase leading-none">
                  {event.date.split(" ")[0]?.slice(0, 3)}
                </span>
                <span className="text-lg font-display font-bold leading-none mt-0.5">
                  {event.date.match(/\d+/)?.[0] ?? ""}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-sm text-white leading-snug truncate">
                  {event.title}
                </h3>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {event.time}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {event.location}
                  </span>
                </div>
              </div>

              {/* Tag */}
              <span
                className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                  tagColors[event.tag] ?? "bg-neutral-800 text-neutral-400"
                }`}
              >
                <Tag className="w-3 h-3" />
                {event.tag}
              </span>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ------------------------------------------------------------------ */}
      {/* POPULAR BOOKS (horizontal scroll on mobile, grid on desktop)       */}
      {/* ------------------------------------------------------------------ */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        <SectionHeader
          title={t(language, "Livres Populaires", "Popular Books")}
          linkLabel={t(language, "Voir tout", "Browse Bookstore")}
          to="/books"
        />

        <div className="flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-5 lg:overflow-x-visible scrollbar-none">
          {topBooks.map((book) => (
            <div
              key={book.id}
              className="shrink-0 w-56 lg:w-auto bg-neutral-900/80 border border-white/[0.06] rounded-xl overflow-hidden hover:-translate-y-0.5 transition-all duration-300 card-glow-green"
            >
              {/* Color header */}
              <div className="h-20 bg-gradient-green flex items-center justify-center relative">
                <span className="font-display font-extrabold text-4xl text-white/20 select-none">
                  {book.major.charAt(0)}
                </span>
                {book.inStock ? (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/90 text-white">
                    {t(language, "En stock", "In Stock")}
                  </span>
                ) : (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/50 text-white/70">
                    {t(language, "Epuise", "Out")}
                  </span>
                )}
              </div>

              <div className="p-4">
                <h3 className="font-display font-bold text-sm text-white leading-snug line-clamp-1 mb-0.5">
                  {language === "fr" ? book.titleFr : book.title}
                </h3>
                <p className="text-xs text-neutral-500 mb-3 truncate">
                  {book.author}
                </p>

                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-base text-white">
                    {book.price}
                    <span className="text-[10px] text-neutral-500 ml-0.5 font-normal">
                      DZD
                    </span>
                  </span>
                  <span className="text-xs text-neutral-500">
                    {book.major}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
