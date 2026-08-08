import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ClipboardList,
  Eye,
  EyeOff,
  FilePlus2,
  FileText,
  FileUp,
  GraduationCap,
  Loader2,
  NotebookPen,
  Printer,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAppStore } from "@/store/appStore";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createAssignment,
  createPrintDocument,
  getAssignmentSubmissions,
  getAssignmentsForCurrentUser,
  getPrivateFileUrl,
  getPrintDocuments,
  reviewSubmission,
  uploadDoctorPrintDocument,
} from "@/services/portal";
import {
  deleteMaterial,
  getCourseOptions,
  getMaterialsForDoctor,
  publishMaterial,
  setMaterialPublished,
  type MaterialWithCourse,
} from "@/services/materials";
import { courseTitle } from "@/services/academics";
import {
  getDoctorCourses,
  getMyExamSubmissions,
  submitExamForReview,
  type DoctorCourseWithCourse,
  type ExamSubmission,
  type ExamSubmissionStatus,
} from "@/services/teaching";
import DoctorBookReviewPanel from "@/components/DoctorBookReviewPanel";
import DoctorCourseSetup from "@/components/DoctorCourseSetup";
import type { Assignment, AssignmentSubmission, Course, CourseMaterial, ExamType, PrintDocument, Track } from "@/types/database";

const inputClass =
  "w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-red-500/30";

// Exam type labels — real DB values (exam_submissions.exam_type /
// previous_exams.exam_type CHECK: partiel | midterm | resit). Mirrors the
// site-wide convention already established in Sessions.tsx/Index.tsx rather
// than inventing a second, conflicting mapping.
const EXAM_TYPE_LABELS: Record<ExamType, { fr: string; en: string }> = {
  partiel: { fr: "Partiel", en: "Final" },
  midterm: { fr: "Midterm", en: "Midterm" },
  resit: { fr: "Rattrapage", en: "Resit" },
};

type ReviewStatus = "graded" | "returned";

interface ReviewDraft {
  status: ReviewStatus;
  grade: string;
  feedback: string;
}

function defaultReviewDraft(submission: AssignmentSubmission): ReviewDraft {
  return {
    status: submission.status === "graded" ? "graded" : "returned",
    grade: submission.grade?.toString() ?? "",
    feedback: submission.feedback,
  };
}

export default function DoctorWorkspace() {
  const { user, profile } = useAuth();
  // Dev-role preview (src/lib/devAuth.ts) fakes `profile`/`isDoctor` but
  // deliberately leaves `user` null — see AuthContext.tsx's "Dev-only role
  // preview" block. Falling back to `profile.id` keeps the gate/edit dialogs
  // renderable (and thus verifiable) under that preview path; in real auth
  // `user.id` and `profile.id` are always the same value, set together.
  const doctorId = user?.id ?? profile?.id ?? "";
  const { language } = useAppStore();
  const isFr = language === "fr";
  const [documents, setDocuments] = useState<PrintDocument[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<Record<string, AssignmentSubmission[]>>({});
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [copies, setCopies] = useState("1");
  const [notes, setNotes] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentCourseId, setAssignmentCourseId] = useState("");
  const [assignmentDescription, setAssignmentDescription] = useState("");
  const [major, setMajor] = useState("");
  const [semester, setSemester] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [allowLate, setAllowLate] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<string | null>(null);
  const [activeReviewSubmissionId, setActiveReviewSubmissionId] = useState<string | null>(null);
  const [openingSubmissionId, setOpeningSubmissionId] = useState<string | null>(null);
  const [isCourseSetupOpen, setIsCourseSetupOpen] = useState(false);
  const [submitting, setSubmitting] = useState<"document" | "assignment" | "material" | "exam" | null>(
    null,
  );

  // Course materials — published to the students of a course, unlike print
  // documents which only the committee ever sees.
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<MaterialWithCourse[]>([]);
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialCourseId, setMaterialCourseId] = useState("");
  const [materialKind, setMaterialKind] = useState<CourseMaterial["kind"]>("notes");
  const [materialDescription, setMaterialDescription] = useState("");

  // Teaching assignments (doctor_courses, migration 012) — gate the
  // workspace until at least one exists, and scope the exam-submission
  // course picker below to only the courses this doctor actually teaches.
  const [teachingAssignments, setTeachingAssignments] = useState<DoctorCourseWithCourse[]>([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);

  // Exam submissions — doctor -> student council review queue. Never
  // visible to students until the council approves it.
  const [examSubmissions, setExamSubmissions] = useState<ExamSubmission[]>([]);
  const [examFile, setExamFile] = useState<File | null>(null);
  const [examCourseId, setExamCourseId] = useState("");
  const [examTrack, setExamTrack] = useState<Track>("french");
  const [examYear, setExamYear] = useState(() => String(new Date().getFullYear()));
  const [examType, setExamType] = useState<ExamType>("partiel");
  const [examPages, setExamPages] = useState("1");

  async function load() {
    const [documentResult, assignmentResult, courseResult] = await Promise.all([
      getPrintDocuments(),
      getAssignmentsForCurrentUser(),
      getCourseOptions(),
    ]);
    setDocuments(documentResult.data);
    setAssignments(assignmentResult.data);
    setCourses(courseResult.data);
    const submissionResults = await Promise.all(
      assignmentResult.data.map(async (assignment) => {
        const result = await getAssignmentSubmissions(assignment.id);
        return [assignment.id, result.data] as const;
      }),
    );
    setAssignmentSubmissions(Object.fromEntries(submissionResults));
    if (user) {
      const [materialResult, teachingResult, examSubmissionResult] = await Promise.all([
        getMaterialsForDoctor(user.id),
        getDoctorCourses(user.id),
        getMyExamSubmissions(user.id),
      ]);
      setMaterials(materialResult.data);
      setTeachingAssignments(teachingResult.data);
      setExamSubmissions(examSubmissionResult.data);
    }
    // Unconditional: dev-role preview (src/lib/devAuth.ts) fakes `profile`/
    // `isDoctor` but deliberately leaves `user` null (see AuthContext.tsx's
    // "Dev-only role preview" block) — gating this on `user` would leave the
    // page stuck on the loading skeleton forever under that preview path.
    setIsLoadingWorkspace(false);
  }

  useEffect(() => { void load(); }, [user?.id]);

  // Unique courses backing the exam-submission course picker below — a
  // doctor can hold multiple doctor_courses rows for the same course_id
  // (different years/semesters), but the picker only needs one entry per course.
  const taughtCourses = useMemo(() => {
    const byId = new Map<string, Course>();
    for (const row of teachingAssignments) {
      if (row.courses) byId.set(row.course_id, row.courses);
    }
    return [...byId.values()];
  }, [teachingAssignments]);

  const doctorAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.doctor_id === doctorId),
    [assignments, doctorId],
  );

  async function submitMaterial(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!materialFile) { toast.error("Attach the PDF to publish."); return; }
    if (!materialCourseId) { toast.error("Pick the course this belongs to."); return; }
    if (!materialTitle.trim()) { toast.error("Add a clear title."); return; }

    setSubmitting("material");
    const result = await publishMaterial(user.id, materialCourseId, materialFile, {
      title: materialTitle.trim(),
      description: materialDescription.trim(),
      kind: materialKind,
    });
    setSubmitting(null);

    if (result.error) { toast.error(result.error.message); return; }
    toast.success("Material published to enrolled students.");
    setMaterialFile(null); setMaterialTitle(""); setMaterialDescription(""); setMaterialCourseId("");
    await load();
  }

  async function toggleMaterial(material: MaterialWithCourse) {
    const { error } = await setMaterialPublished(material.id, material.published_at === null);
    if (error) { toast.error("Could not change visibility."); return; }
    toast.success(material.published_at === null ? "Now visible to students." : "Hidden from students.");
    await load();
  }

  async function removeMaterial(material: MaterialWithCourse) {
    const { error } = await deleteMaterial(material);
    if (error) { toast.error("Could not delete that material."); return; }
    toast.success("Material deleted.");
    await load();
  }

  async function submitDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!documentFile || !user) { toast.error("Attach the PDF to print."); return; }
    if (!documentTitle.trim()) { toast.error("Add a clear document title."); return; }
    setSubmitting("document");
    const upload = await uploadDoctorPrintDocument(user.id, documentFile);
    if (upload.error || !upload.path) { setSubmitting(null); toast.error(upload.error?.message ?? "Upload failed."); return; }
    const result = await createPrintDocument({ doctor_id: user.id, title: documentTitle.trim(), copies: Number(copies), notes: notes.trim(), storage_path: upload.path, original_name: documentFile.name, mime_type: "application/pdf", size_bytes: documentFile.size });
    setSubmitting(null);
    if (result.error) { toast.error(result.error.message); return; }
    toast.success("Print request sent to the committee desk.");
    setDocumentFile(null); setDocumentTitle(""); setCopies("1"); setNotes("");
    await load();
  }

  async function submitAssignment(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !assignmentTitle.trim()) { toast.error("Add an assignment title."); return; }
    if (!assignmentCourseId) { toast.error("Select one of your active teaching courses."); return; }
    setSubmitting("assignment");
    const result = await createAssignment({ doctor_id: user.id, course_id: assignmentCourseId, title: assignmentTitle.trim(), description: assignmentDescription.trim(), target_major: major || null, target_semester: semester || null, due_at: dueAt ? new Date(dueAt).toISOString() : null, allow_late: allowLate, published_at: new Date().toISOString() });
    setSubmitting(null);
    if (result.error) { toast.error(result.error.message); return; }
    toast.success("Assignment published for matching students.");
    setAssignmentTitle(""); setAssignmentCourseId(""); setAssignmentDescription(""); setMajor(""); setSemester(""); setDueAt(""); setAllowLate(false);
    await load();
  }

  async function submitReview(submission: AssignmentSubmission) {
    const draft = reviewDrafts[submission.id] ?? defaultReviewDraft(submission);
    const grade = draft.status === "graded" ? Number(draft.grade) : null;
    if (draft.status === "graded" && (grade === null || !Number.isFinite(grade) || grade < 0 || grade > 100)) {
      toast.error("Enter a grade from 0 to 100.");
      return;
    }

    setReviewingSubmissionId(submission.id);
    const { error } = await reviewSubmission(submission.id, {
      status: draft.status,
      grade,
      feedback: draft.feedback.trim(),
    });
    setReviewingSubmissionId(null);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(draft.status === "graded" ? "Grade shared with the student." : "Submission returned to the student.");
    setActiveReviewSubmissionId(null);
    await load();
  }

  async function openSubmittedPdf(submission: AssignmentSubmission) {
    setOpeningSubmissionId(submission.id);
    const { url, error } = await getPrivateFileUrl("assignment-submissions", submission.storage_path);
    setOpeningSubmissionId(null);

    if (error || !url) {
      toast.error("Could not open this submitted PDF.");
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function submitExam(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!examFile) {
      toast.error(isFr ? "Joignez le PDF de l'examen." : "Attach the exam PDF.");
      return;
    }
    if (!examCourseId) {
      toast.error(isFr ? "Choisissez le cours." : "Pick the course.");
      return;
    }
    if (!examYear.trim()) {
      toast.error(isFr ? "Indiquez l'année." : "Add the year.");
      return;
    }
    const pages = Number(examPages);
    if (!Number.isFinite(pages) || pages < 1) {
      toast.error(isFr ? "Nombre de pages invalide." : "Invalid page count.");
      return;
    }

    setSubmitting("exam");
    const result = await submitExamForReview(user.id, examFile, {
      courseId: examCourseId,
      track: examTrack,
      year: examYear.trim(),
      examType,
      pages,
    });
    setSubmitting(null);

    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(
      isFr
        ? "Examen envoyé au comité étudiant pour révision."
        : "Exam sent to the student council for review.",
    );
    setExamFile(null);
    setExamCourseId("");
    setExamYear(String(new Date().getFullYear()));
    setExamType("partiel");
    setExamTrack("french");
    setExamPages("1");
    await load();
  }

  if (isLoadingWorkspace) {
    return (
      <div className="min-h-screen relative">
        <div className="absolute inset-0 bg-mesh pointer-events-none" />
        <main className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-7">
          <div className="skeleton h-40 rounded-[2rem]" />
          <div className="grid xl:grid-cols-2 gap-6">
            <div className="skeleton h-72 rounded-xl" />
            <div className="skeleton h-72 rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-mesh pointer-events-none" />

      {/* Blocking first-login gate — no doctor_courses rows yet. Rendered
          over the workspace (still mounted underneath) rather than instead
          of it, so the moment it's satisfied the rest is already loaded. */}
      {/* Re-openable edit — "Edit teaching courses" affordance below. */}
      {teachingAssignments.length === 0 && (
        <DoctorCourseSetup
          doctorId={doctorId}
          language={language}
          mode="gate"
          existing={[]}
          onSaved={() => void load()}
        />
      )}

      {isCourseSetupOpen && teachingAssignments.length > 0 && (
        <DoctorCourseSetup
          doctorId={doctorId}
          language={language}
          mode="edit"
          existing={teachingAssignments}
          onSaved={() => {
            setIsCourseSetupOpen(false);
            void load();
          }}
          onClose={() => setIsCourseSetupOpen(false)}
        />
      )}

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-7">
        <motion.header
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface-raised rounded-[2rem] p-7 sm:p-9 flex flex-col md:flex-row md:items-end md:justify-between gap-5 overflow-hidden relative"
        >
          <div className="absolute -top-24 right-0 h-64 w-64 rounded-full bg-red-600/15 blur-3xl pointer-events-none" />

          <div className="relative">
            <span className="eyebrow">
              <ClipboardList className="w-3.5 h-3.5" />
              Doctor workspace
            </span>
            <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-gradient-chrome mt-3">
              Teach, publish, and print without the paperwork chase.
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-3">
              Assignments and course materials reach only matching verified students. Print
              files go to the committee desk through a private queue students never see.
            </p>
          </div>

          <div className="relative grid grid-cols-2 gap-3">
            <div className="surface px-4 py-3">
              <p className="text-xl text-foreground font-display font-extrabold">{doctorAssignments.length}</p>
              <p className="text-xs text-muted-foreground">published</p>
            </div>
            <div className="surface px-4 py-3">
              <p className="text-xl text-foreground font-display font-extrabold">{documents.length}</p>
              <p className="text-xs text-muted-foreground">print jobs</p>
            </div>
          </div>
        </motion.header>

        {/* ── Teaching courses summary ────────────────────────────────────
            doctor_courses (migration 012) scopes what this doctor can
            publish to and whose roster they can see — see DoctorCourseSetup. */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-4"
        >
          <span className="w-10 h-10 rounded-xl bg-red-300/10 text-red-300 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-sm text-foreground">
              {isFr ? "Vos cours enseignés" : "Your teaching courses"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {taughtCourses.length === 0
                ? isFr ? "Aucun cours sélectionné." : "No courses selected."
                : taughtCourses.map((course) => courseTitle(course)).join(" · ")}
            </p>
          </div>
          <p className="shrink-0 text-[11px] text-muted-foreground max-w-48 text-right">
            {isFr ? "Attribués par l’emploi du temps universitaire." : "Assigned from the university schedule."}
          </p>
          <button
            type="button"
            onClick={() => setIsCourseSetupOpen(true)}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-display font-bold text-foreground transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
          >
            {isFr ? "Modifier les cours" : "Edit teaching courses"}
          </button>
        </motion.section>

        <DoctorBookReviewPanel doctorId={doctorId} assignments={teachingAssignments} />

        <div className="grid xl:grid-cols-2 gap-6">
          {/* ── Print request ──────────────────────────────────────────────
              Goes to the committee desk only. Students never see this queue. */}
          <section className="surface p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-red-500/10 text-red-300 flex items-center justify-center shrink-0">
                <Printer className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display font-bold text-lg text-foreground">Send a print request</h2>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-500/10 text-red-300">
                    Committee only
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Visible to committee administrators only — students never see the print queue.
                </p>
              </div>
            </div>

            <form onSubmit={submitDocument} className="space-y-4 mt-6">
              <input
                value={documentTitle}
                onChange={(event) => setDocumentTitle(event.target.value)}
                placeholder="Document title"
                required
                className={inputClass}
              />

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-muted-foreground block mb-2">Copies</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={copies}
                    onChange={(event) => setCopies(event.target.value)}
                    required
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground block mb-2">PDF file</span>
                  <span className="relative flex items-center gap-2 rounded-xl border border-dashed border-border-strong px-4 py-3 cursor-pointer text-sm text-muted-foreground">
                    <UploadCloud className="w-4 h-4 text-red-300 shrink-0" />
                    <span className="truncate">{documentFile?.name ?? "Choose PDF"}</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                    />
                  </span>
                </label>
              </div>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Printing notes (optional)"
                maxLength={2000}
                rows={3}
                className={inputClass}
              />

              <button
                type="submit"
                disabled={submitting === "document"}
                className="w-full py-3 rounded-xl bg-gradient-red text-white font-display font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting === "document" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send to print desk
                  </>
                )}
              </button>
            </form>
          </section>

          {/* ── Assignments ─────────────────────────────────────────────── */}
          <section className="surface p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-green-500/10 text-green-400 flex items-center justify-center shrink-0">
                <FilePlus2 className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display font-bold text-lg text-foreground">Publish an assignment</h2>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-green-500/10 text-green-400">
                    Students see this
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Choose an active teaching course before publishing.</p>
              </div>
            </div>

            <form onSubmit={submitAssignment} className="space-y-4 mt-6">
              <label className="block">
                <span className="text-xs text-muted-foreground block mb-2">Active teaching course</span>
                <Select
                  value={assignmentCourseId}
                  onValueChange={setAssignmentCourseId}
                  disabled={taughtCourses.length === 0}
                >
                  <SelectTrigger className="h-12 w-full rounded-xl border-border bg-input px-4 text-foreground" aria-label="Active teaching course">
                    <SelectValue placeholder={taughtCourses.length === 0 ? "No active teaching courses" : "Select an active teaching course…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {taughtCourses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.code ? course.code + " · " : ""}{courseTitle(course)} ({course.semester})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <input
                value={assignmentTitle}
                onChange={(event) => setAssignmentTitle(event.target.value)}
                placeholder="Assignment title"
                required
                className={inputClass}
              />
              <textarea
                value={assignmentDescription}
                onChange={(event) => setAssignmentDescription(event.target.value)}
                placeholder="Instructions for students"
                maxLength={12000}
                rows={3}
                className={inputClass}
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  value={major}
                  onChange={(event) => setMajor(event.target.value)}
                  placeholder="Target major (blank = all)"
                  className={inputClass}
                />
                <input
                  value={semester}
                  onChange={(event) => setSemester(event.target.value)}
                  placeholder="Target semester (blank = all)"
                  className={inputClass}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3 items-center">
                <label className="block">
                  <span className="text-xs text-muted-foreground block mb-2">Deadline</span>
                  <input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(event) => setDueAt(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex items-center gap-3 pt-6 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowLate}
                    onChange={(event) => setAllowLate(event.target.checked)}
                    className="accent-red-500 w-4 h-4"
                  />
                  Accept late work
                </label>
              </div>
              <button
                type="submit"
                disabled={submitting === "assignment" || taughtCourses.length === 0}
                className="w-full py-3 rounded-xl bg-green-500 hover:bg-green-400 text-green-950 font-display font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting === "assignment" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Publish assignment
                  </>
                )}
              </button>
            </form>
          </section>
        </div>

        <section className="surface p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-display font-bold text-lg text-foreground">Student submission inbox</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Review your students&apos; work and send their grade or revision feedback directly.
              </p>
            </div>
            <span className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-display font-bold uppercase tracking-[0.12em] bg-green-500/10 text-green-400">
              Doctor only
            </span>
          </div>

          {doctorAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-6">
              Publish an assignment to receive student submissions here.
            </p>
          ) : (
            <div className="mt-6 space-y-5">
              {doctorAssignments.map((assignment) => {
                const submissions = assignmentSubmissions[assignment.id] ?? [];
                return (
                  <article key={assignment.id} className="rounded-2xl border border-border bg-surface-0/40 p-4 sm:p-5">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-display font-bold text-foreground">{assignment.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {submissions.length} submission{submissions.length === 1 ? "" : "s"} received
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">Course-linked assignment</span>
                    </div>

                    {submissions.length === 0 ? (
                      <p className="text-sm text-muted-foreground mt-4">No student work has been submitted yet.</p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {submissions.map((submission) => {
                          const draft = reviewDrafts[submission.id] ?? defaultReviewDraft(submission);
                          const isReviewing = reviewingSubmissionId === submission.id;
                          return (
                            <article key={submission.id} className="rounded-xl border border-border bg-surface-1/60 p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{submission.original_name}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Attempt {submission.attempt_number} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(submission.submitted_at))}
                                  </p>
                                </div>
                                <span className="self-start sm:self-auto px-2.5 py-1 rounded-full text-xs capitalize bg-red-500/10 text-red-300">
                                  {submission.status}
                                </span>
                              </div>
                              {submission.message && (
                                <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">{submission.message}</p>
                              )}
                              <Dialog open={activeReviewSubmissionId === submission.id} onOpenChange={(open) => setActiveReviewSubmissionId(open ? submission.id : null)}>
                                <DialogTrigger asChild>
                                  <button type="button" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-display font-bold text-foreground transition-colors hover:bg-white/[0.06]">
                                    <FileText className="w-4 h-4" /> Review submission
                                  </button>
                                </DialogTrigger>
                                <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
                                  <DialogHeader>
                                    <DialogTitle>Review submission</DialogTitle>
                                    <DialogDescription>{submission.original_name} · attempt {submission.attempt_number}</DialogDescription>
                                  </DialogHeader>
                                  <form onSubmit={(event) => { event.preventDefault(); void submitReview(submission); }} className="space-y-4">
                                    <button type="button" onClick={() => void openSubmittedPdf(submission)} disabled={openingSubmissionId === submission.id} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-display font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-50">
                                      {openingSubmissionId === submission.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                                      Open submitted PDF
                                    </button>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">Decision</span><select value={draft.status} onChange={(event) => setReviewDrafts((current) => ({ ...current, [submission.id]: { ...draft, status: event.target.value as ReviewStatus } }))} className={inputClass}><option value="graded">Grade and share</option><option value="returned">Return for revision</option></select></label>
                                      <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">Grade (0–100)</span><input type="number" min="0" max="100" step="0.01" value={draft.grade} disabled={draft.status !== "graded"} onChange={(event) => setReviewDrafts((current) => ({ ...current, [submission.id]: { ...draft, grade: event.target.value } }))} className={inputClass} /></label>
                                    </div>
                                    <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">Feedback</span><textarea value={draft.feedback} maxLength={4000} rows={4} onChange={(event) => setReviewDrafts((current) => ({ ...current, [submission.id]: { ...draft, feedback: event.target.value } }))} placeholder="Feedback for the student" className={inputClass} /></label>
                                    <DialogFooter>
                                      <button type="submit" disabled={isReviewing} className="min-h-11 rounded-xl bg-gradient-red px-4 py-2.5 text-sm font-display font-bold text-white disabled:opacity-50">
                                        {isReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : draft.status === "graded" ? "Save grade" : "Return submission"}
                                      </button>
                                    </DialogFooter>
                                  </form>
                                </DialogContent>
                              </Dialog>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Course materials ──────────────────────────────────────────────
            Published to the students enrolled in the chosen course. This is the
            student-facing counterpart to the print queue below, which students
            never see. */}
        <section className="surface p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-green-500/10 text-green-400 flex items-center justify-center">
              <NotebookPen className="w-5 h-5" />
            </span>
            <div>
              <h2 className="font-display font-bold text-lg text-foreground">Publish course material</h2>
              <p className="text-xs text-muted-foreground">
                Visible to students enrolled in the selected course. Appears under their My Courses.
              </p>
            </div>
          </div>

          <form onSubmit={submitMaterial} className="grid lg:grid-cols-2 gap-4 mt-6">
            <input
              value={materialTitle}
              onChange={(event) => setMaterialTitle(event.target.value)}
              placeholder="Material title"
              required
              className={inputClass}
            />

            <label className="block">
              <span className="sr-only">Course</span>
              <Select
                value={materialCourseId}
                onValueChange={setMaterialCourseId}
              >
                <SelectTrigger className="h-12 w-full rounded-xl border-border bg-input px-4 text-foreground" aria-label="Course">
                  <SelectValue placeholder="Select a course…" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.code ? `${course.code} · ` : ""}{courseTitle(course)} ({course.semester})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="block">
              <span className="sr-only">Kind</span>
              <select
                value={materialKind}
                onChange={(event) => setMaterialKind(event.target.value as CourseMaterial["kind"])}
                className={inputClass}
              >
                <option value="notes">Lecture notes</option>
                <option value="slides">Slides</option>
                <option value="reading">Reading</option>
                <option value="correction">Correction</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="block">
              <span className="relative flex items-center gap-2 rounded-xl border border-dashed border-border-strong px-4 py-3 cursor-pointer text-sm text-muted-foreground">
                <UploadCloud className="w-4 h-4 text-green-400 shrink-0" />
                <span className="truncate">{materialFile?.name ?? "Choose PDF"}</span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(event) => setMaterialFile(event.target.files?.[0] ?? null)}
                />
              </span>
            </label>

            <textarea
              value={materialDescription}
              onChange={(event) => setMaterialDescription(event.target.value)}
              placeholder="Short description (optional)"
              maxLength={4000}
              rows={2}
              className={`${inputClass} lg:col-span-2`}
            />

            <button
              disabled={submitting === "material"}
              className="lg:col-span-2 w-full py-3 rounded-xl bg-gradient-green text-white font-display font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting === "material"
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><Send className="w-4 h-4" />Publish to students</>}
            </button>
          </form>

          <div className="mt-6 space-y-2">
            {materials.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No materials published yet.</p>
            ) : (
              materials.map((material) => (
                <div key={material.id} className="surface flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-sm text-foreground truncate">
                      {material.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {material.courses ? courseTitle(material.courses) : "Unknown course"} · {material.kind}
                      {material.published_at === null && " · hidden"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void toggleMaterial(material)}
                    className="p-2 rounded-lg hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={material.published_at === null ? "Publish" : "Hide from students"}
                    title={material.published_at === null ? "Publish" : "Hide from students"}
                  >
                    {material.published_at === null ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button type="button" className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" aria-label="Delete material">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this material?</AlertDialogTitle>
                        <AlertDialogDescription>Students will lose access to “{material.title}” immediately. This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => void removeMaterial(material)}>Delete material</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── Exam submissions ────────────────────────────────────────────
            Doctor -> student council review queue (exam_submissions,
            migration 012). Course choices are scoped to taughtCourses, not
            the full catalogue. Never visible to students until the council
            approves it and materialises the live previous_exams row. */}
        <section className="surface p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-red-300/10 text-red-300 flex items-center justify-center shrink-0">
              <FileUp className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display font-bold text-lg text-foreground">
                {isFr ? "Soumettre un examen archivé" : "Submit a past exam"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isFr
                  ? "Revu par le comité étudiant avant publication — jamais visible aux étudiants avant approbation."
                  : "Reviewed by the student council before publishing — never visible to students until approved."}
              </p>
            </div>
          </div>

          {taughtCourses.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-6">
              {isFr
                ? "Sélectionnez d'abord vos cours enseignés ci-dessus."
                : "Select your teaching courses above first."}
            </p>
          ) : (
            <form onSubmit={submitExam} className="grid lg:grid-cols-2 gap-4 mt-6">
              <label className="block">
                <span className="sr-only">{isFr ? "Cours" : "Course"}</span>
                <Select
                  value={examCourseId}
                  onValueChange={(nextCourseId) => {
                    setExamCourseId(nextCourseId);
                    const matched = taughtCourses.find((course) => course.id === nextCourseId);
                    if (matched) setExamTrack(matched.track);
                  }}
                >
                  <SelectTrigger className="h-12 w-full rounded-xl border-border bg-input px-4 text-foreground" aria-label={isFr ? "Cours" : "Course"}>
                    <SelectValue placeholder={isFr ? "Sélectionner un cours…" : "Select a course…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {taughtCourses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.code ? `${course.code} · ` : ""}
                      {courseTitle(course)} ({course.semester})
                    </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="block">
                <span className="sr-only">{isFr ? "Filière" : "Track"}</span>
                <select
                  value={examTrack}
                  onChange={(event) => setExamTrack(event.target.value as Track)}
                  className={inputClass}
                >
                  <option value="french">{isFr ? "Français" : "French"}</option>
                  <option value="english">{isFr ? "Anglais" : "English"}</option>
                </select>
              </label>

              <input
                value={examYear}
                onChange={(event) => setExamYear(event.target.value)}
                placeholder={isFr ? "Année (ex. 2025)" : "Year (e.g. 2025)"}
                required
                className={inputClass}
              />

              <label className="block">
                <span className="sr-only">{isFr ? "Type d'examen" : "Exam type"}</span>
                <select
                  value={examType}
                  onChange={(event) => setExamType(event.target.value as ExamType)}
                  className={inputClass}
                >
                  <option value="partiel">{isFr ? "Partiel" : "Final"}</option>
                  <option value="midterm">Midterm</option>
                  <option value="resit">{isFr ? "Rattrapage" : "Resit"}</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-muted-foreground block mb-2">
                  {isFr ? "Nombre de pages" : "Pages"}
                </span>
                <input
                  type="number"
                  min="1"
                  value={examPages}
                  onChange={(event) => setExamPages(event.target.value)}
                  required
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="relative flex items-center gap-2 rounded-xl border border-dashed border-border-strong px-4 py-3 cursor-pointer text-sm text-muted-foreground">
                  <UploadCloud className="w-4 h-4 text-red-300 shrink-0" />
                  <span className="truncate">
                    {examFile?.name ?? (isFr ? "Choisir le PDF" : "Choose PDF")}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(event) => setExamFile(event.target.files?.[0] ?? null)}
                  />
                </span>
              </label>

              <button
                disabled={submitting === "exam"}
                className="lg:col-span-2 w-full py-3 rounded-xl bg-gradient-red text-white font-display font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting === "exam" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {isFr ? "Envoyer au comité" : "Send to council"}
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-6 space-y-2">
            {examSubmissions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                {isFr ? "Aucun examen soumis pour l'instant." : "No exams submitted yet."}
              </p>
            ) : (
              examSubmissions.map((submission) => (
                <div key={submission.id} className="surface px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-sm text-foreground truncate">
                        {courseTitle({
                          title: submission.course_title,
                          title_fr: submission.course_title_fr,
                          track: submission.track,
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {submission.major} · {submission.semester} · {submission.year} ·{" "}
                        {EXAM_TYPE_LABELS[submission.exam_type][isFr ? "fr" : "en"]}
                      </p>
                    </div>
                    <ExamSubmissionStatusPill status={submission.status} isFr={isFr} />
                  </div>
                  {submission.status === "rejected" && submission.rejection_reason && (
                    <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 leading-relaxed">
                      {isFr ? "Motif du rejet : " : "Rejection reason: "}
                      {submission.rejection_reason}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── Print queue ─────────────────────────────────────────────────
            The doctor's own view of print jobs sent to the committee desk.
            Still committee-only — students never see this, same as the send
            form above. */}
        <section className="surface p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
            <h2 className="font-display font-bold text-lg text-foreground">Your print queue</h2>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-500/10 text-red-300">
              Committee only
            </span>
            <span className="text-xs text-muted-foreground">— never shown to students</span>
          </div>

          <div className="mt-5 grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No print requests yet.</p>
            ) : (
              documents.map((document) => (
                <div key={document.id} className="surface p-4">
                  <div className="flex justify-between gap-3">
                    <p className="font-display font-bold text-foreground truncate">{document.title}</p>
                    <span className="text-xs capitalize text-red-300 shrink-0">{document.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 truncate">{document.original_name}</p>
                  <p className="text-xs text-muted-foreground mt-4">
                    {document.copies} copy{document.copies === 1 ? "" : "ies"}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ExamSubmissionStatusPill({
  status,
  isFr,
}: {
  status: ExamSubmissionStatus;
  isFr: boolean;
}) {
  const styles: Record<ExamSubmissionStatus, string> = {
    pending: "bg-neutral-500/15 text-neutral-400",
    approved: "bg-green-500/15 text-green-400",
    rejected: "bg-red-500/15 text-red-400",
  };
  const labels: Record<ExamSubmissionStatus, { en: string; fr: string }> = {
    pending: { en: "Pending", fr: "En attente" },
    approved: { en: "Approved", fr: "Approuvé" },
    rejected: { en: "Rejected", fr: "Rejeté" },
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
