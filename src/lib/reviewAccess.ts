/**
 * Temporary, production-enabled access policy for the four prepared dean
 * review accounts. Keep this list exact: every other account must supply a
 * phone number. Remove this module as part of the official-release checklist.
 */
export const PREPARED_REVIEW_EMAILS = [
  "review-owner@edusphere.local",
  "review-admin@edusphere.local",
  "review-committee@edusphere.local",
  "review-doctor@edusphere.local",
] as const;

export function isPreparedReviewEmail(email: string | null | undefined): boolean {
  const normalizedEmail = email?.trim().toLowerCase();
  return PREPARED_REVIEW_EMAILS.some((preparedEmail) => preparedEmail === normalizedEmail);
}

/** Explicitly authorized for the temporary dean review, including Production. */
export function canBypassReviewPhone(email: string | null | undefined): boolean {
  return isPreparedReviewEmail(email);
}

/** Explicitly authorized for the temporary dean review, including Production. */
export function canBypassReviewMfa(email: string | null | undefined): boolean {
  return isPreparedReviewEmail(email);
}
