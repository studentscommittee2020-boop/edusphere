import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import CartPanel from "./CartPanel";

export default function Layout() {
  const [cartPanelOpen, setCartPanelOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background relative">
      <Sidebar cartPanelOpen={cartPanelOpen} setCartPanelOpen={setCartPanelOpen} />

      <main className="lg:pl-[260px] min-h-screen relative">
        <div className="pt-14 lg:pt-0">
          <Outlet context={{ setCartPanelOpen }} />
        </div>
      </main>

      <CartPanel open={cartPanelOpen} onClose={() => setCartPanelOpen(false)} />
    </div>
  );
}
