import { motion } from "framer-motion";
import { Cookie, Database, Eye, Server, ShieldOff } from "lucide-react";
import { useAppStore } from "@/store/appStore";

/**
 * Plain-language disclosure of what the site collects.
 *
 * EduSphere collects telemetry unconditionally — there is no consent banner.
 * That makes an honest, specific disclosure the only thing standing between
 * the product and its users, so this page names every cookie and every
 * category of data rather than gesturing at "analytics".
 */
export default function Privacy() {
  const { language } = useAppStore();
  const isFr = language === "fr";

  const sections = [
    {
      icon: Cookie,
      titleEn: "Cookies we set",
      titleFr: "Cookies déposés",
      bodyEn: (
        <>
          <p>
            EduSphere sets cookies as soon as the site loads. There is no consent
            banner and no opt-out inside the app — if you do not want these,
            block them in your browser or use private browsing.
          </p>
          <ul>
            <li>
              <code>es_aid</code> — a random anonymous identifier, kept for one
              year. It links your visits together even when you are signed out.
            </li>
            <li>
              <code>es_sid</code> — a random session identifier, kept for 30
              minutes of inactivity. It groups one browsing session.
            </li>
            <li>
              <code>sb-*</code> — Supabase authentication cookies. These keep you
              signed in and are required for the site to work at all.
            </li>
          </ul>
        </>
      ),
      bodyFr: (
        <>
          <p>
            EduSphere dépose des cookies dès le chargement du site. Il n'y a ni
            bandeau de consentement ni refus possible dans l'application — pour
            les éviter, bloquez-les dans votre navigateur ou utilisez la
            navigation privée.
          </p>
          <ul>
            <li>
              <code>es_aid</code> — identifiant anonyme aléatoire, conservé un
              an. Il relie vos visites même déconnecté.
            </li>
            <li>
              <code>es_sid</code> — identifiant de session aléatoire, conservé 30
              minutes d'inactivité.
            </li>
            <li>
              <code>sb-*</code> — cookies d'authentification Supabase,
              indispensables au fonctionnement du site.
            </li>
          </ul>
        </>
      ),
    },
    {
      icon: Database,
      titleEn: "What we record",
      titleFr: "Ce que nous enregistrons",
      bodyEn: (
        <ul>
          <li>Every page you visit, and when.</li>
          <li>Which resources, exams and materials you open.</li>
          <li>Your browser, language, timezone, screen and window size.</li>
          <li>The page that referred you to us.</li>
          <li>Your account id, once you are signed in.</li>
        </ul>
      ),
      bodyFr: (
        <ul>
          <li>Chaque page visitée, et quand.</li>
          <li>Les ressources, examens et supports que vous ouvrez.</li>
          <li>Votre navigateur, langue, fuseau horaire et taille d'écran.</li>
          <li>La page qui vous a amené ici.</li>
          <li>L'identifiant de votre compte, une fois connecté.</li>
        </ul>
      ),
    },
    {
      icon: Eye,
      titleEn: "Session recording",
      titleFr: "Enregistrement de session",
      bodyEn: (
        <p>
          We use Sentry Session Replay, which reconstructs what happened on
          screen — pages, clicks, scrolling and typed text — so we can diagnose
          errors. Password fields and one-time codes are excluded from recording
          and are never captured.
        </p>
      ),
      bodyFr: (
        <p>
          Nous utilisons Sentry Session Replay, qui reconstitue ce qui s'est
          passé à l'écran — pages, clics, défilement et texte saisi — afin de
          diagnostiquer les erreurs. Les champs de mot de passe et les codes à
          usage unique sont exclus et ne sont jamais capturés.
        </p>
      ),
    },
    {
      icon: ShieldOff,
      titleEn: "What we never store",
      titleFr: "Ce que nous ne stockons jamais",
      bodyEn: (
        <p>
          Your university <strong>file number</strong> is never written to our
          database, never logged, and never sent to Sentry. It is used in memory
          to ask the university whether you are a registered student, then
          discarded. That is also why refreshing your schedule asks for it again
          each time — we have nothing stored to reuse. Neither are the raw
          responses the university sends us.
        </p>
      ),
      bodyFr: (
        <p>
          Votre <strong>numéro de dossier</strong> universitaire n'est jamais
          écrit dans notre base, jamais journalisé, jamais envoyé à Sentry. Il
          sert en mémoire à demander à l'université si vous êtes bien inscrit,
          puis il est effacé. C'est aussi pourquoi l'actualisation de votre
          emploi du temps le redemande à chaque fois. Les réponses brutes de
          l'université ne sont pas conservées non plus.
        </p>
      ),
    },
    {
      icon: Server,
      titleEn: "Who can see it",
      titleFr: "Qui peut y accéder",
      bodyEn: (
        <p>
          Telemetry is readable only by the system owner. Ordinary
          administrators cannot read it, and you cannot read other students'
          records — the database enforces this, not the interface. Owner actions
          on your data are written to an audit trail that the owner cannot edit
          or delete.
        </p>
      ),
      bodyFr: (
        <p>
          Les données de télémétrie ne sont lisibles que par le propriétaire du
          système. Les administrateurs ordinaires n'y ont pas accès, et vous ne
          pouvez pas lire les données d'autres étudiants — c'est la base de
          données qui l'impose, pas l'interface. Les actions du propriétaire sur
          vos données sont inscrites dans un journal qu'il ne peut ni modifier
          ni supprimer.
        </p>
      ),
    },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8 lg:py-12 max-w-3xl mx-auto space-y-8">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <span className="eyebrow">
          <Cookie className="w-3.5 h-3.5" />
          {isFr ? "Transparence" : "Transparency"}
        </span>
        <h1 className="mt-2 font-display font-extrabold text-3xl lg:text-4xl text-gradient-chrome">
          {isFr ? "Confidentialité" : "Privacy"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          {isFr
            ? "Ce site collecte des données d'utilisation sans vous demander votre accord. Plutôt que de le dissimuler derrière un bandeau, voici exactement ce qui est collecté."
            : "This site collects usage data without asking for your consent. Rather than hide that behind a banner, here is exactly what is collected."}
        </p>
      </motion.header>

      <div className="rule-glow" />

      <div className="space-y-4">
        {sections.map((section, index) => {
          const Icon = section.icon;
          return (
            <motion.section
              key={section.titleEn}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.35 }}
              className="surface p-5 sm:p-6"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4.5 h-4.5 text-primary" />
                </span>
                <h2 className="font-display font-bold text-lg text-foreground">
                  {isFr ? section.titleFr : section.titleEn}
                </h2>
              </div>

              <div
                className="text-sm text-muted-foreground leading-relaxed space-y-2
                  [&_ul]:space-y-1.5 [&_ul]:pl-4 [&_li]:list-disc [&_li]:marker:text-primary/60
                  [&_code]:font-mono [&_code]:text-xs [&_code]:px-1.5 [&_code]:py-0.5
                  [&_code]:rounded [&_code]:bg-white/[0.07] [&_code]:text-foreground
                  [&_strong]:text-foreground"
              >
                {isFr ? section.bodyFr : section.bodyEn}
              </div>
            </motion.section>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center pt-4">
        {isFr
          ? "Des questions ? Contactez le comité étudiant."
          : "Questions? Contact the student committee."}
      </p>
    </div>
  );
}
