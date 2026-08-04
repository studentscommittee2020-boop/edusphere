import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { isSupabaseConfigured } from "./lib/supabase.ts";
import { initSentry } from "./lib/sentry.ts";
import { initTelemetry } from "./lib/telemetry.ts";

// Both run before render so the earliest errors and the first page view are
// captured. Each is inert when its configuration is absent.
initSentry();
initTelemetry();

function MissingEnvBanner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-6">
      <div className="text-center max-w-md space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="font-bold text-xl text-white" style={{ fontFamily: "'Syne', sans-serif" }}>
          Configuration Required
        </h1>
        <p className="text-neutral-400 text-sm leading-relaxed">
          Missing <code className="text-red-400 bg-white/5 px-1.5 py-0.5 rounded">VITE_SUPABASE_URL</code> and{" "}
          <code className="text-red-400 bg-white/5 px-1.5 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> environment
          variables. Set them in <code className="text-neutral-300 bg-white/5 px-1.5 py-0.5 rounded">.env.local</code>{" "}
          (local dev) or your hosting provider&apos;s environment settings (production).
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {isSupabaseConfigured ? (
        <AuthProvider>
          <App />
        </AuthProvider>
      ) : (
        <MissingEnvBanner />
      )}
    </ErrorBoundary>
  </StrictMode>
);
