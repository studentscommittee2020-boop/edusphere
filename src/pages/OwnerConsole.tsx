import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Database,
  Eye,
  Loader2,
  RefreshCw,
  ScrollText,
  Search,
  ShieldAlert,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAppStore } from "@/store/appStore";
import { track } from "@/lib/telemetry";
import {
  browseTable,
  deleteRow,
  getAccountSnapshot,
  getAllProfiles,
  getAuditTrail,
  getOwnerOverview,
  isWritable,
  OWNER_TABLES,
  setProfileRole,
  startImpersonation,
  type AccountSnapshot,
  type OwnerOverview,
  type OwnerTable,
} from "@/services/owner";
import type { AuditLog, Profile } from "@/types/database";
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
} from "@/components/ui/alert-dialog";

type Tab = "overview" | "accounts" | "tables" | "audit";

const ROLES: Profile["role"][] = ["student", "doctor", "committee_admin", "admin"];
const PAGE_SIZE = 50;
// Mirrors impersonation_sessions.reason's CHECK (char_length BETWEEN 3 AND
// 500) in migration 012 — enforced here only for a fast, friendly message;
// start_impersonation() re-validates server-side regardless.
const REASON_MIN_LENGTH = 3;
const REASON_MAX_LENGTH = 500;
// Same focus-trap selector ExamReportDialog.tsx uses — duplicated rather
// than imported since that component doesn't export it and isn't in this
// page's edit scope.
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function OwnerConsole() {
  const { language } = useAppStore();
  const { user } = useAuth();
  const isFr = language === "fr";

  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<OwnerOverview | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [accountSearch, setAccountSearch] = useState("");
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [actAsTarget, setActAsTarget] = useState<Profile | null>(null);

  const [activeTable, setActiveTable] = useState<OwnerTable>("profiles");
  const [tablePage, setTablePage] = useState(0);
  const [tableRows, setTableRows] = useState<Record<string, unknown>[]>([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [pendingDeletion, setPendingDeletion] = useState<Record<string, unknown> | null>(null);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadCore = useCallback(async () => {
    setIsLoading(true);
    const [overviewData, { data: profileData }, { data: auditData }] = await Promise.all([
      getOwnerOverview(),
      getAllProfiles(),
      getAuditTrail(200),
    ]);
    setOverview(overviewData);
    setProfiles(profileData);
    setAuditTrail(auditData);
    setIsLoading(false);
  }, []);

  const loadTable = useCallback(async () => {
    const { data, error } = await browseTable(activeTable, tablePage, PAGE_SIZE);
    if (error) {
      toast.error(isFr ? "Lecture impossible." : "Could not read that table.");
      return;
    }
    setTableRows(data.rows);
    setTableTotal(data.total);
  }, [activeTable, tablePage, isFr]);

  useEffect(() => {
    void loadCore();
    track("owner_console_opened");
  }, [loadCore]);

  useEffect(() => {
    if (tab === "tables") void loadTable();
  }, [tab, loadTable]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleRoleChange(profile: Profile, role: Profile["role"]) {
    const { error } = await setProfileRole(profile.id, role);
    if (error) {
      toast.error(isFr ? "Changement de rôle refusé." : "Role change rejected.");
      return;
    }
    setProfiles((current) =>
      current.map((item) => (item.id === profile.id ? { ...item, role } : item)),
    );
    toast.success(
      isFr ? `Rôle mis à jour : ${role}` : `Role updated to ${role}`,
    );
    track("owner_role_changed", { role });
  }

  async function handleInspect(profile: Profile) {
    const result = await getAccountSnapshot(profile.id);
    setSnapshot(result);
    track("owner_account_inspected");
  }

  async function confirmDeleteRow(row: Record<string, unknown>) {
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) {
      toast.error(isFr ? "Cette ligne n'a pas d'identifiant." : "That row has no id column.");
      return;
    }

    const { error } = await deleteRow(activeTable, id);
    if (error) {
      toast.error(isFr ? "Suppression refusée." : "Delete rejected.");
      return;
    }
    toast.success(isFr ? "Ligne supprimée." : "Row deleted.");
    track("owner_row_deleted", { table: activeTable });
    setPendingDeletion(null);
    void loadTable();
  }

  const visibleProfiles = useMemo(() => {
    const term = accountSearch.trim().toLowerCase();
    if (!term) return profiles;
    return profiles.filter(
      (profile) =>
        profile.full_name.toLowerCase().includes(term) ||
        profile.id.toLowerCase().includes(term) ||
        (profile.major ?? "").toLowerCase().includes(term),
    );
  }, [profiles, accountSearch]);

  const tabs: { key: Tab; en: string; fr: string; icon: typeof Users }[] = [
    { key: "overview", en: "Overview", fr: "Vue d'ensemble", icon: Activity },
    { key: "accounts", en: "Accounts", fr: "Comptes", icon: Users },
    { key: "tables", en: "Tables", fr: "Tables", icon: Database },
    { key: "audit", en: "Audit trail", fr: "Journal", icon: ScrollText },
  ];

  const tableColumns = tableRows.length > 0 ? Object.keys(tableRows[0]).slice(0, 7) : [];

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8 lg:py-12 max-w-[1600px] mx-auto space-y-8">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
      >
        <div>
          <span className="eyebrow text-red-400/90">
            <ShieldAlert className="w-3.5 h-3.5" />
            {isFr ? "Accès total" : "Unrestricted access"}
          </span>
          <h1 className="mt-2 font-display font-extrabold text-3xl lg:text-4xl text-gradient-chrome">
            {isFr ? "Console Propriétaire" : "Owner Console"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
            {isFr
              ? "Lecture et écriture sur chaque table et chaque compte. Toute action est enregistrée dans un journal que vous ne pouvez pas modifier."
              : "Read and write across every table and every account. Every action is written to an audit trail you cannot edit."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadCore()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl surface-interactive text-foreground font-display font-semibold text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          {isFr ? "Actualiser" : "Refresh"}
        </button>
      </motion.header>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 surface p-1 overflow-x-auto">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-display font-bold whitespace-nowrap transition-colors duration-200",
                tab === item.key
                  ? "bg-gradient-red text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={tab === item.key}
            >
              <Icon className="w-4 h-4" />
              {isFr ? item.fr : item.en}
            </button>
          );
        })}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading || !overview ? (
            Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="skeleton h-24 rounded-xl" />
            ))
          ) : (
            <>
              <StatTile label={isFr ? "Comptes" : "Accounts"} value={overview.users} />
              <StatTile label={isFr ? "Étudiants" : "Students"} value={overview.students} />
              <StatTile label={isFr ? "Enseignants" : "Doctors"} value={overview.doctors} />
              <StatTile label={isFr ? "Admins" : "Admins"} value={overview.admins} />
              <StatTile label={isFr ? "Inscriptions" : "Enrolments"} value={overview.enrollments} />
              <StatTile label={isFr ? "Rendus" : "Submissions"} value={overview.submissions} />
              <StatTile label={isFr ? "Supports" : "Materials"} value={overview.materials} />
              <StatTile label={isFr ? "Évènements suivis" : "Telemetry events"} value={overview.telemetryEvents} />
            </>
          )}
        </div>
      )}

      {/* ── Accounts ─────────────────────────────────────────────────────── */}
      {tab === "accounts" && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
              placeholder={isFr ? "Rechercher par nom, id ou filière…" : "Search by name, id, or major…"}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground/60 focus:border-primary/50"
              aria-label={isFr ? "Rechercher un compte" : "Search accounts"}
            />
          </div>

          <div className="surface overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>{isFr ? "Nom" : "Name"}</Th>
                  <Th>{isFr ? "Filière" : "Major"}</Th>
                  <Th>{isFr ? "Semestre" : "Semester"}</Th>
                  <Th>{isFr ? "Rôle" : "Role"}</Th>
                  <Th className="text-right">{isFr ? "Actions" : "Actions"}</Th>
                </tr>
              </thead>
              <tbody>
                {visibleProfiles.map((profile) => (
                  <tr
                    key={profile.id}
                    className="border-b border-border/60 last:border-0 hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-display font-semibold text-foreground">
                        {profile.full_name || "—"}
                      </p>
                      <p className="text-[11px] font-mono text-muted-foreground truncate max-w-[220px]">
                        {profile.id}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{profile.major ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{profile.semester ?? "—"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={profile.role}
                        onChange={(event) =>
                          void handleRoleChange(profile, event.target.value as Profile["role"])
                        }
                        disabled={profile.id === user?.id}
                        title={
                          profile.id === user?.id
                            ? isFr
                              ? "Vous ne pouvez pas changer votre propre rôle."
                              : "You cannot change your own role."
                            : undefined
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-input border border-border text-foreground text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {/* Read-only observation — no token minted, nothing written
                            anywhere. Kept visually neutral (gray) on purpose, so it
                            never reads as the same action as "Act as" below. */}
                        <button
                          type="button"
                          onClick={() => void handleInspect(profile)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground hover:text-foreground text-xs transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {isFr ? "Inspecter" : "Inspect"}
                        </button>
                        {/* Mints a real, time-boxed session (start_impersonation()) —
                            writes made after this attribute to BOTH identities. Red
                            hover + a distinct icon so it cannot be mistaken for
                            Inspect above. */}
                        <button
                          type="button"
                          onClick={() => setActAsTarget(profile)}
                          disabled={profile.id === user?.id}
                          title={
                            profile.id === user?.id
                              ? isFr
                                ? "Vous ne pouvez pas agir en tant que vous-même."
                                : "You cannot act as yourself."
                              : undefined
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        >
                          <UserCog className="w-3.5 h-3.5" />
                          {isFr ? "Agir en tant que" : "Act as"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {visibleProfiles.length === 0 && (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                {isFr ? "Aucun compte." : "No accounts."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Tables ───────────────────────────────────────────────────────── */}
      {tab === "tables" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {OWNER_TABLES.map((table) => (
              <button
                key={table}
                type="button"
                onClick={() => {
                  setActiveTable(table);
                  setTablePage(0);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-mono transition-colors duration-200",
                  activeTable === table
                    ? "bg-primary/15 text-red-400 border border-primary/30"
                    : "surface text-muted-foreground hover:text-foreground",
                )}
              >
                {table}
                {!isWritable(table) && <span className="ml-1.5 opacity-60">RO</span>}
              </button>
            ))}
          </div>

          <div className="surface overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="border-b border-border text-left">
                  {tableColumns.map((column) => (
                    <Th key={column}>
                      <span className="font-mono">{column}</span>
                    </Th>
                  ))}
                  {isWritable(activeTable) && <Th className="text-right">—</Th>}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, index) => (
                  <tr
                    key={typeof row.id === "string" ? row.id : index}
                    className="border-b border-border/60 last:border-0 hover:bg-white/[0.03] transition-colors"
                  >
                    {tableColumns.map((column) => (
                      <td key={column} className="px-4 py-2.5 text-muted-foreground">
                        <span className="block max-w-[240px] truncate font-mono">
                          {formatCell(row[column])}
                        </span>
                      </td>
                    ))}
                    {isWritable(activeTable) && (
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setPendingDeletion(row)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          aria-label={isFr ? "Supprimer" : "Delete"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {tableRows.length === 0 && (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                {isFr ? "Table vide." : "Table is empty."}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-mono">
              {tablePage * PAGE_SIZE + 1}–{tablePage * PAGE_SIZE + tableRows.length} / {tableTotal}
            </span>
            <div className="flex gap-2">
              <PagerButton
                disabled={tablePage === 0}
                onClick={() => setTablePage((page) => Math.max(0, page - 1))}
              >
                {isFr ? "Précédent" : "Previous"}
              </PagerButton>
              <PagerButton
                disabled={(tablePage + 1) * PAGE_SIZE >= tableTotal}
                onClick={() => setTablePage((page) => page + 1)}
              >
                {isFr ? "Suivant" : "Next"}
              </PagerButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Audit ────────────────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div className="surface divide-y divide-border">
          {auditTrail.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {isFr ? "Journal vide." : "Audit trail is empty."}
            </p>
          ) : (
            auditTrail.map((entry) => (
              <div key={entry.id} className="px-4 py-3 flex items-start gap-3">
                <span
                  className={cn(
                    "shrink-0 mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide",
                    entry.action.startsWith("owner_")
                      ? "bg-red-500/15 text-red-400"
                      : "bg-white/[0.07] text-muted-foreground",
                  )}
                >
                  {entry.action}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-mono truncate">
                    {entry.entity_type}
                    {entry.entity_id ? ` · ${entry.entity_id.slice(0, 8)}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString(isFr ? "fr-FR" : "en-GB")}
                    {entry.actor_id ? ` · ${entry.actor_id.slice(0, 8)}` : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Snapshot drawer ──────────────────────────────────────────────── */}
      {snapshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="surface-raised w-full max-w-md p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display font-extrabold text-lg text-foreground">
                  {snapshot.profile?.full_name || (isFr ? "Compte" : "Account")}
                </h2>
                <p className="text-[11px] font-mono text-muted-foreground break-all">
                  {snapshot.profile?.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSnapshot(null)}
                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground transition-colors"
                aria-label={isFr ? "Fermer" : "Close"}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-2">
              <SnapshotStat label={isFr ? "Inscriptions" : "Enrolments"} value={snapshot.enrollments} />
              <SnapshotStat label={isFr ? "Séances" : "Schedule"} value={snapshot.scheduleEntries} />
              <SnapshotStat label={isFr ? "Rendus" : "Submissions"} value={snapshot.submissions} />
            </dl>

            <p className="text-xs text-muted-foreground">
              {isFr ? "Dernière synchro : " : "Last synced: "}
              {snapshot.lastSyncedAt
                ? new Date(snapshot.lastSyncedAt).toLocaleString(isFr ? "fr-FR" : "en-GB")
                : isFr ? "jamais" : "never"}
            </p>
          </motion.div>
        </div>
      )}

      {/* ── Act as dialog ────────────────────────────────────────────────── */}
      {actAsTarget && (
        <ActAsDialog
          profile={actAsTarget}
          isFr={isFr}
          onClose={() => setActAsTarget(null)}
        />
      )}
      <AlertDialog open={pendingDeletion !== null} onOpenChange={(open) => !open && setPendingDeletion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isFr ? "Supprimer cette ligne ?" : "Delete this row?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isFr ? `Cette ligne sera supprimée définitivement de ${activeTable}. L'action sera enregistrée dans le journal d'audit.` : `This row will be permanently removed from ${activeTable}. The action will be written to the audit trail.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isFr ? "Annuler" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (pendingDeletion) void confirmDeleteRow(pendingDeletion); }}>
              {isFr ? "Supprimer définitivement" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

/**
 * "Act as" confirmation dialog — mints a real start_impersonation() session,
 * unlike the read-only Inspect snapshot above. Requires a typed reason
 * (3–500 chars, matching impersonation_sessions.reason's CHECK) before the
 * confirm button enables, and states plainly that actions taken afterward
 * are attributed to both identities in the audit trail.
 *
 * Same accessibility shape as ExamReportDialog.tsx (role="dialog",
 * aria-modal, labelled heading, Tab focus trap, Escape to close, focus
 * moved in on open and restored on close) — duplicated locally rather than
 * importing from that file, which isn't in this page's edit scope and
 * doesn't export these pieces.
 */
function ActAsDialog({
  profile,
  isFr,
  onClose,
}: {
  profile: Profile;
  isFr: boolean;
  onClose: () => void;
}) {
  const headingId = useId();
  const descId = useId();
  const reasonId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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
  }, [onClose]);

  const trimmedLength = reason.trim().length;
  const showsTooShort = trimmedLength > 0 && trimmedLength < REASON_MIN_LENGTH;
  const canSubmit = !isSubmitting && trimmedLength >= REASON_MIN_LENGTH && trimmedLength <= REASON_MAX_LENGTH;
  const errorId = `${reasonId}-error`;

  async function handleConfirm() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    const { error } = await startImpersonation(profile.id, reason.trim());
    if (error) {
      toast.error(
        isFr ? "Impossible de démarrer l'emprunt d'identité." : "Could not start impersonating.",
      );
      setIsSubmitting(false);
      return;
    }
    track("owner_impersonation_started");
    // Full reload, not a client-side route change: current_impersonation()
    // must be re-read everywhere (banner included) and every already-loaded
    // page needs to re-render as the new effective identity.
    window.location.reload();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose();
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
        className="surface-raised w-full max-w-md p-6 space-y-4 outline-none max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="eyebrow text-red-400">
              <UserCog className="w-3.5 h-3.5" />
              {isFr ? "Emprunt d'identité" : "Impersonation"}
            </span>
            <h2 id={headingId} className="mt-1 font-display font-extrabold text-lg text-foreground truncate">
              {isFr ? "Agir en tant que " : "Act as "}
              {profile.full_name || profile.id.slice(0, 8)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label={isFr ? "Fermer" : "Close"}
            className="shrink-0 p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p id={descId} className="text-xs text-muted-foreground leading-relaxed">
          {isFr
            ? "Contrairement à « Inspecter », ceci ouvre une vraie session, valable 30 minutes maximum : vous agirez comme ce compte, et toute action que vous effectuerez sera enregistrée dans le journal d'audit sous VOS DEUX identités."
            : "Unlike Inspect, this opens a real session — active for up to 30 minutes — during which you act as this account. Anything you do is written to the audit trail under BOTH your identity and theirs."}
        </p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={reasonId} className="block text-xs font-semibold text-muted-foreground">
              {isFr
                ? "Motif (obligatoire, 3 à 500 caractères)"
                : "Reason (required, 3–500 characters)"}
            </label>
            <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
              {trimmedLength}/{REASON_MAX_LENGTH}
            </span>
          </div>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX_LENGTH))}
            rows={3}
            maxLength={REASON_MAX_LENGTH}
            placeholder={
              isFr
                ? "Ex. : dépannage d'un ticket support, à la demande de l'utilisateur…"
                : "E.g. troubleshooting a support ticket, at the user's request…"
            }
            className="w-full px-3.5 py-2.5 rounded-lg bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 resize-none"
            aria-describedby={showsTooShort ? errorId : undefined}
            aria-invalid={showsTooShort}
          />
          {showsTooShort && (
            <p id={errorId} className="text-[11px] text-destructive">
              {isFr
                ? `Encore ${REASON_MIN_LENGTH - trimmedLength} caractère${REASON_MIN_LENGTH - trimmedLength > 1 ? "s" : ""} au minimum.`
                : `${REASON_MIN_LENGTH - trimmedLength} more character${REASON_MIN_LENGTH - trimmedLength > 1 ? "s" : ""} needed.`}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-sm font-display font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            {isFr ? "Annuler" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-red text-white font-display font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isFr ? "Commencer" : "Start acting as"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface px-4 py-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </p>
      <p className="mt-1 font-display font-extrabold text-3xl text-foreground tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function SnapshotStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface px-3 py-2.5">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </dt>
      <dd className="font-display font-bold text-xl text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

function PagerButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-lg surface text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.06] transition-colors"
    >
      {children}
    </button>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
