import { useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { MOCK_ACCOUNTS, getDevRole, setDevRole } from "@/lib/devAuth";
import { cn } from "@/lib/utils";

/**
 * DEVELOPMENT-ONLY floating role switcher.
 *
 * Returns null immediately in production. `import.meta.env.DEV` is replaced by
 * the literal `false` at build time, so this component's body is dead code the
 * minifier removes — see the header of `src/lib/devAuth.ts`.
 *
 * It is deliberately loud. A role-preview control that looks like normal chrome
 * is how a backdoor gets forgotten and shipped; this one is impossible to miss
 * while it is switched on.
 */
export default function DevRoleSwitcher() {
  if (!import.meta.env.DEV) return null;

  const active = getDevRole();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Persistent banner whenever a role is being faked. */}
      {active && (
        <div className="fixed top-0 inset-x-0 z-[100] bg-red-600 text-white text-[11px] font-display font-bold tracking-wide text-center py-1 px-3 pointer-events-none">
          DEV ROLE PREVIEW — viewing as {active.label}. UI only; no real access.
        </div>
      )}

      <div className={cn("fixed z-[100] right-4", active ? "bottom-4" : "bottom-4")}>
        {open ? (
          <div className="surface-raised w-60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="eyebrow text-red-400">
                <FlaskConical className="w-3.5 h-3.5" />
                Dev preview
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-white/[0.06] text-muted-foreground"
                aria-label="Close role switcher"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-snug">
              Renders role-gated UI without a login. Data stays empty — RLS is
              still the only real authority.
            </p>

            <div className="space-y-1">
              {MOCK_ACCOUNTS.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setDevRole(account.id)}
                  className={cn(
                    "w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors",
                    active?.id === account.id
                      ? "bg-red-500/15 text-red-300"
                      : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
                  )}
                >
                  <span className="block font-display font-bold">{account.label}</span>
                  <span className="block text-[10px] opacity-70 truncate">{account.email}</span>
                </button>
              ))}
            </div>

            {active && (
              <button
                type="button"
                onClick={() => setDevRole(null)}
                className="w-full py-1.5 rounded-lg border border-border text-[11px] font-display font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign out of preview
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-xs font-display font-bold transition-transform hover:scale-[1.03]",
              active ? "bg-red-600 text-white" : "surface-raised text-muted-foreground",
            )}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            {active ? active.label : "Dev roles"}
          </button>
        )}
      </div>
    </>
  );
}
