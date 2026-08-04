# Student OTP Edge Function

`student-otp` verifies a student with the university service and emails a six-digit Supabase OTP through Resend. It does not persist the submitted file number or the university API response. A successful verification creates or updates only the Supabase Auth identity for the student email and sets the immutable `student_verified` app-metadata claim required by the portal policies.

Set these Edge Function secrets before deployment:

```text
UNIVERSITY_VERIFICATION_URL=https://university.example.edu/api/student/verify
UNIVERSITY_VERIFICATION_API_KEY=server-to-server-secret
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=EduSphere <access@your-verified-domain.edu>
APP_ORIGIN=https://your-portal.example.edu
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase Edge Functions. Never expose the service-role key in the Vite application or commit it to source control.

The university endpoint must accept:

```json
{ "email": "student@university.edu", "file_number": "AB-1234" }
```

It must return a successful response with either `verified: true` or `valid: true`. It can optionally return the canonical university email in `email` or `student.email`; if provided, it must match the submitted email.

Deploy after applying migration `008_secure_portal_roles_documents_assignments.sql`:

```bash
supabase secrets set UNIVERSITY_VERIFICATION_URL=... UNIVERSITY_VERIFICATION_API_KEY=... RESEND_API_KEY=... RESEND_FROM_EMAIL=... APP_ORIGIN=...
supabase functions deploy student-otp
```
