/**
 * Single translation point between the university API and EduSphere.
 *
 * Every value crossing this boundary is normalised here. Nothing downstream —
 * not the sync RPC, not the database, not the UI — should ever see a raw
 * university label. If the production API uses different vocabularies, the
 * `normalise*` functions below are the only place that needs to change.
 *
 * See docs/UNIVERSITY-API.md for the contract.
 */

export const SEMESTERS = [
  "LS1", "LS2", "LS3", "LS4", "LS5", "LS6", "LS7", "LS8", "LS9",
] as const;
export type Semester = (typeof SEMESTERS)[number];

export const MAJORS = [
  "Common", "Audit & Accounting", "Finance", "Marketing", "Management", "MIS",
] as const;
export type Major = (typeof MAJORS)[number];

export type Track = "french" | "english";
export type EnrollmentStatus = "enrolled" | "completed" | "withdrawn" | "failed";
export type ScheduleKind = "lecture" | "td" | "tp" | "exam" | "other";

export interface StudentIdentity {
  fullName: string;
  major: Major | null;
  semester: Semester | null;
  track: Track | null;
  academicYear: string | null;
}

export interface ScheduleEntry {
  course_code: string | null;
  course_label: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  room: string;
  instructor: string;
  kind: ScheduleKind;
}

export interface EnrollmentRecord {
  course_code: string;
  semester: Semester;
  academic_year: string;
  status: EnrollmentStatus;
  grade: number | null;
}

// ── Normalisers ─────────────────────────────────────────────────────────────

export function normaliseSemester(value: unknown): Semester | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase().replace(/[\s-]/g, "");
  if ((SEMESTERS as readonly string[]).includes(upper)) return upper as Semester;
  // Tolerate exactly three shapes: "S5", "5", and "L3-S5" (already de-hyphenated
  // above to "L3S5"). Fully anchored (^...$) so a trailing digit is never
  // sufficient on its own — "S99" (out of range), "hello9", and "room101"
  // (not a semester reference at all) must all fall through to null instead
  // of silently resolving to a semester that was never actually there. Was
  // previously `/(\d)$/`, which matched the last character of *any* string.
  const match = upper.match(/^(?:S|L\d+S)?([1-9])$/);
  if (match) {
    const candidate = `LS${match[1]}`;
    if ((SEMESTERS as readonly string[]).includes(candidate)) return candidate as Semester;
  }
  return null;
}

export function normaliseMajor(value: unknown): Major | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = MAJORS.find((m) => m.toLowerCase() === trimmed.toLowerCase());
  return match ?? null;
}

export function normaliseTrack(value: unknown): Track | null {
  if (typeof value !== "string") return null;
  const lower = value.trim().toLowerCase();
  // Closed alias sets, not a prefix check: `startsWith("fr")`/`startsWith("en")`
  // would match "friday", "franchise", "entrance-exam", "entropy" — anything
  // that happens to start with those two letters — and confidently return the
  // wrong track instead of null.
  if (lower === "french" || lower === "fr" || lower === "francais" || lower === "français") {
    return "french";
  }
  if (lower === "english" || lower === "en" || lower === "eng") return "english";
  return null;
}

function normaliseStatus(value: unknown): EnrollmentStatus {
  const lower = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (lower === "completed" || lower === "passed") return "completed";
  if (lower === "withdrawn" || lower === "dropped") return "withdrawn";
  if (lower === "failed") return "failed";
  return "enrolled";
}

function normaliseKind(value: unknown): ScheduleKind {
  const lower = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (lower === "td" || lower === "tutorial") return "td";
  if (lower === "tp" || lower === "lab" || lower === "practical") return "tp";
  if (lower === "exam") return "exam";
  if (lower === "lecture" || lower === "cm" || lower === "cours") return "lecture";
  return lower ? "other" : "lecture";
}

/** Accepts "08:30", "8:30", "08:30:00", "0830". Returns "HH:MM:00" or null. */
function normaliseTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/\s/g, "");
  const match = compact.match(/^(\d{1,2}):?(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

// A plain object literal here would be a type-confusion trap: `days[lower]`
// on a Record falls through to Object.prototype for any key that collides
// with an inherited property name. normaliseDayOfWeek("constructor") looked
// up against `{ monday: 1, ... }` returns the Object *constructor function*
// (truthy, so the old `if (days[lower])` guard passed it straight through),
// not a number — silently violating the declared `number | null` return type.
// Same story for "toString", "hasOwnProperty", "__proto__". A Map has no
// prototype-key surface: `.get()` on an absent key is always `undefined`,
// full stop. Hoisted to module scope since the table is fixed data, not
// per-call state.
const DAY_NAMES = new Map<string, number>([
  ["monday", 1], ["lundi", 1],
  ["tuesday", 2], ["mardi", 2],
  ["wednesday", 3], ["mercredi", 3],
  ["thursday", 4], ["jeudi", 4],
  ["friday", 5], ["vendredi", 5],
  ["saturday", 6], ["samedi", 6],
  ["sunday", 7], ["dimanche", 7],
]);

function normaliseDayOfWeek(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7) {
    return value;
  }
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    const named = DAY_NAMES.get(lower);
    if (named !== undefined) return named;
    const numeric = Number(lower);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 7) return numeric;
  }
  return null;
}

function normaliseGrade(value: unknown): number | null {
  // Only ever coerce an actual number, or a non-blank string, through
  // Number(). A bare `Number(value)` on anything else is too permissive:
  // `Number("   ")` is 0 (JS trims first), `Number([])` is 0, `Number(true)`
  // is 1 — a blank cell or a stray boolean/array from upstream would silently
  // become a plausible, in-range, *wrong* grade instead of null.
  let numeric: number;
  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    numeric = Number(trimmed);
  } else {
    return null;
  }
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
  return numeric;
}

// ── Parsers ─────────────────────────────────────────────────────────────────

export function parseIdentity(payload: Record<string, unknown>): StudentIdentity {
  const student = (payload.student ?? {}) as Record<string, unknown>;
  return {
    fullName: typeof student.full_name === "string" ? student.full_name.trim() : "",
    major: normaliseMajor(student.major),
    semester: normaliseSemester(student.semester),
    track: normaliseTrack(student.track),
    academicYear:
      typeof student.academic_year === "string" ? student.academic_year.trim() : null,
  };
}

/** Drops malformed entries rather than failing the whole sync. */
export function parseSchedule(payload: Record<string, unknown>): ScheduleEntry[] {
  const raw = Array.isArray(payload.entries) ? payload.entries : [];
  const entries: ScheduleEntry[] = [];

  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;

    const day = normaliseDayOfWeek(entry.day_of_week ?? entry.day);
    const startsAt = normaliseTime(entry.starts_at ?? entry.start_time);
    const endsAt = normaliseTime(entry.ends_at ?? entry.end_time);
    if (day === null || !startsAt || !endsAt || endsAt <= startsAt) continue;

    const code = typeof entry.course_code === "string" ? entry.course_code.trim() : "";
    const label = typeof entry.course_label === "string" ? entry.course_label.trim() : "";
    if (!code && !label) continue;

    entries.push({
      course_code: code || null,
      course_label: label || code,
      day_of_week: day,
      starts_at: startsAt,
      ends_at: endsAt,
      room: typeof entry.room === "string" ? entry.room.trim().slice(0, 60) : "",
      instructor:
        typeof entry.instructor === "string" ? entry.instructor.trim().slice(0, 120) : "",
      kind: normaliseKind(entry.kind ?? entry.type),
    });
  }

  return entries;
}

export function parseEnrollments(
  payload: Record<string, unknown>,
  fallbackSemester: Semester,
  fallbackYear: string,
): EnrollmentRecord[] {
  const raw = Array.isArray(payload.courses) ? payload.courses : [];
  const records: EnrollmentRecord[] = [];

  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;

    const code = typeof record.course_code === "string" ? record.course_code.trim() : "";
    if (!code) continue;

    records.push({
      course_code: code,
      semester: normaliseSemester(record.semester) ?? fallbackSemester,
      academic_year:
        typeof record.academic_year === "string" && record.academic_year.trim()
          ? record.academic_year.trim()
          : fallbackYear,
      status: normaliseStatus(record.status),
      grade: normaliseGrade(record.grade),
    });
  }

  return records;
}

// ── Transport ───────────────────────────────────────────────────────────────

export class UniversityUnavailableError extends Error {
  constructor(public readonly endpoint: string, public readonly status?: number) {
    super(`University endpoint ${endpoint} unavailable`);
    this.name = "UniversityUnavailableError";
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * POSTs to a university endpoint. Throws UniversityUnavailableError on any
 * transport or non-2xx failure so callers can distinguish "service down"
 * (retryable, not the student's fault) from "not verified" (a real denial).
 */
export async function callUniversity(
  endpoint: "verify" | "schedule" | "courses",
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const baseUrl = Deno.env.get("UNIVERSITY_API_BASE_URL")?.replace(/\/+$/, "");
  const legacyVerifyUrl = Deno.env.get("UNIVERSITY_VERIFICATION_URL");
  const apiKey =
    Deno.env.get("UNIVERSITY_API_KEY") ?? Deno.env.get("UNIVERSITY_VERIFICATION_API_KEY");

  const url =
    endpoint === "verify" && legacyVerifyUrl ? legacyVerifyUrl : `${baseUrl}/${endpoint}`;

  if (!apiKey || (!baseUrl && !(endpoint === "verify" && legacyVerifyUrl))) {
    throw new UniversityUnavailableError(endpoint);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new UniversityUnavailableError(endpoint, response.status);
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof UniversityUnavailableError) throw error;
    throw new UniversityUnavailableError(endpoint);
  } finally {
    clearTimeout(timeout);
  }
}
