import { motion } from "framer-motion";
import { BarChart3, Cookie, Database, Server, ShieldCheck } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { denyAnalyticsConsent, grantAnalyticsConsent, hasAnalyticsConsent } from "@/lib/posthog";
import { clearTelemetryState, track } from "@/lib/telemetry";

export default function Privacy() {
  const { language } = useAppStore();
  const isFr = language === "fr";
  const analyticsAllowed = hasAnalyticsConsent();

  const sections = [
    {
      icon: Cookie,
      titleEn: "Your choice",
      titleFr: "Votre choix",
      bodyEn: "Optional product analytics are off until you choose Allow analytics. Essential Supabase authentication storage is still used to keep an authenticated session working.",
      bodyFr: "Les analyses facultatives sont désactivées tant que vous ne choisissez pas Autoriser les analyses. Le stockage d'authentification Supabase indispensable reste utilisé pour maintenir votre session.",
    },
    {
      icon: BarChart3,
      titleEn: "Limited product analytics",
      titleFr: "Analyses produit limitées",
      bodyEn: "If you opt in, EduSphere records curated product events such as page views and feature use in our first-party telemetry and PostHog. Automatic click capture, form capture, and session replay are disabled.",
      bodyFr: "Si vous acceptez, EduSphere enregistre des événements produit sélectionnés, comme les pages visitées et l'usage des fonctionnalités, dans notre télémétrie interne et PostHog. La capture automatique des clics, des formulaires et la relecture de session sont désactivées.",
    },
    {
      icon: ShieldCheck,
      titleEn: "What never enters analytics",
      titleFr: "Ce qui n'entre jamais dans les analyses",
      bodyEn: "We do not send student file numbers, one-time codes, passwords, phone numbers, email addresses, uploaded documents, assignment content, or university API responses to analytics. Your file number is used only in memory to verify eligibility, then discarded.",
      bodyFr: "Nous n'envoyons jamais aux analyses les numéros de dossier, codes à usage unique, mots de passe, numéros de téléphone, adresses e-mail, documents déposés, contenu des devoirs ou réponses de l'API universitaire. Votre numéro de dossier sert seulement en mémoire à vérifier votre éligibilité, puis est supprimé.",
    },
    {
      icon: Database,
      titleEn: "Diagnostics",
      titleFr: "Diagnostics",
      bodyEn: "Sentry receives limited error and performance diagnostics when configured. It receives an opaque account id after sign-in, not your email or phone. Session Replay is disabled.",
      bodyFr: "Sentry reçoit des diagnostics limités d'erreur et de performance lorsqu'il est configuré. Après connexion, il reçoit un identifiant de compte opaque, jamais votre e-mail ni votre téléphone. La relecture de session est désactivée.",
    },
    {
      icon: Server,
      titleEn: "Access and protection",
      titleFr: "Accès et protection",
      bodyEn: "First-party telemetry is restricted to the system owner by database policies. PostHog is a separate analytics processor and is configured only after you choose a data region. Analytics cannot grant access to documents, assignments, or accounts.",
      bodyFr: "La télémétrie interne est réservée au propriétaire du système par les politiques de base de données. PostHog est un processeur d'analyses distinct et n'est configuré qu'après le choix d'une région de données. Les analyses ne peuvent donner accès ni aux documents, ni aux devoirs, ni aux comptes.",
    },
  ];

  const revoke = () => {
    denyAnalyticsConsent();
    clearTelemetryState();
    window.location.reload();
  };

  const enable = () => {
    grantAnalyticsConsent();
    track("analytics_consent_granted");
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <span className="eyebrow"><Cookie className="size-3.5" />{isFr ? "Transparence" : "Transparency"}</span>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-gradient-chrome lg:text-4xl">{isFr ? "Confidentialité" : "Privacy"}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {isFr ? "Vos analyses produit sont facultatives et contrôlées par un choix clair." : "Product analytics are optional and controlled by a clear choice."}
        </p>
      </motion.header>

      <div className="rule-glow" />

      <section className="surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">{isFr ? "Préférence d'analyses" : "Analytics preference"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{analyticsAllowed ? (isFr ? "Les analyses facultatives sont actuellement autorisées." : "Optional analytics are currently allowed.") : (isFr ? "Seuls les services essentiels sont actuellement autorisés." : "Only essential services are currently allowed.")}</p>
        </div>
        {analyticsAllowed ? (
          <button type="button" onClick={revoke} className="btn-ghost min-h-11 px-4 text-sm">{isFr ? "Retirer l'accord" : "Withdraw consent"}</button>
        ) : (
          <button type="button" onClick={enable} className="btn-primary min-h-11 px-4 text-sm">{isFr ? "Autoriser les analyses" : "Allow analytics"}</button>
        )}
      </section>

      <div className="space-y-4">
        {sections.map((section, index) => {
          const Icon = section.icon;
          return (
            <motion.section key={section.titleEn} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06, duration: 0.35 }} className="surface p-5 sm:p-6">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Icon className="size-4.5 text-primary" /></span>
                <h2 className="font-display text-lg font-bold text-foreground">{isFr ? section.titleFr : section.titleEn}</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{isFr ? section.bodyFr : section.bodyEn}</p>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}
