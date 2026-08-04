import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Two-tier Supabase client: a self-hosted primary (the client's own server —
 * reads AND writes) with the existing Supabase Cloud project kept as an
 * automatic, read-only failover target. Full topology, replication setup,
 * and the failover/failback runbook: docs/ARCHITECTURE-HA.md.
 *
 * ── Design summary ──────────────────────────────────────────────────────
 * - No `VITE_SUPABASE_FALLBACK_URL` / `VITE_SUPABASE_FALLBACK_ANON_KEY` set
 *   (today's state — the self-hosted primary doesn't exist yet): this file
 *   behaves EXACTLY as it did before failover support existed. `supabase`
 *   is the plain object `createClient()` returns — no wrapping, no health
 *   checks, no timers, no extra network calls. This is the branch that
 *   actually ships right now; read it first.
 * - Both fallback vars set: `supabase` becomes a thin `Proxy` that forwards
 *   every call to whichever tier is currently active (primary, until
 *   proven unreachable; then the Cloud fallback; then back to primary once
 *   it's healthy again). Existing call sites — `supabase.from(...)`,
 *   `.rpc(...)`, `.storage...`, `.functions.invoke(...)` — need no changes
 *   anywhere in the app to become failover-aware.
 * - `.auth` is the one deliberate exception: it always resolves to the
 *   PRIMARY client's auth, never the fallback's. Sign in/up/out and token
 *   refresh only ever happen against primary. This mirrors Supabase's own
 *   Read Replica feature, which pins all Auth traffic to the Primary even
 *   when a request goes through its load balancer (verified live,
 *   supabase.com/docs/guides/platform/read-replicas, 2026: "Due to the
 *   requirements of the Auth service, all Auth requests are handled by the
 *   Primary"). The fallback client is instead constructed with an
 *   `accessToken` callback — supabase-js's documented mechanism for using a
 *   *third-party* auth token — that forwards primary's current session
 *   token to every request the fallback client makes. Whether the fallback
 *   project actually accepts that token depends on a one-time ops step
 *   (shared JWT signing key across both stacks) documented in
 *   ARCHITECTURE-HA.md — this file forwards the token if there is one; it
 *   cannot make the fallback project trust it.
 * - Read-only enforcement here is client-side and opt-in (`assertWritable`).
 *   It is not a transport-level interceptor — see that function's doc
 *   comment for exactly what it does and does not guarantee.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const fallbackUrl = import.meta.env.VITE_SUPABASE_FALLBACK_URL;
const fallbackAnonKey = import.meta.env.VITE_SUPABASE_FALLBACK_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[EduSphere] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Set them in .env.local (dev) or Vercel Environment Variables (prod)."
  );
}

/** True when Supabase is properly configured */
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Constructed exactly as before failover support existed — this call is
// unchanged on purpose. The no-fallback-configured path at the bottom of
// this file re-exports this exact object with zero wrapping, so a
// deployment with no fallback vars set is byte-for-byte identical to
// before this file was reworked.
const primaryClient = createClient<Database>(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder",
);

const fallbackConfigured = !!(fallbackUrl && fallbackAnonKey);

if ((fallbackUrl || fallbackAnonKey) && !fallbackConfigured) {
  console.warn(
    "[EduSphere] Only one of VITE_SUPABASE_FALLBACK_URL / VITE_SUPABASE_FALLBACK_ANON_KEY " +
      "is set. Both are required to enable failover — ignoring, running single-tier against primary."
  );
}

// ── Observable connection state ─────────────────────────────────────────────
// Safe to use unconditionally, whether or not a fallback is configured — a
// deployment with no fallback just never transitions off "primary".

export type ConnectionTier = "primary" | "fallback";

export interface ConnectionState {
  /** Which backend is currently serving `.from()` / `.storage` / `.rpc()` calls. */
  tier: ConnectionTier;
  /** True when writes must be rejected client-side (tier === "fallback"). */
  readOnly: boolean;
  /** Whether this deployment has a fallback target configured at all. */
  fallbackConfigured: boolean;
  /** Epoch ms when the current tier was entered. */
  since: number;
}

let currentTier: ConnectionTier = "primary";
let tierSince = Date.now();
const listeners = new Set<() => void>();

function setTier(next: ConnectionTier) {
  if (next === currentTier) return;
  currentTier = next;
  tierSince = Date.now();
  for (const listener of listeners) listener();
}

/** Point-in-time snapshot of the connection state. */
export function getConnectionState(): ConnectionState {
  return {
    tier: currentTier,
    readOnly: currentTier === "fallback",
    fallbackConfigured,
    since: tierSince,
  };
}

/**
 * Subscribe to connection-state changes. `onChange` takes no arguments —
 * re-read state with `getConnectionState()`. Pass this pair directly to
 * React's `useSyncExternalStore(subscribeConnectionState, getConnectionState)`;
 * no adapter needed. Returns an unsubscribe function.
 */
export function subscribeConnectionState(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Convenience — equivalent to `getConnectionState().readOnly`. */
export function isReadOnly(): boolean {
  return currentTier === "fallback";
}

/**
 * Thrown by `assertWritable()`. Carries a stable `.code` so UI code can
 * render its own (bilingual) copy instead of `.message`, which is plain
 * English by convention (matches every other thrown Error in this codebase
 * — see src/lib/errors.ts).
 */
export class ReadOnlyModeError extends Error {
  readonly code = "READ_ONLY_MODE" as const;
  constructor(action?: string) {
    super(
      action
        ? `Cannot perform "${action}": the app is running in read-only mode (primary database unreachable).`
        : "This action is unavailable in read-only mode (primary database unreachable).",
    );
    this.name = "ReadOnlyModeError";
  }
}

/**
 * Call at the top of any service function that writes: inserts, updates,
 * deletes, storage uploads/removals, or a mutating RPC/Edge Function
 * invoke. Throws `ReadOnlyModeError` when the app is currently on the
 * read-only fallback; returns normally (no-op) otherwise.
 *
 * This is an opt-in, early-rejection convenience — it exists so a write
 * fails immediately with a clear, typed error instead of failing deep in
 * PostgREST (a confusing RLS/permission-denied error, or worse, silently
 * succeeding against the fallback if it isn't locked down at the database
 * level). It is NOT a transport-level interceptor: nothing in this file
 * stops a service that forgets to call this from actually reaching the
 * fallback's PostgREST/Storage API. The real backstop against a forgotten
 * check is a database-level one — REVOKE INSERT/UPDATE/DELETE from the
 * fallback project's `authenticated`/`anon` roles (or equivalent RLS
 * `WITH CHECK (false)` policies) — see the risks section of
 * docs/ARCHITECTURE-HA.md. Treat this function as the UX layer, not the
 * security boundary.
 */
export function assertWritable(action?: string): void {
  if (currentTier === "fallback") {
    throw new ReadOnlyModeError(action);
  }
}

// ── Tier-selection logic (pure, exported for unit testing without a network) ─

export interface TierProbeState {
  tier: ConnectionTier;
  primaryFailStreak: number;
  primarySuccessStreak: number;
}

export interface TierProbeSample {
  primaryHealthy: boolean;
  fallbackHealthy: boolean;
}

/**
 * Consecutive same-result probes required before switching tiers, so one
 * dropped packet or a 2-3s blip doesn't flap the app between primary and
 * fallback. [UNVERIFIED]: a starting heuristic, not calibrated against this
 * app's actual failure behavior in production — tune once observed (see
 * `verification.md`'s guidance on treating decision thresholds like this as
 * tunable signals, not laws).
 */
export const FAILOVER_THRESHOLD = 2;
export const FAILBACK_THRESHOLD = 2;

/**
 * Given the previous tier-probe state and a fresh health sample, decides
 * the next state. Hysteretic by design: the failover threshold only counts
 * while on primary, the failback threshold only counts while on fallback,
 * so recovering-then-flapping primaries can't cause rapid tier oscillation.
 * Never fails over to a fallback that the same sample shows as unhealthy.
 */
export function computeNextTier(
  prev: TierProbeState,
  sample: TierProbeSample,
): TierProbeState {
  const primaryFailStreak = sample.primaryHealthy ? 0 : prev.primaryFailStreak + 1;
  const primarySuccessStreak = sample.primaryHealthy ? prev.primarySuccessStreak + 1 : 0;

  let tier = prev.tier;
  if (
    prev.tier === "primary" &&
    primaryFailStreak >= FAILOVER_THRESHOLD &&
    sample.fallbackHealthy
  ) {
    tier = "fallback";
  } else if (prev.tier === "fallback" && primarySuccessStreak >= FAILBACK_THRESHOLD) {
    tier = "primary";
  }

  return { tier, primaryFailStreak, primarySuccessStreak };
}

/**
 * A cheap *authenticated* round trip, not a bare TCP/ping check: GETs
 * PostgREST's root route with this tier's own anon key. Any non-2xx
 * response (wrong/revoked key, RLS gateway misconfigured, 5xx) counts as
 * unhealthy, not just a connection failure — the point is "would real app
 * traffic succeed here," not just "is a socket open." Bounded by an
 * explicit timeout shorter than the probe interval so a hung request can't
 * pile up (cross-cutting.md RULE 2.4).
 */
async function probeHealth(url: string, anonKey: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/`, {
      method: "GET",
      headers: { apikey: anonKey },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wraps `primary` in a `Proxy` that forwards every property access to
 * whichever client `getActive()` currently returns, EXCEPT `.auth`, which
 * always resolves to `primary.auth` (see the file-level doc comment for
 * why). Methods are re-bound to the real target before being returned —
 * `Reflect.get` alone is not enough here: a Proxy's `get` trap intercepts
 * the property read, but if the returned function is later *called* as
 * `proxy.from(...)`, JS calls it with `this = proxy`, not `this = target`.
 * supabase-js's client classes rely on real internal state (some behind
 * private fields) that a bare Proxy object doesn't have, so an unbound
 * forward breaks at the first real method call. Binding fixes it.
 */
function createTierAwareClient(
  primary: SupabaseClient<Database>,
  getActive: () => SupabaseClient<Database>,
): SupabaseClient<Database> {
  return new Proxy(primary, {
    get(_target, prop) {
      if (prop === "auth") return primary.auth;
      const real = getActive();
      const value = Reflect.get(real, prop, real);
      return typeof value === "function" ? value.bind(real) : value;
    },
  });
}

export const supabase: SupabaseClient<Database> = (() => {
  if (!isSupabaseConfigured || !fallbackUrl || !fallbackAnonKey) {
    return primaryClient;
  }

  // Re-bind to plain `string` locals so every closure below (including the
  // nested `runProbeTick` function declaration) has an unambiguous type —
  // TypeScript does not reliably carry a truthy-narrowed `string | undefined`
  // across a nested function declaration's boundary.
  const primaryUrl: string = supabaseUrl;
  const primaryAnonKey: string = supabaseAnonKey;
  const activeFallbackUrl: string = fallbackUrl;
  const activeFallbackAnonKey: string = fallbackAnonKey;

  const fallbackClient = createClient<Database>(activeFallbackUrl, activeFallbackAnonKey, {
    auth: {
      // Auth is pinned to primary (see file-level doc comment) — the
      // fallback client must not try to manage or persist its own session.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // supabase-js's "third-party auth" mechanism, repurposed: our own
    // primary is the "third party" whose token every fallback request
    // carries. Setting this makes fallbackClient.auth unusable by design —
    // fine, since createTierAwareClient() never routes `.auth` here.
    accessToken: async () => {
      const { data } = await primaryClient.auth.getSession();
      return data.session?.access_token ?? null;
    },
  });

  const PROBE_TIMEOUT_MS = 5_000;
  const PROBE_INTERVAL_MS = 30_000;
  const INITIAL_PROBE_DELAY_MS = 1_500;

  let probeState: TierProbeState = {
    tier: "primary",
    primaryFailStreak: 0,
    primarySuccessStreak: 0,
  };
  let inFlight = false;

  async function runProbeTick() {
    if (inFlight) return;
    // Never spam the network from a backgrounded tab (e.g. left open
    // overnight) — try again next interval instead.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

    inFlight = true;
    try {
      const [primaryHealthy, fallbackHealthy] = await Promise.all([
        probeHealth(primaryUrl, primaryAnonKey, PROBE_TIMEOUT_MS),
        probeHealth(activeFallbackUrl, activeFallbackAnonKey, PROBE_TIMEOUT_MS),
      ]);

      probeState = computeNextTier(probeState, { primaryHealthy, fallbackHealthy });

      if (probeState.tier !== currentTier) {
        if (probeState.tier === "fallback") {
          console.error(
            `[EduSphere] Primary Supabase unreachable after ${FAILOVER_THRESHOLD} consecutive checks — ` +
              "failing over to read-only Supabase Cloud fallback."
          );
        } else {
          console.info(
            "[EduSphere] Primary Supabase healthy again — failing back from read-only fallback."
          );
        }
        setTier(probeState.tier);
      }
    } finally {
      inFlight = false;
    }
  }

  const initialTimer = setTimeout(runProbeTick, INITIAL_PROBE_DELAY_MS);
  const intervalId = setInterval(runProbeTick, PROBE_INTERVAL_MS);

  // Avoid duplicate probe loops piling up across Vite HMR reloads of this
  // file during local dev.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      clearTimeout(initialTimer);
      clearInterval(intervalId);
    });
  }

  return createTierAwareClient(primaryClient, () =>
    currentTier === "primary" ? primaryClient : fallbackClient,
  );
})();
