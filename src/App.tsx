import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import Layout from "./components/Layout";
import { useAuth } from "./contexts/AuthContext";

// ── Page imports (lazy for code splitting) ────────────────────────────────────
const Index     = lazy(() => import("./pages/Index"));
const Sessions  = lazy(() => import("./pages/Sessions"));
const Exams     = lazy(() => import("./pages/Exams"));
const Events    = lazy(() => import("./pages/Events"));
const Books     = lazy(() => import("./pages/Books"));
const Admin     = lazy(() => import("./pages/Admin"));
const About     = lazy(() => import("./pages/About"));
const Auth      = lazy(() => import("./pages/Auth"));
const NotFound  = lazy(() => import("./pages/NotFound"));

// ── Loading fallback ──────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <div className="w-8 h-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
    </div>
  );
}

// ── Admin-only guard ──────────────────────────────────────────────────────────
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "hsl(0 0% 8%)",
            color: "hsl(0 0% 95%)",
            border: "1px solid hsl(0 0% 15%)",
          },
        }}
      />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public auth page — outside the layout */}
          <Route path="/auth" element={<Auth />} />

          {/* Main app layout */}
          <Route element={<Layout />}>
            <Route path="/"          element={<Index />} />
            <Route path="/sessions"  element={<Sessions />} />
            <Route path="/exams"     element={<Exams />} />
            <Route path="/events"    element={<Events />} />
            <Route path="/books"     element={<Books />} />
            <Route path="/about"     element={<About />} />

            {/* Admin — protected */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
