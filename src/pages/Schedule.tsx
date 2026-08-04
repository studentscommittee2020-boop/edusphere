import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Clock, MapPin, RefreshCw, User2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAppStore } from "@/store/appStore";
import { track } from "@/lib/telemetry";
import {
  courseTitle,
  durationMinutes,
  formatTime,
  getSchedule,
  getSyncState,
  groupByDay,
  syncAcademics,
  type ScheduleEntryWithCourse,
} from "@/services/academics";
import type { AcademicSyncState } from "@/types/database";
import { cn } from "@/lib/utils";

const DAY_LABELS: Record<number, { en: string; fr: string; short: string }> = {
  1: { en: "Monday", fr: "Lundi", short: "MON" },
  2: { en: "Tuesday", fr: "Mardi", short: "TUE" },
  3: { en: "Wednesday", fr: "Mercredi", short: "WED" },
  4: { en: "Thursday", fr: "Jeudi", short: "THU" },
  5: { en: "Friday", fr: "Vendredi", short: "FRI" },
  6: { en: "Saturday", fr: "Samedi", short: "SAT" },
  7: { en: "Sunday", fr: "Dimanche", short: "SUN" },
};

const KIND_STYLES: Record<string, string> = {
  lecture: "border-l-red-500 bg-red-500/[0.07]",
  td: "border-l-blue-500 bg-blue-500/[0.07]",
  tp: "border-l-green-500 bg-green-500/[0.07]",
  exam: "border-l-red-300 bg-red-300/[0.07]",
  other: "border-l-neutral-500 bg-white/[0.04]",
};

export default function Schedule() {
  const { user, profile } = useAuth();
  const { language } = useAppStore();
  const isFr = language === "fr";

  const [entries, setEntries] = useState<ScheduleEntryWithCourse[]>([]);
  const [syncState, setSyncState] = useState<AcademicSyncState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [fileNumber, setFileNumber] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const [{ data: scheduleData }, { data: state }] = await Promise.all([
      getSchedule(user.id),
      getSyncState(user.id),
    ]);
    setEntries(scheduleData);
    setSyncState(state);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
    track("schedule_viewed");
  }, [load]);

  const byDay = useMemo(() => groupByDay(entries), [entries]);
  // Weekends only earn a column when something is actually scheduled there.
  const visibleDays = useMemo(() => {
    const days = [1, 2, 3, 4, 5];
    if (byDay[6]?.length) days.push(6);
    if (byDay[7]?.length) days.push(7);
    return days;
  }, [byDay]);

  const totalHours = useMemo(
    () =>
      entries.reduce(
        (sum, entry) => sum + durationMinutes(entry.starts_at, entry.ends_at),
        0,
      ) / 60,
    [entries],
  );

  async function handleSync(event: React.FormEvent) {
    event.preventDefault();
    if (!fileNumber.trim()) return;

    setIsSyncing(true);
    const { data, error } = await syncAcademics(fileNumber, profile?.semester ?? undefined);
    setIsSyncing(false);

    if (error) {
      toast.error(error.message);
      track("schedule_sync_failed");
      return;
    }

    // Clear immediately — the file number lives no longer than this submit.
    setFileNumber("");
    setShowSyncDialog(false);
    toast.success(
      isFr
        ? `${data?.entries ?? 0} séances et ${data?.courses ?? 0} cours synchronisés.`
        : `Synced ${data?.entries ?? 0} sessions and ${data?.courses ?? 0} courses.`,
    );
    track("schedule_sync_succeeded", {
      entries: data?.entries ?? 0,
      courses: data?.courses ?? 0,
    });
    void load();
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8 lg:py-12 max-w-[1400px] mx-auto space-y-8">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
      >
        <div>
          <span className="eyebrow">
            <CalendarClock className="w-3.5 h-3.5" />
            {isFr ? "Ma Scolarité" : "My Academics"}
          </span>
          <h1 className="mt-2 font-display font-extrabold text-3xl lg:text-4xl text-gradient-chrome">
            {isFr ? "Mon Emploi du Temps" : "My Schedule"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {syncState
              ? isFr
                ? `Dernière synchronisation : ${new Date(syncState.last_synced_at).toLocaleString("fr-FR")}`
                : `Last synced ${new Date(syncState.last_synced_at).toLocaleString("en-GB")}`
              : isFr
                ? "Jamais synchronisé avec l'université."
                : "Never synced with the university."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowSyncDialog(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-red text-white font-display font-semibold text-sm transition-transform duration-200 hover:scale-[1.02] active:scale-100"
        >
          <RefreshCw className="w-4 h-4" />
          {isFr ? "Actualiser" : "Refresh"}
        </button>
      </motion.header>

      {/* ── Summary ──────────────────────────────────────────────────────── */}
      {!isLoading && entries.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryTile label={isFr ? "Séances" : "Sessions"} value={String(entries.length)} />
          <SummaryTile
            label={isFr ? "Heures / semaine" : "Hours / week"}
            value={totalHours.toFixed(1)}
          />
          <SummaryTile
            label={isFr ? "Jours actifs" : "Active days"}
            value={String(visibleDays.filter((day) => byDay[day]?.length).length)}
          />
          <SummaryTile
            label={isFr ? "Semestre" : "Semester"}
            value={profile?.semester ?? "—"}
          />
        </div>
      )}

      <div className="rule-glow" />

      {/* ── Timetable ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton h-56 rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptySchedule isFr={isFr} onSync={() => setShowSyncDialog(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
          {visibleDays.map((day, dayIndex) => (
            <motion.section
              key={day}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: dayIndex * 0.05, duration: 0.35 }}
              className="space-y-2.5"
            >
              <header className="flex items-baseline justify-between px-1">
                <h2 className="font-display font-bold text-sm text-foreground">
                  {isFr ? DAY_LABELS[day].fr : DAY_LABELS[day].en}
                </h2>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {byDay[day]?.length ?? 0}
                </span>
              </header>

              {(byDay[day]?.length ?? 0) === 0 ? (
                <div className="surface px-3 py-6 text-center text-xs text-muted-foreground">
                  {isFr ? "Libre" : "Free"}
                </div>
              ) : (
                byDay[day].map((entry) => (
                  <article
                    key={entry.id}
                    className={cn(
                      "surface-interactive border-l-[3px] px-3.5 py-3 space-y-2",
                      KIND_STYLES[entry.kind] ?? KIND_STYLES.other,
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      {/* Course names follow the language the course is taught
                          in, not the interface language. */}
                      <h3 className="font-display font-bold text-sm text-foreground leading-snug">
                        {entry.courses ? courseTitle(entry.courses) : entry.course_label}
                      </h3>
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-white/[0.07] text-muted-foreground">
                        {entry.kind}
                      </span>
                    </div>

                    <dl className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-mono">
                          {formatTime(entry.starts_at)}–{formatTime(entry.ends_at)}
                        </span>
                      </div>
                      {entry.room && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span>{entry.room}</span>
                        </div>
                      )}
                      {entry.instructor && (
                        <div className="flex items-center gap-1.5">
                          <User2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{entry.instructor}</span>
                        </div>
                      )}
                    </dl>
                  </article>
                ))
              )}
            </motion.section>
          ))}
        </div>
      )}

      {/* ── Sync dialog ──────────────────────────────────────────────────── */}
      {showSyncDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sync-title"
        >
          <motion.form
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onSubmit={handleSync}
            className="surface-raised w-full max-w-sm p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="sync-title" className="font-display font-extrabold text-lg text-foreground">
                  {isFr ? "Synchroniser" : "Sync with university"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {isFr
                    ? "Votre numéro de dossier est utilisé une seule fois pour interroger l'université. Il n'est jamais enregistré."
                    : "Your file number is used once to query the university. It is never stored."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncDialog(false)}
                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground transition-colors"
                aria-label={isFr ? "Fermer" : "Close"}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="file-number"
                className="block text-xs font-semibold text-muted-foreground"
              >
                {isFr ? "Numéro de dossier" : "File number"}
              </label>
              <input
                id="file-number"
                type="text"
                value={fileNumber}
                onChange={(event) => setFileNumber(event.target.value)}
                autoComplete="off"
                data-sensitive="true"
                placeholder="FS2-12345"
                className="w-full px-3.5 py-2.5 rounded-lg bg-input border border-border text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:border-primary/50"
              />
            </div>

            <button
              type="submit"
              disabled={isSyncing || !fileNumber.trim()}
              className="w-full py-2.5 rounded-lg bg-gradient-red text-white font-display font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {isSyncing
                ? isFr ? "Synchronisation…" : "Syncing…"
                : isFr ? "Synchroniser" : "Sync now"}
            </button>
          </motion.form>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </p>
      <p className="mt-0.5 font-display font-extrabold text-2xl text-foreground">{value}</p>
    </div>
  );
}

function EmptySchedule({ isFr, onSync }: { isFr: boolean; onSync: () => void }) {
  return (
    <div className="surface flex flex-col items-center text-center px-6 py-16">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <CalendarClock className="w-7 h-7 text-primary" />
      </div>
      <h2 className="font-display font-extrabold text-xl text-foreground">
        {isFr ? "Aucun emploi du temps" : "No schedule yet"}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
        {isFr
          ? "Synchronisez avec l'université pour importer vos séances et vos cours. Votre numéro de dossier n'est jamais enregistré."
          : "Sync with the university to import your sessions and courses. Your file number is never stored."}
      </p>
      <button
        type="button"
        onClick={onSync}
        className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-red text-white font-display font-semibold text-sm"
      >
        <RefreshCw className="w-4 h-4" />
        {isFr ? "Synchroniser maintenant" : "Sync now"}
      </button>
    </div>
  );
}
