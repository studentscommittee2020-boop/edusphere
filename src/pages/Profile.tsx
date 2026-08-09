import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Mail,
  GraduationCap,
  Calendar,
  Globe,
  Library,
  Clock,
  Trash2,
  LogOut,
  ChevronRight,
  AlertTriangle,
  Package,
  ArrowLeft,
  KeyRound,
  Moon,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAppStore } from "@/store/appStore";
import { supabase } from "@/lib/supabase";
import { courseTitle } from "@/services/academics";
import { getDoctorCourses, type DoctorCourseWithCourse } from "@/services/teaching";
import type { Profile as UserProfile, StudentEnrollment } from "@/types/database";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const enrollmentStatusColors: Record<string, string> = {
  enrolled: "bg-blue-500/20 text-blue-400",
  completed: "bg-green-500/20 text-green-400",
  withdrawn: "bg-muted text-muted-foreground",
  failed: "bg-red-500/20 text-red-400",
};

type EditableProfileSettings = {
  full_name: string;
  phone: string;
  major: NonNullable<UserProfile["major"]> | "";
  semester: NonNullable<UserProfile["semester"]> | "";
  track: NonNullable<UserProfile["track"]> | "";
};

// ── Component ────────────────────────────────────────────────────────────────

export default function Profile() {
  const navigate = useNavigate();
  const { user, profile, isAuthenticated, isLoading, hasMfaFactor, signOut, updateProfile } = useAuth();
  const { language, theme, setLanguage, setTheme } = useAppStore();
  const isFr = language === "fr";

  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [teachingAssignments, setTeachingAssignments] = useState<DoctorCourseWithCourse[]>([]);
  const [activeTab, setActiveTab] = useState<"profile" | "courses">("profile");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<EditableProfileSettings>({ full_name: "", phone: "", major: "", semester: "", track: "" });

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/auth", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Load user data
  useEffect(() => {
    if (!user) return;
    if (profile?.role === "student") {
      supabase
        .from("student_enrollments")
        .select("*")
        .eq("student_id", user.id)
        .order("academic_year", { ascending: false })
        .then(({ data }) => setEnrollments(data ?? []));
    } else {
      setEnrollments([]);
    }
    if (profile?.role === "doctor") {
      getDoctorCourses(user.id).then(({ data }) => setTeachingAssignments(data));
    } else {
      setTeachingAssignments([]);
    }
  }, [user, profile?.role]);

  useEffect(() => {
    setSettings({
      full_name: profile?.full_name ?? "",
      phone: profile?.phone ?? "",
      major: profile?.major ?? "",
      semester: profile?.semester ?? "",
      track: profile?.track ?? "",
    });
  }, [profile]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleDeleteAccount() {
    if (deleteConfirm !== "DELETE" || !user) return;

    // Impersonation deliberately does NOT redirect reads (migration 012 keeps
    // RLS on the real identity), so this page still shows — and this button
    // still deletes — the SIGNED-IN owner's own profile, not the impersonated
    // target's. With a banner overhead saying "Acting as <someone else>", that
    // is a trap: you would be one confirmation away from deleting your own
    // account while believing you were acting as another user. Refuse outright
    // rather than rely on the operator noticing.
    const { data: session } = await supabase.rpc("current_impersonation");
    if (session) {
      toast.error(
        isFr
          ? "Arrêtez l'usurpation avant de supprimer un compte. Cette action porterait sur VOTRE compte, pas sur celui que vous incarnez."
          : "Stop impersonating before deleting an account. This would delete YOUR account, not the one you are acting as.",
      );
      return;
    }

    setDeleting(true);
    try {
      // Delete profile (cascades registrations and other owned portal rows via RLS)
      await supabase.from("profiles").delete().eq("id", user.id);
      await signOut();
      navigate("/", { replace: true });
    } catch {
      setDeleting(false);
    }
  }

  async function handleSaveName() {
    if (!editName.trim()) return;
    await updateProfile({ full_name: editName.trim() });
    setEditing(false);
  }

  async function handleSaveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!settings.full_name.trim()) {
      toast.error(isFr ? "Ajoutez votre nom." : "Add your name.");
      return;
    }
    setSavingSettings(true);
    const { error } = await updateProfile({
      full_name: settings.full_name.trim(),
      phone: settings.phone.trim() || null,
      ...(profile?.role === "student"
        ? {
            major: settings.major || null,
            semester: settings.semester || null,
            track: settings.track || null,
          }
        : {}),
    });
    setSavingSettings(false);
    if (error) {
      toast.error(isFr ? "Impossible d'enregistrer les paramètres." : "Could not save settings.");
      return;
    }
    toast.success(isFr ? "Profil mis à jour." : "Profile updated.");
  }

  async function handlePasswordReset() {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/auth` });
    if (error) toast.error(error.message);
    else toast.success(isFr ? "Un lien de réinitialisation a été envoyé." : "A password-reset link has been sent.");
  }

  function handleMfaSetup() {
    navigate("/auth", { state: { next: "/profile", setupMfa: true } });
  }

  async function handleSignOut() {
    await signOut();
    navigate("/auth", { replace: true });
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const isStudentProfile = profile?.role === "student";
  const isDoctorProfile = profile?.role === "doctor";
  const tabs = [
    { id: "profile" as const, label: isFr ? "Profil" : "Profile", icon: User },
    ...(isStudentProfile
      ? [{ id: "courses" as const, label: isFr ? "Mes Cours" : "My Courses", icon: Library }]
      : []),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <nav className="flex items-center justify-between border-b border-border/70 pb-4" aria-label={isFr ? "Navigation du profil" : "Profile navigation"}>
        <button type="button" onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/")} className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card/70 py-1.5 pl-1.5 pr-4 text-sm font-display font-semibold text-muted-foreground shadow-sm transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground">
          <span className="flex size-8 items-center justify-center rounded-full bg-muted transition group-hover:bg-primary/15"><ArrowLeft className="size-4" /></span>{isFr ? "Retour au portail" : "Back to portal"}
        </button>
        <span className="hidden text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground sm:inline">{isFr ? "Paramètres du compte" : "Account settings"}</span>
      </nav>
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-red flex items-center justify-center shrink-0">
          <span className="text-white text-2xl font-bold font-display">
            {profile?.full_name?.charAt(0)?.toUpperCase() ?? "U"}
          </span>
        </div>
        <div className="min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-input border border-border rounded-lg px-3 py-1.5 text-foreground text-lg font-display font-bold focus:outline-none focus:ring-2 focus:ring-red-500/50"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
              />
              <button
                onClick={handleSaveName}
                className="px-3 py-1.5 rounded-lg bg-gradient-red text-white text-sm font-bold"
              >
                {isFr ? "Sauver" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-muted-foreground text-sm"
              >
                {isFr ? "Annuler" : "Cancel"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setEditName(profile?.full_name ?? "");
                setEditing(true);
              }}
              className="group"
            >
              <h1 className="font-display font-extrabold text-2xl text-foreground group-hover:text-red-400 transition-colors">
                {profile?.full_name || (isFr ? "Utilisateur" : "User")}
              </h1>
            </button>
          )}
          <p className="text-muted-foreground text-sm truncate">
            {user?.email}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 surface p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-display font-semibold transition-all duration-200 ${
              activeTab === tab.id
                ? "bg-gradient-red text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === "profile" && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <form onSubmit={handleSaveSettings} className="space-y-5">
              <section className="surface p-5 sm:p-6">
                <div className="mb-5 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10"><Settings2 className="size-5 text-primary" /></span><div><h2 className="font-display text-lg font-bold text-foreground">{isFr ? "Informations du profil" : "Profile details"}</h2><p className="text-xs text-muted-foreground">{isFr ? "Vos informations académiques et de contact." : "Your academic and contact information."}</p></div></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2"><span className="mb-2 block text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground">{isFr ? "Nom complet" : "Full name"}</span><input value={settings.full_name} onChange={(event) => setSettings((current) => ({ ...current, full_name: event.target.value }))} required className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40" /></label>
                  <label className="block"><span className="mb-2 block text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground">{isFr ? "Téléphone" : "Phone number"}</span><div className="relative"><Smartphone className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input type="tel" inputMode="tel" autoComplete="tel" value={settings.phone} onChange={(event) => setSettings((current) => ({ ...current, phone: event.target.value }))} placeholder="+961 70 123 456" className="w-full rounded-xl border border-border bg-input py-3 pl-11 pr-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40" /></div></label>
                  {isStudentProfile && <>
                    <label className="block"><span className="mb-2 block text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground">{isFr ? "Filière" : "Major"}</span><select value={settings.major} onChange={(event) => setSettings((current) => ({ ...current, major: event.target.value as EditableProfileSettings["major"] }))} className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"><option value="">{isFr ? "Non défini" : "Not set"}</option><option value="Common">Common</option><option value="Management">Management</option><option value="Marketing">Marketing</option><option value="Audit & Accounting">Audit & Accounting</option><option value="Finance">Finance</option><option value="MIS">MIS</option></select></label>
                    <label className="block"><span className="mb-2 block text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground">{isFr ? "Semestre" : "Semester"}</span><select value={settings.semester} onChange={(event) => setSettings((current) => ({ ...current, semester: event.target.value as EditableProfileSettings["semester"] }))} className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"><option value="">{isFr ? "Non défini" : "Not set"}</option>{["LS1", "LS2", "LS3", "LS4", "LS5", "LS6", "LS7", "LS8", "LS9"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                    <label className="block"><span className="mb-2 block text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground">{isFr ? "Langue d'enseignement" : "Teaching language"}</span><select value={settings.track} onChange={(event) => setSettings((current) => ({ ...current, track: event.target.value as "" | "french" | "english" }))} className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"><option value="">{isFr ? "Non défini" : "Not set"}</option><option value="french">{isFr ? "Français" : "French"}</option><option value="english">{isFr ? "Anglais" : "English"}</option></select></label>
                  </>}
                </div>
                <div className="mt-5 flex justify-end"><button type="submit" disabled={savingSettings} className="btn-primary min-h-11 px-5 text-sm disabled:opacity-50">{savingSettings ? (isFr ? "Enregistrement…" : "Saving…") : (isFr ? "Enregistrer les modifications" : "Save changes")}</button></div>
              </section>

              <section className="surface p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10"><ShieldCheck className="size-5 text-primary" /></span><div><h2 className="font-display text-lg font-bold text-foreground">{isFr ? "Sécurité du compte" : "Account security"}</h2><p className="text-xs text-muted-foreground">{isFr ? "L'application d'authentification est facultative." : "The authenticator app is optional."}</p></div></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">{isFr ? "Adresse e-mail" : "Email address"}</p><p className="mt-1 truncate text-sm font-medium text-foreground">{user?.email ?? "—"}</p></div>
                  <div className="rounded-xl border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">{isFr ? "Application d'authentification" : "Authenticator app"}</p><p className="mt-1 text-sm font-medium text-foreground">{hasMfaFactor ? (isFr ? "Activée · facultative" : "Enabled · optional") : (isFr ? "Non activée · facultative" : "Not enabled · optional")}</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!hasMfaFactor && <button type="button" onClick={handleMfaSetup} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-display font-bold text-foreground hover:bg-primary/15"><ShieldCheck className="size-4" />{isFr ? "Activer l'authentificateur" : "Enable authenticator"}</button>}
                  <button type="button" onClick={() => void handlePasswordReset()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-display font-bold text-foreground hover:bg-muted"><KeyRound className="size-4" />{isFr ? "Envoyer un lien de réinitialisation" : "Send password-reset link"}</button>
                </div>
              </section>

              <section className="surface p-5 sm:p-6"><div className="mb-4 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10"><Globe className="size-5 text-primary" /></span><div><h2 className="font-display text-lg font-bold text-foreground">{isFr ? "Préférences" : "Preferences"}</h2><p className="text-xs text-muted-foreground">{isFr ? "Ces choix sont enregistrés dans ce navigateur." : "These choices are saved in this browser."}</p></div></div><div className="grid gap-4 sm:grid-cols-2"><div><p className="mb-2 text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground">{isFr ? "Langue de l'interface" : "Interface language"}</p><div className="flex rounded-xl bg-muted p-1"><button type="button" onClick={() => setLanguage("en")} className={`min-h-10 flex-1 rounded-lg text-sm font-semibold ${language === "en" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>English</button><button type="button" onClick={() => setLanguage("fr")} className={`min-h-10 flex-1 rounded-lg text-sm font-semibold ${language === "fr" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Français</button></div></div><div><p className="mb-2 text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground">{isFr ? "Apparence" : "Appearance"}</p><div className="flex rounded-xl bg-muted p-1"><button type="button" onClick={() => setTheme("dark")} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold ${theme === "dark" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}><Moon className="size-4" />{isFr ? "Sombre" : "Dark"}</button><button type="button" onClick={() => setTheme("light")} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold ${theme === "light" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}><Sun className="size-4" />{isFr ? "Contraste" : "High contrast"}</button></div></div></div></section>
            </form>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoCard
                icon={Mail}
                label={isFr ? "Email" : "Email"}
                value={user?.email ?? "—"}
              />
              {isStudentProfile && <>
                <InfoCard
                  icon={GraduationCap}
                  label={isFr ? "Filiere" : "Major"}
                  value={profile?.major ?? (isFr ? "Non defini" : "Not set")}
                />
                <InfoCard
                  icon={Calendar}
                  label={isFr ? "Semestre" : "Semester"}
                  value={profile?.semester ?? (isFr ? "Non defini" : "Not set")}
                />
                <InfoCard
                  icon={GraduationCap}
                  label={isFr ? "Langue d'enseignement" : "Teaching language"}
                  value={profile?.track === "french" ? (isFr ? "Français" : "French") : profile?.track === "english" ? (isFr ? "Anglais" : "English") : "—"}
                />
              </>}
              <InfoCard
                icon={Globe}
                label={isFr ? "Langue de l'interface" : "Interface language"}
                value={language === "fr" ? "Français" : "English"}
              />
              <InfoCard
                icon={Clock}
                label={isFr ? "Membre depuis" : "Member since"}
                value={profile?.created_at ? formatDate(profile.created_at) : "—"}
              />
              {isStudentProfile && <InfoCard
                icon={Library}
                label={isFr ? "Cours inscrits" : "Enrolled courses"}
                value={String(enrollments.filter((e) => e.status === "enrolled").length)}
              />}
            </div>

            {isDoctorProfile && (
              <section className="surface p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-display text-lg font-bold text-foreground">{isFr ? "Cours enseignés" : "Teaching assignments"}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{isFr ? "Chaque cours conserve son semestre, sa filière et sa langue." : "Each course keeps its own semester, major, and teaching language."}</p>
                  </div>
                  <button type="button" onClick={() => navigate("/doctor")} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-display font-bold text-foreground hover:bg-primary/15">{isFr ? "Gérer les cours" : "Manage courses"}</button>
                </div>
                {teachingAssignments.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{isFr ? "Aucun cours vérifié pour le moment." : "No verified teaching assignments yet."}</p>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {teachingAssignments.map((assignment) => (
                      <article key={assignment.id} className="rounded-xl border border-border bg-muted/25 p-4">
                        <p className="font-display text-sm font-bold text-foreground">{assignment.courses ? courseTitle(assignment.courses) : assignment.course_id}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{assignment.semester} · {assignment.courses?.major ?? "—"} · {assignment.courses?.track === "french" ? "French" : "English"} · {assignment.academic_year}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Actions */}
            <div className="space-y-2 pt-4">
              <button
                onClick={handleSignOut}
                className="surface-interactive flex items-center gap-3 w-full px-4 py-3 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-display font-semibold text-sm">
                  {isFr ? "Se deconnecter" : "Sign Out"}
                </span>
                <ChevronRight className="w-4 h-4 ml-auto" />
              </button>

              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-red-500/[0.06] border border-red-500/20 text-red-400 hover:bg-red-500/[0.12] transition-all"
              >
                <Trash2 className="w-5 h-5" />
                <span className="font-display font-semibold text-sm">
                  {isFr ? "Supprimer mon compte" : "Delete my account"}
                </span>
                <ChevronRight className="w-4 h-4 ml-auto" />
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === "courses" && (
          <motion.div
            key="courses"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {enrollments.length === 0 ? (
              <EmptyState
                icon={Package}
                text={
                  isFr
                    ? "Aucun cours synchronisé. Actualisez depuis Mon Emploi du Temps."
                    : "No courses synced yet. Refresh from My Schedule."
                }
              />
            ) : (
              enrollments.map((enrollment) => (
                <div key={enrollment.id} className="surface p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground font-display font-bold text-sm">
                      {enrollment.semester} · {enrollment.academic_year}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        enrollmentStatusColors[enrollment.status] ??
                        "bg-muted text-muted-foreground"
                      }`}
                    >
                      {enrollment.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{formatDate(enrollment.synced_at)}</span>
                    {enrollment.grade !== null && (
                      <span className="text-foreground font-semibold">
                        {enrollment.grade}/100
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </motion.div>
        )}

      </AnimatePresence>

      {/* Delete account modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteModal(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="surface-raised p-6 max-w-sm w-full space-y-4">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
                <h3 className="text-center font-display font-extrabold text-lg text-foreground">
                  {isFr ? "Supprimer le compte ?" : "Delete account?"}
                </h3>
                <p className="text-center text-muted-foreground text-sm">
                  {isFr
                    ? "Cette action est irreversible. Tapez DELETE pour confirmer."
                    : "This action cannot be undone. Type DELETE to confirm."}
                </p>
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-foreground text-center text-sm font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeleteConfirm("");
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.06] text-muted-foreground text-sm font-display font-semibold hover:bg-white/[0.1] transition-all"
                  >
                    {isFr ? "Annuler" : "Cancel"}
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirm !== "DELETE" || deleting}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-display font-bold disabled:opacity-40 hover:bg-red-700 transition-all"
                  >
                    {deleting
                      ? isFr ? "Suppression..." : "Deleting..."
                      : isFr ? "Supprimer" : "Delete"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string;
}) {
  return (
    <div className="surface flex items-center gap-3 p-4">
      <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs font-display font-semibold uppercase tracking-wider">
          {label}
        </p>
        <p className="text-foreground text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof User; text: string }) {
  return (
    <div className="surface flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-primary" />
      </div>
      <p className="text-muted-foreground text-sm font-display font-semibold">{text}</p>
    </div>
  );
}
