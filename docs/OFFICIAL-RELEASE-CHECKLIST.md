# Official release checklist

## Temporary reviewer access — remove at approval

`VITE_REVIEW_PHONE_BYPASS=true` is temporarily configured for prepared
dean/staff review accounts only. The code allow-lists the four review emails;
all other accounts remain phone-mandatory.

When the site is officially approved:

1. In Vercel, remove `VITE_REVIEW_PHONE_BYPASS` from every environment.
2. Confirm no deployment has the variable set to `true`.
3. Delete the development/review bypass code in `src/App.tsx` and
   `src/pages/Auth.tsx`, then deploy the removal to `main`.
4. Verify that staff and student sign-in both require a phone number and MFA.

This is intentionally a manual release step: no client-side condition can
reliably detect an organizational approval without risking an accidental
production bypass.
