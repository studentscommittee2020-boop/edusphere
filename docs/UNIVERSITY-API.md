# University API contract

EduSphere talks to the university over three endpoints. Until the real service
is available, `mocks/university-api/server.mjs` implements this contract exactly
and is what the app runs against locally.

Swapping to production is a single environment change — set
`UNIVERSITY_API_BASE_URL` to the real host. No application code changes.

## Ground rules

- **Nothing from the university is persisted verbatim.** File numbers, raw
  responses and university-side identifiers are used in memory and discarded.
  Only the derived enrolment and schedule rows are written, keyed to our own
  `profiles.id`.
- **No PII is logged.** Edge Functions log event names and status codes only.
- All requests are `POST` with `Authorization: Bearer ${UNIVERSITY_API_KEY}`
  and `Content-Type: application/json`.
- All responses are JSON. Any non-2xx is treated as "service unavailable" and
  surfaces to the student as a retry message, never as a verification failure.

## 1. `POST /verify` — student identity

Confirms an (email, file number) pair belongs to a real, active student. This
is the endpoint the existing `student-otp` function already calls.

Request:

```json
{ "email": "student@ul.edu.lb", "file_number": "FS2-12345" }
```

Response:

```json
{
  "verified": true,
  "email": "student@ul.edu.lb",
  "student": {
    "external_ref": "opaque-id-used-only-in-memory",
    "full_name": "Student Name",
    "major": "Finance",
    "semester": "LS5",
    "track": "french",
    "academic_year": "2025-2026"
  }
}
```

`verified: false` (or a mismatched `email`) denies the sign-in. `major`,
`semester` and `track` must use our own vocabularies — the mapping table below
is authoritative.

## 2. `POST /schedule` — weekly timetable

Request:

```json
{ "email": "student@ul.edu.lb", "file_number": "FS2-12345", "academic_year": "2025-2026", "semester": "LS5" }
```

Response:

```json
{
  "academic_year": "2025-2026",
  "semester": "LS5",
  "entries": [
    {
      "course_code": "fc5",
      "course_label": "Corporate Finance",
      "day_of_week": 1,
      "starts_at": "08:30",
      "ends_at": "10:00",
      "room": "B204",
      "instructor": "Dr. Haddad",
      "kind": "lecture"
    }
  ]
}
```

- `day_of_week` is ISO-8601: **1 = Monday … 7 = Sunday**.
- `starts_at` / `ends_at` are 24-hour `HH:MM` in Asia/Beirut local time.
- `kind` ∈ `lecture | td | tp | exam | other`.
- An entry whose `course_code` matches no row in `courses` is still stored and
  rendered, using `course_label`. It simply carries no linked resources.

## 3. `POST /courses` — enrolment history

Request: same shape as `/schedule` (`academic_year` and `semester` optional —
omit them to request the student's full history).

Response:

```json
{
  "courses": [
    {
      "course_code": "fc5",
      "semester": "LS5",
      "academic_year": "2025-2026",
      "status": "enrolled",
      "grade": null
    },
    {
      "course_code": "fc1",
      "semester": "LS1",
      "academic_year": "2023-2024",
      "status": "completed",
      "grade": 82.5
    }
  ]
}
```

- `status` ∈ `enrolled | completed | withdrawn | failed`.
- `grade` is 0–100 or `null`.
- Courses whose `course_code` has no match in our `courses` table are skipped —
  they cannot be linked to resources, which is the entire point of the sync.

## Vocabularies

| Field | Accepted values |
|---|---|
| `semester` | `LS1` … `LS9` |
| `major` | `Common`, `Audit & Accounting`, `Finance`, `Marketing`, `Management`, `MIS` |
| `track` | `french`, `english` |
| `status` | `enrolled`, `completed`, `withdrawn`, `failed` |
| `kind` | `lecture`, `td`, `tp`, `exam`, `other` |

If the real API uses different labels, map them in
`supabase/functions/_shared/university.ts` → `normalise*()`. That file is the
single translation point; nothing downstream should ever see a raw university
value.

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `UNIVERSITY_API_BASE_URL` | Edge Function secrets | Base URL, no trailing slash |
| `UNIVERSITY_API_KEY` | Edge Function secrets | Bearer token |
| `UNIVERSITY_VERIFICATION_URL` | Edge Function secrets | Legacy full URL for `/verify`; falls back to `${BASE_URL}/verify` |

Local development:

```bash
node mocks/university-api/server.mjs
```

Then set `UNIVERSITY_API_BASE_URL=http://host.docker.internal:8787` in
`supabase/.env.local` before `supabase functions serve`.
