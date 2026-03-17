import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Shield, LogOut, ChevronRight, Lock, Eye, EyeOff,
  FileText, BookOpen, Calendar, ShoppingCart, Trash2, Plus, X, Check, Pencil, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useAppStore, PreviousExam, Book, Exam, EventItem } from "@/store/appStore";

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
function AddExamForm({ language, onClose }: { language: string; onClose: () => void }) {
  const { addPreviousExam } = useAppStore();
  const [form, setForm] = useState({
    courseTitle: "", courseTitleFr: "", major: "Common",
    semester: "LS1", year: new Date().getFullYear().toString(),
    examType: "final" as PreviousExam["examType"],
    pages: "4", track: "french" as PreviousExam["track"], fileUrl: "",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseTitle.trim()) { toast.error("Course title required"); return; }
    addPreviousExam({
      id: `pe-${Date.now()}`,
      courseId: `c-${Date.now()}`,
      courseTitle: form.courseTitle,
      courseTitleFr: form.courseTitleFr || form.courseTitle,
      major: form.major, semester: form.semester, year: form.year,
      examType: form.examType, pages: Number(form.pages) || 4,
      rating: 4.0, track: form.track, fileUrl: form.fileUrl,
    });
    toast.success(language === "fr" ? "Examen ajouté" : "Exam added");
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 border-t border-border bg-muted/20">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <InputField label="Course Title (EN)" value={form.courseTitle} onChange={e => set("courseTitle", e.target.value)} placeholder="e.g. Accounting 1" required />
        <InputField label="Course Title (FR)" value={form.courseTitleFr} onChange={e => set("courseTitleFr", e.target.value)} placeholder="e.g. Comptabilité 1" />
        <InputField label="Year" value={form.year} onChange={e => set("year", e.target.value)} placeholder="2024" />
        <SelectField label="Major" value={form.major} onChange={e => set("major", e.target.value)}>
          {["Common","Audit & Accounting","Finance","Marketing","Management","MIS"].map(m => <option key={m}>{m}</option>)}
        </SelectField>
        <SelectField label="Semester" value={form.semester} onChange={e => set("semester", e.target.value)}>
          {["LS1","LS2","LS3","LS4","LS5","LS6", "LS7", "LS8", "LS9"].map(s => <option key={s}>{s}</option>)}
        </SelectField>
        <SelectField label="Exam Type" value={form.examType} onChange={e => set("examType", e.target.value as PreviousExam["examType"])}>
          <option value="midterms">Midterms</option>
          <option value="final">Final</option>
          <option value="resit">Resit</option>
        </SelectField>
        <InputField label="Pages" type="number" min="1" value={form.pages} onChange={e => set("pages", e.target.value)} />
        <SelectField label="Track" value={form.track} onChange={e => set("track", e.target.value as PreviousExam["track"])}>
          <option value="french">French</option>
          <option value="english">English</option>
        </SelectField>
        <InputField label="File URL" value={form.fileUrl} onChange={e => set("fileUrl", e.target.value)} placeholder="https://..." />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-sm font-display font-semibold hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" /> {language === "fr" ? "Annuler" : "Cancel"}
        </button>
        <button type="submit" className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-red text-white text-sm font-display font-semibold hover:opacity-90 transition-all active:scale-95">
          <Check className="w-3.5 h-3.5" /> {language === "fr" ? "Ajouter" : "Add Exam"}
        </button>
      </div>
    </form>
  );
}

// ── Add Book Form ─────────────────────────────────────────────────────────────
function AddBookForm({ language, onClose }: { language: string; onClose: () => void }) {
  const { addBook } = useAppStore();
  const [form, setForm] = useState({
    title: "", titleFr: "", author: "", price: "1200",
    major: "Common", semesters: "LS1",
    track: "french" as Book["track"], inStock: true,
  });

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title required"); return; }
    addBook({
      id: Date.now(), title: form.title, titleFr: form.titleFr || form.title,
      author: form.author, price: Number(form.price) || 1200,
      rating: 4.0, major: form.major, semesters: form.semesters,
      inStock: form.inStock, relatedCourses: [], track: form.track,
    });
    toast.success(language === "fr" ? "Livre ajouté" : "Book added");
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 border-t border-border bg-muted/20">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <InputField label="Title (EN)" value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Financial Accounting" required />
        <InputField label="Title (FR)" value={form.titleFr} onChange={e => set("titleFr", e.target.value)} placeholder="e.g. Comptabilité Financière" />
        <InputField label="Author" value={form.author} onChange={e => set("author", e.target.value)} placeholder="Author name" />
        <InputField label="Price (DZD)" type="number" min="0" value={form.price} onChange={e => set("price", e.target.value)} />
        <SelectField label="Major" value={form.major} onChange={e => set("major", e.target.value)}>
          {["Common","Audit & Accounting","Finance","Marketing","Management","MIS"].map(m => <option key={m}>{m}</option>)}
        </SelectField>
        <InputField label="Semesters" value={form.semesters} onChange={e => set("semesters", e.target.value)} placeholder="e.g. LS1, LS2" />
        <SelectField label="Track" value={form.track} onChange={e => set("track", e.target.value as Book["track"])}>
          <option value="french">French</option>
          <option value="english">English</option>
          <option value="both">Both</option>
        </SelectField>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide">Stock</label>
          <label className="flex items-center gap-2 cursor-pointer mt-2">
            <input type="checkbox" checked={form.inStock} onChange={e => set("inStock", e.target.checked)} className="w-4 h-4 accent-primary rounded" />
            <span className="text-sm text-foreground">{language === "fr" ? "En stock" : "In Stock"}</span>
          </label>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-sm font-display font-semibold hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" /> {language === "fr" ? "Annuler" : "Cancel"}
        </button>
        <button type="submit" className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-red text-white text-sm font-display font-semibold hover:opacity-90 transition-all active:scale-95">
          <Check className="w-3.5 h-3.5" /> {language === "fr" ? "Ajouter" : "Add Book"}
        </button>
      </div>
    </form>
  );
}

// ── Add Entrance Exam Form ────────────────────────────────────────────────────
function AddEntranceForm({ language, onClose }: { language: string; onClose: () => void }) {
  const { addExam } = useAppStore();
  const [form, setForm] = useState({
    title: "", titleFr: "", subject: "", examLang: "French",
    year: new Date().getFullYear().toString(),
    difficulty: "Medium" as Exam["difficulty"],
    pages: "4", description: "", fileUrl: "",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title required"); return; }
    addExam({
      id: `ex-${Date.now()}`, title: form.title, titleFr: form.titleFr || form.title,
      subject: form.subject, examLang: form.examLang, year: form.year,
      difficulty: form.difficulty, pages: Number(form.pages) || 4,
      rating: 4.0, description: form.description, descriptionFr: form.description,
      fileUrl: form.fileUrl,
    });
    toast.success(language === "fr" ? "Concours ajouté" : "Entrance exam added");
    onClose();
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
        <SelectField label="Difficulty" value={form.difficulty} onChange={e => set("difficulty", e.target.value as Exam["difficulty"])}>
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
        <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-sm font-display font-semibold hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" /> {language === "fr" ? "Annuler" : "Cancel"}
        </button>
        <button type="submit" className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-red text-white text-sm font-display font-semibold hover:opacity-90 transition-all active:scale-95">
          <Check className="w-3.5 h-3.5" /> {language === "fr" ? "Ajouter" : "Add Exam"}
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
function AddEventForm({ language, onClose }: { language: string; onClose: () => void }) {
  const { addEvent } = useAppStore();
  const [form, setForm] = useState({
    title: "", date: "", time: "10:00", location: "",
    tag: "Workshop", description: "", type: "upcoming" as EventItem["type"],
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title required"); return; }
    if (!form.date.trim()) { toast.error("Date required"); return; }
    addEvent({
      id: `ev-${Date.now()}`, title: form.title, date: form.date,
      time: form.time, location: form.location, attendees: 0,
      tag: form.tag, description: form.description, type: form.type,
    });
    toast.success(language === "fr" ? "Événement ajouté" : "Event added");
    onClose();
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
        <SelectField label="Type" value={form.type} onChange={e => set("type", e.target.value)}>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
        </SelectField>
        <div className="sm:col-span-2 lg:col-span-3 flex flex-col gap-1">
          <label className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide">Description</label>
          <input value={form.description} onChange={e => set("description", e.target.value)} className="px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" placeholder="Brief description..." />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-sm font-display font-semibold hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" /> {language === "fr" ? "Annuler" : "Cancel"}
        </button>
        <button type="submit" className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-red text-white text-sm font-display font-semibold hover:opacity-90 transition-all active:scale-95">
          <Check className="w-3.5 h-3.5" /> {language === "fr" ? "Ajouter" : "Add Event"}
        </button>
      </div>
    </form>
  );
}

// ── Edit Event Form ───────────────────────────────────────────────────────────
function EditEventForm({ language, event, onClose }: { language: string; event: EventItem; onClose: () => void }) {
  const { updateEvent } = useAppStore();
  const [form, setForm] = useState({
    title: event.title,
    date: event.date,
    time: event.time,
    location: event.location,
    tag: event.tag,
    description: event.description,
    type: event.type,
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title required"); return; }
    updateEvent({
      ...event,
      title: form.title, date: form.date, time: form.time,
      location: form.location, tag: form.tag, description: form.description,
      type: form.type as EventItem["type"],
    });
    toast.success(language === "fr" ? "Événement mis à jour" : "Event updated");
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 border-t border-border bg-secondary/5">
      <p className="text-xs font-display font-semibold text-secondary mb-3">
        {language === "fr" ? "Modifier l'événement" : "Edit Event"}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <InputField label="Title" value={form.title} onChange={e => set("title", e.target.value)} placeholder="Event title" required />
        <InputField label="Date" value={form.date} onChange={e => set("date", e.target.value)} placeholder="e.g. April 5, 2025" />
        <InputField label="Time" value={form.time} onChange={e => set("time", e.target.value)} placeholder="e.g. 2:00 PM - 6:00 PM" />
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
        <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-sm font-display font-semibold hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" /> {language === "fr" ? "Annuler" : "Cancel"}
        </button>
        <button type="submit" className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-green text-white text-sm font-display font-semibold hover:opacity-90 transition-all active:scale-95">
          <Check className="w-3.5 h-3.5" /> {language === "fr" ? "Enregistrer" : "Save Changes"}
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
  resource: { type: "entrance" | "previous", exam: Exam | PreviousExam },
  onClose: () => void,
  onUpload: (exam: PreviousExam | Exam, file: File, folderPath: string) => Promise<void>,
  language: string
}) {
  const [major, setMajor] = useState(resource.type === "previous" ? (resource.exam as PreviousExam).major : "");
  const [semester, setSemester] = useState(resource.type === "previous" ? (resource.exam as PreviousExam).semester : "");
  const [track, setTrack] = useState(resource.type === "previous" ? (resource.exam as PreviousExam).track : "");

  const [year, setYear] = useState(resource.type === "entrance" ? (resource.exam as Exam).year : "");
  const [examLang, setExamLang] = useState(resource.type === "entrance" ? (resource.exam as Exam).examLang : "");
  const [subject, setSubject] = useState(resource.type === "entrance" ? (resource.exam as Exam).subject : "");
  
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
        className="relative w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl p-6 overflow-hidden"
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
          className={`w-full py-2.5 rounded-xl text-white font-display font-bold text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${isEntrance ? 'bg-gradient-to-r from-secondary to-orange-500' : 'bg-gradient-red'}`}
        >
          {language === "fr" ? "Téléverser et Lier" : "Upload & Link File"}
        </button>
      </motion.div>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
export default function Admin() {
  const { language,
    previousExams, removePreviousExam, updatePreviousExam,
    books, removeBook,
    exams, removeExam, updateExam,
    events, removeEvent, updateEvent,
  } = useAppStore();
  const { session, isAdmin, signOut } = useAuth();

  const [activeTab, setActiveTab] = useState<"exams"|"books"|"entrance"|"events">("exams");
  const [adminTrack, setAdminTrack] = useState<"french"|"english">("french");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);

  const [uploadModalResource, setUploadModalResource] = useState<{ type: "entrance" | "previous", exam: Exam | PreviousExam } | null>(null);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/auth";
  };

  const handleFileUpload = async (exam: PreviousExam | Exam, file: File, folderPath: string) => {
    const toastId = toast.loading(language === "fr" ? "Téléchargement en cours..." : "Uploading file...");
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${exam.id}-${Date.now()}.${fileExt}`;
      const isEntrance = 'subject' in exam;
      
      const filePath = `${folderPath}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('exam-papers')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('exam-papers')
        .getPublicUrl(uploadData.path);

      if (isEntrance) {
        updateExam({ ...(exam as Exam), fileUrl: publicUrl });
      } else {
        updatePreviousExam({ ...(exam as PreviousExam), fileUrl: publicUrl });
      }

      toast.success(language === "fr" ? "Fichier lié avec succès" : "File linked successfully!", { id: toastId });
    } catch (error: any) {
      toast.error(error.message || "Upload failed", { id: toastId });
    }
  };

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setShowAddForm(false);
    setEditingEvent(null);
  };

  const displayedPreviousExams = previousExams.filter(e => e.track === adminTrack);
  const displayedExams = exams.filter(e => e.examLang.toLowerCase() === adminTrack || e.examLang.toLowerCase() === "both");

  const tabs = [
    { key: "exams" as const, label: language === "fr" ? "Examens Précédents" : "Previous Exams", icon: <FileText className="w-4 h-4" />, count: displayedPreviousExams.length },
    { key: "entrance" as const, label: language === "fr" ? "Concours" : "Entrance Exams", icon: <BookOpen className="w-4 h-4" />, count: displayedExams.length },
    { key: "books" as const, label: language === "fr" ? "Livres" : "Books", icon: <ShoppingCart className="w-4 h-4" />, count: books.length },
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
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-red flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-extrabold text-2xl text-foreground">
                {language === "fr" ? "Panneau Admin" : "Admin Panel"}
              </h1>
              <p className="text-muted-foreground text-xs">
                {language === "fr" ? "Gérez le contenu de la plateforme" : "Manage platform content"}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-muted-foreground text-sm font-medium hover:text-foreground hover:border-foreground/20 transition-all"
          >
            <LogOut className="w-4 h-4" />
            {language === "fr" ? "Déconnexion" : "Sign Out"}
          </button>
        </motion.div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {tabs.map((tab) => (
            <div key={tab.key} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                {tab.icon}
              </div>
              <div>
                <p className="font-display font-extrabold text-xl text-foreground">{tab.count}</p>
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
          className="rounded-2xl border border-border bg-card overflow-hidden"
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
                {activeTab === "exams" && <AddExamForm language={language} onClose={() => setShowAddForm(false)} />}
                {activeTab === "books" && <AddBookForm language={language} onClose={() => setShowAddForm(false)} />}
                {activeTab === "entrance" && <AddEntranceForm language={language} onClose={() => setShowAddForm(false)} />}
                {activeTab === "events" && <AddEventForm language={language} onClose={() => setShowAddForm(false)} />}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Rows */}
          <div className="divide-y divide-border">
            {activeTab === "exams" && displayedPreviousExams.map((exam) => (
              <div key={exam.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-display font-semibold text-sm text-foreground">
                      {language === "fr" ? exam.courseTitleFr : exam.courseTitle}
                    </p>
                    {exam.fileUrl && <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-[10px] font-bold uppercase">FILE LINKED</span>}
                  </div>
                  <p className="text-muted-foreground text-xs">{exam.major} · {exam.semester} · {exam.year} · {exam.examType}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setUploadModalResource({ type: "previous", exam })}
                    className="p-1.5 rounded-lg hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors" 
                    aria-label="Upload File"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                  <button onClick={() => {
                    const url = window.prompt("Enter new file URL for this exam:", exam.fileUrl || "");
                    if (url !== null) updatePreviousExam({ ...exam, fileUrl: url });
                  }} className="p-1.5 rounded-lg hover:bg-secondary/10 hover:text-secondary text-muted-foreground transition-colors" aria-label="Edit URL">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => { removePreviousExam(exam.id); toast.success(language === "fr" ? "Supprimé" : "Removed"); }} className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors" aria-label="Remove">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {activeTab === "books" && books.map((book) => (
              <div key={book.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors">
                <div>
                  <p className="font-display font-semibold text-sm text-foreground">{language === "fr" ? book.titleFr : book.title}</p>
                  <p className="text-muted-foreground text-xs">{book.author} · {book.major}</p>
                </div>
                <button onClick={() => { removeBook(book.id); toast.success(language === "fr" ? "Supprimé" : "Removed"); }} className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors" aria-label="Remove">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {activeTab === "entrance" && displayedExams.map((exam) => (
              <div key={exam.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-display font-semibold text-sm text-foreground">{language === "fr" ? exam.titleFr : exam.title}</p>
                    {exam.fileUrl && <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-[10px] font-bold uppercase">FILE LINKED</span>}
                  </div>
                  <p className="text-muted-foreground text-xs">{exam.subject} · {exam.examLang} · {exam.year} · {exam.difficulty}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setUploadModalResource({ type: "entrance", exam })}
                    className="p-1.5 rounded-lg hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors" 
                    aria-label="Upload File"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                  <button onClick={() => {
                    const url = window.prompt("Enter new file URL for this exam:", exam.fileUrl || "");
                    if (url !== null) updateExam({ ...exam, fileUrl: url });
                  }} className="p-1.5 rounded-lg hover:bg-secondary/10 hover:text-secondary text-muted-foreground transition-colors" aria-label="Edit URL">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => { removeExam(exam.id); toast.success(language === "fr" ? "Supprimé" : "Removed"); }} className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors" aria-label="Remove">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {activeTab === "events" && events.map((event) => (
              <div key={event.id}>
                <div className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors">
                  <div>
                    <p className="font-display font-semibold text-sm text-foreground">{event.title}</p>
                    <p className="text-muted-foreground text-xs">{event.date} · {event.tag} · {event.type}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingEvent(e => e?.id === event.id ? null : event); setShowAddForm(false); }}
                      className="p-1.5 rounded-lg hover:bg-secondary/10 hover:text-secondary text-muted-foreground transition-colors"
                      aria-label="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => { removeEvent(event.id); if (editingEvent?.id === event.id) setEditingEvent(null); toast.success(language === "fr" ? "Supprimé" : "Removed"); }} className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors" aria-label="Remove">
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
                      <EditEventForm language={language} event={editingEvent} onClose={() => setEditingEvent(null)} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {/* Empty states */}
            {activeTab === "exams" && displayedPreviousExams.length === 0 && (
              <div className="px-5 py-12 text-center text-muted-foreground text-sm">{language === "fr" ? "Aucun examen pour cette sélection" : "No exams for this track"}</div>
            )}
            {activeTab === "books" && books.length === 0 && (
              <div className="px-5 py-12 text-center text-muted-foreground text-sm">{language === "fr" ? "Aucun livre" : "No books yet"}</div>
            )}
            {activeTab === "entrance" && displayedExams.length === 0 && (
              <div className="px-5 py-12 text-center text-muted-foreground text-sm">{language === "fr" ? "Aucun concours pour cette sélection" : "No exams for this track"}</div>
            )}
            {activeTab === "events" && events.length === 0 && (
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
