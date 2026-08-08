import posthog from "posthog-js";

/**
 * Product analytics is deliberately opt-in. It is not an event dump: callers
 * may send only small, curated product properties, never form values, files,
 * credentials, contact details, or university records.
 */
const CONSENT_KEY = "edusphere-analytics-consent";
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY?.trim() ?? "";
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST?.trim() ?? "";

let initialized = false;

function isAvailable(): boolean {
  // Analytics from local development and Vercel previews would contaminate
  // production metrics. A configured production build is the only reporter.
  return import.meta.env.PROD && Boolean(POSTHOG_KEY && POSTHOG_HOST);
}

function storedConsent(): "granted" | "denied" | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(CONSENT_KEY);
  return value === "granted" || value === "denied" ? value : null;
}

export function hasAnalyticsConsent(): boolean {
  return storedConsent() === "granted";
}

export function initProductAnalytics(): void {
  if (initialized || !isAvailable()) return;
  initialized = true;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    defaults: "2026-05-30",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    opt_out_capturing_by_default: true,
    person_profiles: "identified_only",
  });

  if (hasAnalyticsConsent()) posthog.opt_in_capturing();
}

export function grantAnalyticsConsent(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_KEY, "granted");
  initProductAnalytics();
  if (initialized) posthog.opt_in_capturing();
}

export function denyAnalyticsConsent(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_KEY, "denied");
  if (initialized) posthog.opt_out_capturing();
}

const sensitiveProperty = /email|phone|file.?number|otp|pass(word)?|token|secret|document|content|message/i;
const allowedEvents = new Set([
  "analytics_consent_granted",
  "page_view",
  "session_start",
  "my_courses_viewed",
  "resource_opened",
  "schedule_viewed",
  "schedule_sync_failed",
  "schedule_sync_succeeded",
  "owner_console_opened",
  "owner_role_changed",
  "owner_account_inspected",
  "owner_row_deleted",
  "owner_impersonation_started",
]);

export function sanitizeAnalyticsProperties(properties: Record<string, unknown>): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (sensitiveProperty.test(key)) continue;
    if (typeof value === "string") safe[key] = value.slice(0, 120);
    else if (typeof value === "number" || typeof value === "boolean") safe[key] = value;
  }
  return safe;
}

export function captureProductEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
): void {
  if (!hasAnalyticsConsent() || !allowedEvents.has(eventName)) return;
  initProductAnalytics();
  if (!initialized) return;
  posthog.capture(eventName, sanitizeAnalyticsProperties(properties));
}

export function identifyAnalyticsUser(userId: string | null): void {
  if (!hasAnalyticsConsent()) return;
  initProductAnalytics();
  if (!initialized) return;
  if (userId) posthog.identify(userId);
  else posthog.reset();
}

export function resetAnalyticsUser(): void {
  if (initialized) posthog.reset();
}
