import { create } from "zustand";
import { persist } from "zustand/middleware";
import { 
  frenchCourses, englishCourses, 
  defaultPreviousExams,
  defaultExams, defaultEvents 
} from "@/data/mockData";

export interface Course {
  id: string; title: string; titleFr: string;
  credits: number; semester: string; major: string;
  type: "common" | "major"; track: "french" | "english";
}
export interface PreviousExam {
  id: string; courseId: string; courseTitle: string; courseTitleFr: string;
  major: string; semester: string; year: string;
  examType: "midterms" | "final" | "resit"; pages: number; rating: number;
  track: "french" | "english";
  fileUrl?: string;
}
export interface Exam {
  id: string; title: string; titleFr: string; subject: string;
  examLang: string; year: string; difficulty: "Easy" | "Medium" | "Hard";
  pages: number; rating: number; description: string; descriptionFr: string;
  fileUrl?: string;
}
export interface EventItem {
  id: string; title: string; date: string; time: string;
  location: string; attendees: number; tag: string;
  description: string; type: "upcoming" | "past";
}

// ── ZUSTAND STORE ─────────────────────────────────────────────────────────────
interface AppState {
  // Data
  courses: Course[];
  previousExams: PreviousExam[];
  exams: Exam[];
  events: EventItem[];
  // UI State
  language: "fr" | "en";
  theme: "dark" | "light";
  // Actions
  setLanguage: (lang: "fr" | "en") => void;
  setTheme: (theme: "dark" | "light") => void;
  addPreviousExam: (exam: PreviousExam) => void;
  removePreviousExam: (id: string) => void;
  updatePreviousExam: (exam: PreviousExam) => void;
  addExam: (exam: Exam) => void;
  removeExam: (id: string) => void;
  updateExam: (exam: Exam) => void;
  addEvent: (event: EventItem) => void;
  removeEvent: (id: string) => void;
  updateEvent: (event: EventItem) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // ── Initial Data ──────────────────────────────────────────────────────
      courses: [...frenchCourses, ...englishCourses],
      previousExams: defaultPreviousExams,
      exams: defaultExams,
      events: defaultEvents,
      // ── Initial UI State ──────────────────────────────────────────────────
      language: "fr",
      theme: "dark",
      // ── Language ──────────────────────────────────────────────────────────
      setLanguage: (lang) => set({ language: lang }),
      setTheme: (theme) => {
        // Apply immediately as well as through App's layout effect. This keeps
        // the toggle responsive even before React paints the next frame.
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
        set({ theme });
      },
      // ── Admin CRUD ────────────────────────────────────────────────────────
      addPreviousExam: (exam) =>
        set((s) => ({ previousExams: [...s.previousExams, exam] })),
      removePreviousExam: (id) =>
        set((s) => ({ previousExams: s.previousExams.filter((e) => e.id !== id) })),
      updatePreviousExam: (exam) =>
        set((s) => ({ previousExams: s.previousExams.map((e) => (e.id === exam.id ? exam : e)) })),
      addExam: (exam) =>
        set((s) => ({ exams: [...s.exams, exam] })),
      removeExam: (id) =>
        set((s) => ({ exams: s.exams.filter((e) => e.id !== id) })),
      updateExam: (exam) =>
        set((s) => ({ exams: s.exams.map((e) => (e.id === exam.id ? exam : e)) })),
      addEvent: (event) =>
        set((s) => ({ events: [...s.events, event] })),
      removeEvent: (id) =>
        set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
      updateEvent: (event) =>
        set((s) => ({ events: s.events.map((e) => (e.id === event.id ? event : e)) })),
    }),
    {
      name: "edusphere-v2-store",
      partialize: (state) => ({
        language: state.language,
        theme: state.theme,
      }),
    }
  )
);
