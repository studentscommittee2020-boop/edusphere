# EduSphere v2 — Student Academic Hub

## Project Overview
Bilingual (French/English) university student portal for FSEG 2.
Features: exam archive, entrance exams, campus events, book ordering, admin panel.

## Tech Stack
- **Frontend**: React 18 + Vite 5 + TypeScript 5.8 (strict)
- **Styling**: Tailwind CSS 3.4 + Radix UI + Framer Motion 11
- **State**: Zustand 4.5
- **Routing**: React Router v6 (client-side)
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Icons**: Lucide React
- **Notifications**: Sonner

## Supabase Configuration
- **Project ID**: `ahqcjymeeifftcrglani`
- **API URL**: `https://ahqcjymeeifftcrglani.supabase.co`
- **Dashboard**: https://supabase.com/dashboard/project/ahqcjymeeifftcrglani
- **API Keys Dashboard**: https://supabase.com/dashboard/project/ahqcjymeeifftcrglani/settings/api-keys

### Keys (stored in `.env.local` — never commit)
| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | *See .env.local* |
| `VITE_SUPABASE_ANON_KEY` | *See .env.local* |
| `SUPABASE_SERVICE_ROLE_KEY` | *See .env.local* |

> **Security note**: The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row-Level-Security.
> Only ever use it server-side (Edge Functions, migration scripts). Never expose it to the browser.

## Directory Structure
```
src/
  components/    → Reusable UI components
  contexts/      → React context providers (AuthContext)
  pages/         → Route-level page components
  lib/           → Utilities (cn, escapeLike, supabase client)
  store/         → Zustand global state (language, cart UI)
  data/          → Mock data (legacy, to be replaced by services)
  types/         → TypeScript type definitions
  services/      → Supabase service layer (queries, mutations)
supabase/
  migrations/    → SQL migration files (run in order)
docs/
  UX-REDESIGN-SPEC.md → Full UX audit & redesign spec
```

## Routes
| Path | Page | Description |
|------|------|-------------|
| `/` | Index | Dashboard with stats and quick access |
| `/sessions` | Sessions | Previous exam archive with filters |
| `/exams` | Exams | Entrance exam papers |
| `/events` | Events | Campus events listing |
| `/books` | Books | Book catalog with cart |
| `/admin` | Admin | Admin panel (protected) |
| `/auth` | Auth | Login/Register/Forgot password |

## Database Schema (Supabase)
Tables: `profiles`, `courses`, `previous_exams`, `entrance_exams`, `books`, `events`, `event_registrations`, `orders`, `order_items`, `cart_items`, `favorites`, `admin_emails`

### Migrations (apply in order)
| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Full schema + RLS + Storage buckets |
| `002_seed_data.sql` | Seed data for all tables |
| `003_rpc_functions.sql` | RPC functions + orders schema fix + favorites table |

### Key RPC Functions
| Function | Args | Returns | Purpose |
|----------|------|---------|---------|
| `is_admin()` | — | boolean | Check if current user is admin |
| `get_dashboard_stats()` | — | JSON | Global platform stats |
| `get_user_dashboard_stats(major, semester)` | TEXT, TEXT | JSON | Personalized stats |
| `get_recommended_exams(major, semester, limit)` | TEXT, TEXT, INT | rows | Personalised exam recs |
| `increment_event_attendees(event_id)` | UUID | void | +1 attendee count |
| `decrement_event_attendees(event_id)` | UUID | void | -1 attendee count (floor 0) |

## Design System
- **Theme**: Dark mode primary
- **Primary**: Red (0° 72% 51%) — `#dc2626`
- **Secondary**: Green (145° 63% 42%) — `#16a34a`
- **Fonts**: Syne (display/headings), DM Sans (body)
- **Border Radius**: 1rem base (`rounded-xl`)

## Security
- All SECURITY DEFINER functions use `SET search_path = public`
- Search inputs are sanitized via `escapeLike()` before use in `.ilike` filters
- `SUPABASE_SERVICE_ROLE_KEY` has no `VITE_` prefix — never exposed to the browser
- Admin access is server-enforced via RLS + `is_admin()` function
- File uploads validate bucket names (enum-typed parameter)

## Key Rules
- All data fetched from Supabase (no hardcoded mock data in production)
- Bilingual: every user-facing string must support FR/EN
- RLS policies on all tables — never skip
- Admin access gated by `admin_emails` table allowlist
- File uploads to Supabase Storage (exam PDFs go to `exam-papers`, book covers to `book-covers`, avatars to `avatars`)
- Never log or commit the `SUPABASE_SERVICE_ROLE_KEY`
- Use `useAuth()` from `@/contexts/AuthContext` for authentication state
- Always use `escapeLike()` when interpolating user input into `.ilike` or `.or` filters
