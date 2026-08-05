import { useEffect, useState } from "react";
import { CheckCircle2, FileUp, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getCourses } from "@/services/courses";
import { courseTitle } from "@/services/academics";
import {
  getCourseBookPrintCounts,
  getCourseBooks,
  getDoctorsForAliases,
  getInstructorAliases,
  getUnattributedCourseStudents,
  reviewDoctorReplacement,
  setInstructorAlias,
  syncTeachingAssignments,
  uploadCourseBook,
  type CourseBook,
  type CourseBookPrintCount,
  type DoctorOption,
  type InstructorAlias,
  type UnattributedCourseStudents,
} from "@/services/courseBooks";
import type { Course } from "@/types/database";

export default function CouncilCourseBooksPanel() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [books, setBooks] = useState<CourseBook[]>([]);
  const [counts, setCounts] = useState<CourseBookPrintCount[]>([]);
  const [unattributed, setUnattributed] = useState<UnattributedCourseStudents[]>([]);
  const [aliases, setAliases] = useState<InstructorAlias[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [alias, setAlias] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [course, book, count, gap, aliasResult, doctorResult] = await Promise.all([
      getCourses(), getCourseBooks(), getCourseBookPrintCounts(), getUnattributedCourseStudents(), getInstructorAliases(), getDoctorsForAliases(),
    ]);
    setCourses(course.data ?? []); setBooks(book.data); setCounts(count.data); setUnattributed(gap.data); setAliases(aliasResult.data); setDoctors(doctorResult.data);
    if (course.error || book.error || count.error || gap.error || aliasResult.error || doctorResult.error) toast.error("Some course-book information could not be loaded.");
  }
  useEffect(() => { void load(); }, []);

  async function upload() {
    if (!courseId || !file) { toast.error("Select a course and attach a PDF or PowerPoint file."); return; }
    setBusy("upload");
    const { error } = await uploadCourseBook({ file, courseId, title: title || file.name });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Book uploaded. Each assigned doctor now has an independent review decision.");
    setCourseId(""); setTitle(""); setFile(null); await load();
  }
  async function reviewReplacement(book: CourseBook, decision: "confirmed" | "rejected") {
    const reason = decision === "rejected" ? window.prompt("Reason for rejection (required):") ?? "" : "";
    if (decision === "rejected" && !reason.trim()) return;
    setBusy(book.id);
    const { error } = await reviewDoctorReplacement(book.id, decision, reason);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(decision === "confirmed" ? "Replacement approved for its submitting doctor." : "Replacement rejected.");
    await load();
  }
  async function saveAlias() {
    if (!alias.trim() || !doctorId) { toast.error("Enter the university instructor name and select its doctor."); return; }
    setBusy("alias"); const { error } = await setInstructorAlias(alias, doctorId); setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Instructor alias saved."); setAlias(""); setDoctorId(""); await load();
  }
  async function sync() {
    setBusy("sync"); const { data, error } = await syncTeachingAssignments(); setBusy(null);
    if (error) { toast.error(error.message); return; }
    const result = data?.[0];
    toast.success(`Teaching assignments synchronized. ${result?.unresolved_count ?? 0} instructor names remain unresolved.`);
    await load();
  }

  const replacements = books.filter((book) => book.status === "pending_council_review");
  return <section className="surface-raised rounded-[1.6rem] p-5 sm:p-6 space-y-5">
    <div><p className="eyebrow">Course-book desk</p><h2 className="font-display font-bold text-lg text-foreground mt-2">Book review, assignment coverage, and print counts</h2><p className="text-xs text-muted-foreground mt-1">Book files remain private to staff. Counts intentionally retain a student under each different lecture/TD doctor book.</p></div>

    <div className="grid lg:grid-cols-2 gap-4">
      <div className="surface p-4 space-y-3"><h3 className="font-display font-semibold text-sm">Upload a council book</h3>
        <select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"><option value="">Choose course</option>{courses.map((course) => <option key={course.id} value={course.id}>{courseTitle(course)} ({course.code ?? course.semester})</option>)}</select>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Book title" className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm" />
        <input type="file" accept="application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,.pdf,.ppt,.pptx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-xs" />
        <button type="button" onClick={() => void upload()} disabled={busy === "upload"} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-red text-white text-xs font-semibold disabled:opacity-50">{busy === "upload" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}Upload for doctor review</button>
      </div>
      <div className="surface p-4 space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="font-display font-semibold text-sm">University instructor aliases</h3><button type="button" onClick={() => void sync()} disabled={busy === "sync"} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg surface-interactive text-[11px] font-semibold"><RefreshCw className="w-3 h-3" />Sync teaching</button></div>
        <input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="Exact university instructor name" className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm" />
        <select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"><option value="">Match to doctor</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>)}</select>
        <button type="button" onClick={() => void saveAlias()} disabled={busy === "alias"} className="px-3 py-2 rounded-lg bg-white/[0.08] text-xs font-semibold">Save exact alias</button>
        <p className="text-[11px] text-muted-foreground">{aliases.length} managed alias{aliases.length === 1 ? "" : "es"}. Names without an exact match remain visibly unattributed.</p>
      </div>
    </div>

    {replacements.length > 0 && <div className="space-y-2"><h3 className="font-display font-semibold text-sm">Doctor replacements awaiting council review</h3>{replacements.map((book) => <div key={book.id} className="surface p-3 flex flex-wrap items-center gap-2"><p className="text-sm text-foreground flex-1">{book.title}<span className="block text-[11px] text-muted-foreground">Private to the submitting doctor and staff</span></p><button type="button" disabled={busy === book.id} onClick={() => void reviewReplacement(book, "confirmed")} className="inline-flex gap-1 items-center px-2.5 py-1.5 rounded-lg bg-green-500/15 text-green-400 text-xs"><CheckCircle2 className="w-3.5 h-3.5" />Approve</button><button type="button" disabled={busy === book.id} onClick={() => void reviewReplacement(book, "rejected")} className="inline-flex gap-1 items-center px-2.5 py-1.5 rounded-lg bg-red-600/15 text-red-300 text-xs"><XCircle className="w-3.5 h-3.5" />Reject</button></div>)}</div>}

    <div className="grid lg:grid-cols-2 gap-4"><div><h3 className="font-display font-semibold text-sm mb-2">Selected-book print counts</h3>{counts.length === 0 ? <p className="text-xs text-muted-foreground">No selected books yet.</p> : <div className="space-y-2">{counts.map((count) => <div key={`${count.book_id}-${count.academic_year}-${count.semester}`} className="surface p-3 text-xs"><p className="font-semibold text-foreground">{count.book_title}</p><p className="text-muted-foreground">{count.academic_year} · {count.semester} · attributed: {count.attributed_student_count} · unresolved: {count.unattributed_student_count}</p></div>)}</div>}</div><div><h3 className="font-display font-semibold text-sm mb-2">Unattributed students</h3>{unattributed.length === 0 ? <p className="text-xs text-green-400">All schedule instructors are resolved.</p> : <div className="space-y-2">{unattributed.map((gap) => <div key={`${gap.course_id}-${gap.academic_year}-${gap.semester}`} className="surface p-3 text-xs"><p className="font-semibold text-foreground">{gap.course_title}</p><p className="text-red-300">{gap.unattributed_student_count} student{gap.unattributed_student_count === 1 ? "" : "s"} need an instructor alias before their count is complete.</p></div>)}</div>}</div></div>
  </section>;
}
