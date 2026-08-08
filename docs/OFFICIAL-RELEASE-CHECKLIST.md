# Official release checklist

## Temporary reviewer access — remove at approval

The temporary reviewer policy in `src/lib/reviewAccess.ts` allows only the four
prepared dean/staff review emails to omit a phone number. The authenticated
account must also have a staff role. All other accounts remain phone-mandatory.

When the site is officially approved:

1. In Vercel, remove the legacy `VITE_REVIEW_PHONE_BYPASS` variable from every
   environment.
2. Delete `src/lib/reviewAccess.ts` and the temporary calls to
   `canBypassReviewPhone` in `src/App.tsx` and `src/pages/Auth.tsx`.
3. Deploy the removal to `main`.
4. Verify that staff and student sign-in both require a phone number and MFA.

This is intentionally a manual release step: no client-side condition can
reliably detect an organizational approval without risking an accidental
production bypass.
