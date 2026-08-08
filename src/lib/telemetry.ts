import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database";
import {
  captureProductEvent,
  identifyAnalyticsUser,
  initProductAnalytics,
  resetAnalyticsUser,
  sanitizeAnalyticsProperties,
} from "@/lib/posthog";

/**
 * First-party telemetry starts by default alongside the configured PostHog
 * product stream. Both streams accept only curated, non-sensitive events.
 */
const ANON_COOKIE = "es_aid";
const SESSION_COOKIE = "es_sid";
const ANON_MAX_AGE = 60 * 60 * 24 * 365;
const SESSION_MAX_AGE = 60 * 30;
const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH = 25;

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
}

function anonymousId(): string {
  let id = readCookie(ANON_COOKIE);
  if (!id) {
    id = crypto.randomUUID();
    writeCookie(ANON_COOKIE, id, ANON_MAX_AGE);
  }
  return id;
}

function sessionId(): string {
  const id = readCookie(SESSION_COOKIE) ?? crypto.randomUUID();
  writeCookie(SESSION_COOKIE, id, SESSION_MAX_AGE);
  return id;
}

interface QueuedEvent {
  user_id: string | null;
  anonymous_id: string;
  session_id: string;
  event_name: string;
  path: string;
  referrer: string;
  properties: Json;
  user_agent: string;
  locale: string;
  timezone: string;
  viewport: string;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;
let started = false;

export function setTelemetryUser(userId: string | null): void {
  currentUserId = userId;
  if (userId) identifyAnalyticsUser(userId);
  else resetAnalyticsUser();
}

function environmentFields() {
  let timezone = "";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    // Browser support must not affect the portal.
  }
  return {
    user_agent: navigator.userAgent.slice(0, 500),
    locale: navigator.language ?? "",
    timezone,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

function safeReferrer(): string {
  if (!document.referrer) return "";
  try {
    const url = new URL(document.referrer);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

async function flush(useBeacon = false): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (useBeacon && typeof navigator.sendBeacon === "function") {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/telemetry_events`;
    const blob = new Blob([JSON.stringify(batch)], { type: "application/json" });
    if (navigator.sendBeacon(`${url}?apikey=${import.meta.env.VITE_SUPABASE_ANON_KEY}`, blob)) return;
  }
  const { error } = await supabase.from("telemetry_events").insert(batch);
  if (error && import.meta.env.DEV) console.warn("[telemetry] insert failed:", error.message);
}

function scheduleFlush(): void {
  if (queue.length >= MAX_BATCH) {
    void flush();
    return;
  }
  if (!flushTimer) flushTimer = setTimeout(() => void flush(), FLUSH_INTERVAL_MS);
}

/** Records a small, curated event. It never throws or blocks the caller. */
export function track(eventName: string, properties: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  try {
    queue.push({
      user_id: currentUserId,
      anonymous_id: anonymousId(),
      session_id: sessionId(),
      event_name: eventName.slice(0, 120),
      path: window.location.pathname,
      referrer: safeReferrer(),
      properties: sanitizeAnalyticsProperties(properties) as Json,
      ...environmentFields(),
    });
    captureProductEvent(eventName, properties);
    scheduleFlush();
  } catch {
    // Analytics is never a reason to interrupt a student.
  }
}

export function trackPageView(path: string): void {
  track("page_view", { path });
}

/** Idempotent. Starts curated analytics when the app starts. */
export function initTelemetry(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  initProductAnalytics();
  window.addEventListener("pagehide", () => void flush(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush(true);
  });
  track("session_start", {
    screen: `${window.screen.width}x${window.screen.height}`,
    pixel_ratio: window.devicePixelRatio,
  });
}
