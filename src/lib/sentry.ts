import * as Sentry from "@sentry/react";

/**
 * Sentry provides diagnostics and performance tracing. Session Replay is
 * intentionally disabled: this portal handles education records and auth
 * factors, so recorded screens and inputs are not an acceptable trade-off.
 */
const DSN = import.meta.env.VITE_SENTRY_DSN ?? "";

function sampleRate(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function initSentry(): void {
  if (!DSN) {
    if (import.meta.env.DEV) console.info("[sentry] VITE_SENTRY_DSN not set - Sentry disabled.");
    return;
  }
  const isProd = import.meta.env.PROD;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? (isProd ? "production" : "development"),
    release: import.meta.env.VITE_APP_VERSION,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: sampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, isProd ? 0.2 : 1),
    sendDefaultPii: false,
    beforeSend(event) {
      const scrub = (value: string) => value.replace(/\\b(file[_-]?number|fileNumber)["'\\s:=]+[A-Za-z0-9/-]+/gi, "$1=[redacted]");
      if (event.request?.url) event.request.url = scrub(event.request.url);
      if (event.message) event.message = scrub(event.message);
      for (const exception of event.exception?.values ?? []) {
        if (exception.value) exception.value = scrub(exception.value);
      }
      return event;
    },
  });
}

/** Identifies diagnostics by opaque account id only, never email or phone. */
export function setSentryUser(user: { id: string; role?: string | null } | null): void {
  if (!DSN) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: user.id });
  Sentry.setTag("user.role", user.role ?? "guest");
}

export { Sentry };
