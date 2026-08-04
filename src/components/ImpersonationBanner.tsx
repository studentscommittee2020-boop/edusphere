import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { LogOut, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/store/appStore";
import { isDevRoleActive } from "@/lib/devAuth";
import {
  endImpersonation,
  getActiveImpersonation,
  type ActiveImpersonation,
} from "@/services/owner";
import { cn } from "@/lib/utils";

/**
 * Re-checks with the server at this cadence — catches a session that ended
 * from elsewhere (another tab, or the 30-minute hard stop already passing
 * before this tab notices) without polling so tightly it's wasteful. The
 * visible countdown itself ticks every second, purely client-side, between
 * polls — see the two effects below.
 */
const REFRESH_INTERVAL_MS = 20_000;
const TICK_MS = 1_000;

/**
 * DevRoleSwitcher (src/components/DevRoleSwitcher.tsx — out of scope for
 * this component to edit) pins its own dev-only preview banner to
 * `fixed top-0`. When that banner is also showing — dev builds only;
 * isDevRoleActive() is hardwired to `import.meta.env.DEV`, so this whole
 * branch is dead code in production, same as DevRoleSwitcher itself — this
 * banner is pushed down below it by its rendered height instead of the two
 * stacking on top of one another. Matches that component's current
 * `py-1 text-[11px]` markup; revisit if that markup changes.
 */
const DEV_BANNER_OFFSET_PX = 28;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Persistent "you are impersonating someone" bar. Unlike DevRoleSwitcher,
 * this is a REAL production feature — never gated behind
 * `import.meta.env.DEV` — because an active impersonation session is real
 * access to a real account, not a UI preview.
 *
 * Self-contained: fetches its own state (current_impersonation() plus the
 * target's profile, via services/owner.ts), owns its own poll/countdown
 * timers, and renders nothing whenever no session is active. Mounted once,
 * near the root in Layout.tsx, so it is visible — and un-ignorable — on
 * every page, not just the owner console.
 */
export default function ImpersonationBanner() {
  const { language } = useAppStore();
  const isFr = language === "fr";

  const [active, setActive] = useState<ActiveImpersonation | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  const expiresAtMs = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await getActiveImpersonation();
    expiresAtMs.current = data ? new Date(data.session.expires_at).getTime() : null;
    setActive(data);
    setRemainingMs(expiresAtMs.current ? expiresAtMs.current - Date.now() : 0);
  }, []);

  // Poll unconditionally (not just while `active`) — this is what notices a
  // session started in another tab, or one that already ended server-side
  // before this tab looked.
  useEffect(() => {
    void refresh();
    const pollId = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(pollId);
  }, [refresh]);

  // Client-side ticking clock, only while a session is active. This is what
  // catches expiry the instant it happens (rather than up to
  // REFRESH_INTERVAL_MS late) and is what keeps the banner from ever
  // rendering a stale negative countdown — once the local clock says time is
  // up, the banner clears itself immediately without waiting on the network.
  useEffect(() => {
    if (!active) return;
    const tickId = window.setInterval(() => {
      const left = (expiresAtMs.current ?? 0) - Date.now();
      if (left <= 0) {
        expiresAtMs.current = null;
        setActive(null);
        setRemainingMs(0);
        return;
      }
      setRemainingMs(left);
    }, TICK_MS);
    return () => window.clearInterval(tickId);
  }, [active]);

  async function handleStop() {
    setIsEnding(true);
    const { error } = await endImpersonation();
    if (error) {
      toast.error(
        isFr ? "Impossible d'arrêter l'emprunt d'identité." : "Could not stop impersonating.",
      );
      setIsEnding(false);
      return;
    }
    window.location.reload();
  }

  if (!active) return null;

  const targetName =
    active.targetProfile?.full_name?.trim() || active.session.target_user_id.slice(0, 8);
  const countdown = formatCountdown(remainingMs);

  // Coarse, screen-reader-facing summary: its VALUE only changes once the
  // whole-minute bucket changes, so even though this recomputes every
  // second, React only touches the live region's DOM text (and so only
  // triggers an announcement) roughly once a minute — never once a second.
  const minutesLeft = Math.max(0, Math.round(remainingMs / 60_000));
  const announced = isFr
    ? `Vous agissez en tant que ${targetName}. Expire dans environ ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`
    : `Acting as ${targetName}. Expires in about ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`;

  return (
    <motion.div
      initial={{ y: -48, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "fixed inset-x-0 z-[110] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-3 py-2",
        "bg-gradient-red text-white text-xs sm:text-sm shadow-lg shadow-black/30",
        isDevRoleActive() ? "top-[28px]" : "top-0",
      )}
    >
      <span className="inline-flex items-center gap-1.5 font-display font-bold">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          <span className="absolute inset-0 rounded-full bg-red-300 animate-ping opacity-75" />
          <span className="relative rounded-full h-2 w-2 bg-red-200" />
        </span>
        <UserCog className="w-4 h-4 shrink-0" aria-hidden="true" />
        {isFr ? "Vous agissez en tant que" : "Acting as"}
      </span>

      <span className="font-display font-extrabold truncate max-w-[40vw]">{targetName}</span>

      <span className="tabular-nums font-mono text-white/85">
        {isFr ? "expire dans " : "expires in "}
        {countdown}
      </span>

      <button
        type="button"
        onClick={() => void handleStop()}
        disabled={isEnding}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-red-700 font-display font-bold text-xs hover:bg-white/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
        {isEnding ? (isFr ? "Arrêt…" : "Stopping…") : isFr ? "Arrêter l'emprunt d'identité" : "Stop impersonating"}
      </button>

      {/* Auto-announced summary — deliberately separate from the visible,
          every-second countdown above (plain text, not itself a live
          region): a screen reader can still read that on request, it just
          doesn't interrupt on every tick. This span is the only thing that
          auto-announces, and only about once a minute — see `announced`. */}
      <span className="sr-only" role="status" aria-live="polite">
        {announced}
      </span>
    </motion.div>
  );
}
