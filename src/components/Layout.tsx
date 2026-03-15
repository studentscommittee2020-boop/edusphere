import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import CartPanel from "./CartPanel";
import BackgroundAnimation from "./BackgroundAnimation";

export default function Layout() {
  const [cartPanelOpen, setCartPanelOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background relative">
      {/* Global particle network background */}
      <BackgroundAnimation />

      <Sidebar cartPanelOpen={cartPanelOpen} setCartPanelOpen={setCartPanelOpen} />

      {/* Main content area — sits above the canvas (z-10) */}
      <main className="lg:pl-[260px] min-h-screen relative z-10">
        {/* Top padding for mobile header */}
        <div className="pt-14 lg:pt-0">
          <Outlet context={{ setCartPanelOpen }} />
        </div>
      </main>

      <CartPanel open={cartPanelOpen} onClose={() => setCartPanelOpen(false)} />
    </div>
  );
}
