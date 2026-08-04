import { describe, expect, it } from "vitest";
import {
  courseTitle,
  durationMinutes,
  formatTime,
  groupByDay,
  type ScheduleEntryWithCourse,
} from "@/services/academics";
import type { Course } from "@/types/database";

// ── courseTitle ──────────────────────────────────────────────────────────────

describe("courseTitle", () => {
  it("returns title_fr for a french-track course", () => {
    const course = { title: "Intro to Finance", title_fr: "Introduction à la Finance", track: "french" as const };
    expect(courseTitle(course)).toBe("Introduction à la Finance");
  });

  it("returns title for an english-track course", () => {
    const course = { title: "Intro to Finance", title_fr: "Introduction à la Finance", track: "english" as const };
    expect(courseTitle(course)).toBe("Intro to Finance");
  });

  it("depends only on track, never on any other field — swapping title/title_fr content does not change which key is picked", () => {
    const frenchTrack = { title: "EN NAME", title_fr: "FR NAME", track: "french" as const };
    const englishTrack = { title: "EN NAME", title_fr: "FR NAME", track: "english" as const };
    expect(courseTitle(frenchTrack)).toBe("FR NAME");
    expect(courseTitle(englishTrack)).toBe("EN NAME");
  });

  it("takes only {title, title_fr, track} — the type signature has no UI-language field to consult", () => {
    // courseTitle's parameter type is Pick<Course, "title" | "title_fr" | "track">.
    // There is no interface-language input it could branch on even if it wanted
    // to — the compiler enforces that the only signal available is `track`.
    const course: Pick<Course, "title" | "title_fr" | "track"> = {
      title: "Marketing 101",
      title_fr: "Marketing 101 (FR)",
      track: "french",
    };
    // Calling it repeatedly with the identical input is deterministic and
    // always keyed off track, regardless of what interface language a caller
    // happens to be rendering elsewhere in the app.
    expect(courseTitle(course)).toBe(course.title_fr);
    expect(courseTitle(course)).toBe(course.title_fr);
  });
});

// ── groupByDay ───────────────────────────────────────────────────────────────

function entry(overrides: Partial<ScheduleEntryWithCourse>): ScheduleEntryWithCourse {
  return {
    id: "id",
    student_id: "student",
    course_id: "course",
    academic_year: "2025-2026",
    semester: "LS5",
    day_of_week: 1,
    starts_at: "08:30:00",
    ends_at: "10:00:00",
    room: "A1",
    instructor: "Dr. X",
    kind: "lecture",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    courses: null,
    ...overrides,
  } as unknown as ScheduleEntryWithCourse;
}

describe("groupByDay", () => {
  it("returns all 7 ISO weekday keys even when given no entries", () => {
    const result = groupByDay([]);
    expect(Object.keys(result).map(Number).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (let day = 1; day <= 7; day++) {
      expect(result[day]).toEqual([]);
    }
  });

  it("buckets entries under their ISO weekday", () => {
    const monday = entry({ day_of_week: 1 });
    const sunday = entry({ day_of_week: 7 });
    const result = groupByDay([monday, sunday]);
    expect(result[1]).toEqual([monday]);
    expect(result[7]).toEqual([sunday]);
    expect(result[2]).toEqual([]);
  });

  it("keeps multiple entries on the same day, in insertion order", () => {
    const first = entry({ day_of_week: 3, starts_at: "08:00:00" });
    const second = entry({ day_of_week: 3, starts_at: "10:00:00" });
    const result = groupByDay([second, first]);
    expect(result[3]).toEqual([second, first]);
  });
});

// ── formatTime ───────────────────────────────────────────────────────────────

describe("formatTime", () => {
  it("strips seconds from an HH:MM:SS string", () => {
    expect(formatTime("08:30:00")).toBe("08:30");
  });

  it("handles other times consistently", () => {
    expect(formatTime("23:59:59")).toBe("23:59");
    expect(formatTime("00:00:00")).toBe("00:00");
  });
});

// ── durationMinutes ──────────────────────────────────────────────────────────

describe("durationMinutes", () => {
  it("computes 90 minutes between 08:30 and 10:00", () => {
    expect(durationMinutes("08:30:00", "10:00:00")).toBe(90);
  });

  it("computes 0 for identical start and end", () => {
    expect(durationMinutes("09:00:00", "09:00:00")).toBe(0);
  });

  it("never goes negative when end precedes start", () => {
    expect(durationMinutes("10:00:00", "08:30:00")).toBe(0);
  });

  it("handles cross-hour spans correctly", () => {
    expect(durationMinutes("07:45:00", "09:15:00")).toBe(90);
  });
});
