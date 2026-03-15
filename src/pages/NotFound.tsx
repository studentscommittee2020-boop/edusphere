import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Home, ArrowLeft } from "lucide-react";
import { useAppStore } from "@/store/appStore";

export default function NotFound() {
  const { language } = useAppStore();
  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative">
      <div className="absolute inset-0 bg-mesh" />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative text-center max-w-md"
      >
        <div className="font-display font-extrabold text-[120px] leading-none text-foreground/5 select-none mb-2">
          404
        </div>
        <div className="w-16 h-16 rounded-2xl bg-gradient-red flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_-5px_hsla(0,72%,51%,0.4)]">
          <span className="text-white font-display font-bold text-2xl">?</span>
        </div>
        <h1 className="font-display font-extrabold text-2xl text-foreground mb-3">
          {language === "fr" ? "Page introuvable" : "Page Not Found"}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-8">
          {language === "fr"
            ? "La page que vous recherchez n'existe pas ou a été déplacée."
            : "The page you're looking for doesn't exist or has been moved."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-red text-white font-display font-semibold text-sm hover:opacity-90 transition-all duration-200 hover:-translate-y-0.5"
          >
            <Home className="w-4 h-4" />
            {language === "fr" ? "Accueil" : "Go Home"}
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-muted-foreground font-display font-semibold text-sm hover:text-foreground hover:border-foreground/30 transition-all duration-200"
          >
            <ArrowLeft className="w-4 h-4" />
            {language === "fr" ? "Retour" : "Go Back"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
