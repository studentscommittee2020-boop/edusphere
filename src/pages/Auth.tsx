import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  requestStudentOtp,
  verifyStudentOtp,
  requestStaffOtp,
  verifyStaffOtp,
} from "@/services/studentAuth";
import { useAppStore } from "@/store/appStore";

type AuthMode = "student" | "verify" | "staff" | "forgot" | "staffOtp" | "staffOtpVerify" | "review";

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
  const { language } = useAppStore();
  const [mode, setMode] = useState<AuthMode>("student");
  const [email, setEmail] = useState("");
  const [fileNumber, setFileNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleStudentRequest(event: React.FormEvent) {
    event.preventDefault();
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

    toast.success("Student access confirmed.");
    navigate("/sessions", { replace: true });
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

    toast.success("Welcome back.");
    navigate("/", { replace: true });
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

    toast.success(t(language, "Bon retour.", "Welcome back."));
    navigate("/", { replace: true });
  }

  const title = {
    student: "Student access",
    verify: "Enter your code",
    staff: "Staff sign in",
    forgot: "Reset staff password",
    staffOtp: t(language, "Code de connexion", "Email code sign-in"),
    staffOtpVerify: t(language, "Entrez votre code", "Enter your code"),
    review: "Dean review access",
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
  }[mode];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-[0.18] pointer-events-none" />
      <div className="absolute -top-40 left-[10%] w-[540px] h-[540px] bg-red-600/[0.16] rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-40 right-[7%] w-[500px] h-[500px] bg-emerald-500/[0.11] rounded-full blur-[130px] pointer-events-none" />

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-5xl grid md:grid-cols-[0.9fr_1.1fr] overflow-hidden rounded-[2rem] border border-border glass shadow-2xl shadow-black/50 relative z-10"
      >
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
                    <span className="text-xs font-display font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Password</span>
                    <div className="relative"><Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required className={inputClass} /></div>
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

          {mode !== "verify" && mode !== "staffOtpVerify" && (
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
