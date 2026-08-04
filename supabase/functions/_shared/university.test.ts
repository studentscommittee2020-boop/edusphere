import { describe, expect, it } from "vitest";
import {
  normaliseMajor,
  normaliseSemester,
  normaliseTrack,
  parseEnrollments,
  parseSchedule,
} from "./university";

// This file is intentionally co-located with university.ts (outside src/) rather
// than under src/test/. university.ts is Deno-targeted — `callUniversity` uses
// the global `Deno` namespace, which the app's tsconfig.app.json (include: ["src"])
// has no ambient types for. Keeping this test file outside "src" means `tsc -b`
// (npm run typecheck / npm run build) never pulls university.ts into its program,
// so it can't fail on the unresolved `Deno` symbol. Vitest itself only transpiles
// (esbuild, no type-checking) and never executes callUniversity's body here, so
// the untyped `Deno` reference is inert at runtime too.

// ── normaliseSemester ────────────────────────────────────────────────────────

describe("normaliseSemester", () => {
  it.each([
    ["LS5", "LS5"],
    ["ls5", "LS5"],
    ["S5", "LS5"],
    ["5", "LS5"],
    ["L3-S5", "LS5"],
  ])("normaliseSemester(%j) -> %j", (input, expected) => {
    expect(normaliseSemester(input)).toBe(expected);
  });

  it("rejects a non-numeric word", () => {
    expect(normaliseSemester("garbage")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(normaliseSemester("")).toBeNull();
  });

  it("rejects null, undefined, and non-string values", () => {
    expect(normaliseSemester(null)).toBeNull();
    expect(normaliseSemester(undefined)).toBeNull();
    expect(normaliseSemester(5)).toBeNull();
  });

  // BUG (source, not test): normaliseSemester's fallback regex `/(\d)$/` only
  // inspects the LAST character of the uppercased input. It does not require
  // the string to actually look like a semester reference (an "S" prefix, or
  // being all-digits, or the "L<n>-S<n>" shape) — it just grabs whatever
  // single digit 1-9 the string happens to end with. Confirmed empirically:
  //   normaliseSemester("S99")     -> "LS9"  (should be null: 99 is out of range)
  //   normaliseSemester("hello9")  -> "LS9"  (should be null: not a semester at all)
  //   normaliseSemester("room101") -> "LS1"  (should be null: not a semester at all)
  // Real-world impact: any upstream field that happens to end in a digit
  // 1-9 (a room number, a stray ID, truncated garbage) silently becomes a
  // *valid-looking* semester instead of being rejected, so a parse failure
  // that should show up as `null` instead silently mis-files a student's
  // record under the wrong semester. These three assertions are left
  // failing on purpose per instructions — do not loosen them to pass; the
  // source fix belongs to whichever agent owns supabase/functions/_shared/university.ts.
  it("rejects an out-of-range semester number like S99", () => {
    expect(normaliseSemester("S99")).toBeNull();
  });

  it("rejects a non-semester word that happens to end in a digit", () => {
    expect(normaliseSemester("hello9")).toBeNull();
  });

  it("rejects an unrelated alphanumeric id that happens to end in a digit", () => {
    expect(normaliseSemester("room101")).toBeNull();
  });
});

// ── normaliseTrack ───────────────────────────────────────────────────────────

describe("normaliseTrack", () => {
  it.each([
    ["French", "french"],
    ["fr", "french"],
    ["FRANCAIS", "french"],
    ["English", "english"],
    ["en", "english"],
  ])("normaliseTrack(%j) -> %j", (input, expected) => {
    expect(normaliseTrack(input)).toBe(expected);
  });

  it("returns null for garbage input", () => {
    expect(normaliseTrack("spanish")).toBeNull();
    expect(normaliseTrack("")).toBeNull();
    expect(normaliseTrack(null)).toBeNull();
    expect(normaliseTrack(42)).toBeNull();
  });
});

// ── normaliseMajor ───────────────────────────────────────────────────────────

describe("normaliseMajor", () => {
  it("matches case-insensitively", () => {
    expect(normaliseMajor("common")).toBe("Common");
    expect(normaliseMajor("FINANCE")).toBe("Finance");
    expect(normaliseMajor("MiS")).toBe("MIS");
  });

  it("matches the compound 'Audit & Accounting' major case-insensitively", () => {
    expect(normaliseMajor("Audit & Accounting")).toBe("Audit & Accounting");
    expect(normaliseMajor("audit & accounting")).toBe("Audit & Accounting");
    expect(normaliseMajor("AUDIT & ACCOUNTING")).toBe("Audit & Accounting");
  });

  it("returns null for garbage input", () => {
    expect(normaliseMajor("Underwater Basket Weaving")).toBeNull();
    expect(normaliseMajor("")).toBeNull();
    expect(normaliseMajor(null)).toBeNull();
    expect(normaliseMajor(123)).toBeNull();
  });
});

// ── parseSchedule ────────────────────────────────────────────────────────────

describe("parseSchedule", () => {
  const validEntry = {
    day_of_week: 1,
    starts_at: "08:30",
    ends_at: "10:00",
    course_code: "FIN301",
    course_label: "Corporate Finance",
    room: "A1",
    instructor: "Dr. Khoury",
    kind: "lecture",
  };

  it("parses a well-formed entry", () => {
    const result = parseSchedule({ entries: [validEntry] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      day_of_week: 1,
      starts_at: "08:30:00",
      ends_at: "10:00:00",
      course_code: "FIN301",
      course_label: "Corporate Finance",
    });
  });

  it("accepts '8:30', '08:30', and '0830' time formats", () => {
    const result = parseSchedule({
      entries: [
        { ...validEntry, starts_at: "8:30", ends_at: "10:00" },
        { ...validEntry, starts_at: "08:30", ends_at: "10:00" },
        { ...validEntry, starts_at: "0830", ends_at: "1000" },
      ],
    });
    expect(result).toHaveLength(3);
    for (const e of result) {
      expect(e.starts_at).toBe("08:30:00");
      expect(e.ends_at).toBe("10:00:00");
    }
  });

  it("drops entries with a malformed day_of_week", () => {
    const result = parseSchedule({
      entries: [{ ...validEntry, day_of_week: 0 }, { ...validEntry, day_of_week: 8 }, { ...validEntry, day_of_week: "sometime" }],
    });
    expect(result).toHaveLength(0);
  });

  it("drops entries where end <= start instead of throwing", () => {
    expect(() =>
      parseSchedule({ entries: [{ ...validEntry, starts_at: "10:00", ends_at: "08:00" }] }),
    ).not.toThrow();
    const result = parseSchedule({
      entries: [
        { ...validEntry, starts_at: "10:00", ends_at: "08:00" }, // end before start
        { ...validEntry, starts_at: "10:00", ends_at: "10:00" }, // end == start
      ],
    });
    expect(result).toHaveLength(0);
  });

  it("drops entries missing both course_code and course_label", () => {
    const result = parseSchedule({
      entries: [{ ...validEntry, course_code: undefined, course_label: "" }],
    });
    expect(result).toHaveLength(0);
  });

  it("keeps an entry that has only course_code or only course_label", () => {
    const result = parseSchedule({
      entries: [
        { ...validEntry, course_code: "FIN301", course_label: "" },
        { ...validEntry, course_code: undefined, course_label: "Corporate Finance" },
      ],
    });
    expect(result).toHaveLength(2);
  });

  it("does not throw on a non-array or missing entries payload — returns an empty list", () => {
    expect(() => parseSchedule({})).not.toThrow();
    expect(parseSchedule({})).toEqual([]);
    expect(parseSchedule({ entries: "not an array" })).toEqual([]);
    expect(parseSchedule({ entries: [null, 42, "junk"] })).toEqual([]);
  });
});

// ── parseEnrollments ─────────────────────────────────────────────────────────

describe("parseEnrollments", () => {
  it("skips rows with no course_code", () => {
    const result = parseEnrollments(
      { courses: [{ course_code: "" }, { course_code: undefined }, { status: "completed" }] },
      "LS5",
      "2025-2026",
    );
    expect(result).toHaveLength(0);
  });

  it("keeps rows with a course_code and fills fallback semester/year", () => {
    const result = parseEnrollments(
      { courses: [{ course_code: "FIN301" }] },
      "LS5",
      "2025-2026",
    );
    expect(result).toEqual([
      {
        course_code: "FIN301",
        semester: "LS5",
        academic_year: "2025-2026",
        status: "enrolled",
        grade: null,
      },
    ]);
  });

  it("nulls out-of-range grades", () => {
    const result = parseEnrollments(
      {
        courses: [
          { course_code: "A", grade: -5 },
          { course_code: "B", grade: 150 },
          { course_code: "C", grade: 85 },
          { course_code: "D", grade: "not a number" },
        ],
      },
      "LS5",
      "2025-2026",
    );
    expect(result.map((r) => r.grade)).toEqual([null, null, 85, null]);
  });

  it("does not throw on a non-array or missing courses payload", () => {
    expect(() => parseEnrollments({}, "LS5", "2025-2026")).not.toThrow();
    expect(parseEnrollments({}, "LS5", "2025-2026")).toEqual([]);
  });
});
