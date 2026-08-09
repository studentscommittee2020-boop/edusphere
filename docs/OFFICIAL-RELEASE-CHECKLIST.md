# Official release checklist

## Temporary reviewer access — remove at approval

The temporary reviewer policy in `src/lib/reviewAccess.ts` allows only the four
prepared dean/staff review emails to omit a phone number. The authenticated
account must also have a staff role. Every other account must provide a phone
number. Authenticator-app MFA is optional for every account; after a user opts
in, future AAL1 sessions must complete the authenticator challenge.

When the site is officially approved:

1. In Vercel, remove the legacy `VITE_REVIEW_PHONE_BYPASS` variable from every
   environment.
2. Delete `src/lib/reviewAccess.ts` and the temporary calls to
   `canBypassReviewPhone` in `src/App.tsx` and
   `src/pages/Auth.tsx`.
3. Deploy the removal to `main`.
4. Verify that staff and student sign-in both require a phone number.
5. Verify that unenrolled accounts can sign in without an authenticator, while
   an account that enabled one is challenged on its next AAL1 session.
6. Remove the prepared review accounts and their seeded preview teaching rows
   if they are not intended to remain as permanent training accounts.

This is intentionally a manual release step: no client-side condition can
reliably detect an organizational approval without risking an accidental
production bypass.

## Production gates

Do not mark the site officially approved until every item below has captured
evidence (deployment URL, migration version, test output, or API response id):

1. Apply migrations `020_optional_mfa_remove_favorites_preview_courses.sql`
   and `021_targeted_course_book_reviews.sql` to Production, then verify the
   remote migration list.
2. Deploy the `course-book-upload` Edge Function from the same commit.
3. Configure and test the university doctor-teaching API with a non-production
   doctor. The API must provide a stable doctor identifier plus course,
   semester/level, language/track, academic year, and active/inactive status.
4. Confirm a doctor cannot add or edit their own teaching assignments. A
   council/admin sync must be the only write path.
5. Confirm a council book upload requires an exact course/language and at
   least one selected university-verified doctor; confirm an unselected doctor
   cannot read or review the file.
6. Confirm a doctor replacement shows the council the doctor's name, course,
   language, semester, and academic year before approval.
7. Confirm the Favorites table and dashboard RPC are absent in Production.
8. Run typecheck, unit tests, a production build, and role-based browser smoke
   tests for student, doctor, council, admin, and owner accounts.
