# Student OTP Edge Function

`student-otp` verifies a student with the university service and emails a six-digit Supabase OTP through Resend. It does not persist the submitted file number or the university API response. The function applies the persistent `student_verified` app-metadata claim only after Resend accepts the message, never before.

`APP_ORIGINS` is mandatory in production: set it to a comma-separated list of exact portal origins. `APP_ORIGIN` remains supported for a single origin. The function never falls back to `*`.

The endpoint also has a small in-memory per-isolate throttle to reduce repeat requests without adding a new service. It is not a distributed rate-limit guarantee: a cold start, scale-out, or a request routed to another isolate has an empty counter. Use an edge WAF/rate limit if a cross-isolate guarantee is required.

There is no transaction spanning Supabase Auth and Resend. Resend accepting the API request is the strongest delivery signal available here; a message can still fail later in delivery, and Supabase does not expose an administrative API to revoke a generated OTP. This function therefore cannot truthfully offer per-session university verification or perfect delivery/claim atomicity.

Set these Edge Function secrets before deployment:

```text
UNIVERSITY_VERIFICATION_URL=https://university.example.edu/api/student/verify
UNIVERSITY_VERIFICATION_API_KEY=server-to-server-secret
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=EduSphere <access@your-verified-domain.edu>
APP_ORIGINS=https://your-portal.example.edu,http://localhost:5173
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase Edge Functions. Never expose the service-role key in the Vite application or commit it to source control.

The university endpoint must accept:

```json
{ "email": "student@university.edu", "file_number": "AB-1234" }
```

It must return a successful response with either `verified: true` or `valid: true`. It can optionally return the canonical university email in `email` or `student.email`; if provided, it must match the submitted email.

Deploy after applying migration `008_secure_portal_roles_documents_assignments.sql`:

```bash
supabase secrets set UNIVERSITY_VERIFICATION_URL=... UNIVERSITY_VERIFICATION_API_KEY=... RESEND_API_KEY=... RESEND_FROM_EMAIL=... APP_ORIGINS=...
supabase functions deploy student-otp
```
