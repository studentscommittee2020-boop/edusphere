import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, FileUp, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { DoctorCourseWithCourse } from "@/services/teaching";
import {
  getCourseBooks,
  getCourseBookUrl,
  getMyCourseBookReviews,
  reviewCourseBook,
  selectCourseBook,
  uploadCourseBook,
  type CourseBook,
  type CourseBookReview,
} from "@/services/courseBooks";
import { courseTitle } from "@/services/academics";

export default function DoctorBookReviewPanel({ doctorId, assignments }: {
  doctorId: string;
  assignments: DoctorCourseWithCourse[];
}) {
  const [books, setBooks] = useState<CourseBook[]>([]);
  const [reviews, setReviews] = useState<CourseBookReview[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [replacementFor, setReplacementFor] = useState<{ book: CourseBook; assignment: DoctorCourseWithCourse } | null>(null);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementTitle, setReplacementTitle] = useState("");
  const [reason, setReason] = useState("");

  async function load() {
    const [bookResult, reviewResult] = await Promise.all([getCourseBooks(), getMyCourseBookReviews(doctorId)]);
    if (bookResult.error || reviewResult.error) toast.error("Could not load the course-book review queue.");
    setBooks(bookResult.data);
    setReviews(reviewResult.data);
  }
  useEffect(() => { void load(); }, [doctorId]);

  const cards = useMemo(() => assignments.flatMap((assignment) =>
    books.filter((book) => book.course_id === assignment.course_id).map((book) => ({ assignment, book })),
  ), [assignments, books]);

  function reviewFor(bookId: string, assignmentId: string) {
    return reviews.find((review) => review.book_id === bookId && review.doctor_course_id === assignmentId) ?? null;
  }
  async function open(book: CourseBook) {
    const { url, error } = await getCourseBookUrl(book.storage_path);
    if (error || !url) { toast.error("Could not open this private file."); return; }
    window.open(url, "_blank", "noopener,noreferrer");
  }
  async function confirm(book: CourseBook, assignment: DoctorCourseWithCourse) {
    setBusy(book.id);
    const { error } = await reviewCourseBook(book.id, assignment.id, "confirmed");
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Book confirmed for this teaching assignment.");
    await load();
  }
  async function select(book: CourseBook, assignment: DoctorCourseWithCourse) {
    setBusy(book.id);
    const { error } = await selectCourseBook(assignment.id, book.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Book selected. Its students now appear in the print count.");
    await load();
  }
  async function sendReplacement() {
    if (!replacementFor || !replacementFile || !reason.trim()) {
      toast.error("Attach the replacement and provide a rejection reason."); return;
    }
    setBusy(replacementFor.book.id);
    const { error } = await uploadCourseBook({
      file: replacementFile,
      title: replacementTitle || replacementFile.name,
      originalBookId: replacementFor.book.id,
      doctorCourseId: replacementFor.assignment.id,
      rejectionReason: reason,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Replacement sent to the council. Only you and staff can access it.");
    setReplacementFor(null); setReplacementFile(null); setReplacementTitle(""); setReason("");
    await load();
  }

  return (
    <section className="surface-raised rounded-[1.6rem] p-5 sm:p-6 space-y-4">
      <div>
        <p className="eyebrow">Course books</p>
        <h2 className="font-display font-bold text-lg text-foreground mt-2">Verify the books assigned to your courses</h2>
        <p className="text-xs text-muted-foreground mt-1">Your decision affects only your teaching assignment. Students never see these files.</p>
      </div>
      {cards.length === 0 ? <p className="text-sm text-muted-foreground">No council book is awaiting review for your assigned courses.</p> : (
        <div className="space-y-3">
          {cards.map(({ book, assignment }) => {
            const review = reviewFor(book.id, assignment.id);
            const selected = (assignment as DoctorCourseWithCourse & { selected_book_id?: string | null }).selected_book_id === book.id;
            const privateReplacement = book.restricted_to_doctor_id === doctorId;
            return <article key={`${book.id}-${assignment.id}`} className="surface p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display font-semibold text-foreground truncate">{book.title}</p>
                  <p className="text-xs text-muted-foreground">{assignment.courses ? courseTitle(assignment.courses) : book.course_title} · {assignment.academic_year} · {assignment.semester}</p>
                  {privateReplacement && <p className="text-[11px] text-green-400 mt-1">Private replacement — visible only to you and staff.</p>}
                </div>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{review?.status ?? book.status.replace(/_/g, " ")}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void open(book)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg surface-interactive text-xs font-semibold"><Download className="w-3.5 h-3.5" />Open</button>
                {!privateReplacement && !review && <>
                  <button type="button" disabled={busy === book.id} onClick={() => void confirm(book, assignment)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-green text-white text-xs font-semibold disabled:opacity-50"><CheckCircle2 className="w-3.5 h-3.5" />Confirm</button>
                  <button type="button" disabled={busy === book.id} onClick={() => setReplacementFor({ book, assignment })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600/15 text-red-300 text-xs font-semibold"><XCircle className="w-3.5 h-3.5" />Reject and replace</button>
                </>}
                {review?.status === "confirmed" && !selected && <button type="button" disabled={busy === book.id} onClick={() => void select(book, assignment)} className="px-3 py-2 rounded-lg bg-gradient-red text-white text-xs font-semibold disabled:opacity-50">Use for my class</button>}
                {selected && <span className="px-3 py-2 rounded-lg bg-green-500/10 text-green-400 text-xs font-semibold">Selected for your class</span>}
              </div>
            </article>;
          })}
        </div>
      )}
      {replacementFor && <div className="surface border border-red-500/30 p-4 space-y-3">
        <p className="font-display font-semibold text-sm">Replace “{replacementFor.book.title}”</p>
        <input type="text" value={replacementTitle} onChange={(event) => setReplacementTitle(event.target.value)} placeholder="Replacement book title" className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm" />
        <input type="file" accept="application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,.pdf,.ppt,.pptx" onChange={(event) => setReplacementFile(event.target.files?.[0] ?? null)} className="block w-full text-xs" />
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is the council book incorrect?" rows={3} className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm resize-none" />
        <div className="flex gap-2"><button type="button" onClick={() => void sendReplacement()} disabled={busy === replacementFor.book.id} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-red text-white text-xs font-semibold disabled:opacity-50">{busy === replacementFor.book.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}<FileUp className="w-3.5 h-3.5" />Send to council</button><button type="button" onClick={() => setReplacementFor(null)} className="px-3 py-2 text-xs text-muted-foreground">Cancel</button></div>
      </div>}
    </section>
  );
}
