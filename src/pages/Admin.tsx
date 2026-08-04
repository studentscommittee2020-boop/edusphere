import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Shield, LogOut, ChevronRight,
  FileText, BookOpen, Calendar, Trash2, Plus, X, Check, Pencil, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/appStore";
import {
  createPreviousExam,
  updatePreviousExam as apiUpdatePreviousExam,
  deletePreviousExam,
  createEntranceExam,
  updateEntranceExam as apiUpdateEntranceExam,
  deleteEntranceExam,
  createEvent,
  updateEvent as apiUpdateEvent,
  deleteEvent,
  uploadFile,
} from "@/services/admin";
import { getPreviousExams, getEntranceExams } from "@/services/exams";
import { getEvents } from "@/services/events";
import { getCourses } from "@/services/courses";
import { EXAM_TYPES } from "@/types/database";
import type {
  Course,
  PreviousExam,
  EntranceExam,
  Event as EventRow,
  Major,
  Semester,
  Track,
  ExamType,
  Difficulty,
  EventType,
} from "@/types/database";

// ── Error helper ──────────────────────────────────────────────────────────────
// Supabase errors (PostgrestError / StorageError) aren't always `instanceof
// Error`, so extract `.message` defensively instead of assuming a shape.
function errMsg(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

// ── Enum label maps (real DB values -> human-readable labels) ───────────────
const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  partiel: "Partiel",
  midterm: "Midterm",
  resit: "Resit",
};

// ── Reusable form field components ───────────────────────────────────────────

function InputField({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <input
        {...props}
        className="px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
      />
    </div>
  );
}

function SelectField({ label, children, ...props }: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <select
        {...props}
        className="px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
      >
        {children}
      </select>
    </div>
  );
}

// ── Add Previous Exam Form ────────────────────────────────────────────────────
function AddExamForm({
  language,
  courses,
  onClose,
  onSuccess,
}: {
  language: string;
  courses: Course[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    courseId: "", major: "Common" as Major,
    semester: "LS1" as Semester, year: new Date().getFullYear().toString(),
    examType: "partiel" as ExamType,
    pages: "4", track: "french" as Track, fileUrl: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseId) {
      toast.error(language === "fr" ? "Veuillez sélectionner un cours" : "Please select a course");
      return;
    }
    const course = courses.find((c) => c.id === form.courseId);
    if (!course) {
      toast.error(language === "fr" ? "Cours introuvable" : "Course not found");
      return;
    }
    setIsSubmitting(true);
    const { error } = await createPreviousExam({
      course_id: course.id,
      course_title: course.title,
      course_title_fr: course.title_fr,
      major: form.major,
      semester: form.semester,
      year: form.year,
      exam_type: form.examType,
      pages: Number(form.pages) || 4,
      track: form.track,
      file_url: form.fileUrl.trim() || undefined,
    });
    setIsSubmitting(false);
    if (error) {
      toast.error(errMsg(error, language === "fr" ? "Échec de l'ajout de l'examen" : "Failed to add exam"));
      return;
    }
    toast.success(language === "fr" ? "Examen ajouté" : "Exam added");
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 border-t border-border bg-muted/20">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <SelectField
          label={language === "fr" ? "Cours" : "Course"}
          value={form.courseId}
          onChange={(e) => {
            const course = courses.find((c) => c.id === e.target.value);
            setForm((f) => ({
              ...f,
              courseId: e.target.value,
              major: course?.major ?? f.major,
              semester: course?.semester ?? f.semester,
              track: course?.track ?? f.track,
            }));
          }}
          required
        >
          <option value="" disabled>
            {language === "fr" ? "Sélectionner…" : "Select…"}
          </option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {(language === "fr" ? c.title_fr : c.title)} · {c.semester}
            </option>
          ))}
        </SelectField>
        <InputField label="Year" value={form.year} onChange={e => set("year", e.target.value)} placeholder="2024" />
        <SelectField label="Major" value={form.major} onChange={e => set("major", e.target.value)}>
          {["Common","Audit & Accounting","Finance","Marketing","Management","MIS"].map(m => <option key={m}>{m}</option>)}
        </SelectField>
        <SelectField label="Semester" value={form.semester} onChange={e => set("semester", e.target.value)}>
          {["LS1","LS2","LS3","LS4","LS5","LS6", "LS7", "LS8", "LS9"].map(s => <option key={s}>{s}</option>)}
        </SelectField>
        <SelectField label="Exam Type" value={form.examType} onChange={e => set("examType", e.target.value as ExamType)}>
          {EXAM_TYPES.map(t => <option key={t} value={t}>{EXAM_TYPE_LABELS[t]}</option>)}
        </SelectField>
        <InputField label="Pages" type="number" min="1" value={form.pages} onChange={e => set("pages", e.target.value)} />
        <SelectField label="Track" value={form.track} onChange={e => set("track", e.target.value as Track)}>
          <option value="french">French</option>
          <option value="english">English</option>
        </SelectField>
        <InputField label="File URL" value={form.fileUrl} onChange={e => set("fileUrl", e.target.value)} placeholder="https://..." />
        {courses.length === 0 && (
          <p className="sm:col-span-2 lg:col-span-3 text-xs text-destructive">
            {language === "fr"
              ? "Aucun cours disponible. Un cours doit exister avant de pouvoir ajouter un examen."
              : "No courses available yet. A course must exist before an exam can be added."}
          </p>
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} disabled={isSubmitting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-sm font-display font-semibold hover:text-foreground transition-colors disabled:opacity-50">
          <X className="w-3.5 h-3.5" /> {language === "fr" ? "Annuler" : "Cancel"}
        </button>
        <button type="submit" disabled={isSubmitting || courses.length === 0} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-red text-white text-sm font-display font-semibold hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
          <Check className="w-3.5 h-3.5" /> {isSubmitting ? (language === "fr" ? "Ajout..." : "Adding...") : (language === "fr" ? "Ajouter" : "Add Exam")}
        </button>
      </div>
    </form>
  );
}

// ── Add Entrance Exam Form ────────────────────────────────────────────────────
function AddEntranceForm({ language, onClose, onSuccess }: { language: string; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    title: "", titleFr: "", subject: "", examLang: "French",
    year: new Date().getFullYear().toString(),
    difficulty: "Medium" as Difficulty,
    pages: "4", description: "", fileUrl: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setIsSubmitting(true);
    const { error } = await createEntranceExam({
      title: form.title,
      title_fr: form.titleFr || form.title,
      subject: form.subject,
      exam_lang: form.examLang,
      year: form.year,
      difficulty: form.difficulty,
      pages: Number(form.pages) || 4,
      description: form.description,
      description_fr: form.description,
      file_url: form.fileUrl.trim() || undefined,
    });
    setIsSubmitting(false);
    if (error) {
      toast.error(errMsg(error, language === "fr" ? "Échec de l'ajout" : "Failed to add exam"));
      return;
    }
    toast.success(language === "fr" ? "Concours ajouté" : "Entrance exam added");
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 border-t border-border bg-muted/20">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <InputField label="Title (EN)" value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. ECOLE NATIONALE 2024" required />
        <InputField label="Title (FR)" value={form.titleFr} onChange={e => set("titleFr", e.target.value)} placeholder="French title" />
        <InputField label="Subject" value={form.subject} onChange={e => set("subject", e.target.value)} placeholder="e.g. Finance & Economics" />
        <InputField label="Year" value={form.year} onChange={e => set("year", e.target.value)} placeholder="2024" />
        <SelectField label="Language" value={form.examLang} onChange={e => set("examLang", e.target.value)}>
          <option>French</option><option>English</option><option>Arabic</option>
        </SelectField>
        <SelectField label="Difficulty" value={form.difficulty} onChange={e => set("difficulty", e.target.value as Difficulty)}>
          <option>Easy</option><option>Medium</option><option>Hard</option>
        </SelectField>
        <InputField label="Pages" type="number" min="1" value={form.pages} onChange={e => set("pages", e.target.value)} />
        <InputField label="File URL" value={form.fileUrl} onChange={e => set("fileUrl", e.target.value)} placeholder="https://..." />
        <div className="sm:col-span-2 lg:col-span-3 flex flex-col gap-1">
          <label className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide">Description</label>
          <input value={form.description} onChange={e => set("description", e.target.value)} className="px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" placeholder="Brief description..." />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} disabled={isSubmitting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-sm font-display font-semibold hover:text-foreground transition-colors disabled:opacity-50">
          <X className="w-3.5 h-3.5" /> {language === "fr" ? "Annuler" : "Cancel"}
        </button>
        <button type="submit" disabled={isSubmitting} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-red text-white text-sm font-display font-semibold hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
          <Check className="w-3.5 h-3.5" /> {isSubmitting ? (language === "fr" ? "Ajout..." : "Adding...") : (language === "fr" ? "Ajouter" : "Add Exam")}
        </button>
      </div>
    </form>
  );
}

const EVENT_TAGS = [
  "Academic","Art","Competition","Conference","Cultural",
  "Info Session","Lecture","Networking","Science","Seminar",
  "Sports","Tech","Workshop",
];

// ── Add Event Form ────────────────────────────────────────────────────────────
function AddEventForm({ language, onClose, onSuccess }: { language: string; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    title: "", date: "", time: "10:00", location: "",
    tag: "Workshop", description: "", type: "upcoming" as EventType,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title required"); return; }
    if (!form.date.trim()) { toast.error("Date required"); return; }
    setIsSubmitting(true);
    const { error } = await createEvent({
      title: form.title,
      description: form.description,
      date: form.date,
      time: form.time,
      location: form.location,
      tag: form.tag,
      type: form.type,
    });
    setIsSubmitting(false);
    if (error) {
      toast.error(errMsg(error, language === "fr" ? "Échec de l'ajout" : "Failed to add event"));
      return;
    }
    toast.success(language === "fr" ? "Événement ajouté" : "Event added");
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 border-t border-border bg-muted/20">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <InputField label="Title" value={form.title} onChange={e => set("title", e.target.value)} placeholder="Event title" required />
        <InputField label="Date" type="date" value={form.date} onChange={e => set("date", e.target.value)} required />
        <InputField label="Time" type="time" value={form.time} onChange={e => set("time", e.target.value)} />
        <InputField label="Location" value={form.location} onChange={e => set("location", e.target.value)} placeholder="e.g. Room A-102" />
        <SelectField label="Tag" value={form.tag} onChange={e => set("tag", e.target.value)}>
          {EVENT_TAGS.map(t => <option key={t}>{t}</option>)}
        </SelectField>
        <SelectField label="Type" value={form.type} onChange={e => set("type", e.target.value as EventType)}>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
        </SelectField>
        <div className="sm:col-span-2 lg:col-span-3 flex flex-col gap-1">
          <label className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide">Description</label>
          <input value={form.description} onChange={e => set("description", e.target.value)} className="px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" placeholder="Brief description..." />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} disabled={isSubmitting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-sm font-display font-semibold hover:text-foreground transition-colors disabled:opacity-50">
          <X className="w-3.5 h-3.5" /> {language === "fr" ? "Annuler" : "Cancel"}
        </button>
        <button type="submit" disabled={isSubmitting} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-red text-white text-sm font-display font-semibold hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
          <Check className="w-3.5 h-3.5" /> {isSubmitting ? (language === "fr" ? "Ajout..." : "Adding...") : (language === "fr" ? "Ajouter" : "Add Event")}
        </button>
      </div>
    </form>
  );
}

// ── Edit Event Form ───────────────────────────────────────────────────────────
function EditEventForm({ language, event, onClose, onSuccess }: { language: string; event: EventRow; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    title: event.title,
    date: event.date,
    time: event.time,
    location: event.location,
    tag: event.tag,
    description: event.description,
    type: event.type,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setIsSubmitting(true);
    const { error } = await apiUpdateEvent(event.id, {
      title: form.title,
      date: form.date,
      time: form.time,
      location: form.location,
      tag: form.tag,
      description: form.description,
      type: form.type as EventType,
    });
    setIsSubmitting(false);
    if (error) {
      toast.error(errMsg(error, language === "fr" ? "Échec de la mise à jour" : "Update failed"));
      return;
    }
    toast.success(language === "fr" ? "Événement mis à jour" : "Event updated");
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 border-t border-border bg-secondary/5">
      <p className="text-xs font-display font-semibold text-secondary mb-3">
        {language === "fr" ? "Modifier l'événement" : "Edit Event"}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <InputField label="Title" value={form.title} onChange={e => set("title", e.target.value)} placeholder="Event title" required />
        <InputField label="Date" type="date" value={form.date} onChange={e => set("date", e.target.value)} required />
        <InputField label="Time" type="time" value={form.time} onChange={e => set("time", e.target.value)} />
        <InputField label="Location" value={form.location} onChange={e => set("location", e.target.value)} placeholder="e.g. Room A-102" />
        <SelectField label="Tag" value={form.tag} onChange={e => set("tag", e.target.value)}>
          {EVENT_TAGS.map(t => <option key={t}>{t}</option>)}
        </SelectField>
        <SelectField label="Type" value={form.type} onChange={e => set("type", e.target.value)}>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
        </SelectField>
        <div className="sm:col-span-2 lg:col-span-3 flex flex-col gap-1">
          <label className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide">Description</label>
          <input value={form.description} onChange={e => set("description", e.target.value)} className="px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary/50 transition-all" placeholder="Brief description..." />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} disabled={isSubmitting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-sm font-display font-semibold hover:text-foreground transition-colors disabled:opacity-50">
          <X className="w-3.5 h-3.5" /> {language === "fr" ? "Annuler" : "Cancel"}
        </button>
        <button type="submit" disabled={isSubmitting} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-green text-white text-sm font-display font-semibold hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
          <Check className="w-3.5 h-3.5" /> {isSubmitting ? (language === "fr" ? "Enregistrement..." : "Saving...") : (language === "fr" ? "Enregistrer" : "Save Changes")}
        </button>
      </div>
    </form>
  );
}

// ── Upload Modal Component ──────────────────────────────────────────────────────────
function UploadModal({
  resource,
  onClose,
  onUpload,
  language
}: {
  resource: { type: "entrance" | "previous", exam: EntranceExam | PreviousExam },
  onClose: () => void,
  onUpload: (exam: PreviousExam | EntranceExam, file: File, folderPath: string) => Promise<void>,
  language: string
}) {
  const [major, setMajor] = useState(resource.type === "previous" ? (resource.exam as PreviousExam).major : "");
  const [semester, setSemester] = useState(resource.type === "previous" ? (resource.exam as PreviousExam).semester : "");
  const [track, setTrack] = useState(resource.type === "previous" ? (resource.exam as PreviousExam).track : "");

  const [year, setYear] = useState(resource.type === "entrance" ? (resource.exam as EntranceExam).year : "");
  const [examLang, setExamLang] = useState(resource.type === "entrance" ? (resource.exam as EntranceExam).exam_lang : "");
  const [subject, setSubject] = useState(resource.type === "entrance" ? (resource.exam as EntranceExam).subject : "");

  const MAJORS = ["Common", "Audit & Accounting", "Finance", "Marketing", "Management", "MIS"];
  const SEMESTERS = ["LS1", "LS2", "LS3", "LS4", "LS5", "LS6", "LS7", "LS8", "LS9"];
  const TRACKS = ["french", "english"];

  // Create an array with unique subjects from exams if needed, or static
  const SUBJECTS = ["French", "English", "Math", "Economics", "Physics", "Chemistry", "Biology"];
  const LANGS = ["French", "English", "Arabic", "Both"];
  const YEARS = Array.from({length: 6}, (_, i) => (new Date().getFullYear() - i).toString());

  const derivedPath = resource.type === "entrance"
    ? `entrance-exams/${year}/${examLang}/${subject}`.toLowerCase().replace(/\s+/g, '-')
    : `${major}/${semester}/${track}`.toLowerCase().replace(/\s+/g, '-');

  const [file, setFile] = useState<File | null>(null);

  const isEntrance = resource.type === "entrance";
  const colorClass = isEntrance ? "bg-secondary text-white" : "bg-primary text-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="surface-raised relative w-full max-w-lg p-6 overflow-hidden"
      >
        <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors p-1 bg-muted/50 rounded-lg">
          <X className="w-4 h-4" />
        </button>

        <h2 className="font-display font-bold text-lg mb-4">
          {language === "fr" ? "Sélectionner le chemin du fichier" : "Select Upload Path"}
        </h2>

        <div className="space-y-5 mb-6">
          {!isEntrance ? (
            <>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Major</label>
                <div className="flex flex-wrap gap-1.5">
                  {MAJORS.map(m => (
                    <button key={m} onClick={() => setMajor(m)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${major === m ? colorClass : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Semester</label>
                <div className="flex flex-wrap gap-1.5">
                  {SEMESTERS.map(s => (
                    <button key={s} onClick={() => setSemester(s)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${semester === s ? colorClass : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Track</label>
                <div className="flex flex-wrap gap-1.5">
                  {TRACKS.map(t => (
                    <button key={t} onClick={() => setTrack(t.toLowerCase())} className={`px-2.5 py-1 rounded text-[10px] uppercase font-bold transition-colors ${track.toLowerCase() === t.toLowerCase() ? colorClass : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{t}</button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Year</label>
                <div className="flex flex-wrap gap-1.5">
                  {YEARS.map(y => (
                    <button key={y} onClick={() => setYear(y)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${year === y ? colorClass : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{y}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Language</label>
                <div className="flex flex-wrap gap-1.5">
                  {LANGS.map(l => (
                    <button key={l} onClick={() => setExamLang(l)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${examLang === l ? colorClass : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Subject</label>
                <div className="flex flex-wrap gap-1.5">
                  {SUBJECTS.map(s => (
                    <button key={s} onClick={() => setSubject(s)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${subject === s ? colorClass : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{s}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="bg-muted/30 p-3 rounded-lg border border-border mt-4">
            <span className="text-xs text-muted-foreground uppercase font-semibold block mb-1">Upload Location</span>
            <code className="text-primary font-mono text-xs">{derivedPath}/</code>
          </div>

          <div>
             <label className="cursor-pointer flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-6 hover:bg-muted/50 transition-colors">
               <Upload className="w-8 h-8 text-muted-foreground mb-2" />
               <span className="text-sm font-medium text-center">{file ? file.name : (language === "fr" ? "Choisir un fichier" : "Choose a file")}</span>
               <span className="text-xs text-muted-foreground mt-1">.pdf, .doc, .docx</span>
               <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={e => e.target.files && setFile(e.target.files[0])} />
             </label>
          </div>
        </div>

        <button
          onClick={() => {
            if (file) {
              onUpload(resource.exam, file, derivedPath);
              onClose();
            }
          }}
          disabled={!file}
          className={`w-full py-2.5 rounded-xl text-white font-display font-bold text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${isEntrance ? 'bg-gradient-to-r from-secondary to-red-300' : 'bg-gradient-red'}`}
        >
          {language === "fr" ? "Téléverser et Lier" : "Upload & Link File"}
        </button>
      </motion.div>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
export default function Admin() {
  const { language } = useAppStore();
  const { signOut } = useAuth();

  const [activeTab, setActiveTab] = useState<"exams"|"entrance"|"events">("exams");
  const [adminTrack, setAdminTrack] = useState<"french"|"english">("french");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);

  const [uploadModalResource, setUploadModalResource] = useState<{ type: "entrance" | "previous", exam: EntranceExam | PreviousExam } | null>(null);

  const [previousExams, setPreviousExams] = useState<PreviousExam[]>([]);
  const [entranceExams, setEntranceExams] = useState<EntranceExam[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const beginPending = (id: string) => setPendingIds((prev) => new Set(prev).add(id));
  const endPending = (id: string) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [examsRes, entranceRes, eventsRes, coursesRes] = await Promise.all([
      getPreviousExams(),
      getEntranceExams(),
      getEvents(),
      getCourses(),
    ]);
    if (examsRes.error) console.error("[Admin] getPreviousExams failed", examsRes.error);
    if (entranceRes.error) console.error("[Admin] getEntranceExams failed", entranceRes.error);
    if (eventsRes.error) console.error("[Admin] getEvents failed", eventsRes.error);
    if (coursesRes.error) console.error("[Admin] getCourses failed", coursesRes.error);
    setPreviousExams((examsRes.data ?? []) as PreviousExam[]);
    setEntranceExams(entranceRes.data ?? []);
    setEvents(eventsRes.data ?? []);
    setCourses(coursesRes.data ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/auth";
  };

  const handleFileUpload = async (exam: PreviousExam | EntranceExam, file: File, folderPath: string) => {
    const toastId = toast.loading(language === "fr" ? "Téléchargement en cours..." : "Uploading file...");
    const isEntrance = "subject" in exam;
    beginPending(exam.id);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${exam.id}-${Date.now()}.${fileExt}`;
      const filePath = `${folderPath}/${fileName}`;

      const { url, error: uploadError } = await uploadFile("exam-papers", filePath, file);
      if (uploadError || !url) throw uploadError ?? new Error("Upload failed");

      const { error: dbError } = isEntrance
        ? await apiUpdateEntranceExam(exam.id, { file_url: url })
        : await apiUpdatePreviousExam(exam.id, { file_url: url });

      if (dbError) {
        // Compensating delete: don't orphan the uploaded storage object if the
        // DB write fails — same pattern as services/materials.ts publishMaterial.
        await supabase.storage.from("exam-papers").remove([url]);
        throw dbError;
      }

      await loadData();
      toast.success(language === "fr" ? "Fichier lié avec succès" : "File linked successfully!", { id: toastId });
    } catch (error) {
      toast.error(errMsg(error, "Upload failed"), { id: toastId });
    } finally {
      endPending(exam.id);
    }
  };

  const handleEditExamFileUrl = async (exam: PreviousExam) => {
    const url = window.prompt("Enter new file URL for this exam:", exam.file_url || "");
    if (url === null) return;
    beginPending(exam.id);
    const { error } = await apiUpdatePreviousExam(exam.id, { file_url: url });
    if (error) {
      toast.error(errMsg(error, language === "fr" ? "Échec de la mise à jour" : "Update failed"));
    } else {
      toast.success(language === "fr" ? "Mis à jour" : "Updated");
      await loadData();
    }
    endPending(exam.id);
  };

  const handleEditEntranceFileUrl = async (exam: EntranceExam) => {
    const url = window.prompt("Enter new file URL for this exam:", exam.file_url || "");
    if (url === null) return;
    beginPending(exam.id);
    const { error } = await apiUpdateEntranceExam(exam.id, { file_url: url });
    if (error) {
      toast.error(errMsg(error, language === "fr" ? "Échec de la mise à jour" : "Update failed"));
    } else {
      toast.success(language === "fr" ? "Mis à jour" : "Updated");
      await loadData();
    }
    endPending(exam.id);
  };

  const handleDeletePreviousExam = async (id: string) => {
    beginPending(id);
    const { error } = await deletePreviousExam(id);
    if (error) {
      toast.error(errMsg(error, language === "fr" ? "Échec de la suppression" : "Delete failed"));
    } else {
      toast.success(language === "fr" ? "Supprimé" : "Removed");
      await loadData();
    }
    endPending(id);
  };

  const handleDeleteEntranceExam = async (id: string) => {
    beginPending(id);
    const { error } = await deleteEntranceExam(id);
    if (error) {
      toast.error(errMsg(error, language === "fr" ? "Échec de la suppression" : "Delete failed"));
    } else {
      toast.success(language === "fr" ? "Supprimé" : "Removed");
      await loadData();
    }
    endPending(id);
  };

  const handleDeleteEvent = async (id: string) => {
    beginPending(id);
    const { error } = await deleteEvent(id);
    if (error) {
      toast.error(errMsg(error, language === "fr" ? "Échec de la suppression" : "Delete failed"));
    } else {
      if (editingEvent?.id === id) setEditingEvent(null);
      toast.success(language === "fr" ? "Supprimé" : "Removed");
      await loadData();
    }
    endPending(id);
  };

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setShowAddForm(false);
    setEditingEvent(null);
  };

  const displayedPreviousExams = previousExams.filter(e => e.track === adminTrack);
  const displayedExams = entranceExams.filter(e => e.exam_lang.toLowerCase() === adminTrack || e.exam_lang.toLowerCase() === "both");

  const tabs = [
    { key: "exams" as const, label: language === "fr" ? "Examens Précédents" : "Previous Exams", icon: <FileText className="w-4 h-4" />, count: displayedPreviousExams.length },
    { key: "entrance" as const, label: language === "fr" ? "Concours" : "Entrance Exams", icon: <BookOpen className="w-4 h-4" />, count: displayedExams.length },
    { key: "events" as const, label: language === "fr" ? "Événements" : "Events", icon: <Calendar className="w-4 h-4" />, count: events.length },
  ];

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-mesh pointer-events-none" />
      <div className="relative px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/" className="hover:text-foreground transition-colors">
            {language === "fr" ? "Accueil" : "Home"}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground font-medium">
            {language === "fr" ? "Panneau Admin" : "Admin Panel"}
          </span>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between gap-4 mb-8"
        >
          <div>
            <span className="eyebrow">
              <Shield className="w-3.5 h-3.5" />
              {language === "fr" ? "Comité étudiant" : "Student committee"}
            </span>
            <h1 className="mt-2 font-display font-extrabold text-3xl lg:text-4xl text-gradient-chrome">
              {language === "fr" ? "Panneau Admin" : "Admin Panel"}
            </h1>
            <p className="mt-1.5 text-muted-foreground text-sm">
              {language === "fr" ? "Gérez le contenu de la plateforme" : "Manage platform content"}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-muted-foreground text-sm font-medium hover:text-foreground hover:border-foreground/20 transition-all"
          >
            <LogOut className="w-4 h-4" />
            {language === "fr" ? "Déconnexion" : "Sign Out"}
          </button>
        </motion.div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {tabs.map((tab) => (
            <div key={tab.key} className="surface p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                {tab.icon}
              </div>
              <div>
                {isLoading ? (
                  <div className="skeleton h-6 w-8 rounded mb-1" />
                ) : (
                  <p className="font-display font-extrabold text-xl text-foreground">{tab.count}</p>
                )}
                <p className="text-muted-foreground text-xs leading-tight">{tab.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs and Track Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-display font-semibold text-sm transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-gradient-red text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {(activeTab === "exams" || activeTab === "entrance") && (
            <div className="flex bg-muted rounded-xl p-1 w-fit border border-border">
              <button
                onClick={() => setAdminTrack("french")}
                className={`flex-1 px-4 py-2 rounded-lg font-display font-semibold text-sm transition-all ${adminTrack === "french" ? "bg-primary/20 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {language === "fr" ? "Filière: Français" : "Track: French"}
              </button>
              <button
                onClick={() => setAdminTrack("english")}
                className={`flex-1 px-4 py-2 rounded-lg font-display font-semibold text-sm transition-all ${adminTrack === "english" ? "bg-primary/20 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {language === "fr" ? "Filière: Anglais" : "Track: English"}
              </button>
            </div>
          )}
        </div>

        {/* Content table */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface overflow-hidden"
        >
          {/* Table header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
            <p className="font-display font-semibold text-sm text-foreground">
              {tabs.find(t => t.key === activeTab)?.label}
            </p>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-semibold transition-all ${
                showAddForm
                  ? "bg-muted border border-border text-muted-foreground hover:text-foreground"
                  : "bg-secondary/10 text-secondary hover:bg-secondary/20"
              }`}
              onClick={() => setShowAddForm(v => !v)}
            >
              {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showAddForm
                ? (language === "fr" ? "Fermer" : "Close")
                : (language === "fr" ? "Ajouter" : "Add New")}
            </button>
          </div>

          {/* Inline add form */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                {activeTab === "exams" && (
                  <AddExamForm
                    language={language}
                    courses={courses}
                    onClose={() => setShowAddForm(false)}
                    onSuccess={() => { setShowAddForm(false); loadData(); }}
                  />
                )}
                {activeTab === "entrance" && (
                  <AddEntranceForm
                    language={language}
                    onClose={() => setShowAddForm(false)}
                    onSuccess={() => { setShowAddForm(false); loadData(); }}
                  />
                )}
                {activeTab === "events" && (
                  <AddEventForm
                    language={language}
                    onClose={() => setShowAddForm(false)}
                    onSuccess={() => { setShowAddForm(false); loadData(); }}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Rows */}
          <div className="divide-y divide-border">
            {isLoading && [1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="flex-1 space-y-2 max-w-xs">
                  <div className="skeleton h-4 w-48 rounded" />
                  <div className="skeleton h-3 w-32 rounded" />
                </div>
                <div className="flex items-center gap-1">
                  <div className="skeleton h-7 w-7 rounded-lg" />
                  <div className="skeleton h-7 w-7 rounded-lg" />
                  <div className="skeleton h-7 w-7 rounded-lg" />
                </div>
              </div>
            ))}

            {!isLoading && activeTab === "exams" && displayedPreviousExams.map((exam) => (
              <div key={exam.id} className={`flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors ${pendingIds.has(exam.id) ? "opacity-60 pointer-events-none" : ""}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-display font-semibold text-sm text-foreground">
                      {language === "fr" ? exam.course_title_fr : exam.course_title}
                    </p>
                    {exam.file_url && <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-[10px] font-bold uppercase">FILE LINKED</span>}
                  </div>
                  <p className="text-muted-foreground text-xs">{exam.major} · {exam.semester} · {exam.year} · {EXAM_TYPE_LABELS[exam.exam_type]}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setUploadModalResource({ type: "previous", exam })}
                    disabled={pendingIds.has(exam.id)}
                    className="p-1.5 rounded-lg hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors disabled:opacity-50"
                    aria-label="Upload File"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleEditExamFileUrl(exam)} disabled={pendingIds.has(exam.id)} className="p-1.5 rounded-lg hover:bg-secondary/10 hover:text-secondary text-muted-foreground transition-colors disabled:opacity-50" aria-label="Edit URL">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeletePreviousExam(exam.id)} disabled={pendingIds.has(exam.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors disabled:opacity-50" aria-label="Remove">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {!isLoading && activeTab === "entrance" && displayedExams.map((exam) => (
              <div key={exam.id} className={`flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors ${pendingIds.has(exam.id) ? "opacity-60 pointer-events-none" : ""}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-display font-semibold text-sm text-foreground">{language === "fr" ? exam.title_fr : exam.title}</p>
                    {exam.file_url && <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-[10px] font-bold uppercase">FILE LINKED</span>}
                  </div>
                  <p className="text-muted-foreground text-xs">{exam.subject} · {exam.exam_lang} · {exam.year} · {exam.difficulty}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setUploadModalResource({ type: "entrance", exam })}
                    disabled={pendingIds.has(exam.id)}
                    className="p-1.5 rounded-lg hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors disabled:opacity-50"
                    aria-label="Upload File"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleEditEntranceFileUrl(exam)} disabled={pendingIds.has(exam.id)} className="p-1.5 rounded-lg hover:bg-secondary/10 hover:text-secondary text-muted-foreground transition-colors disabled:opacity-50" aria-label="Edit URL">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeleteEntranceExam(exam.id)} disabled={pendingIds.has(exam.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors disabled:opacity-50" aria-label="Remove">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {!isLoading && activeTab === "events" && events.map((event) => (
              <div key={event.id}>
                <div className={`flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors ${pendingIds.has(event.id) ? "opacity-60 pointer-events-none" : ""}`}>
                  <div>
                    <p className="font-display font-semibold text-sm text-foreground">{event.title}</p>
                    <p className="text-muted-foreground text-xs">{event.date} · {event.tag} · {event.type}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingEvent(e => e?.id === event.id ? null : event); setShowAddForm(false); }}
                      disabled={pendingIds.has(event.id)}
                      className="p-1.5 rounded-lg hover:bg-secondary/10 hover:text-secondary text-muted-foreground transition-colors disabled:opacity-50"
                      aria-label="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteEvent(event.id)} disabled={pendingIds.has(event.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors disabled:opacity-50" aria-label="Remove">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <AnimatePresence>
                  {editingEvent?.id === event.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <EditEventForm
                        language={language}
                        event={editingEvent}
                        onClose={() => setEditingEvent(null)}
                        onSuccess={() => { setEditingEvent(null); loadData(); }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {/* Empty states */}
            {!isLoading && activeTab === "exams" && displayedPreviousExams.length === 0 && (
              <div className="px-5 py-12 text-center text-muted-foreground text-sm">{language === "fr" ? "Aucun examen pour cette sélection" : "No exams for this track"}</div>
            )}
            {!isLoading && activeTab === "entrance" && displayedExams.length === 0 && (
              <div className="px-5 py-12 text-center text-muted-foreground text-sm">{language === "fr" ? "Aucun concours pour cette sélection" : "No exams for this track"}</div>
            )}
            {!isLoading && activeTab === "events" && events.length === 0 && (
              <div className="px-5 py-12 text-center text-muted-foreground text-sm">{language === "fr" ? "Aucun événement" : "No events yet"}</div>
            )}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {uploadModalResource && (
          <UploadModal
            resource={uploadModalResource}
            onClose={() => setUploadModalResource(null)}
            onUpload={handleFileUpload}
            language={language}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
