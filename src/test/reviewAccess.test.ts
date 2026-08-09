import { describe, expect, it } from "vitest";
import {
  PREPARED_REVIEW_EMAILS,
  canBypassReviewPhone,
  isPreparedReviewEmail,
} from "@/lib/reviewAccess";

describe("temporary prepared-review security policy", () => {
  it("allows exactly the four prepared review emails", () => {
    expect(PREPARED_REVIEW_EMAILS).toHaveLength(4);
    for (const email of PREPARED_REVIEW_EMAILS) {
      expect(canBypassReviewPhone(email)).toBe(true);
    }
  });

  it("normalizes harmless casing and surrounding whitespace", () => {
    expect(isPreparedReviewEmail("  REVIEW-DOCTOR@EDUSPHERE.LOCAL ")).toBe(true);
  });

  it.each([
    undefined,
    null,
    "",
    "doctor@edusphere.local",
    "review-doctor@edusphere.local.attacker.example",
    "review-student@edusphere.local",
  ])("keeps phone mandatory for %s", (email) => {
    expect(canBypassReviewPhone(email)).toBe(false);
  });
});
