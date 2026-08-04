import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database";

/**
 * First-party telemetry.
 *
 * Per the product decision, this collects unconditionally — there is no consent
 * gate. What it collects is disclosed on /privacy and in docs/PRIVACY.md.
 *
 * Two identifiers are set as cookies:
 *   · es_aid — anonymous id, 1 year, survives sign-out, links sessions
 *   · es_sid — session id, 30 min sliding, one browsing session
 *
 * Both are first-party, Lax, and Secure outside localhost. Events are queued
 * and flushed in batches so a burst of page views is one request, and are
 * flushed on pagehide via sendBeacon so the last event of a session is not lost.
 *
 * Deliberately never collected: student file numbers, OTP codes, passwords,
 * or any form field value. Only the events named below are emitted.
 */

const ANON_COOKIE = "es_aid";
const SESSION_COOKIE = "es_sid";
const ANON_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const SESSION_MAX_AGE = 60 * 30; // 30 minutes, refreshed on each event

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH = 25;

// ── Cookie helpers ───────────────────────────────────────────────────────────

function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
}

function newId(): string {
  return crypto.randomUUID();
}

function anonymousId(): string {
  let id = readCookie(ANON_COOKIE);
  if (!id) {
    id = newId();
    writeCookie(ANON_COOKIE, id, ANON_MAX_AGE);
  }
  return id;
}

function sessionId(): string {
  let id = readCookie(SESSION_COOKIE);
  if (!id) id = newId();
  // Rewritten on every read so the 30-minute window slides with activity.
  writeCookie(SESSION_COOKIE, id, SESSION_MAX_AGE);
  return id;
}

// ── Queue ────────────────────────────────────────────────────────────────────

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
}

function environmentFields() {
  let timezone = "";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    timezone = "";
  }

  return {
    user_agent: navigator.userAgent.slice(0, 500),
    locale: navigator.language ?? "",
    timezone,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

async function flush(useBeacon = false): Promise<void> {
  if (queue.length === 0) return;

  const batch = queue;
  queue = [];

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  // On pagehide the tab may die before fetch resolves; sendBeacon survives it.
  if (useBeacon && typeof navigator.sendBeacon === "function") {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/telemetry_events`;
    const blob = new Blob([JSON.stringify(batch)], { type: "application/json" });
    // Beacon cannot set headers, so this only lands if the endpoint accepts
    // anon inserts — which telemetry_insert_anyone does. A failure here is
    // acceptable: it costs at most the final event of a session.
    const sent = navigator.sendBeacon(`${url}?apikey=${import.meta.env.VITE_SUPABASE_ANON_KEY}`, blob);
    if (sent) return;
  }

  const { error } = await supabase.from("telemetry_events").insert(batch);

  // Telemetry must never break the app or spam the console in production.
  if (error && import.meta.env.DEV) {
    console.warn("[telemetry] insert failed:", error.message);
  }
}

function scheduleFlush(): void {
  if (queue.length >= MAX_BATCH) {
    void flush();
    return;
  }
  if (flushTimer) return;
  flushTimer = setTimeout(() => void flush(), FLUSH_INTERVAL_MS);
}

/**
 * Records an event. Fire-and-forget: never throws, never blocks the caller.
 * `properties` must contain no personal data — pass ids and enums, not values.
 */
export function track(
  eventName: string,
  properties: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return;

  try {
    queue.push({
      user_id: currentUserId,
      anonymous_id: anonymousId(),
      session_id: sessionId(),
      event_name: eventName.slice(0, 120),
      path: window.location.pathname,
      referrer: document.referrer,
      // Callers pass plain records; the column is jsonb. Anything not
      // JSON-serialisable is the caller's bug, not something to mask here.
      properties: properties as Json,
      ...environmentFields(),
    });
    scheduleFlush();
  } catch {
    // A telemetry failure is never worth surfacing to a student.
  }
}

export function trackPageView(path: string): void {
  track("page_view", { path });
}

/** Idempotent. Call once at app start. */
export function initTelemetry(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  // pagehide is the reliable terminal event on mobile Safari; visibilitychange
  // covers tab-switching, which is where most sessions actually end.
  window.addEventListener("pagehide", () => void flush(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush(true);
  });

  track("session_start", {
    screen: `${window.screen.width}x${window.screen.height}`,
    pixel_ratio: window.devicePixelRatio,
  });
}
