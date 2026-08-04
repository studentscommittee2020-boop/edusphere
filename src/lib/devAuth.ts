import type { Profile } from "@/types/database";

/**
 * DEVELOPMENT-ONLY role preview.
 *
 * Lets you view every role-gated surface without a live database, applied
 * migrations, or real credentials.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS CANNOT REACH PRODUCTION
 *
 * Every export below is guarded by `import.meta.env.DEV`, which Vite replaces
 * with the literal `false` at build time. The bodies then sit behind
 * `if (false)`, so the minifier deletes them outright — this file contributes
 * no reachable code to a production bundle. Verify after any change with:
 *
 *   npm run build
 *   grep -r "MOCK_ACCOUNTS\|edusphere-dev-role" dist/   # must return nothing
 *
 * A previous project in this workspace shipped a dev auth backdoor to
 * production and it became a release blocker. A runtime `if` is not enough,
 * because a runtime flag can be flipped by config. A compile-time constant
 * cannot — that is the entire point of the DEV guard.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS DOES NOT DO
 *
 * It fakes ONLY the client's idea of who you are, so role-conditional UI
 * renders. It mints no JWT and grants nothing server-side. Every Supabase
 * query still runs unauthenticated, so live data will come back empty or
 * denied by RLS. That is correct and intended: this previews layout and
 * navigation, never data access. RLS remains the only real authority.
 */

export type MockRole = "owner" | "doctor" | "committee";

export interface MockAccount {
  id: MockRole;
  label: string;
  email: string;
  profile: Profile;
  isOwner: boolean;
  isAdmin: boolean;
  isDoctor: boolean;
  isCommitteeAdmin: boolean;
  isVerifiedStudent: boolean;
}

const STORAGE_KEY = "edusphere-dev-role";

/** Deterministic UUIDs so re-selecting a role is stable across reloads. */
function mockProfile(overrides: Partial<Profile> & Pick<Profile, "id" | "full_name">): Profile {
  return {
    avatar_url: "",
    language: "fr",
    major: "Common",
    semester: "LS1",
    track: "french",
    role: "student",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  } as Profile;
}

export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    id: "owner",
    label: "You (Owner)",
    email: "elietecovery@gmail.com",
    isOwner: true,
    isAdmin: true,
    isDoctor: false,
    isCommitteeAdmin: false,
    // Owner inherits every surface, including the student ones.
    isVerifiedStudent: true,
    profile: mockProfile({
      id: "00000000-0000-4000-8000-000000000001",
      full_name: "Elie (Owner)",
      role: "admin",
      major: "Finance",
      semester: "LS5",
    }),
  },
  {
    id: "doctor",
    label: "Doctor",
    email: "dr.haddad@ul.edu.lb",
    isOwner: false,
    isAdmin: false,
    isDoctor: true,
    isCommitteeAdmin: false,
    isVerifiedStudent: false,
    profile: mockProfile({
      id: "00000000-0000-4000-8000-000000000002",
      full_name: "Dr. Haddad",
      role: "doctor",
      major: "Finance",
      semester: "LS5",
    }),
  },
  {
    id: "committee",
    label: "Student Council",
    email: "council@ul.edu.lb",
    isOwner: false,
    isAdmin: false,
    isDoctor: false,
    isCommitteeAdmin: true,
    isVerifiedStudent: false,
    profile: mockProfile({
      id: "00000000-0000-4000-8000-000000000003",
      full_name: "Student Council",
      role: "committee_admin",
      major: "Common",
      semester: "LS3",
    }),
  },
];

/** The selected mock account, or null. Always null in production. */
export function getDevRole(): MockAccount | null {
  if (!import.meta.env.DEV) return null;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return MOCK_ACCOUNTS.find((account) => account.id === stored) ?? null;
  } catch {
    return null;
  }
}

/** Selects a mock account, or clears it with null. Reloads to re-run auth. */
export function setDevRole(role: MockRole | null): void {
  if (!import.meta.env.DEV) return;
  try {
    if (role) window.sessionStorage.setItem(STORAGE_KEY, role);
    else window.sessionStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  } catch {
    // sessionStorage unavailable (private mode) — preview simply stays off.
  }
}

/** True when a dev role is active. Drives the warning banner. */
export function isDevRoleActive(): boolean {
  return import.meta.env.DEV && getDevRole() !== null;
}
