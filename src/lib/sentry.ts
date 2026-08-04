import * as Sentry from "@sentry/react";

/**
 * Sentry: errors, performance tracing, and Session Replay.
 *
 * Replay is configured to capture everything — text and inputs are NOT masked —
 * which matches the site's stated telemetry posture (see docs/PRIVACY.md and
 * the /privacy page). The one hard exclusion is credential fields: any input
 * that is a password, or is marked data-sensitive, is blocked from replay.
 * Capturing a password would be indefensible regardless of posture.
 *
 * Inert without VITE_SENTRY_DSN — no network calls, no bundle cost at runtime.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN ?? "";

function sampleRate(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function initSentry(): void {
  if (!DSN) {
    if (import.meta.env.DEV) {
      console.info("[sentry] VITE_SENTRY_DSN not set — Sentry disabled.");
    }
    return;
  }

  const isProd = import.meta.env.PROD;

  Sentry.init({
    dsn: DSN,
    environment:
      import.meta.env.VITE_SENTRY_ENVIRONMENT ?? (isProd ? "production" : "development"),
    release: import.meta.env.VITE_APP_VERSION,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Full-fidelity replay, per the site's telemetry posture.
        maskAllText: false,
        maskAllInputs: false,
        blockAllMedia: false,
        // Non-negotiable exclusions.
        mask: ['[data-sensitive="true"]'],
        block: [".sentry-block"],
        ignore: ['input[type="password"]', 'input[name="token"]', 'input[name="otp"]'],
      }),
    ],

    tracesSampleRate: sampleRate(
      import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
      isProd ? 0.2 : 1,
    ),
    replaysSessionSampleRate: sampleRate(
      import.meta.env.VITE_SENTRY_REPLAY_SAMPLE_RATE,
      isProd ? 0.1 : 1,
    ),
    // An error is always worth the replay, whatever the session rate.
    replaysOnErrorSampleRate: 1.0,

    sendDefaultPii: true,

    beforeSend(event) {
      // A student's file number is the one value we promise never to store.
      // Strip it defensively in case it reaches an error message or URL.
      const scrub = (value: string) =>
        value.replace(/\b(file[_-]?number|fileNumber)["'\s:=]+[A-Za-z0-9/-]+/gi, "$1=[redacted]");

      if (event.request?.url) event.request.url = scrub(event.request.url);
      if (event.message) event.message = scrub(event.message);

      for (const exception of event.exception?.values ?? []) {
        if (exception.value) exception.value = scrub(exception.value);
      }

      return event;
    },
  });
}

/**
 * Attaches the signed-in user to every subsequent event and replay.
 * Call with null on sign-out.
 */
export function setSentryUser(
  user: { id: string; email?: string | null; role?: string | null } | null,
): void {
  if (!DSN) return;

  if (!user) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({
    id: user.id,
    email: user.email ?? undefined,
  });
  Sentry.setTag("user.role", user.role ?? "guest");
}

export { Sentry };
