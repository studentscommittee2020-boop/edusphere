import { lazy, Suspense, useEffect, useLayoutEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import Layout from "./components/Layout";
import { useAuth } from "./contexts/AuthContext";
import { trackPageView } from "./lib/telemetry";
import { useAppStore } from "./store/appStore";

// ── Page imports (lazy for code splitting) ────────────────────────────────────
const Index     = lazy(() => import("./pages/Index"));
const Sessions  = lazy(() => import("./pages/Sessions"));
const Exams     = lazy(() => import("./pages/Exams"));
const Events    = lazy(() => import("./pages/Events"));
const Admin     = lazy(() => import("./pages/Admin"));
const About     = lazy(() => import("./pages/About"));
const Auth      = lazy(() => import("./pages/Auth"));
const Profile   = lazy(() => import("./pages/Profile"));
const StudentAssignments = lazy(() => import("./pages/StudentAssignments"));
const Schedule  = lazy(() => import("./pages/Schedule"));
const MyCourses = lazy(() => import("./pages/MyCourses"));
const OwnerConsole = lazy(() => import("./pages/OwnerConsole"));
const Privacy   = lazy(() => import("./pages/Privacy"));
const DoctorWorkspace = lazy(() => import("./pages/DoctorWorkspace"));
const PrintDesk = lazy(() => import("./pages/PrintDesk"));
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

function StudentRoute({ children }: { children: React.ReactNode }) {
  const { isVerifiedStudent, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <PageLoader />;
  if (!isVerifiedStudent) {
    return <Navigate to="/auth" replace state={{ next: `${location.pathname}${location.search}` }} />;
  }
  return <>{children}</>;
}

function DoctorRoute({ children }: { children: React.ReactNode }) {
  const { isDoctor, isAdmin, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!isDoctor && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function CommitteeRoute({ children }: { children: React.ReactNode }) {
  const { isCommitteeAdmin, isAdmin, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!isCommitteeAdmin && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function OwnerRoute({ children }: { children: React.ReactNode }) {
  const { isOwner, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!isOwner) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** A signed-in account must complete its authenticator-app challenge before
    any authenticated portal screen is rendered. Public pages remain public. */
function MfaGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isMfaVerified, profile } = useAuth();
  const location = useLocation();
  if (isLoading) return <PageLoader />;
  // A phone number is a required testing contact detail. Keep this gate beside
  // MFA so a signed-in session cannot bypass the profile-completion screen.
  if (isAuthenticated && (!profile?.phone || !isMfaVerified)) {
    return <Navigate to="/auth" replace state={{ next: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Emits a page_view on every navigation. Must live inside the Router. */
function RouteTelemetry() {
  const location = useLocation();

  useLayoutEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return null;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return (
    <BrowserRouter>
      <RouteTelemetry />
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: "surface edusphere-toast",
        }}
      />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public auth page — outside the layout */}
          <Route path="/auth" element={<Auth />} />

          {/* Main app layout */}
          <Route element={<MfaGate><Layout /></MfaGate>}>
            <Route path="/"          element={<Index />} />
            <Route path="/sessions" element={<StudentRoute><Sessions /></StudentRoute>} />
            <Route path="/schedule" element={<StudentRoute><Schedule /></StudentRoute>} />
            <Route path="/my-courses" element={<StudentRoute><MyCourses /></StudentRoute>} />
            <Route path="/assignments" element={<StudentRoute><StudentAssignments /></StudentRoute>} />
            <Route path="/doctor" element={<DoctorRoute><DoctorWorkspace /></DoctorRoute>} />
            <Route path="/print-desk" element={<CommitteeRoute><PrintDesk /></CommitteeRoute>} />
            <Route path="/exams"     element={<Exams />} />
            <Route path="/events"    element={<Events />} />
            <Route path="/about"     element={<About />} />
            <Route path="/privacy"   element={<Privacy />} />
            <Route path="/profile"  element={<Profile />} />

            {/* Admin — protected */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />

            {/* Owner — full read/write across every table and account */}
            <Route
              path="/owner"
              element={
                <OwnerRoute>
                  <OwnerConsole />
                </OwnerRoute>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
