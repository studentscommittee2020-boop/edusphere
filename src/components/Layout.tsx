import { useState, useEffect, lazy, Suspense } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import CartPanel from "./CartPanel";

const HeroScene = lazy(() => import("./HeroScene"));

export default function Layout() {
  const [cartPanelOpen, setCartPanelOpen] = useState(false);
  const [showScene, setShowScene] = useState(false);

  useEffect(() => {
    // Only load the heavy 3D scene on screens wider than 768px
    const mq = window.matchMedia("(min-width: 768px)");
    setShowScene(mq.matches);
    const handler = (e: MediaQueryListEvent) => setShowScene(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="min-h-screen bg-background relative">
      {/* 3D background scene — skip on mobile to save ~800KB */}
      {showScene && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <Suspense fallback={null}>
            <HeroScene />
          </Suspense>
        </div>
      )}

      <Sidebar cartPanelOpen={cartPanelOpen} setCartPanelOpen={setCartPanelOpen} />

      <main className="lg:pl-[260px] min-h-screen relative z-10">
        <div className="pt-14 lg:pt-0">
          <Outlet context={{ setCartPanelOpen }} />
        </div>
      </main>

      <CartPanel open={cartPanelOpen} onClose={() => setCartPanelOpen(false)} />
    </div>
  );
}
