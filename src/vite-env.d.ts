/// <reference types="vite/client" />

/**
 * Typed access to the VITE_* variables this app reads. Anything not declared
 * here is a compile error at the `import.meta.env` site rather than an
 * `undefined` discovered at runtime.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /**
   * Optional read-only failover target (intended: the existing Supabase
   * Cloud project, once VITE_SUPABASE_URL above points at the self-hosted
   * primary). Both fallback vars must be set together to enable failover —
   * leaving either/both empty keeps today's single-tier behavior with zero
   * added overhead. See src/lib/supabase.ts and docs/ARCHITECTURE-HA.md.
   */
  readonly VITE_SUPABASE_FALLBACK_URL?: string;
  readonly VITE_SUPABASE_FALLBACK_ANON_KEY?: string;
  /** Sentry DSN. Empty or absent disables Sentry entirely. */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  /** Fraction of transactions traced, 0–1. Defaults to 1 in dev, 0.2 in prod. */
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  /** Fraction of ordinary sessions replayed, 0–1. Errors always replay. */
  readonly VITE_SENTRY_REPLAY_SAMPLE_RATE?: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
