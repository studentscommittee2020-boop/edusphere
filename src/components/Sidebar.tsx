import { useState, useCallback } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  GraduationCap,
  Calendar,
  ShoppingCart,
  User,
  Globe,
  LogOut,
  Menu,
  X,
  Info,
} from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavItem {
  to: string;
  label: string;
  labelFr: string;
  icon: React.ReactNode;
  showCartBadge?: boolean;
}

interface NavSection {
  title: string;
  titleFr: string;
  items: NavItem[];
}

// ---------------------------------------------------------------------------
// Navigation structure
// ---------------------------------------------------------------------------

const navSections: NavSection[] = [
  {
    title: "MAIN",
    titleFr: "PRINCIPAL",
    items: [
      {
        to: "/",
        label: "Dashboard",
        labelFr: "Tableau de Bord",
        icon: <LayoutDashboard className="w-[18px] h-[18px]" />,
      },
      {
        to: "/sessions",
        label: "Exam Archive",
        labelFr: "Archives d'Examens",
        icon: <FileText className="w-[18px] h-[18px]" />,
      },
      {
        to: "/exams",
        label: "Entrance Exams",
        labelFr: "Examens d'Entree",
        icon: <GraduationCap className="w-[18px] h-[18px]" />,
      },
      {
        to: "/events",
        label: "Events",
        labelFr: "Evenements",
        icon: <Calendar className="w-[18px] h-[18px]" />,
      },
      {
        to: "/books",
        label: "Bookstore",
        labelFr: "Librairie",
        icon: <ShoppingCart className="w-[18px] h-[18px]" />,
        showCartBadge: true,
      },
      {
        to: "/about",
        label: "About Faculty",
        labelFr: "À Propos",
        icon: <Info className="w-[18px] h-[18px]" />,
      },
    ],
  },
  {
    title: "PERSONAL",
    titleFr: "PERSONNEL",
    items: [
      {
        to: "/profile",
        label: "My Profile",
        labelFr: "Mon Profil",
        icon: <User className="w-[18px] h-[18px]" />,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SidebarProps {
  cartPanelOpen: boolean;
  setCartPanelOpen: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Sidebar({ cartPanelOpen, setCartPanelOpen }: SidebarProps) {
  const location = useLocation();
  const { cart, language, setLanguage } = useAppStore();
  const { isAdmin, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const cartCount = cart.length;

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // Check if a nav item is the currently active route
  const isActive = useCallback(
    (to: string) => {
      if (to === "/") return location.pathname === "/";
      return location.pathname.startsWith(to);
    },
    [location.pathname],
  );

  // Get the user's display initials (placeholder for guest)
  const userInitials = "G";
  const userName = language === "fr" ? "Invite" : "Guest";

  // -------------------------------------------------------------------------
  // Shared sidebar content (used by both desktop and mobile)
  // -------------------------------------------------------------------------

  const dynamicNavSections = [...navSections];
  if (isAdmin) {
    dynamicNavSections.push({
      title: "ADMINISTRATION",
      titleFr: "ADMINISTRATION",
      items: [
        {
          to: "/admin",
          label: "Admin Dashboard",
          labelFr: "Tableau Admin",
          icon: <LayoutDashboard className="w-[18px] h-[18px]" />,
        },
      ],
    });
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-red flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div className="leading-tight">
            <p className="font-display font-bold text-[15px] text-white tracking-tight">
              FSEG <span className="text-red-500">2</span>
            </p>
            <p className="font-display font-medium text-[11px] text-neutral-500 tracking-wide">
              StudentHub
            </p>
          </div>
        </div>
      </div>

      {/* ── User profile card ─────────────────────────────────────────────── */}
      <div className="px-4 pb-4">
        <NavLink
          to={isAdmin ? "/profile" : "/auth"}
          onClick={closeMobile}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] transition-all duration-200 hover:bg-white/[0.07] group"
        >
          {/* Avatar circle with initials */}
          <div className="w-8 h-8 rounded-full bg-gradient-red flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold font-display">
              {userInitials}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate font-display">
              {userName}
            </p>
            <p className="text-[11px] text-neutral-500 truncate">
              {isAdmin
                ? "Admin"
                : language === "fr"
                  ? "Se connecter"
                  : "Sign in"}
            </p>
          </div>
        </NavLink>
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 space-y-5 overflow-y-auto pb-2" role="navigation">
        {dynamicNavSections.map((section) => (
          <div key={section.title}>
            {/* Section label */}
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-600 select-none font-display">
              {language === "fr" ? section.titleFr : section.title}
            </p>

            {/* Section items */}
            <ul className="space-y-0.5" role="list">
              {section.items.map((item) => {
                const active = isActive(item.to);

                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={closeMobile}
                      className={cn(
                        "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group",
                        active
                          ? "text-white"
                          : "text-neutral-400 hover:text-white hover:bg-white/[0.04]",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      {/* Active left border accent */}
                      {active && (
                        <motion.div
                          layoutId="sidebar-active-indicator"
                          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-red-500"
                          transition={{
                            type: "spring",
                            stiffness: 350,
                            damping: 30,
                          }}
                        />
                      )}

                      {/* Active background highlight */}
                      {active && (
                        <motion.div
                          layoutId="sidebar-active-bg"
                          className="absolute inset-0 rounded-lg bg-red-500/[0.08]"
                          transition={{
                            type: "spring",
                            stiffness: 350,
                            damping: 30,
                          }}
                        />
                      )}

                      <span
                        className={cn(
                          "relative z-10 transition-colors duration-200",
                          active
                            ? "text-red-500"
                            : "text-neutral-500 group-hover:text-neutral-300",
                        )}
                      >
                        {item.icon}
                      </span>

                      <span
                        className={cn(
                          "relative z-10 font-display font-semibold text-sm flex-1",
                          active ? "text-red-400" : "",
                        )}
                      >
                        {language === "fr" ? item.labelFr : item.label}
                      </span>

                      {/* Cart badge */}
                      {item.showCartBadge && cartCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setCartPanelOpen(!cartPanelOpen);
                          }}
                          className="relative z-10 flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gradient-red text-white text-[10px] font-bold shrink-0 transition-transform duration-200 hover:scale-110"
                          aria-label={`${cartCount} ${
                            language === "fr"
                              ? "articles dans le panier"
                              : "items in cart"
                          }`}
                        >
                          {cartCount}
                        </button>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Bottom section ─────────────────────────────────────────────────── */}
      <div className="mt-auto px-4 py-4 border-t border-white/[0.08] space-y-3">
        {/* Language toggle pill */}
        <div className="flex items-center gap-3 px-1">
          <Globe className="w-[18px] h-[18px] text-neutral-500 shrink-0" />
          <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setLanguage("fr")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-display font-bold transition-all duration-200",
                language === "fr"
                  ? "bg-gradient-red text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-300",
              )}
              aria-pressed={language === "fr"}
              aria-label="Passer en francais"
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-display font-bold transition-all duration-200",
                language === "en"
                  ? "bg-gradient-green text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-300",
              )}
              aria-pressed={language === "en"}
              aria-label="Switch to English"
            >
              EN
            </button>
          </div>
        </div>

        {/* Sign out (only show when admin is logged in) */}
        {isAdmin && (
          <button
            type="button"
            onClick={async () => {
              await signOut();
              closeMobile();
              window.location.href = "/auth";
            }}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-neutral-500 hover:text-red-400 hover:bg-white/[0.04] transition-all duration-200"
            aria-label={language === "fr" ? "Se deconnecter" : "Sign out"}
          >
            <LogOut className="w-[18px] h-[18px]" />
            <span className="font-display font-semibold text-sm">
              {language === "fr" ? "Deconnexion" : "Sign Out"}
            </span>
          </button>
        )}
      </div>
    </div>
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-[260px] bg-neutral-950 border-r border-white/[0.08] z-40"
        aria-label="Main navigation"
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-neutral-950 border-b border-white/[0.08] z-40 flex items-center px-4 gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-white/[0.04] transition-colors duration-200"
          aria-label={
            language === "fr"
              ? "Ouvrir le menu de navigation"
              : "Open navigation menu"
          }
        >
          <Menu className="w-5 h-5 text-neutral-300" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-red flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-sm text-white">
            FSEG <span className="text-red-500">2</span>
          </span>
        </div>

        {/* Mobile cart button */}
        {cartCount > 0 && (
          <button
            type="button"
            onClick={() => setCartPanelOpen(!cartPanelOpen)}
            className="ml-auto relative p-2 rounded-lg hover:bg-white/[0.04] transition-colors duration-200"
            aria-label={`${
              language === "fr" ? "Panier" : "Cart"
            }: ${cartCount} ${
              language === "fr" ? "articles" : "items"
            }`}
          >
            <ShoppingCart className="w-5 h-5 text-neutral-400" />
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-gradient-red text-white text-[9px] font-bold flex items-center justify-center">
              {cartCount}
            </span>
          </button>
        )}
      </div>

      {/* ── Mobile drawer ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeMobile}
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              aria-hidden="true"
            />

            {/* Drawer panel */}
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="lg:hidden fixed left-0 top-0 h-full w-[280px] bg-neutral-950 border-r border-white/[0.08] z-50 shadow-2xl shadow-black/50"
              role="dialog"
              aria-modal="true"
              aria-label={
                language === "fr" ? "Menu de navigation" : "Navigation menu"
              }
            >
              {/* Close button */}
              <button
                type="button"
                onClick={closeMobile}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors duration-200 z-10"
                aria-label={
                  language === "fr"
                    ? "Fermer le menu de navigation"
                    : "Close navigation menu"
                }
              >
                <X className="w-5 h-5 text-neutral-400" />
              </button>

              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
