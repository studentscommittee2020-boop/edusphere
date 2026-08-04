import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, ChevronDown, Loader2, Save, Search, X } from "lucide-react";
import { toast } from "sonner";
import { getCourseOptions } from "@/services/materials";
import { courseTitle } from "@/services/academics";
import {
  setDoctorCourses,
  type CourseAssignmentInput,
  type DoctorCourse,
  type DoctorCourseWithCourse,
} from "@/services/teaching";
import { SEMESTERS, TRACKS, type Course, type Semester, type Track } from "@/types/database";
import { cn } from "@/lib/utils";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DoctorCourseSetupProps {
  /** The signed-in doctor's profile id — assignments are always written for themselves. */
  doctorId: string;
  language: "fr" | "en";
  /**
   * "gate" — blocking first-login setup: no close affordance, Escape and
   * backdrop clicks are inert, and `onClose` is ignored even if passed.
   * "edit" — re-opened later from the workspace: closable, pre-filled from
   * `existing`.
   */
  mode: "gate" | "edit";
  /** The doctor's current assignments, for pre-filling in "edit" mode. Pass [] for "gate". */
  existing: DoctorCourseWithCourse[];
  onSaved: (rows: DoctorCourse[]) => void;
  onClose?: () => void;
}

/** A sensible starting guess for a free-text academic-year field — never persisted until saved. */
function suggestAcademicYear(): string {
  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
}

/**
 * Blocking (or re-openable) course-selection dialog backing `doctor_courses`.
 *
 * `set_doctor_courses()` replaces a doctor's ENTIRE teaching load in one
 * call (see src/services/teaching.ts), and `doctor_courses` rows carry their
 * own `academic_year` alongside `course_id`/`semester`. This dialog only
 * ever writes ONE academic year per save — the value in the "Academic year"
 * field applies to every checked course. A doctor who has previously saved
 * courses under a *different* academic year sees that flagged explicitly
 * (`otherYearsNote` below) rather than silently dropped: saving with a
 * different year than what's shown WILL remove those other-year rows
 * (full-replace semantics), so the copy says so plainly instead of hiding
 * it. Multi-year editing in a single session is a deliberate scope cut, not
 * an oversight — see the delivery notes this component shipped with.
 */
export default function DoctorCourseSetup({
  doctorId,
  language,
  mode,
  existing,
  onSaved,
  onClose,
}: DoctorCourseSetupProps) {
  const isFr = language === "fr";
  const isGate = mode === "gate";
  const headingId = useId();
  const descId = useId();
  const yearFieldId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [trackFilter, setTrackFilter] = useState<"all" | Track>("all");
  const [semesterFilter, setSemesterFilter] = useState<"all" | Semester>("all");

  const distinctExistingYears = useMemo(
    () => [...new Set(existing.map((row) => row.academic_year))].sort(),
    [existing],
  );
  const initialYear = distinctExistingYears[distinctExistingYears.length - 1];

  const [academicYear, setAcademicYear] = useState(() => initialYear ?? suggestAcademicYear());

  // Seeded once from the props this component was mounted with — the caller
  // always mounts a fresh instance per open (matches Schedule.tsx's and
  // ExamReportDialog's conditional-render convention), so a lazy initializer
  // is equivalent to — and simpler than — an effect here.
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(
    () => new Set(existing.filter((row) => row.academic_year === initialYear).map((row) => row.course_id)),
  );
  const [openSemesters, setOpenSemesters] = useState<Set<Semester>>(
    () => new Set(existing.map((row) => row.semester)),
  );

  useEffect(() => {
    let isMounted = true;
    getCourseOptions().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        toast.error(isFr ? "Impossible de charger le catalogue de cours." : "Could not load the course catalogue.");
      }
      setCourses(data);
      setIsLoadingCourses(false);
    });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalogue fetch runs once per mount, matching every other dialog in this codebase
  }, []);

  // Remember what had focus before opening, return it there on close.
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

  // Escape-to-close (edit mode only — a gate has no dismissal) + a Tab focus
  // trap, same shape as ExamReportDialog.tsx.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!isGate && onClose) {
          event.preventDefault();
          onClose();
        }
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
  }, [isGate, onClose]);

  const filteredBySemester = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<Semester, Course[]>();
    for (const semester of SEMESTERS) map.set(semester, []);

    for (const course of courses) {
      if (trackFilter !== "all" && course.track !== trackFilter) continue;
      if (semesterFilter !== "all" && course.semester !== semesterFilter) continue;
      if (term) {
        const haystack = `${course.title} ${course.title_fr} ${course.code ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) continue;
      }
      map.get(course.semester)?.push(course);
    }
    return map;
  }, [courses, trackFilter, semesterFilter, search]);

  const visibleSemesters = SEMESTERS.filter(
    (semester) => (filteredBySemester.get(semester)?.length ?? 0) > 0,
  );

  function toggleCourse(courseId: string) {
    setSelectedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  }

  function toggleSemesterOpen(semester: Semester) {
    setOpenSemesters((prev) => {
      const next = new Set(prev);
      if (next.has(semester)) next.delete(semester);
      else next.add(semester);
      return next;
    });
  }

  const canSave =
    !isSaving && !isLoadingCourses && selectedCourseIds.size > 0 && academicYear.trim().length > 0;

  async function handleSave() {
    if (!canSave) return;
    const year = academicYear.trim();

    const assignments: CourseAssignmentInput[] = [];
    for (const courseId of selectedCourseIds) {
      const course = courses.find((item) => item.id === courseId);
      if (!course) continue;
      assignments.push({ course_id: courseId, academic_year: year, semester: course.semester });
    }

    setIsSaving(true);
    const { data, error } = await setDoctorCourses(assignments);
    setIsSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(
      isFr
        ? `${data.length} cours enregistré(s) pour ${year}.`
        : `${data.length} course${data.length === 1 ? "" : "s"} saved for ${year}.`,
    );
    onSaved(data);
  }

  const otherYears = distinctExistingYears.filter((year) => year !== academicYear.trim());
  const otherYearsNote =
    otherYears.length > 0
      ? isFr
        ? `Vous avez aussi des cours enregistrés pour : ${otherYears.join(", ")}. Enregistrer avec l'année ci-dessus les remplacera.`
        : `You also have courses saved under: ${otherYears.join(", ")}. Saving with the year above will replace them.`
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/70 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (!isGate && onClose && event.target === event.currentTarget) onClose();
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
        className="surface-raised w-full max-w-3xl p-6 sm:p-7 space-y-5 outline-none max-h-[92vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="eyebrow">
              <BookOpen className="w-3.5 h-3.5" />
              {isGate
                ? isFr ? "Configuration requise" : "Setup required"
                : isFr ? "Cours enseignés" : "Teaching courses"}
            </span>
            <h2 id={headingId} className="mt-2 font-display font-extrabold text-xl text-foreground">
              {isFr ? "Quels cours enseignez-vous ?" : "Which courses do you teach?"}
            </h2>
            <p id={descId} className="mt-1.5 text-xs text-muted-foreground leading-relaxed max-w-xl">
              {isFr
                ? "Ces sélections déterminent les cours auxquels vous pouvez publier des documents et devoirs, et les étudiants dont vous pouvez voir le travail. Toutes filières, tous semestres et années confondus."
                : "These selections determine which courses you can publish materials and assignments to, and whose student work you can see — across any track, semester, and academic year."}
            </p>
          </div>
          {!isGate && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={isFr ? "Fermer" : "Close"}
              className="shrink-0 p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {isGate && (
          <p className="text-[11px] text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 leading-relaxed">
            {isFr
              ? "Sélectionnez au moins un cours pour accéder à votre espace enseignant."
              : "Select at least one course to unlock your workspace."}
          </p>
        )}

        {/* Academic year */}
        <div className="space-y-1.5">
          <label htmlFor={yearFieldId} className="block text-xs font-semibold text-muted-foreground">
            {isFr ? "Année académique" : "Academic year"}
          </label>
          <input
            id={yearFieldId}
            type="text"
            value={academicYear}
            onChange={(event) => setAcademicYear(event.target.value)}
            placeholder="2026-2027"
            className="w-full sm:w-56 px-3.5 py-2.5 rounded-lg bg-input border border-border text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:border-primary/50"
          />
          {otherYearsNote && <p className="text-[11px] text-red-300 leading-relaxed">{otherYearsNote}</p>}
        </div>

        {/* Filters — semester and track at minimum, plus free search */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={isFr ? "Rechercher un cours ou un code…" : "Search course title or code…"}
              aria-label={isFr ? "Rechercher un cours" : "Search courses"}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground/60 focus:border-primary/50"
            />
          </div>
          <div
            className="flex items-center gap-1 surface p-1 shrink-0"
            role="group"
            aria-label={isFr ? "Filtrer par filière" : "Filter by track"}
          >
            {(["all", ...TRACKS] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTrackFilter(value)}
                aria-pressed={trackFilter === value}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-[11px] font-display font-bold transition-colors duration-200",
                  trackFilter === value
                    ? "bg-gradient-red text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "all" ? (isFr ? "Toutes" : "All") : value === "french" ? "FR" : "EN"}
              </button>
            ))}
          </div>
          <label className="shrink-0">
            <span className="sr-only">{isFr ? "Filtrer par semestre" : "Filter by semester"}</span>
            <select
              value={semesterFilter}
              onChange={(event) => setSemesterFilter(event.target.value as "all" | Semester)}
              className="px-3 py-2 rounded-lg bg-input border border-border text-foreground text-sm focus:border-primary/50"
            >
              <option value="all">{isFr ? "Tous semestres" : "All semesters"}</option>
              {SEMESTERS.map((semester) => (
                <option key={semester} value={semester}>
                  {semester}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Course list, grouped by semester */}
        {isLoadingCourses ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton h-14 rounded-xl" />
            ))}
          </div>
        ) : visibleSemesters.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {isFr ? "Aucun cours ne correspond à ces filtres." : "No courses match these filters."}
          </p>
        ) : (
          <div className="space-y-2.5 max-h-[42vh] overflow-y-auto pr-1">
            {visibleSemesters.map((semester) => {
              const semesterCourses = filteredBySemester.get(semester) ?? [];
              const isOpen = openSemesters.has(semester);
              const selectedInGroup = semesterCourses.filter((course) =>
                selectedCourseIds.has(course.id),
              ).length;

              return (
                <fieldset key={semester} className="surface overflow-hidden">
                  <legend className="sr-only">{semester}</legend>
                  <button
                    type="button"
                    onClick={() => toggleSemesterOpen(semester)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="font-display font-bold text-sm text-foreground">{semester}</span>
                    <span className="text-xs text-muted-foreground">
                      {semesterCourses.length} {isFr ? "cours" : "courses"}
                      {selectedInGroup > 0 &&
                        ` · ${selectedInGroup} ${isFr ? "sélectionné(s)" : "selected"}`}
                    </span>
                    <ChevronDown
                      className={cn(
                        "ml-auto w-4 h-4 text-muted-foreground transition-transform duration-200",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>

                  {isOpen && (
                    <div className="border-t border-border divide-y divide-border">
                      {semesterCourses.map((course) => {
                        const checkboxId = `doctor-course-setup-${course.id}`;
                        const checked = selectedCourseIds.has(course.id);
                        return (
                          <label
                            key={course.id}
                            htmlFor={checkboxId}
                            className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors"
                          >
                            <input
                              id={checkboxId}
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCourse(course.id)}
                              className="w-4 h-4 shrink-0 accent-red-500"
                            />
                            <span className="flex-1 min-w-0">
                              <span className="block font-display font-semibold text-sm text-foreground truncate">
                                {courseTitle(course)}
                              </span>
                              <span className="block text-[11px] text-muted-foreground truncate">
                                {course.code ? `${course.code} · ` : ""}
                                {course.major}
                              </span>
                            </span>
                            <span
                              className={cn(
                                "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide",
                                course.track === "french"
                                  ? "bg-blue-500/15 text-blue-400"
                                  : "bg-red-500/15 text-red-400",
                              )}
                            >
                              {course.track === "french" ? "FR" : "EN"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </fieldset>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {selectedCourseIds.size} {isFr ? "cours sélectionné(s)" : "course(s) selected"}
          </p>
          <div className="flex items-center gap-2">
            {!isGate && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-display font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                {isFr ? "Annuler" : "Cancel"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-red text-white font-display font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isGate
                ? isFr ? "Enregistrer et continuer" : "Save and continue"
                : isFr ? "Enregistrer" : "Save changes"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
