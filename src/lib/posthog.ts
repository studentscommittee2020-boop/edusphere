import posthog from "posthog-js";

/**
 * Analytics starts by default when a production PostHog project is configured.
 * It is intentionally limited to the approved event list below: credentials,
 * OTPs, file numbers, contact details, files, and academic content are never
 * analytics properties.
 */
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY?.trim() ?? "";
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST?.trim() ?? "";
let initialized = false;

function isAvailable(): boolean {
  // Keep local development and Vercel previews out of production metrics.
  return import.meta.env.PROD && Boolean(POSTHOG_KEY && POSTHOG_HOST);
}

/** Retained as the telemetry feature flag; analytics is enabled by default. */
export function hasAnalyticsConsent(): boolean {
  return true;
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
    person_profiles: "identified_only",
  });
}

const sensitiveProperty = /email|phone|file.?number|otp|pass(word)?|token|secret|document|content|message/i;
const allowedEvents = new Set([
  "page_view", "session_start", "my_courses_viewed", "resource_opened",
  "schedule_viewed", "schedule_sync_failed", "schedule_sync_succeeded",
  "owner_console_opened", "owner_role_changed", "owner_account_inspected",
  "owner_row_deleted", "owner_impersonation_started",
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

export function captureProductEvent(eventName: string, properties: Record<string, unknown> = {}): void {
  if (!allowedEvents.has(eventName)) return;
  initProductAnalytics();
  if (initialized) posthog.capture(eventName, sanitizeAnalyticsProperties(properties));
}

export function identifyAnalyticsUser(userId: string | null): void {
  initProductAnalytics();
  if (!initialized) return;
  if (userId) posthog.identify(userId);
  else posthog.reset();
}

export function resetAnalyticsUser(): void {
  if (initialized) posthog.reset();
}
