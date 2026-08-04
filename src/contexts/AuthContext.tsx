import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import type { Profile } from "@/types/database";
import { getDevRole } from "@/lib/devAuth";
import { setSentryUser } from "@/lib/sentry";
import { setTelemetryUser } from "@/lib/telemetry";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ADMIN_REFRESH_MS = 5 * 60 * 1000; // re-check admin status every 5 min

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  /** Super-administrator. Implies isAdmin. Verified server-side via is_owner(). */
  isOwner: boolean;
  isDoctor: boolean;
  isCommitteeAdmin: boolean;
  isVerifiedStudent: boolean;
  isAuthenticated: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    metadata?: Partial<Pick<Profile, "major" | "semester" | "track">>
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (
    updates: Partial<Profile>
  ) => Promise<{ data: Profile | null; error: unknown }>;
  refreshProfile: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  // ── Dev-only role preview ───────────────────────────────────────────────
  // Read BEFORE the state below so the faked flags can seed the initial state
  // synchronously. Applying them in an effect instead left a window in which
  // `isLoading` was already false while the role flags were still at their
  // defaults — any route guard that evaluated during that window saw a guest
  // and redirected away. Whether you are authenticated must not depend on
  // effect ordering.
  //
  // `import.meta.env.DEV` is a build-time constant, so this whole branch is
  // removed from a production bundle — see src/lib/devAuth.ts. It fakes only
  // the client's view of who you are; every Supabase query still runs
  // unauthenticated and RLS still governs all data.
  const devAccount = import.meta.env.DEV ? getDevRole() : null;

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(devAccount?.profile ?? null);
  const [isLoading, setIsLoading] = useState(!devAccount);
  const [isAdmin, setIsAdmin] = useState(devAccount?.isAdmin ?? false);
  const [isOwner, setIsOwner] = useState(devAccount?.isOwner ?? false);
  const [isDoctor, setIsDoctor] = useState(devAccount?.isDoctor ?? false);
  const [isCommitteeAdmin, setIsCommitteeAdmin] = useState(
    devAccount?.isCommitteeAdmin ?? false,
  );
  const [isVerifiedStudent, setIsVerifiedStudent] = useState(
    devAccount?.isVerifiedStudent ?? false,
  );

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    return data as Profile | null;
  }, []);

  const checkAdmin = useCallback(async () => {
    const { data } = await supabase.rpc("is_admin");
    return !!data;
  }, []);

  // Owner status is never inferred from the local email — it is answered by the
  // database, which is also what enforces it. The UI flag is only for chrome.
  const checkOwner = useCallback(async () => {
    const { data } = await supabase.rpc("is_owner");
    return !!data;
  }, []);

  const loadSession = useCallback(
    async (sess: Session | null) => {
      if (sess?.user) {
        const [prof, adminFlag, ownerFlag] = await Promise.all([
          fetchProfile(sess.user.id),
          checkAdmin(),
          checkOwner(),
        ]);
        setUser(sess.user);
        setSession(sess);
        setProfile(prof);
        setIsAdmin(adminFlag || ownerFlag);
        setIsOwner(ownerFlag);

        // Identify the user to observability once, here, rather than at every
        // call site — this is the only place the session is authoritative.
        setSentryUser({
          id: sess.user.id,
          email: sess.user.email,
          role: ownerFlag ? "owner" : adminFlag ? "admin" : prof?.role ?? "student",
        });
        setTelemetryUser(sess.user.id);
        setIsDoctor(prof?.role === "doctor");
        setIsCommitteeAdmin(prof?.role === "committee_admin");
        setIsVerifiedStudent(
          adminFlag ||
            ownerFlag ||
            prof?.role === "doctor" ||
            prof?.role === "committee_admin" ||
            sess.user.app_metadata?.student_verified === true,
        );
      } else {
        setUser(null);
        setSession(null);
        setProfile(null);
        setSentryUser(null);
        setTelemetryUser(null);
        setIsAdmin(false);
        setIsOwner(false);
        setIsDoctor(false);
        setIsCommitteeAdmin(false);
        setIsVerifiedStudent(false);
      }
      setIsLoading(false);
    },
    [fetchProfile, checkAdmin, checkOwner]
  );

  // ── Boot: get existing session ───────────────────────────────────────────────

  useEffect(() => {
    // A dev role preview owns the auth state; letting the real "no session"
    // path run would immediately clear the faked flags back to guest.
    if (devAccount) return;

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      loadSession(sess);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      loadSession(sess);
    });

    return () => subscription.unsubscribe();
  }, [loadSession, devAccount]);

  // ── Idle timeout: auto-logout after 30 min inactivity ───────────────────────

  const idleTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!user) return;

    function resetIdle() {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(async () => {
        await supabase.auth.signOut();
      }, IDLE_TIMEOUT_MS);
    }

    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }));
    resetIdle(); // start timer

    return () => {
      clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, resetIdle));
    };
  }, [user]);

  // ── Periodic admin status refresh (every 5 min) ────────────────────────────

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      const [freshAdmin, freshOwner] = await Promise.all([checkAdmin(), checkOwner()]);
      setIsAdmin(freshAdmin || freshOwner);
      setIsOwner(freshOwner);
      setIsVerifiedStudent((current) => current || freshAdmin || freshOwner);
    }, ADMIN_REFRESH_MS);
    return () => clearInterval(interval);
  }, [user, checkAdmin, checkOwner]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      metadata?: Partial<Pick<Profile, "major" | "semester" | "track">>
    ) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            ...metadata,
          },
        },
      });
      return { error: error as Error | null };
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<Profile>) => {
      if (!user) return { data: null, error: new Error("Not authenticated") };
      // Strip role field to prevent privilege escalation
      const { role: _stripped, ...safeUpdates } = updates as Record<string, unknown>;
      const { data, error } = await supabase
        .from("profiles")
        .update(safeUpdates)
        .eq("id", user.id)
        .select()
        .single();
      if (data) setProfile(data as Profile);
      return { data: data as Profile | null, error };
    },
    [user]
  );

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const prof = await fetchProfile(user.id);
    if (prof) setProfile(prof);
  }, [user, fetchProfile]);

  // ── Context Value ────────────────────────────────────────────────────────────

  const value: AuthContextValue = {
    user,
    session,
    profile,
    isLoading,
    isAdmin,
    isOwner,
    isDoctor,
    isCommitteeAdmin,
    isVerifiedStudent,
    isAuthenticated: !!user || !!devAccount,
    signIn,
    signUp,
    signOut,
    updateProfile,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
