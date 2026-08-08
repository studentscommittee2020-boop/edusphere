import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  FileKey2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  Smartphone,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { canBypassReviewPhone } from "@/lib/reviewAccess";
import {
  requestStudentOtp,
  verifyStudentOtp,
  requestStaffOtp,
  verifyStaffOtp,
} from "@/services/studentAuth";
import { useAppStore } from "@/store/appStore";
import { useAuth } from "@/contexts/AuthContext";

type AuthMode = "student" | "verify" | "staff" | "forgot" | "staffOtp" | "staffOtpVerify" | "review" | "contact" | "mfaEnroll" | "mfaChallenge";

type ReviewAccount = {
  label: string;
  email: string;
  description: string;
};

// Temporary internal review access: this only reveals the role selector. Each
// account still signs in through Supabase with its password and receives its
// normal server-enforced permissions. Remove after the dean review.
const mockReviewEnabled = true;

const reviewAccounts: ReviewAccount[] = [
  { label: "Mock owner", email: "review-owner@edusphere.local", description: "Full owner console and audit access" },
  { label: "Admin reviewer", email: "review-admin@edusphere.local", description: "Platform administration and review oversight" },
  { label: "Student council", email: "review-committee@edusphere.local", description: "Council book upload and replacement review" },
  { label: "Dr. Review", email: "review-doctor@edusphere.local", description: "Assigned course-book confirmation or replacement" },
];

const inputClass =
  "w-full pl-11 pr-4 py-3.5 bg-input border border-border rounded-2xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/60 transition-all";

function normalizePhone(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

// Local FR/EN helper, matching the convention used across the rest of the app
// (see e.g. src/pages/About.tsx, src/pages/Index.tsx) — `language` from useAppStore()
// is INTERFACE language only, unrelated to what the visitor is signing in as.
const t = (lang: string, fr: string, en: string) => (lang === "fr" ? fr : en);

// Supabase's own AuthError already carries a stable `.code` (see
// @supabase/auth-js/dist/module/lib/error-codes.d.ts) — branch on that, not on
// `.message` text, which can change between server versions.
function describeStaffOtpRequestError(error: AuthError, language: string): string {
  if (isAuthRetryableFetchError(error)) {
    // Network-level failure — the request never reached Supabase at all (no
    // response, so no .code). Confirmed live: a blocked/unreachable network
    // surfaces exactly this, and it must not be reported as if the email was bad.
    return t(
      language,
      "Impossible de joindre le service de connexion. Vérifiez votre connexion et réessayez.",
      "Could not reach the sign-in service. Check your connection and try again.",
    );
  }

  switch (error.code) {
    case "email_address_not_authorized":
      // The single most likely failure during review launch: Supabase's default
      // SMTP only delivers to project members. Point at configuration, not the
      // email address the person typed.
      return t(
        language,
        "L'envoi d'e-mails n'est pas encore configuré pour ce projet (le SMTP par défaut de Supabase ne livre qu'aux membres du projet). Contactez un administrateur.",
        "Email sending isn't fully configured for this project yet (Supabase's default SMTP only delivers to project members). Contact an administrator.",
      );
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return t(
        language,
        "Trop de tentatives. Patientez quelques minutes avant de redemander un code.",
        "Too many attempts. Wait a few minutes before requesting another code.",
      );
    case "otp_disabled":
      return t(
        language,
        "La connexion par code n'est pas activée pour ce projet. Utilisez votre mot de passe ou contactez un administrateur.",
        "Passwordless sign-in isn't enabled for this project. Use your password or contact an administrator.",
      );
    case "signup_disabled":
    case "user_not_found":
      return t(
        language,
        "Aucun compte du personnel n'existe pour cette adresse. Demandez à un administrateur de créer votre compte.",
        "No staff account exists yet for that email. Ask an administrator to create your account.",
      );
    default:
      return (
        error.message ||
        t(language, "Impossible d'envoyer le code. Réessayez.", "We could not send the code. Try again.")
      );
  }
}

function describeStaffOtpVerifyError(error: AuthError, language: string): string {
  if (isAuthRetryableFetchError(error)) {
    return t(
      language,
      "Impossible de joindre le service de connexion. Vérifiez votre connexion et réessayez.",
      "Could not reach the sign-in service. Check your connection and try again.",
    );
  }

  switch (error.code) {
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return t(
        language,
        "Trop de tentatives. Patientez avant de réessayer.",
        "Too many attempts. Wait before trying again.",
      );
    case "otp_expired":
    default:
      // Supabase folds "wrong code" and "expired code" into the same otp_expired
      // code/message (invalid and expired tokens are indistinguishable server-side),
      // so a single message covers both — same wording the student flow already uses.
      return t(
        language,
        "Ce code est invalide ou a expiré. Demandez-en un nouveau.",
        "That code is invalid or has expired. Request a new one.",
      );
  }
}

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, theme, setTheme } = useAppStore();
  const { user, refreshProfile } = useAuth();
  const [mode, setMode] = useState<AuthMode>("student");
  const [email, setEmail] = useState("");
  const [fileNumber, setFileNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaQr, setMfaQr] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const nextPath = (location.state as { next?: string } | null)?.next || "/";
  const preparedReviewSelected = canBypassReviewPhone(email);

  const authBackLabel = (() => {
    if (mode === "staff" && preparedReviewSelected) return "Review accounts";
    if (mode === "forgot" || mode === "staffOtp") return "Staff sign in";
    if (mode === "staff" || mode === "review") return "Student access";
    return "Back to portal";
  })();

  function handleAuthBack() {
    setShowPassword(false);
    if (mode === "staff" && preparedReviewSelected) {
      setPassword("");
      setMode("review");
      return;
    }
    if (mode === "forgot" || mode === "staffOtp") {
      setMode("staff");
      return;
    }
    if (mode === "staff" || mode === "review") {
      setMode("student");
      return;
    }
    navigate("/");
  }

  /** Temporary shortcut for the four prepared dean/staff review accounts.
      The authenticated database role is still checked before it is applied. */
  async function isPreparedReviewAccount(): Promise<boolean> {
    const { data: { user: activeUser } } = await supabase.auth.getUser();
    if (!activeUser || !canBypassReviewPhone(activeUser.email)) return false;
    const [profileResult, adminResult, ownerResult] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", activeUser.id).single(),
      supabase.rpc("is_admin"),
      supabase.rpc("is_owner"),
    ]);
    const role = profileResult.data?.role;
    return Boolean(adminResult.data || ownerResult.data || role === "doctor" || role === "committee_admin" || role === "admin");
  }

  async function beginMfaFlow() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast.error("We could not check your authenticator setup. Please try again.");
      return;
    }
    const factor = data.totp.find((item) => item.status === "verified");
    if (factor) {
      setMfaFactorId(factor.id);
      setMode("mfaChallenge");
    } else {
      setMode("mfaEnroll");
    }
  }

  async function savePhoneAndBeginMfa() {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      toast.error("Enter a valid international phone number, for example +96170123456.");
      return false;
    }
    const { data: { user: activeUser } } = await supabase.auth.getUser();
    if (!activeUser) {
      toast.error("Your sign-in session expired. Please sign in again.");
      return false;
    }
    const { error } = await supabase.from("profiles").update({ phone: normalized }).eq("id", activeUser.id);
    if (error) {
      toast.error("We could not securely save your phone number. Please try again.");
      return false;
    }
    // Keep the route gate's profile snapshot in sync before MFA completes;
    // otherwise a newly saved phone can briefly look missing and redirect back
    // to this screen.
    await refreshProfile();
    await beginMfaFlow();
    return true;
  }

  async function continueStaffAuthentication(): Promise<boolean> {
    if (await isPreparedReviewAccount()) {
      await refreshProfile();
      await beginMfaFlow();
      return true;
    }
    return savePhoneAndBeginMfa();
  }

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("phone").eq("id", user.id).single().then(async ({ data }) => {
      if (!data?.phone && !(await isPreparedReviewAccount())) {
        setMode("contact");
        return;
      }
      setPhone(data?.phone ?? "");
      void beginMfaFlow();
    });
  }, [user?.id]);

  async function handleStudentRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!normalizePhone(phone)) {
      toast.error("Enter a valid international phone number, for example +96170123456.");
      return;
    }
    setIsLoading(true);
    const { error } = await requestStudentOtp(email, fileNumber);
    setIsLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setMode("verify");
    toast.success("A sign-in code has been sent to your student email.");
  }

  async function handleOtpVerification(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    const { error } = await verifyStudentOtp(email, otp);
    setIsLoading(false);

    if (error) {
      toast.error("That code is invalid or has expired. Request a new one.");
      return;
    }

    if (await savePhoneAndBeginMfa()) toast.success("Student access confirmed. Complete secure access below.");
  }

  async function handleStaffLogin(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setIsLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (await continueStaffAuthentication()) toast.success("Welcome back. Complete secure access below.");
  }

  async function handlePasswordReset(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth`,
    });
    setIsLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("A password reset link has been sent.");
      setMode("staff");
    }
  }

  // Staff passwordless (email OTP) — see src/services/studentAuth.ts for why this is
  // kept structurally separate from the student flow above (no file-number check, no
  // student-otp Edge Function call). shouldCreateUser:false lives in the service, not
  // here, so this handler can never accidentally omit it.
  async function handleStaffOtpRequest(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    const { error } = await requestStaffOtp(email);
    setIsLoading(false);

    if (error) {
      toast.error(describeStaffOtpRequestError(error, language));
      return;
    }

    setMode("staffOtpVerify");
    toast.success(t(language, "Un code de connexion a été envoyé.", "A sign-in code has been sent."));
  }

  async function handleStaffOtpVerification(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    const { error } = await verifyStaffOtp(email, staffCode);
    setIsLoading(false);
    // Clear the typed code immediately after the attempt, success or failure — it
    // must not linger in state any longer than the single verify call needs it.
    setStaffCode("");

    if (error) {
      toast.error(describeStaffOtpVerifyError(error, language));
      return;
    }

    if (await continueStaffAuthentication()) toast.success(t(language, "Bon retour. Finalisez l'accès sécurisé.", "Welcome back. Complete secure access below."));
  }

  async function handlePhoneSetup(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    await savePhoneAndBeginMfa();
    setIsLoading(false);
  }

  async function startAuthenticatorEnrollment() {
    setIsLoading(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "EduSphere authenticator",
    });
    setIsLoading(false);
    if (error || !data.totp) {
      toast.error(error?.message || "We could not start authenticator setup.");
      return;
    }
    setMfaFactorId(data.id);
    setMfaQr(data.totp.qr_code);
    setMfaSecret(data.totp.secret);
  }

  async function verifyAuthenticator(event: React.FormEvent) {
    event.preventDefault();
    if (!mfaFactorId || mfaCode.length !== 6) return;
    setIsLoading(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: mfaCode });
    setIsLoading(false);
    setMfaCode("");
    if (error) {
      toast.error("That authenticator code is invalid or expired. Try the current code.");
      return;
    }
    toast.success("Two-factor authentication confirmed.");
    navigate(nextPath, { replace: true });
  }

  const title = {
    student: "Student access",
    verify: "Enter your code",
    staff: "Staff sign in",
    forgot: "Reset staff password",
    staffOtp: t(language, "Code de connexion", "Email code sign-in"),
    staffOtpVerify: t(language, "Entrez votre code", "Enter your code"),
    review: "Dean review access",
    contact: "Add your contact number",
    mfaEnroll: "Set up your authenticator",
    mfaChallenge: "Verify your identity",
  }[mode];

  const description = {
    student: "Verify your university record, then use a one-time code to enter the session library.",
    verify: `We sent a six-digit code to ${email}.`,
    staff: "For doctors, committee administrators, and platform administrators.",
    forgot: "We will email a reset link to your staff account.",
    staffOtp: t(
      language,
      "Pour le personnel disposant déjà d'un compte. Nous vous enverrons un code à usage unique par e-mail.",
      "For staff who already have an account. We'll email you a one-time code instead of a password.",
    ),
    staffOtpVerify: t(language, `Nous avons envoyé un code à ${email}.`, `We sent a code to ${email}.`),
    review: "Choose a prepared review account. Its email is filled in for you; enter the temporary review password on the next screen.",
    contact: "A phone number is required for your EduSphere profile. It is not used to send sign-in codes.",
    mfaEnroll: "Use an authenticator app such as Google Authenticator, Microsoft Authenticator, Authy, or 1Password.",
    mfaChallenge: "Enter the current six-digit code from your authenticator app to continue.",
  }[mode];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-[0.18] pointer-events-none" />
      <div className="absolute -top-40 left-[10%] w-[540px] h-[540px] bg-red-600/[0.16] rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-40 right-[7%] w-[500px] h-[500px] bg-green-500/[0.11] rounded-full blur-[130px] pointer-events-none" />

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-5xl grid md:grid-cols-[0.9fr_1.1fr] overflow-hidden rounded-[2rem] border border-border glass shadow-2xl shadow-black/50 relative z-10"
      >
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="absolute right-5 top-5 z-20 rounded-xl border border-border bg-background/80 p-2 text-foreground transition-colors hover:bg-muted"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <section className="p-8 sm:p-10 md:p-12 bg-gradient-to-br from-red-600/20 via-red-950/20 to-transparent border-b md:border-b-0 md:border-r border-border flex flex-col justify-between min-h-[290px]">
          <div>
            <div className="inline-flex items-center gap-3">
              <img src="/logo.svg" alt="EduSphere logo" className="w-12 h-12 rounded-2xl bg-white p-1" />
              <div>
                <p className="font-display font-extrabold text-xl text-foreground">EduSphere</p>
                <p className="text-xs tracking-[0.18em] uppercase text-red-200/70">Academic Portal</p>
              </div>
            </div>

            <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-gradient-chrome leading-tight mt-12">
              Your verified route to every session file.
            </h1>
            <p className="text-sm leading-6 text-muted-foreground mt-5 max-w-sm">
              Student access is checked directly with the university. Your file number and university record are never saved in EduSphere.
            </p>
          </div>

          <div className="grid gap-3 mt-10">
            {[
              [Building2, "University record check"],
              [Mail, "One-time code through Resend"],
              [ShieldCheck, "Private, role-based resources"],
            ].map(([Icon, label]) => {
              const FeatureIcon = Icon as typeof Building2;
              return (
                <div key={label as string} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="w-9 h-9 rounded-xl bg-white/[0.08] border border-border flex items-center justify-center">
                    <FeatureIcon className="w-4 h-4 text-red-300" />
                  </span>
                  {label as string}
                </div>
              );
            })}
          </div>
        </section>

        <section className="p-8 sm:p-10 md:p-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.18 }}
            >
              {(mode === "student" || mode === "staff" || mode === "review" || mode === "forgot" || mode === "staffOtp") && (
                <button
                  type="button"
                  onClick={handleAuthBack}
                  className="group mb-7 inline-flex min-h-11 items-center gap-2.5 rounded-2xl border border-border bg-muted/35 py-1.5 pl-1.5 pr-4 text-sm font-medium text-muted-foreground shadow-sm transition hover:border-red-400/40 hover:bg-red-500/[0.07] hover:text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40"
                >
                  <span className="flex size-8 items-center justify-center rounded-xl border border-border bg-background/80 text-foreground transition-transform group-hover:-translate-x-0.5">
                    <ArrowLeft className="size-4" />
                  </span>
                  {authBackLabel}
                </button>
              )}

              {mode === "verify" && (
                <button
                  type="button"
                  onClick={() => setMode("student")}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-7"
                >
                  <ArrowLeft className="w-4 h-4" /> Change details
                </button>
              )}

              {mode === "staffOtpVerify" && (
                <button
                  type="button"
                  onClick={() => setMode("staffOtp")}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-7"
                >
                  <ArrowLeft className="w-4 h-4" /> {t(language, "Modifier l'adresse", "Change email")}
                </button>
              )}

              <div className="mb-8">
                <h2 className="font-display font-extrabold text-3xl text-foreground">{title}</h2>
                <p className="text-sm leading-6 text-muted-foreground mt-2">{description}</p>
              </div>

              {mode === "student" && (
                <form onSubmit={handleStudentRequest} className="space-y-4">
                  <label className="block">
                    <span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Student email</span>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.edu" required className={inputClass} />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">File number</span>
                    <div className="relative">
                      <FileKey2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      {/* data-sensitive is load-bearing, not decoration: Sentry
                          Session Replay runs with maskAllInputs:false, and
                          src/lib/sentry.ts masks only `[data-sensitive="true"]`.
                          Without it the file number — the one value the product
                          promises is never sent to Sentry — is captured verbatim
                          in replay. beforeSend does not help; it scrubs error
                          messages and URLs, not replay DOM. */}
                      <input
                        name="file_number"
                        data-sensitive="true"
                        autoComplete="off"
                        value={fileNumber}
                        onChange={(event) => setFileNumber(event.target.value)}
                        placeholder="Your university file number"
                        required
                        minLength={4}
                        maxLength={40}
                        className={inputClass}
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Mobile number</span>
                    <div className="relative">
                      <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input name="phone" data-sensitive="true" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+961 70 123 456" required className={inputClass} />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">Required for the portal test. It stays in this form until your email code is confirmed.</p>
                  </label>
                  <button type="submit" disabled={isLoading} className="w-full py-3.5 rounded-2xl bg-gradient-red text-white font-display font-bold flex items-center justify-center gap-2 transition hover:brightness-110 disabled:opacity-50 shadow-lg shadow-red-600/20">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Verify and send code <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </form>
              )}

              {mode === "verify" && (
                <form onSubmit={handleOtpVerification} className="space-y-5">
                  <label className="block">
                    <span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">One-time code</span>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input name="otp" data-sensitive="true" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required minLength={6} maxLength={6} className={`${inputClass} tracking-[0.5em] font-mono text-lg`} />
                    </div>
                  </label>
                  <button type="submit" disabled={isLoading || otp.length !== 6} className="w-full py-3.5 rounded-2xl bg-gradient-red text-white font-display font-bold flex items-center justify-center gap-2 transition hover:brightness-110 disabled:opacity-50 shadow-lg shadow-red-600/20">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Confirm access <BadgeCheck className="w-4 h-4" /></>}
                  </button>
                  <button type="button" onClick={() => setMode("student")} className="w-full text-sm text-red-300 hover:text-red-200">Request a new code</button>
                </form>
              )}

              {mode === "staff" && (
                <form onSubmit={handleStaffLogin} className="space-y-4">
                  <label className="block">
                    <span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Staff email</span>
                    <div className="relative"><Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className={inputClass} /></div>
                  </label>
                  <label className="block">
                    <span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Mobile number</span>
                    <div className="relative"><Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input name="phone" data-sensitive="true" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+961 70 123 456" required={!preparedReviewSelected} className={inputClass} /></div>
                    {preparedReviewSelected && <p className="mt-2 text-xs text-muted-foreground">Optional for this prepared review account only.</p>}
                  </label>
                  <label className="block">
                    <span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Password</span>
                    <div className="relative"><Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required className={`${inputClass} pr-12`} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
                  </label>
                  <div className="text-right"><button type="button" onClick={() => setMode("forgot")} className="text-sm text-red-300 hover:text-red-200">Forgot password?</button></div>
                  <button type="submit" disabled={isLoading} className="w-full py-3.5 rounded-2xl bg-white text-neutral-950 font-display font-bold flex items-center justify-center gap-2 transition hover:bg-neutral-200 disabled:opacity-50">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Sign in <ArrowRight className="w-4 h-4" /></>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("staffOtp")}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {t(language, "Recevoir un code par e-mail à la place", "Email me a code instead")}
                  </button>
                </form>
              )}

              {mode === "staffOtp" && (
                // Passwordless staff sign-in via Supabase's built-in email OTP.
                // Deliberately staff-only: no file-number field, no student-otp call.
                // See src/services/studentAuth.ts (requestStaffOtp) for why that
                // separation matters — this must never read as a student sign-in option.
                <form onSubmit={handleStaffOtpRequest} className="space-y-4">
                  <label className="block">
                    <span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">
                      {t(language, "E-mail du personnel", "Staff email")}
                    </span>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className={inputClass} />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Mobile number</span>
                    <div className="relative"><Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input name="phone" data-sensitive="true" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+961 70 123 456" required={!preparedReviewSelected} className={inputClass} /></div>
                    {preparedReviewSelected && <p className="mt-2 text-xs text-muted-foreground">Optional for this prepared review account only.</p>}
                  </label>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t(
                      language,
                      "Réservé au personnel dont le compte a déjà été créé par un administrateur. Les étudiants doivent utiliser la vérification universitaire ci-dessous.",
                      "For staff whose account an administrator has already created. Students should use the university verification option below.",
                    )}
                  </p>
                  <button type="submit" disabled={isLoading} className="w-full py-3.5 rounded-2xl bg-gradient-red text-white font-display font-bold flex items-center justify-center gap-2 transition hover:brightness-110 disabled:opacity-50 shadow-lg shadow-red-600/20">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{t(language, "Envoyer le code", "Send code")} <ArrowRight className="w-4 h-4" /></>}
                  </button>
                  <button type="button" onClick={() => setMode("staff")} className="w-full text-sm text-muted-foreground hover:text-foreground">
                    {t(language, "Utiliser un mot de passe à la place", "Use a password instead")}
                  </button>
                </form>
              )}

              {mode === "staffOtpVerify" && (
                <form onSubmit={handleStaffOtpVerification} className="space-y-5">
                  <label className="block">
                    <span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">
                      {t(language, "Code à usage unique", "One-time code")}
                    </span>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        name="otp"
                        data-sensitive="true"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={staffCode}
                        onChange={(event) => setStaffCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        required
                        minLength={6}
                        maxLength={6}
                        className={`${inputClass} tracking-[0.5em] font-mono text-lg`}
                      />
                    </div>
                  </label>
                  <button type="submit" disabled={isLoading || staffCode.length !== 6} className="w-full py-3.5 rounded-2xl bg-gradient-red text-white font-display font-bold flex items-center justify-center gap-2 transition hover:brightness-110 disabled:opacity-50 shadow-lg shadow-red-600/20">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{t(language, "Confirmer l'accès", "Confirm access")} <BadgeCheck className="w-4 h-4" /></>}
                  </button>
                  <button type="button" onClick={() => setMode("staffOtp")} className="w-full text-sm text-red-300 hover:text-red-200">
                    {t(language, "Demander un nouveau code", "Request a new code")}
                  </button>
                </form>
              )}

              {mode === "forgot" && (
                <form onSubmit={handlePasswordReset} className="space-y-5">
                  <div className="relative"><Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Staff email" required className={inputClass} /></div>
                  <button type="submit" disabled={isLoading} className="w-full py-3.5 rounded-2xl bg-white text-neutral-950 font-display font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send reset link"}
                  </button>
                  <button type="button" onClick={() => setMode("staff")} className="w-full text-sm text-muted-foreground hover:text-foreground">Back to staff sign in</button>
                </form>
              )}

              {mode === "contact" && (
                <form onSubmit={handlePhoneSetup} className="space-y-5">
                  <label className="block">
                    <span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Mobile number</span>
                    <div className="relative"><Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input name="phone" data-sensitive="true" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+961 70 123 456" required className={inputClass} /></div>
                  </label>
                  <button type="submit" disabled={isLoading} className="w-full py-3.5 rounded-2xl bg-gradient-red text-white font-display font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </form>
              )}

              {mode === "mfaEnroll" && (
                <div className="space-y-5">
                  {!mfaQr ? (
                    <button type="button" onClick={startAuthenticatorEnrollment} disabled={isLoading} className="w-full py-3.5 rounded-2xl bg-gradient-red text-white font-display font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ShieldCheck className="w-4 h-4" /> Set up authenticator</>}
                    </button>
                  ) : (
                    <form onSubmit={verifyAuthenticator} className="space-y-5">
                      <div className="rounded-2xl bg-white p-4 mx-auto w-fit"><img src={`data:image/svg+xml;utf8,${encodeURIComponent(mfaQr)}`} alt="Authenticator setup QR code" className="w-48 h-48" /></div>
                      <p className="text-xs text-muted-foreground text-center">Can't scan it? Add this setup key manually: <span className="font-mono text-foreground break-all">{mfaSecret}</span></p>
                      <label className="block"><span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Authenticator code</span><div className="relative"><KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input name="mfa_code" data-sensitive="true" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required minLength={6} maxLength={6} className={`${inputClass} tracking-[0.5em] font-mono text-lg`} /></div></label>
                      <button type="submit" disabled={isLoading || mfaCode.length !== 6} className="w-full py-3.5 rounded-2xl bg-gradient-red text-white font-display font-bold flex items-center justify-center gap-2 disabled:opacity-50">{isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Enable two-factor authentication <BadgeCheck className="w-4 h-4" /></>}</button>
                    </form>
                  )}
                </div>
              )}

              {mode === "mfaChallenge" && (
                <form onSubmit={verifyAuthenticator} className="space-y-5">
                  <label className="block"><span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Authenticator code</span><div className="relative"><KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input name="mfa_code" data-sensitive="true" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required minLength={6} maxLength={6} className={`${inputClass} tracking-[0.5em] font-mono text-lg`} /></div></label>
                  <button type="submit" disabled={isLoading || mfaCode.length !== 6} className="w-full py-3.5 rounded-2xl bg-gradient-red text-white font-display font-bold flex items-center justify-center gap-2 disabled:opacity-50">{isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Verify and continue <BadgeCheck className="w-4 h-4" /></>}</button>
                </form>
              )}

              {mode === "review" && (
                <div className="space-y-3">
                  {reviewAccounts.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => {
                        setEmail(account.email);
                        setPassword("");
                        setMode("staff");
                      }}
                      className="w-full rounded-2xl border border-border bg-white/[0.03] px-4 py-4 text-left transition hover:border-red-400/60 hover:bg-red-500/[0.08] focus:outline-none focus:ring-2 focus:ring-red-500/40"
                    >
                      <span className="flex items-center justify-between gap-4">
                        <span>
                          <span className="block font-display font-bold text-foreground">{account.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{account.description}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-red-300" />
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMode("staff")}
                    className="w-full pt-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back to standard staff sign in
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {mode !== "verify" && mode !== "staffOtpVerify" && mode !== "contact" && mode !== "mfaEnroll" && mode !== "mfaChallenge" && (
            <div className="mt-8 pt-6 border-t border-border text-center text-sm text-muted-foreground">
              {mode === "staff" || mode === "forgot" || mode === "staffOtp" || mode === "review" ? (
                <button onClick={() => setMode("student")} className="text-red-300 hover:text-red-200">Student sign in</button>
              ) : (
                <div className="space-y-3">
                  <button onClick={() => setMode("staff")} className="block w-full text-muted-foreground hover:text-foreground">Staff member? Sign in here</button>
                  {mockReviewEnabled && (
                    <button onClick={() => setMode("review")} className="text-red-300 hover:text-red-200">Dean review access</button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </motion.main>
    </div>
  );
}
