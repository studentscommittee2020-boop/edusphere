import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  FileText,
  GraduationCap,
  Calendar,
  CalendarClock,
  Library,
  User,
  Globe,
  LogOut,
  Moon,
  Menu,
  Sun,
  X,
  Info,
  ClipboardList,
  ListTodo,
  Printer,
  ShieldAlert,
} from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string;
  label: string;
  labelFr: string;
  icon: React.ReactNode;
  /** Rendered in a red pill after the label. */
  badge?: string;
}

interface NavSection {
  key: string;
  title: string;
  titleFr: string;
  items: NavItem[];
}

const iconClass = "w-[18px] h-[18px]";

// ── Component ────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const location = useLocation();
  const { language, setLanguage, theme, setTheme } = useAppStore();
  const {
    isAdmin,
    isAuthenticated,
    isCommitteeAdmin,
    isDoctor,
    isOwner,
    isVerifiedStudent,
    profile,
    signOut,
  } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const isFrUi = language === "fr";
  const hasStudentWorkspace = isVerifiedStudent && profile?.role === "student";

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      mobileMenuRef.current?.querySelector<HTMLElement>("button, a, input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      menuButtonRef.current?.focus();
    };
  }, [mobileOpen]);

  const handleDrawerKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobile();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(mobileMenuRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
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
  }, [closeMobile]);

  const isActive = useCallback(
    (to: string) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to)),
    [location.pathname],
  );

  // Navigation is derived from role, so a section only exists when the user can
  // actually reach it — no disabled-looking dead links.
  const sections = useMemo<NavSection[]>(() => {
    const result: NavSection[] = [
      {
        key: "main",
        title: "Main",
        titleFr: "Principal",
        items: [
          { to: "/", label: "Dashboard", labelFr: "Tableau de Bord", icon: <LayoutDashboard className={iconClass} /> },
          ...(hasStudentWorkspace ? [{ to: "/sessions", label: "Exam Archive", labelFr: "Archives d'Examens", icon: <FileText className={iconClass} /> }] : []),
          { to: "/exams", label: "Entrance Exams", labelFr: "Concours", icon: <GraduationCap className={iconClass} /> },
          { to: "/events", label: "Events", labelFr: "Évènements", icon: <Calendar className={iconClass} /> },
          { to: "/about", label: "About Faculty", labelFr: "À Propos", icon: <Info className={iconClass} /> },
        ],
      },
    ];

    if (hasStudentWorkspace) {
      result.push({
        key: "academics",
        title: "My Academics",
        titleFr: "Ma Scolarité",
        items: [
          { to: "/schedule", label: "My Schedule", labelFr: "Mon Emploi du Temps", icon: <CalendarClock className={iconClass} /> },
          { to: "/my-courses", label: "My Courses", labelFr: "Mes Cours", icon: <Library className={iconClass} /> },
          { to: "/assignments", label: "Assignments", labelFr: "Devoirs", icon: <ListTodo className={iconClass} /> },
        ],
      });
    }

    const staffItems: NavItem[] = [];
    if (isDoctor || isAdmin) {
      staffItems.push({
        to: "/doctor", label: "Doctor Workspace", labelFr: "Espace Docteur",
        icon: <ClipboardList className={iconClass} />,
      });
    }
    if (isCommitteeAdmin || isAdmin) {
      staffItems.push({
        to: "/print-desk", label: "Print Desk", labelFr: "Bureau d'Impression",
        icon: <Printer className={iconClass} />,
      });
    }
    if (staffItems.length > 0) {
      result.push({ key: "staff", title: "Workspace", titleFr: "Espace de Travail", items: staffItems });
    }

    result.push(isAuthenticated
      ? {
          key: "personal",
          title: "Personal",
          titleFr: "Personnel",
          items: [{ to: "/profile", label: "My Profile", labelFr: "Mon Profil", icon: <User className={iconClass} /> }],
        }
      : {
          key: "access",
          title: "Access",
          titleFr: "Accès",
          items: [{ to: "/auth", label: "Sign in", labelFr: "Se connecter", icon: <User className={iconClass} /> }],
        });

    if (isAdmin) {
      const adminItems: NavItem[] = [
        { to: "/admin", label: "Admin Dashboard", labelFr: "Tableau Admin", icon: <LayoutDashboard className={iconClass} /> },
      ];
      if (isOwner) {
        adminItems.push({
          to: "/owner", label: "Owner Console", labelFr: "Console Propriétaire",
          icon: <ShieldAlert className={iconClass} />, badge: "ALL",
        });
      }
      result.push({ key: "administration", title: "Administration", titleFr: "Administration", items: adminItems });
    }

    return result;
  }, [hasStudentWorkspace, isAdmin, isAuthenticated, isCommitteeAdmin, isDoctor, isOwner]);

  const userInitials = profile?.full_name?.trim().slice(0, 1).toUpperCase() ?? "G";
  const userName = profile?.full_name?.trim() || (language === "fr" ? "Invité" : "Guest");
  const roleLabel = isOwner
    ? language === "fr" ? "Propriétaire" : "Owner"
    : isAdmin
      ? language === "fr" ? "Administrateur" : "Administrator"
      : isCommitteeAdmin
        ? language === "fr" ? "Admin comité" : "Committee admin"
        : isDoctor
          ? language === "fr" ? "Docteur" : "Doctor"
          : isVerifiedStudent
            ? language === "fr" ? "Étudiant vérifié" : "Verified student"
            : language === "fr" ? "Se connecter" : "Sign in";

  // ── Shared content ─────────────────────────────────────────────────────────

  const SidebarContent = () => (
    <div
      className="flex flex-col h-full"
      style={{ background: "hsl(var(--sidebar-background))" }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <img
            src="/logo.svg"
            alt=""
            aria-hidden="true"
            className="w-9 h-9 shrink-0 rounded-lg bg-white p-0.5"
          />
          <div className="leading-tight">
            <p className="font-display font-extrabold text-[15px] text-foreground tracking-tight">
              EduSphere
            </p>
            <p className="font-display font-medium text-[11px] text-muted-foreground tracking-[0.14em] uppercase">
              StudentHub
            </p>
          </div>
        </div>
      </div>

      {/* Identity card */}
      <div className="px-4 pb-5">
        <NavLink
          to={isAuthenticated ? "/profile" : "/auth"}
          onClick={closeMobile}
          className="surface-interactive flex items-center gap-3 px-3 py-2.5"
        >
          <div
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
              isOwner ? "bg-gradient-to-br from-red-300 to-red-600" : "bg-gradient-red",
            )}
          >
            <span className="text-white text-xs font-bold font-display">{userInitials}</span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate font-display">{userName}</p>
            <p className="text-[11px] text-muted-foreground truncate">{roleLabel}</p>
          </div>
        </NavLink>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-6 overflow-y-auto pb-2" aria-label="Main">
        {sections.map((section) => (
          <div key={section.key}>
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70 select-none font-display">
              {language === "fr" ? section.titleFr : section.title}
            </p>

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.to);

                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={closeMobile}
                      className={cn(
                        "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-200 group",
                        active
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      {active && (
                        <>
                          <motion.span
                            layoutId="sidebar-active-indicator"
                            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary"
                            transition={{ type: "spring", stiffness: 350, damping: 30 }}
                          />
                          <motion.span
                            layoutId="sidebar-active-bg"
                            className="absolute inset-0 rounded-lg bg-primary/[0.09]"
                            transition={{ type: "spring", stiffness: 350, damping: 30 }}
                          />
                        </>
                      )}

                      <span
                        className={cn(
                          "relative z-10 transition-colors duration-200",
                          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                        )}
                      >
                        {item.icon}
                      </span>

                      <span
                        className={cn(
                          "relative z-10 font-display font-semibold text-sm flex-1",
                          active && "text-primary",
                        )}
                      >
                        {language === "fr" ? item.labelFr : item.label}
                      </span>

                      {item.badge && (
                        <span className="relative z-10 px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 text-[9px] font-bold tracking-wide">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-auto px-4 py-4 border-t border-border space-y-3">
        {/* Interface language only. A student's course track (the language
            their courses are taught in) is set by the university and is not
            affected by this toggle. */}
        <div className="flex items-center gap-3 px-1">
          <Globe className="w-[18px] h-[18px] text-muted-foreground shrink-0" />
          <div
            className="flex items-center gap-0.5 surface p-0.5"
            role="group"
            aria-label={isFrUi ? "Langue de l'interface" : "Interface language"}
          >
            <button
              type="button"
              onClick={() => setLanguage("fr")}
              className={cn(
                "min-h-[44px] px-3 py-1 rounded-md text-xs font-display font-bold transition-all duration-200",
                language === "fr"
                  ? "bg-gradient-red text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={language === "fr"}
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={cn(
                "min-h-[44px] px-3 py-1 rounded-md text-xs font-display font-bold transition-all duration-200",
                language === "en"
                  ? "bg-gradient-green text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={language === "en"}
            >
              EN
            </button>
          </div>
        </div>

        <div className="px-1">
          <p className="mb-2 text-xs text-muted-foreground">{language === "fr" ? "Apparence" : "Appearance"}</p>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="group" aria-label={language === "fr" ? "Apparence" : "Appearance"}>
            <button type="button" onClick={() => setTheme("dark")} aria-pressed={theme === "dark"} className={cn("min-h-[44px] rounded-md px-2 text-xs font-semibold transition-colors", theme === "dark" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground")}>
              <Moon className="mr-1 inline h-3.5 w-3.5" />{language === "fr" ? "Sombre" : "Dark"}
            </button>
            <button type="button" onClick={() => setTheme("light")} aria-pressed={theme === "light"} className={cn("min-h-[44px] rounded-md px-2 text-xs font-semibold transition-colors", theme === "light" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground")}>
              <Sun className="mr-1 inline h-3.5 w-3.5" />{language === "fr" ? "Clair" : "Light"}
            </button>
          </div>
        </div>

        {isAuthenticated && (
          <button
            type="button"
            onClick={async () => {
              await signOut();
              closeMobile();
              window.location.href = "/auth";
            }}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-red-400 hover:bg-white/[0.04] transition-colors duration-200"
          >
            <LogOut className={iconClass} />
            <span className="font-display font-semibold text-sm">
              {language === "fr" ? "Déconnexion" : "Sign Out"}
            </span>
          </button>
        )}
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <aside
        className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-[var(--sidebar-w)] border-r border-border z-40"
        aria-label="Main navigation"
      >
        <SidebarContent />
      </aside>

      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 glass border-b border-border z-40 flex items-center px-4 gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          ref={menuButtonRef}
          className="min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-muted transition-colors duration-200"
          aria-label={language === "fr" ? "Ouvrir le menu" : "Open navigation menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>

        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="" aria-hidden="true" className="w-7 h-7 rounded-md bg-white p-0.5" />
          <span className="font-display font-bold text-sm text-foreground">EduSphere</span>
        </div>
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="ml-auto min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun className="w-5 h-5 text-foreground" /> : <Moon className="w-5 h-5 text-foreground" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeMobile}
              className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
              aria-hidden="true"
            />

            <motion.aside
              ref={mobileMenuRef}
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
              id="mobile-navigation"
              className="lg:hidden fixed left-0 top-0 h-full w-[288px] border-r border-border z-50 shadow-2xl shadow-black/60"
              role="dialog"
              aria-modal="true"
              aria-label={language === "fr" ? "Menu de navigation" : "Navigation menu"}
              onKeyDown={handleDrawerKeyDown}
            >
              <button
                type="button"
                onClick={closeMobile}
                className="absolute top-3 right-3 min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-muted transition-colors duration-200 z-10"
                aria-label={language === "fr" ? "Fermer le menu" : "Close navigation menu"}
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>

              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
