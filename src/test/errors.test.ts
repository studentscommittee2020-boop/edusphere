import { describe, expect, it } from "vitest";
import { ApiError, getHttpStatus, getSafeErrorMessage } from "@/lib/errors";

// ── getHttpStatus ────────────────────────────────────────────────────────────

describe("getHttpStatus", () => {
  it("narrows an ApiError instance via instanceof and returns its own httpStatus", () => {
    const error = new ApiError("CONFLICT", "duplicate row", 409);
    expect(error).toBeInstanceOf(ApiError);
    expect(getHttpStatus(error)).toBe(409);
  });

  it("prefers the ApiError's explicit httpStatus over message sniffing", () => {
    // Message says "not found" but the error was explicitly constructed as a 422 —
    // the instanceof branch must win and the string-matching fallback must not run.
    const error = new ApiError("UNPROCESSABLE_ENTITY", "not found in a weird sense", 422);
    expect(getHttpStatus(error)).toBe(422);
  });

  it("falls back to message sniffing for plain Error instances", () => {
    expect(getHttpStatus(new Error("Row not found"))).toBe(404);
    expect(getHttpStatus(new Error("Unauthorized access"))).toBe(401);
    expect(getHttpStatus(new Error("Forbidden: no permission"))).toBe(403);
    expect(getHttpStatus(new Error("unique constraint conflict"))).toBe(409);
    expect(getHttpStatus(new Error("invalid validation input"))).toBe(422);
  });

  it("defaults to 500 for unrecognized errors and non-Error values", () => {
    expect(getHttpStatus(new Error("something exploded"))).toBe(500);
    expect(getHttpStatus("just a string")).toBe(500);
    expect(getHttpStatus(null)).toBe(500);
    expect(getHttpStatus(undefined)).toBe(500);
  });
});

// ── getSafeErrorMessage ──────────────────────────────────────────────────────

describe("getSafeErrorMessage", () => {
  it("narrows an ApiError instance via instanceof and returns its message verbatim", () => {
    const error = new ApiError("VALIDATION_ERROR", "Email is required", 400);
    expect(error).toBeInstanceOf(ApiError);
    expect(getSafeErrorMessage(error)).toBe("Email is required");
  });

  // BUG (source, not test): getSafeErrorMessage's redaction checks
  // (`msg.includes("FOREIGN KEY")`, `"UNIQUE"`, `"CHECK"`) are case-sensitive
  // against ALL-CAPS substrings, but real Postgres/PostgREST error text uses
  // lowercase phrasing — "violates foreign key constraint", "violates unique
  // constraint", "violates check constraint". Confirmed empirically below:
  // the case-sensitive check never matches, so `getSafeErrorMessage` falls
  // through to `return msg` and leaks the raw DB error (constraint names,
  // table names) verbatim, exactly what the docstring "Hide sensitive
  // database details from client" says it must not do. These three
  // assertions are left failing on purpose per instructions — do not loosen
  // them to pass; the source fix belongs to whichever agent owns
  // src/lib/errors.ts (e.g. lowercase both sides of the comparison).
  it("does not leak raw FOREIGN KEY constraint text to callers", () => {
    const dbError = new Error(
      'update or delete on table "courses" violates foreign key constraint "enrollments_course_id_fkey" on table "student_enrollments"',
    );
    const message = getSafeErrorMessage(dbError);
    expect(message).not.toMatch(/FOREIGN KEY/i);
    expect(message).not.toMatch(/constraint/i);
    expect(message).not.toMatch(/student_enrollments/i);
    expect(message).toBe("This resource is referenced elsewhere and cannot be deleted");
  });

  it("does not leak raw UNIQUE constraint text to callers", () => {
    const dbError = new Error(
      'duplicate key value violates unique constraint "profiles_email_key"',
    );
    const message = getSafeErrorMessage(dbError);
    expect(message).not.toMatch(/UNIQUE/);
    expect(message).not.toMatch(/profiles_email_key/);
    expect(message).toBe("This record already exists");
  });

  it("does not leak raw CHECK constraint text to callers", () => {
    const dbError = new Error('new row violates check constraint "grade_range_check"');
    const message = getSafeErrorMessage(dbError);
    expect(message).not.toMatch(/grade_range_check/);
    expect(message).toBe("Invalid data provided");
  });

  it("masks token-related failures as a generic auth failure", () => {
    expect(getSafeErrorMessage(new Error("jwt token expired"))).toBe("Authentication failed");
  });

  it("passes through ordinary error messages unmodified", () => {
    expect(getSafeErrorMessage(new Error("Could not refresh your academic data."))).toBe(
      "Could not refresh your academic data.",
    );
  });

  it("returns a generic message for non-Error values", () => {
    expect(getSafeErrorMessage("raw string")).toBe("An unexpected error occurred");
    expect(getSafeErrorMessage(null)).toBe("An unexpected error occurred");
    expect(getSafeErrorMessage(undefined)).toBe("An unexpected error occurred");
  });
});

// ── ApiError class itself ────────────────────────────────────────────────────

describe("ApiError", () => {
  it("is a real Error subclass usable with instanceof (the bug this class fixes)", () => {
    const error = new ApiError("NOT_FOUND", "missing", 404, { id: "123" });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.httpStatus).toBe(404);
    expect(error.details).toEqual({ id: "123" });
    expect(error.name).toBe("ApiError");
  });

  it("defaults httpStatus to 500 when not provided", () => {
    const error = new ApiError("INTERNAL_SERVER_ERROR", "boom");
    expect(error.httpStatus).toBe(500);
  });
});
