import { motion } from "framer-motion";
import {
  GraduationCap,
  Smartphone,
  ExternalLink,
  BookOpen,
  Users,
  MapPin,
  Mail,
  Info,
} from "lucide-react";
import { useAppStore } from "@/store/appStore";

const t = (lang: string, fr: string, en: string) => (lang === "fr" ? fr : en);

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export default function About() {
  const { language } = useAppStore();

  const quickLinks = [
    {
      icon: <GraduationCap className="w-6 h-6" />,
      title: t(language, "Inscription à la Faculté", "Faculty Registration"),
      description: t(
        language,
        "Inscription en ligne pour les nouveaux étudiants de la Faculté des Sciences Économiques et de Gestion.",
        "Online registration for new students at the Faculty of Economics and Management (FSEG 2)."
      ),
      href: "http://sisol.ul.edu.lb/rol/ASTRTPG",
      label: t(language, "S'inscrire maintenant", "Register Now"),
      gradient: "bg-gradient-red",
      glow: "hover:shadow-red-500/20",
      badge: t(language, "Portail officiel", "Official Portal"),
    },
    {
      icon: <Smartphone className="w-6 h-6" />,
      title: t(language, "Services Mobiles Étudiants", "Student Mobile Services"),
      description: t(
        language,
        "Demandez l'accès aux services mobiles de l'Université Libanaise pour gérer vos informations académiques.",
        "Apply for Lebanese University mobile services to manage your academic information and records on the go."
      ),
      href: "http://www.sisol.ul.edu.lb/MOB/MOBLSTRT",
      label: t(language, "Faire une demande", "Apply Now"),
      gradient: "bg-gradient-green",
      glow: "hover:shadow-emerald-500/20",
      badge: t(language, "SISOL — UL", "SISOL — LU"),
    },
  ];

  const features = [
    {
      icon: <BookOpen className="w-5 h-5 text-red-400" />,
      title: t(language, "Archives d'Examens", "Exam Archives"),
      desc: t(language, "Accédez aux examens précédents classés par filière, semestre et matière.", "Access past exams organised by major, semester, and subject."),
    },
    {
      icon: <GraduationCap className="w-5 h-5 text-emerald-400" />,
      title: t(language, "Examens d'Entrée", "Entrance Exams"),
      desc: t(language, "Préparez-vous avec les sujets des concours d'entrée des années précédentes.", "Prepare with past entrance exam papers from previous years."),
    },
    {
      icon: <Users className="w-5 h-5 text-red-400" />,
      title: t(language, "Événements Campus", "Campus Events"),
      desc: t(language, "Restez informé des conférences, ateliers et événements culturels.", "Stay informed about conferences, workshops, and cultural events."),
    },
    {
      icon: <Info className="w-5 h-5 text-emerald-400" />,
      title: t(language, "Librairie Académique", "Academic Bookstore"),
      desc: t(language, "Commandez les manuels recommandés pour chaque cours et filière.", "Order recommended textbooks for each course and major."),
    },
  ];

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-5xl mx-auto space-y-10 sm:space-y-12">
      {/* ── Hero ── */}
      <motion.section
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4 }}
        className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-neutral-900/60 backdrop-blur-sm p-8 md:p-12"
      >
        {/* Decorative glow */}
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-emerald-600/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-red flex items-center justify-center shrink-0 shadow-lg shadow-red-500/20">
            <GraduationCap className="w-9 h-9 text-white" />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-3xl md:text-4xl text-white leading-tight">
              {t(language, "FSEG", "FSEG")}{" "}
              <span className="text-red-500">2</span>{" "}
              <span className="text-neutral-400 font-medium text-2xl md:text-3xl">
                StudentHub
              </span>
            </h1>
            <p className="text-neutral-400 mt-2 max-w-xl leading-relaxed">
              {t(
                language,
                "La plateforme académique officielle du comité des étudiants de la Faculté des Sciences Économiques et de Gestion de l'Université Libanaise — campus Achrafieh.",
                "The official student committee academic platform for the Faculty of Economic Sciences & Management at Lebanese University — Ashrafieh campus."
              )}
            </p>
          </div>
        </div>
      </motion.section>

      {/* ── Quick Links ── */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <h2 className="font-display font-bold text-lg text-white mb-5">
          {t(language, "Liens Officiels UL", "Official LU Links")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {quickLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`group relative flex flex-col gap-4 p-6 rounded-2xl border border-white/[0.08] bg-neutral-900/70 backdrop-blur-sm transition-all duration-300 hover:border-white/[0.15] hover:shadow-xl ${link.glow} hover:-translate-y-1`}
            >
              {/* Badge */}
              <span className="absolute top-4 right-4 text-[10px] font-semibold text-neutral-500 bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-full">
                {link.badge}
              </span>

              {/* Icon */}
              <div className={`w-12 h-12 rounded-xl ${link.gradient} flex items-center justify-center text-white shrink-0 shadow-lg transition-transform duration-300 group-hover:scale-110`}>
                {link.icon}
              </div>

              {/* Text */}
              <div className="flex-1">
                <h3 className="font-display font-bold text-white text-base leading-snug mb-1.5">
                  {link.title}
                </h3>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  {link.description}
                </p>
              </div>

              {/* CTA */}
              <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-300 group-hover:text-white transition-colors duration-200">
                {link.label}
                <ExternalLink className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </a>
          ))}
        </div>
      </motion.section>

      {/* ── Features ── */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <h2 className="font-display font-bold text-lg text-white mb-5">
          {t(language, "Ce que propose EduSphere", "What EduSphere Offers")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="flex items-start gap-4 p-5 rounded-xl bg-neutral-900/60 border border-white/[0.06] hover:border-white/[0.1] transition-colors duration-200"
            >
              <div className="w-9 h-9 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0">
                {f.icon}
              </div>
              <div>
                <h4 className="font-display font-semibold text-sm text-white mb-1">
                  {f.title}
                </h4>
                <p className="text-xs text-neutral-500 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ── Faculty Info ── */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="rounded-2xl border border-white/[0.08] bg-neutral-900/60 p-6 space-y-4"
      >
        <h2 className="font-display font-bold text-lg text-white">
          {t(language, "À Propos de la Faculté", "About the Faculty")}
        </h2>
        <p className="text-sm text-neutral-400 leading-relaxed">
          {t(
            language,
            "Le comité des étudiants de la Faculté des Sciences Économiques et de Gestion (FSEG 2) de l'Université Libanaise, campus Achrafieh, propose cette plateforme pour soutenir les étudiants dans leurs cursus de licence en filière française et anglaise.",
            "The student committee of the Faculty of Economic Sciences & Management (FSEG 2) at Lebanese University (Ashrafieh campus) provides this platform to support students in both French and English tracks."
          )}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <a 
            href="https://maps.app.goo.gl/jbQStf5FZ25uMg9r5" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            <MapPin className="w-4 h-4 text-red-400 shrink-0" />
            <span>Ashrafieh, Beirut — Lebanon</span>
          </a>
          <a 
            href="https://www.instagram.com/student.council_ulfsegii" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>@student.council_ulfsegii</span>
          </a>
        </div>
      </motion.section>

      {/* ── Footer note ── */}
      <p className="text-center text-xs text-neutral-700 pb-4">
        {t(
          language,
          "EduSphere est l'initiative officielle du comité des étudiants FSEG 2.",
          "EduSphere is the official initiative of the FSEG 2 student committee."
        )}
      </p>
    </div>
  );
}
