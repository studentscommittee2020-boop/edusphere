import { motion } from "framer-motion";
import { BarChart3, Cookie, Database, Server, ShieldCheck } from "lucide-react";
import { useAppStore } from "@/store/appStore";

export default function Privacy() {
  const { language } = useAppStore();
  const isFr = language === "fr";
  const sections = [
    { icon: Cookie, titleEn: "Analytics by default", titleFr: "Analyses par défaut", bodyEn: "EduSphere records limited product-use events by default to improve the portal. Essential Supabase storage keeps an authenticated session working.", bodyFr: "EduSphere enregistre par défaut des événements limités d'utilisation du portail afin de l'améliorer. Le stockage Supabase indispensable maintient votre session." },
    { icon: BarChart3, titleEn: "Curated product events", titleFr: "Événements produit sélectionnés", bodyEn: "We record approved events such as page views and feature use in first-party telemetry and, when configured, PostHog. Automatic click capture, form capture, and session replay are disabled.", bodyFr: "Nous enregistrons des événements approuvés, comme les pages visitées et l'usage des fonctionnalités, dans notre télémétrie interne et, lorsqu'il est configuré, PostHog. La capture automatique des clics, des formulaires et la relecture de session sont désactivées." },
    { icon: ShieldCheck, titleEn: "What never enters analytics", titleFr: "Ce qui n'entre jamais dans les analyses", bodyEn: "Student file numbers, one-time codes, passwords, phone numbers, email addresses, uploaded documents, assignment content, and university API responses are never sent to analytics. File numbers are used only in memory for eligibility checks, then discarded.", bodyFr: "Les numéros de dossier, codes à usage unique, mots de passe, numéros de téléphone, adresses e-mail, documents déposés, contenu des devoirs et réponses de l'API universitaire ne sont jamais envoyés aux analyses. Les numéros de dossier servent seulement en mémoire à vérifier l'éligibilité, puis sont supprimés." },
    { icon: Database, titleEn: "Diagnostics", titleFr: "Diagnostics", bodyEn: "Sentry receives limited error and performance diagnostics when configured. It receives an opaque account id after sign-in, not your email or phone. Session Replay is disabled.", bodyFr: "Sentry reçoit des diagnostics limités d'erreur et de performance lorsqu'il est configuré. Après connexion, il reçoit un identifiant de compte opaque, jamais votre e-mail ni votre téléphone. La relecture de session est désactivée." },
    { icon: Server, titleEn: "Access and protection", titleFr: "Accès et protection", bodyEn: "First-party telemetry is restricted to the system owner by database policies. Analytics cannot grant access to documents, assignments, or accounts.", bodyFr: "La télémétrie interne est réservée au propriétaire du système par les politiques de base de données. Les analyses ne peuvent donner accès ni aux documents, ni aux devoirs, ni aux comptes." },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <span className="eyebrow"><Cookie className="size-3.5" />{isFr ? "Transparence" : "Transparency"}</span>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-gradient-chrome lg:text-4xl">{isFr ? "Confidentialité" : "Privacy"}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{isFr ? "Voici ce que le portail mesure et protège." : "Here is what the portal measures and protects."}</p>
      </motion.header>
      <div className="rule-glow" />
      <div className="space-y-4">
        {sections.map((section, index) => {
          const Icon = section.icon;
          return <motion.section key={section.titleEn} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06, duration: 0.35 }} className="surface p-5 sm:p-6"><div className="mb-3 flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Icon className="size-4.5 text-primary" /></span><h2 className="font-display text-lg font-bold text-foreground">{isFr ? section.titleFr : section.titleEn}</h2></div><p className="text-sm leading-relaxed text-muted-foreground">{isFr ? section.bodyFr : section.bodyEn}</p></motion.section>;
        })}
      </div>
    </div>
  );
}
