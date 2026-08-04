import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FileText,
  Library,
  NotebookPen,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAppStore } from "@/store/appStore";
import { track } from "@/lib/telemetry";
import {
  courseTitle,
  getEnrollments,
  getResourceUrl,
  getResourcesForCourses,
  type EnrollmentWithCourse,
} from "@/services/academics";
import type { CourseResource } from "@/types/database";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "enrolled" | "completed";

const RESOURCE_META: Record<
  CourseResource["resource_kind"],
  { icon: typeof FileText; labelEn: string; labelFr: string; tone: string }
> = {
  exam: { icon: FileText, labelEn: "Past exam", labelFr: "Examen", tone: "text-red-400 bg-red-500/10" },
  material: { icon: NotebookPen, labelEn: "Material", labelFr: "Support", tone: "text-green-400 bg-green-500/10" },
  assignment: { icon: ClipboardList, labelEn: "Assignment", labelFr: "Devoir", tone: "text-red-300 bg-red-300/10" },
};

export default function MyCourses() {
  const { user } = useAuth();
  const { language } = useAppStore();
  const isFr = language === "fr";

  const [enrollments, setEnrollments] = useState<EnrollmentWithCourse[]>([]);
  const [resources, setResources] = useState<CourseResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    const { data: enrollmentData } = await getEnrollments(user.id);
    setEnrollments(enrollmentData);

    // Resources are fetched for every course the student has ever taken, in one
    // query, then bucketed client-side — cheaper than a request per course.
    const courseIds = [...new Set(enrollmentData.map((item) => item.course_id))];
    const { data: resourceData } = await getResourcesForCourses(courseIds);
    setResources(resourceData);

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
    track("my_courses_viewed");
  }, [load]);

  const resourcesByCourse = useMemo(() => {
    const map = new Map<string, CourseResource[]>();
    for (const resource of resources) {
      if (!resource.course_id) continue;
      const bucket = map.get(resource.course_id) ?? [];
      bucket.push(resource);
      map.set(resource.course_id, bucket);
    }
    return map;
  }, [resources]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return enrollments.filter((enrollment) => {
      if (statusFilter !== "all" && enrollment.status !== statusFilter) return false;
      if (!term) return true;
      const course = enrollment.courses;
      return (
        course?.title.toLowerCase().includes(term) ||
        course?.title_fr.toLowerCase().includes(term) ||
        course?.code?.toLowerCase().includes(term)
      );
    });
  }, [enrollments, statusFilter, search]);

  async function openResource(resource: CourseResource) {
    if (!resource.storage_path) {
      toast.error(isFr ? "Aucun fichier joint." : "No file attached.");
      return;
    }

    const { url, error } = await getResourceUrl(resource.bucket, resource.storage_path);
    if (error || !url) {
      toast.error(isFr ? "Impossible d'ouvrir ce fichier." : "Could not open that file.");
      return;
    }

    track("resource_opened", { kind: resource.resource_kind, bucket: resource.bucket });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const filters: { key: StatusFilter; en: string; fr: string }[] = [
    { key: "all", en: "All", fr: "Tous" },
    { key: "enrolled", en: "In progress", fr: "En cours" },
    { key: "completed", en: "Completed", fr: "Terminés" },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8 lg:py-12 max-w-[1400px] mx-auto space-y-8">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <span className="eyebrow">
          <Library className="w-3.5 h-3.5" />
          {isFr ? "Ma Scolarité" : "My Academics"}
        </span>
        <h1 className="mt-2 font-display font-extrabold text-3xl lg:text-4xl text-gradient-chrome">
          {isFr ? "Mes Cours" : "My Courses"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
          {isFr
            ? "Chaque cours que vous avez suivi, avec tous ses supports : examens précédents, documents des enseignants et devoirs."
            : "Every course you have taken, with all of its resources: past exams, doctor materials, and assignments."}
        </p>
      </motion.header>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={isFr ? "Rechercher un cours…" : "Search courses…"}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground/60 focus:border-primary/50"
            aria-label={isFr ? "Rechercher un cours" : "Search courses"}
          />
        </div>

        <div className="flex items-center gap-1 surface p-1">
          {filters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setStatusFilter(filter.key)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-display font-bold transition-colors duration-200",
                statusFilter === filter.key
                  ? "bg-gradient-red text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={statusFilter === filter.key}
            >
              {isFr ? filter.fr : filter.en}
            </button>
          ))}
        </div>
      </div>

      <div className="rule-glow" />

      {/* ── Course list ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="surface flex flex-col items-center text-center px-6 py-16">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Library className="w-7 h-7 text-primary" />
          </div>
          <h2 className="font-display font-extrabold text-xl text-foreground">
            {enrollments.length === 0
              ? isFr ? "Aucun cours synchronisé" : "No courses synced"
              : isFr ? "Aucun résultat" : "No matches"}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
            {enrollments.length === 0
              ? isFr
                ? "Synchronisez depuis Mon Emploi du Temps pour importer vos cours depuis l'université."
                : "Sync from My Schedule to import your courses from the university."
              : isFr
                ? "Essayez un autre terme ou un autre filtre."
                : "Try a different search term or filter."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((enrollment, index) => {
            const course = enrollment.courses;
            const courseResources = resourcesByCourse.get(enrollment.course_id) ?? [];
            const isOpen = expanded === enrollment.id;

            return (
              <motion.li
                key={enrollment.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.3 }}
                className="surface overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : enrollment.id)}
                  className="w-full flex items-center gap-4 px-4 sm:px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
                  aria-expanded={isOpen}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display font-bold text-base text-foreground truncate">
                        {course ? courseTitle(course) : enrollment.course_id}
                      </h2>
                      {course?.code && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-white/[0.07] text-muted-foreground">
                          {course.code}
                        </span>
                      )}
                      {/* The language the course is TAUGHT in. Independent of
                          the interface language toggle in the sidebar. */}
                      {course?.track && <TrackBadge track={course.track} />}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {enrollment.semester} · {enrollment.academic_year}
                      {course?.credits ? ` · ${course.credits} ${isFr ? "crédits" : "credits"}` : ""}
                      {courseResources.length > 0 &&
                        ` · ${courseResources.length} ${isFr ? "ressources" : "resources"}`}
                    </p>
                  </div>

                  {enrollment.grade !== null && (
                    <span className="hidden sm:block font-display font-bold text-lg text-foreground tabular-nums">
                      {enrollment.grade}
                    </span>
                  )}

                  <StatusPill status={enrollment.status} isFr={isFr} />

                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-border px-4 sm:px-5 py-4">
                    {courseResources.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        {isFr
                          ? "Aucune ressource pour ce cours pour l'instant."
                          : "No resources for this course yet."}
                      </p>
                    ) : (
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {courseResources.map((resource) => {
                          const meta = RESOURCE_META[resource.resource_kind];
                          const Icon = meta.icon;

                          return (
                            <li key={`${resource.resource_kind}-${resource.resource_id}`}>
                              <button
                                type="button"
                                onClick={() => void openResource(resource)}
                                className="w-full surface-interactive flex items-center gap-3 px-3.5 py-3 text-left"
                              >
                                <span
                                  className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                    meta.tone,
                                  )}
                                >
                                  <Icon className="w-4 h-4" />
                                </span>

                                <span className="flex-1 min-w-0">
                                  <span className="block font-display font-semibold text-sm text-foreground truncate">
                                    {resource.title}
                                  </span>
                                  <span className="block text-xs text-muted-foreground truncate">
                                    {isFr ? meta.labelFr : meta.labelEn} · {resource.subtitle}
                                  </span>
                                </span>

                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * The language a course is taught in — a property of the course, not of the
 * reader. A student on the French track sees "FR" here whether the interface
 * is set to French or English.
 */
function TrackBadge({ track }: { track: "french" | "english" }) {
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide",
        track === "french"
          ? "bg-blue-500/15 text-blue-400"
          : "bg-red-500/15 text-red-400",
      )}
      title={track === "french" ? "Taught in French" : "Taught in English"}
    >
      {track === "french" ? "FR" : "EN"}
    </span>
  );
}

function StatusPill({
  status,
  isFr,
}: {
  status: EnrollmentWithCourse["status"];
  isFr: boolean;
}) {
  const styles: Record<string, string> = {
    enrolled: "bg-blue-500/15 text-blue-400",
    completed: "bg-green-500/15 text-green-400",
    withdrawn: "bg-neutral-500/15 text-neutral-400",
    failed: "bg-red-500/15 text-red-400",
  };
  const labels: Record<string, { en: string; fr: string }> = {
    enrolled: { en: "In progress", fr: "En cours" },
    completed: { en: "Completed", fr: "Terminé" },
    withdrawn: { en: "Withdrawn", fr: "Abandonné" },
    failed: { en: "Failed", fr: "Échoué" },
  };

  return (
    <span
      className={cn(
        "shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide",
        styles[status],
      )}
    >
      {isFr ? labels[status].fr : labels[status].en}
    </span>
  );
}
