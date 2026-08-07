import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  FileText,
  BookOpen,
  Calendar,
  Library,
  ArrowRight,
  GraduationCap,
  MapPin,
  Clock,
  Tag,
} from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { getPreviousExams, getEntranceExams } from "@/services/exams";
import { getEvents } from "@/services/events";
import { getCourses } from "@/services/courses";
import { courseTitle } from "@/services/academics";

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
// Local shapes adapted from Supabase rows (see Sessions.tsx for the same
// DB-row -> UI-shape adaptation pattern)
// ---------------------------------------------------------------------------

interface RecentExamCard {
  id: string;
  title: string;
  title_fr: string;
  track: "french" | "english";
  semester: string;
  year: string;
  examType: "partiel" | "midterm" | "resit";
}

interface UpcomingEventCard {
  id: string;
  title: string;
  date: string; // ISO YYYY-MM-DD, per services/events.ts
  time: string;
  location: string;
  tag: string;
}

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
      <h2 className="font-display font-bold text-lg text-foreground">{title}</h2>
      <Link
        to={to}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors group"
      >
        {linkLabel}
        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}

/** Empty-state panel for a dashboard section — mirrors the .surface pattern
 * used by MyCourses.tsx / Schedule.tsx. */
function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="surface flex flex-col items-center text-center px-6 py-16">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-display font-extrabold text-xl text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}

// Exam type labels + colors — keyed on the real DB values (previous_exams.exam_type
// is a CHECK constraint of partiel | midterm | resit). Index everything with the
// raw DB value, never with mock-store-style values ("final" / "midterms").
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

// Tag colors reused from Events page
const tagColors: Record<string, string> = {
  Science: "bg-blue-500/15 text-blue-300",
  Workshop: "bg-purple-500/15 text-purple-300",
  Cultural: "bg-red-500/15 text-red-300",
  Tech: "bg-cyan-500/15 text-cyan-300",
  Academic: "bg-red-500/15 text-red-400",
  Networking: "bg-green-500/15 text-green-400",
  Lecture: "bg-red-500/15 text-red-300",
  Sports: "bg-red-500/15 text-red-300",
  Art: "bg-pink-500/15 text-pink-300",
};

// Fixed-width month abbreviations for the compact event date badge. Kept
// deliberately independent of Intl locale formatting so the 56px badge never
// reflows (French Intl short-months are inconsistent length, e.g. "juil.").
const MONTH_LABEL: Record<"fr" | "en", string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  fr: ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"],
};

/** "2026-08-15" -> { month: "Aug", day: "15" }, parsed as a local wall-clock
 * date (not UTC) so the displayed day never shifts across timezones. */
function formatEventBadge(dateIso: string, language: string) {
  const parsed = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return { month: "--", day: "--" };
  const months = MONTH_LABEL[language === "fr" ? "fr" : "en"];
  return { month: months[parsed.getMonth()], day: String(parsed.getDate()) };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Index() {
  const { language } = useAppStore();

  const [isLoading, setIsLoading] = useState(true);
  const [previousExamCount, setPreviousExamCount] = useState(0);
  const [entranceExamCount, setEntranceExamCount] = useState(0);
  const [courseCount, setCourseCount] = useState(0);
  const [upcomingEventCount, setUpcomingEventCount] = useState(0);
  const [recentExams, setRecentExams] = useState<RecentExamCard[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEventCard[]>([]);

  // ---- Live data load ----
  // Global reads (exam archive, entrance exams, course catalog, events) —
  // not scoped to a signed-in student, so no useAuth() dependency here,
  // matching Sessions.tsx. Never filtered by interface `language`; course
  // track is a DB property, independent of the UI toggle (docs/LANGUAGE-AND-TRACK.md).
  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [examsRes, entranceRes, eventsRes, coursesRes] = await Promise.all([
          getPreviousExams(),
          getEntranceExams(),
          getEvents("upcoming"),
          getCourses(),
        ]);

        if (!isMounted) return;

        if (examsRes.error) console.error("[Index] getPreviousExams failed", examsRes.error);
        if (entranceRes.error) console.error("[Index] getEntranceExams failed", entranceRes.error);
        if (eventsRes.error) console.error("[Index] getEvents failed", eventsRes.error);
        if (coursesRes.error) console.error("[Index] getCourses failed", coursesRes.error);

        // previous_exams rows are already ordered year desc, rating desc by
        // the service — that ordering doubles as "recent + well-rated" for
        // the homepage preview.
        const examRows = examsRes.data ?? [];
        setPreviousExamCount(examRows.length);
        setRecentExams(
          examRows.slice(0, 5).map((exam) => ({
            id: exam.id,
            title: exam.course_title,
            title_fr: exam.course_title_fr,
            track: exam.track,
            semester: exam.semester,
            year: exam.year,
            examType: exam.exam_type,
          })),
        );

        setEntranceExamCount((entranceRes.data ?? []).length);
        setCourseCount((coursesRes.data ?? []).length);

        // getEvents("upcoming") already orders by date ascending (soonest first).
        const eventRows = eventsRes.data ?? [];
        setUpcomingEventCount(eventRows.length);
        setUpcomingEvents(
          eventRows.slice(0, 3).map((event) => ({
            id: event.id,
            title: event.title,
            date: event.date,
            time: event.time,
            location: event.location,
            tag: event.tag,
          })),
        );
      } catch (err) {
        // Belt-and-suspenders: even an unexpected throw (network down,
        // misconfigured client) must degrade to empty sections, never a
        // white screen.
        if (!isMounted) return;
        console.error("[Index] dashboard load failed", err);
        setPreviousExamCount(0);
        setEntranceExamCount(0);
        setCourseCount(0);
        setUpcomingEventCount(0);
        setRecentExams([]);
        setUpcomingEvents([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  // ---- Derived data ----

  const stats = [
    {
      label: t(language, "Examens Precedents", "Previous Exams"),
      value: previousExamCount,
      icon: <FileText className="w-5 h-5" />,
      color: "red" as const,
    },
    {
      label: t(language, "Evenements a Venir", "Upcoming Events"),
      value: upcomingEventCount,
      icon: <Calendar className="w-5 h-5" />,
      color: "green" as const,
    },
    {
      label: t(language, "Cours au Catalogue", "Courses Catalogued"),
      value: courseCount,
      icon: <Library className="w-5 h-5" />,
      color: "red" as const,
    },
    {
      label: t(language, "Examens d'Entree", "Entrance Exams"),
      value: entranceExamCount,
      icon: <BookOpen className="w-5 h-5" />,
      color: "green" as const,
    },
  ];

  // ---- Render ----

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto space-y-8 sm:space-y-10">
      {/* ------------------------------------------------------------------ */}
      {/* WELCOME HEADER                                                     */}
      {/* ------------------------------------------------------------------ */}
      <motion.section {...fadeIn}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-foreground leading-tight">
              {t(language, "Bienvenue, Etudiant!", "Welcome, Student!")}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t(
                language,
                "Votre portail de ressources academiques",
                "Your academic resource hub",
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg surface text-xs text-muted-foreground">
              <GraduationCap className="w-3.5 h-3.5" />
              {t(language, "Semestre:", "Semester:")} <span className="text-foreground font-medium">--</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg surface text-xs text-muted-foreground">
              {t(language, "Filiere:", "Major:")} <span className="text-foreground font-medium">--</span>
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
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <motion.div
                key={i}
                variants={fadeIn}
                className="surface rounded-xl p-5 flex flex-col gap-3"
              >
                <div className="skeleton w-10 h-10 rounded-xl" />
                <div className="space-y-2">
                  <div className="skeleton h-7 w-12 rounded" />
                  <div className="skeleton h-4 w-24 rounded" />
                </div>
              </motion.div>
            ))
          : stats.map((stat, i) => (
              <motion.div
                key={i}
                variants={fadeIn}
                whileHover={{ y: -4 }}
                className="surface rounded-xl p-5 flex flex-col gap-3 transition-shadow duration-300 hover:shadow-lg"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${
                    stat.color === "red" ? "bg-gradient-red" : "bg-gradient-green"
                  }`}
                >
                  {stat.icon}
                </div>
                <div>
                  <p className="font-display font-bold text-2xl sm:text-3xl text-foreground leading-none">
                    {stat.value}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
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

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="surface rounded-xl p-4 flex flex-col gap-3"
              >
                <div className="flex gap-1.5">
                  <div className="skeleton h-5 w-14 rounded-full" />
                  <div className="skeleton h-5 w-16 rounded-full" />
                </div>
                <div className="skeleton h-4 w-full rounded" />
                <div className="skeleton h-4 w-2/3 rounded" />
                <div className="mt-auto skeleton h-3 w-10 rounded" />
              </div>
            ))}
          </div>
        ) : recentExams.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-7 h-7 text-primary" />}
            title={t(language, "Aucun examen archive", "No exams archived yet")}
            description={t(
              language,
              "Les examens precedents apparaitront ici des qu'ils seront ajoutes aux archives.",
              "Previous exams will appear here once they're added to the archive.",
            )}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {recentExams.map((exam) => (
              <div
                key={exam.id}
                className="surface rounded-xl p-4 flex flex-col gap-3 hover:-translate-y-0.5 transition-all duration-300 card-glow"
              >
                {/* Badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground border border-border">
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

                {/* Title — follows the course's teaching language (track),
                    never the interface language. */}
                <h3 className="font-display font-bold text-sm text-foreground leading-snug line-clamp-2">
                  {courseTitle(exam)}
                </h3>

                {/* Year */}
                <div className="mt-auto">
                  <span className="text-xs text-muted-foreground">{exam.year}</span>
                </div>
              </div>
            ))}
          </div>
        )}
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

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="surface rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="skeleton shrink-0 w-14 h-14 rounded-xl" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="skeleton h-4 w-1/2 rounded" />
                  <div className="skeleton h-3 w-1/3 rounded" />
                </div>
                <div className="skeleton h-6 w-20 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        ) : upcomingEvents.length === 0 ? (
          <EmptyState
            icon={<Calendar className="w-7 h-7 text-primary" />}
            title={t(language, "Aucun evenement a venir", "No upcoming events")}
            description={t(
              language,
              "Revenez bientot pour decouvrir les prochains evenements du campus.",
              "Check back soon for upcoming campus events.",
            )}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {upcomingEvents.map((event) => {
              const badge = formatEventBadge(event.date, language);
              return (
                <div
                  key={event.id}
                  className="surface rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-primary/35 transition-colors duration-200"
                >
                  {/* Date badge */}
                  <div className="shrink-0 w-14 h-14 rounded-xl bg-gradient-red flex flex-col items-center justify-center text-white">
                    <span className="text-[11px] font-semibold uppercase leading-none">
                      {badge.month}
                    </span>
                    <span className="text-lg font-display font-bold leading-none mt-0.5">
                      {badge.day}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-bold text-sm text-foreground leading-snug truncate">
                      {event.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
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
              );
            })}
          </div>
        )}
      </motion.section>

    </div>
  );
}
