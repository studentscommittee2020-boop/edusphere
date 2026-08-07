import { useState, useEffect, lazy, Suspense } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import ErrorBoundary from "./ErrorBoundary";
import DevRoleSwitcher from "./DevRoleSwitcher";
import ImpersonationBanner from "./ImpersonationBanner";

const HeroScene = lazy(() => import("./HeroScene"));

export default function Layout() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    // The full animated scene is part of the portal's visual identity. Keep it
    // on tablets and desktops; only phones use the lightweight CSS fallback.
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="min-h-screen bg-background relative">
      {/* Tablets and desktops get the WebGL scene; phones get CSS orbs at a fraction of
          the cost. Both are decorative — a WebGL failure must never take the
          page down, hence the boundary. */}
      {isDesktop ? (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <HeroScene />
            </Suspense>
          </ErrorBoundary>
        </div>
      ) : (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="bg-orb-red" style={{ top: "-10%", left: "-15%" }} />
          <div className="bg-orb-green" style={{ bottom: "-10%", right: "-15%" }} />
          <div className="bg-orb-accent" style={{ top: "40%", left: "30%" }} />
          <div className="bg-mesh fixed inset-0" />
          <div className="bg-grid fixed inset-0 opacity-30 mask-fade-b" />
        </div>
      )}

      <Sidebar />

      <main className="lg:pl-[var(--sidebar-w)] min-h-screen relative z-10">
        <div className="pt-14 lg:pt-0">
          <Outlet />
        </div>
      </main>

      {/* REAL feature, always mounted (not DEV-gated) — visible on every page
          so an active owner "act as" session can never be navigated away
          from and forgotten. Positions itself below the dev banner when
          both happen to be active — see that component's own comment. */}
      <ImpersonationBanner />

      {/* Renders nothing in production — see src/lib/devAuth.ts */}
      <DevRoleSwitcher />
    </div>
  );
}
