import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, CheckCircle2, FileUp, Loader2, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAssignmentSubmissions,
  getAssignmentsForCurrentUser,
  uploadAssignmentSubmission,
} from "@/services/portal";
import type { Assignment, AssignmentSubmission } from "@/types/database";

function formatDueDate(value: string | null) {
  if (!value) return "No deadline";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function dueTone(value: string | null) {
  if (!value) return "text-muted-foreground bg-white/[0.05]";
  const remaining = new Date(value).getTime() - Date.now();
  if (remaining < 0) return "text-red-300 bg-red-500/10";
  if (remaining < 1000 * 60 * 60 * 72) return "text-red-300 bg-red-500/10";
  return "text-emerald-300 bg-emerald-500/10";
}

export default function StudentAssignments() {
  const { user, profile } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, AssignmentSubmission[]>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | undefined>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await getAssignmentsForCurrentUser();
    if (error) toast.error("Could not load assignments.");
    setAssignments(data);

    const allSubmissions = await Promise.all(
      data.map(async (assignment) => {
        const result = await getAssignmentSubmissions(assignment.id);
        return [assignment.id, result.data] as const;
      }),
    );
    setSubmissions(Object.fromEntries(allSubmissions));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const upcomingCount = useMemo(
    () => assignments.filter((assignment) => !assignment.due_at || new Date(assignment.due_at) > new Date()).length,
    [assignments],
  );

  async function submit(assignment: Assignment) {
    const file = selectedFiles[assignment.id];
    if (!file || !user) {
      toast.error("Choose your PDF before submitting.");
      return;
    }

    setSubmittingId(assignment.id);
    const { error } = await uploadAssignmentSubmission(
      user.id,
      assignment.id,
      file,
      messages[assignment.id] ?? "",
    );
    setSubmittingId(null);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Assignment submitted successfully.");
    setSelectedFiles((current) => ({ ...current, [assignment.id]: undefined }));
    setMessages((current) => ({ ...current, [assignment.id]: "" }));
    await load();
  }

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-mesh pointer-events-none" />
      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-7">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface-raised rounded-[2rem] p-6 sm:p-8 overflow-hidden relative"
        >
          <div className="absolute -right-16 -top-20 w-72 h-72 bg-emerald-500/10 blur-3xl rounded-full" />
          <div className="relative flex flex-col sm:flex-row gap-6 sm:items-end sm:justify-between">
            <div>
              <span className="eyebrow">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified student workspace
              </span>
              <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-gradient-chrome mt-3">
                Assignments, clearly in hand.
              </h1>
              <p className="text-sm text-muted-foreground mt-3 max-w-xl">
                Only assignments that match your registered academic profile appear here. Submit a
                PDF and follow its review status in one place.
              </p>
            </div>
            <div className="surface rounded-2xl px-5 py-4 min-w-40">
              <p className="text-2xl font-display font-extrabold text-foreground">{upcomingCount}</p>
              <p className="text-xs text-muted-foreground mt-1">available assignments</p>
            </div>
          </div>
          {profile?.major && (
            <p className="relative mt-6 text-xs text-muted-foreground">
              Personalized for {profile.major}
              {profile.semester ? ` · ${profile.semester}` : ""}
            </p>
          )}
        </motion.section>

        {loading ? (
          <div className="grid gap-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="skeleton h-40 rounded-[1.6rem]" />
            ))}
          </div>
        ) : assignments.length === 0 ? (
          <section className="surface flex flex-col items-center text-center rounded-[2rem] px-6 py-20">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-7 h-7 text-primary" />
            </div>
            <h2 className="font-display font-extrabold text-xl text-foreground">You are up to date.</h2>
            <p className="text-sm text-muted-foreground mt-2">
              There are no published assignments for your academic profile right now.
            </p>
          </section>
        ) : (
          <div className="grid gap-5">
            {assignments.map((assignment, index) => {
              const history = submissions[assignment.id] ?? [];
              const latest = history[0];
              const canSubmit = history.length < assignment.max_submissions;
              return (
                <motion.article
                  key={assignment.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="surface rounded-[1.6rem] p-5 sm:p-6"
                >
                  <div className="flex flex-col lg:flex-row gap-5 lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] uppercase tracking-[0.14em] font-display font-bold text-red-300 bg-red-500/10 px-2.5 py-1 rounded-full">
                          Assignment
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${dueTone(assignment.due_at)}`}
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          {formatDueDate(assignment.due_at)}
                        </span>
                      </div>
                      <h2 className="font-display font-extrabold text-xl text-foreground mt-4">
                        {assignment.title}
                      </h2>
                      {assignment.description && (
                        <p className="text-sm leading-6 text-muted-foreground mt-2 max-w-3xl whitespace-pre-wrap">
                          {assignment.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-4">
                        {assignment.max_submissions} submission{assignment.max_submissions === 1 ? "" : "s"} allowed
                        {assignment.allow_late ? " · late work accepted" : ""}
                      </p>
                    </div>
                    {latest && (
                      <div className="lg:w-52 shrink-0 surface rounded-2xl p-4">
                        <p className="text-xs uppercase tracking-[0.13em] font-display font-bold text-muted-foreground">
                          Latest submission
                        </p>
                        <p className="text-sm text-foreground font-medium mt-2 truncate">
                          {latest.original_name}
                        </p>
                        <p className="text-xs text-emerald-300 mt-2 capitalize">{latest.status}</p>
                        {latest.feedback && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{latest.feedback}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {canSubmit ? (
                    <div className="mt-6 pt-5 border-t border-border grid lg:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                      <label className="block">
                        <span className="text-xs font-display font-bold uppercase tracking-[0.12em] text-muted-foreground mb-2 block">
                          Your PDF
                        </span>
                        <span className="relative flex items-center gap-3 rounded-xl border border-dashed border-border-strong bg-white/[0.025] px-4 py-3 cursor-pointer hover:border-red-400/60 transition">
                          <FileUp className="w-5 h-5 text-red-300" />
                          <span className="text-sm text-muted-foreground truncate">
                            {selectedFiles[assignment.id]?.name ?? "Choose assignment file"}
                          </span>
                          <input
                            type="file"
                            accept="application/pdf"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={(event) =>
                              setSelectedFiles((current) => ({
                                ...current,
                                [assignment.id]: event.target.files?.[0],
                              }))
                            }
                          />
                        </span>
                      </label>
                      <label className="block">
                        <span className="text-xs font-display font-bold uppercase tracking-[0.12em] text-muted-foreground mb-2 block">
                          Note to doctor (optional)
                        </span>
                        <input
                          value={messages[assignment.id] ?? ""}
                          onChange={(event) =>
                            setMessages((current) => ({ ...current, [assignment.id]: event.target.value }))
                          }
                          maxLength={2000}
                          placeholder="Add a short note"
                          className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void submit(assignment)}
                        disabled={submittingId === assignment.id}
                        className="h-[46px] px-5 rounded-xl bg-gradient-red text-white text-sm font-display font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {submittingId === assignment.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Submit
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-5 pt-5 border-t border-border text-sm text-red-300">
                      You have used the available submission attempts for this assignment.
                    </p>
                  )}
                </motion.article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
