# EduSphere v2 -- UX Redesign Specification

**Audit Date:** 2026-03-13
**Auditor:** UX Specialist
**App:** EduSphere v2 (FSEG 2 StudentHub)
**Tech Stack:** React 18 + Vite + Tailwind CSS + Radix UI + Framer Motion + Zustand
**Theme:** Dark mode, Primary #dc2626 (Red), Secondary #16a34a (Green)
**Fonts:** Syne (display), DM Sans (body)

---

## 1. Executive Summary -- Top 5 Critical UX Issues

### Issue 1: No Authentication or User Profile System
The app has zero user authentication. Students cannot create accounts, save preferences, track their download history, or personalize their experience. The admin panel uses a hardcoded plaintext password (`admin123`) stored directly in the Zustand store. There is no concept of user identity, which means the language preference and cart persist via localStorage but are anonymous.

**Impact:** High. Students cannot save their major/semester to auto-filter content. Every visit starts from scratch.

### Issue 2: Sparse Content Creates a Dead-App Impression
The Events page has only 10 hardcoded events. The Books page shows 24 items but with no pagination or virtual scrolling. More critically, these numbers will grow, and there is zero infrastructure for loading states, skeleton screens, or progressive data fetching. The app feels like a prototype rather than a production tool.

**Impact:** High. Students arriving at sparse pages will abandon the app immediately.

### Issue 3: Sessions and Exams Pages Are Confusingly Similar
The "Previous Exams" (`/sessions`) and "Entrance Exams" (`/exams`) pages serve different purposes but look nearly identical. The naming is also ambiguous -- "Sessions" is the route name but the page title says "Previous Exams." Students will struggle to understand the difference between these two sections. The information architecture conflates two distinct user journeys: exam preparation for current courses vs. entrance exam preparation.

**Impact:** High. Navigation confusion leads to wasted time and frustration.

### Issue 4: Filter Sidebar Hidden on Mobile with No Alternative
The Sessions page filter sidebar (`hidden md:block`) completely disappears on screens below `md` (768px). Mobile users, likely the majority of university students, have zero access to filters. They must scroll through an unfiltered list of 32+ exam cards with no way to narrow results.

**Impact:** Critical. The primary feature of the app (finding specific exams) is broken on mobile.

### Issue 5: No Checkout Flow for Book Orders
The book ordering flow is: Browse -> Add to Cart -> "Place Order" (which just clears the cart and shows a toast). There is no checkout form, no delivery address, no order summary, no confirmation step, and no order history. The "Place Order" button is a destructive action with no confirmation dialog.

**Impact:** Medium-High. Users lose their cart with no recourse, and there is no actual order mechanism.

---

## 2. Information Architecture

### 2.1 Current Navigation Structure

```
Sidebar (260px fixed, left)
  +-- Dashboard (/)
  +-- Previous Exams (/sessions)
  +-- Entrance Exams (/exams)
  +-- Events (/events)
  +-- Order Books (/books)
  +-- [divider]
  +-- Language Toggle (FR | EN)
  +-- Admin (/admin)
```

### 2.2 Problems with Current IA

1. **"Sessions" vs "Previous Exams"** -- The route is `/sessions` but the label is "Previous Exams." These should match. The word "sessions" has no meaning to students in this context.

2. **Entrance Exams buried at same level as Previous Exams** -- These serve radically different audiences (current students vs. prospective students). The entrance exam section should be visually distinct or separated.

3. **No Course Catalog** -- The app stores a rich `courses` array (50+ courses across 6 majors, 2 tracks, 6 semesters) but never surfaces it. Students cannot browse courses, see credit loads, or discover what courses exist for their major.

4. **No user profile or settings** -- Language preference, major selection, semester, and track should persist in a user profile. Currently language is the only persistent setting.

5. **Admin link visible to all users** -- The admin entry point should not be in the main student navigation. It creates confusion and a false sense of insecurity.

### 2.3 Proposed Navigation Structure

```
Sidebar (280px fixed, left)
  +-- [Logo: EduSphere / FSEG 2]
  +-- [User Profile Card: avatar, name, major, semester]
  |
  +-- MAIN
  |   +-- Dashboard (/)
  |   +-- Courses (/courses) [NEW]
  |   +-- Exam Archive (/exams)  [renamed from /sessions]
  |   +-- Entrance Exams (/entrance) [renamed from /exams]
  |   +-- Events (/events)
  |   +-- Bookstore (/books) [renamed from /books]
  |
  +-- PERSONAL
  |   +-- My Favorites (/favorites) [NEW]
  |   +-- My Orders (/orders) [NEW]
  |   +-- My Profile (/profile) [NEW]
  |
  +-- [divider]
  +-- Language Toggle (FR | EN)
  +-- [Theme Toggle: Dark/Light] [NEW]
  +-- Help & Feedback (/help) [NEW]
```

**Admin panel:** Move to `/admin` with no sidebar link. Access via direct URL or a hidden route behind user role check. The admin link currently in the sidebar should be replaced by the profile/settings section.

### 2.4 New Pages Needed

| Page | Route | Purpose |
|------|-------|---------|
| Auth | `/auth` | Login / Register / Password recovery |
| Profile | `/profile` | Major, semester, track, language, notification preferences |
| Course Catalog | `/courses` | Browse all courses, see credit loads, linked exams and books |
| Favorites | `/favorites` | Bookmarked exams, books, events |
| Order History | `/orders` | Past book orders with status tracking |
| Help | `/help` | FAQ, contact info, feedback form |

---

## 3. Page-by-Page Redesign Specifications

### 3.1 Dashboard (`/` -- Index.tsx)

#### Current Issues

- **Hero section is 60% of viewport width on desktop** but contains only a tagline, subtitle, and 2 CTAs. The 3 decorative badges at the bottom ("Rated content," "All majors," "Up to date") are meaningless marketing copy with no actionable value.
- **Stats cards (2x2 grid, right 40%)** show raw counts (e.g., "32 Previous Exams") but provide no context. These numbers are meaningless to a student who does not know what the total should be.
- **Quick Access cards duplicate the sidebar** -- they link to the same 4 pages already in the sidebar navigation. This is redundant.
- **No personalization** -- the dashboard does not greet the user, does not show their upcoming events, does not recommend exams for their major, and does not show recent activity.
- **Background decorations (bg-mesh, bg-grid, bg-dots, gradient orbs)** add visual noise without functional value.

#### Proposed Redesign

```
+---------------------------------------------------------------+
| Welcome back, [Name]!           [Semester: LS3] [Major: Audit] |
+---------------------------------------------------------------+

+-------------------+  +-------------------+  +-----------------+
| YOUR NEXT EVENT   |  | RECENTLY ADDED    |  | YOUR CART       |
| [Event card with  |  | [3 latest exams   |  | [2 items]       |
|  countdown timer] |  |  for YOUR major]  |  | [View Cart CTA] |
+-------------------+  +-------------------+  +-----------------+

+---------------------------------------------------------------+
| QUICK STATS                                                   |
| [Exams for your major: 8] [All exams: 32] [Books: 24]        |
+---------------------------------------------------------------+

+---------------------------------------------------------------+
| RECOMMENDED FOR YOU (based on major + semester)               |
| [Exam Card] [Exam Card] [Book Card] [Book Card]              |
| [See All ->]                                                  |
+---------------------------------------------------------------+

+---------------------------------------------------------------+
| UPCOMING EVENTS (next 3)                                      |
| [Compact event row] [Compact event row] [Compact event row]  |
| [View All Events ->]                                          |
+---------------------------------------------------------------+
```

**Key changes:**
- Replace generic hero with personalized greeting based on user profile
- Show contextual stats (exams for YOUR major, not total counts)
- Add "Recommended for You" section that filters content by user's major + semester
- Show next 3 upcoming events in a compact list format
- Remove decorative gradient orbs and reduce visual noise
- Add a quick cart summary if items exist

#### Component Improvements

- **PersonalizedGreeting:** New component that reads user profile (major, semester, name) and displays a contextual welcome
- **RecommendedContent:** Horizontal scrollable card row filtered by user's major and semester
- **UpcomingEventsList:** Compact list view (not cards) showing date, title, location for next 3 events
- **DashboardStats:** 4-stat row with contextual labels like "Exams for Audit" not "Previous Exams"

#### Interaction Patterns

- Dashboard should load instantly with cached data and show skeleton screens for any async content
- "Recommended for You" should be swipeable on mobile (horizontal scroll with snap points)
- Clicking a stat should navigate to the relevant page with the user's major pre-filtered

---

### 3.2 Exam Archive (`/sessions` -> renamed to `/exams` -- Sessions.tsx)

#### Current Issues

- **Route naming:** `/sessions` has no semantic meaning. Rename to `/exams` or `/exam-archive`.
- **Filter sidebar hidden on mobile** -- this is the most critical UX failure in the entire app. The 5-filter sidebar (Major, Semester, Exam Type, Year, Track) vanishes on screens below 768px.
- **Filter sidebar is collapsible but all sections start open** -- on desktop, the sidebar shows 5 expanded sections totaling 30+ clickable options. This is overwhelming.
- **Search bar is disconnected from filters** -- the search field sits above the filter sidebar, creating an awkward layout where the user must visually skip over the sidebar to reach the search results.
- **Exam cards lack visual differentiation** -- all cards look identical (same red top accent, same layout). The only differentiation is text-based badges, which are hard to scan.
- **No pagination or virtual scrolling** -- 32 exam cards render all at once, each with its own Framer Motion animation (delay: `i * 0.04`). With 32 cards, the last card has a 1.28-second delay before appearing.
- **Download button has no actual download functionality** -- it is a button with no onClick handler.
- **Rating system is display-only** -- users cannot rate exams.
- **No exam preview** -- students must download an exam to see if it is relevant. There should be a preview modal.

#### Proposed Redesign

```
+---------------------------------------------------------------+
| Exam Archive                    [Search................] [Filters icon] |
+---------------------------------------------------------------+
| Active: [Major: Audit x] [Semester: LS5 x] [Clear All]       |
+---------------------------------------------------------------+

+------- Filter Sheet (mobile) / Sidebar (desktop) --------+
| Major:    [All] [Common] [Audit] [Finance] ...          |
| Semester: [All] [LS1] [LS2] [LS3] [LS4] [LS5] [LS6]    |
| Type:     [All] [Final] [Midterm] [Resit]                |
| Year:     [All] [2025] [2024] [2023]                     |
| Track:    [All] [French] [English]                        |
| [Apply Filters]                          [Reset]         |
+----------------------------------------------------------+

+---------------------------------------------------------------+
| Showing 12 of 32 exams                   [Grid] [List] toggle |
+---------------------------------------------------------------+
| [Exam Card] [Exam Card] [Exam Card]                          |
| [Exam Card] [Exam Card] [Exam Card]                          |
| [Load More] or [Pagination: 1 2 3 4]                         |
+---------------------------------------------------------------+
```

**Key changes:**

1. **Mobile filter drawer:** Replace `hidden md:block` sidebar with a bottom sheet / slide-up drawer triggered by a "Filters" button. This is the single most important fix.

2. **Pill-based filter UI (mobile):** On mobile, show filter categories as horizontal scrollable pill groups instead of a vertical accordion sidebar.

3. **Smart defaults:** If the user has a profile with major and semester set, pre-apply those filters on first visit. Show a dismissible banner: "Showing exams for Audit / LS5. [Show All]"

4. **Grid/List toggle:** Add a view toggle. The grid view (current) is good for scanning, but a list view with more metadata per row is better for targeted searching.

5. **Pagination:** Replace the full-render approach with pagination (12 items per page) or infinite scroll with intersection observer.

6. **Preview modal:** Add an exam preview dialog that shows page thumbnails, metadata, and a download button without navigating away.

7. **Color-coded left borders by major:** Instead of the uniform red top accent, use the major's color as a left border (Audit = blue, Finance = purple, etc.) for instant visual scanning.

#### Interaction Patterns

- Filter changes should update results in real-time (no "Apply" button on desktop; the "Apply" button is mobile-only for the drawer)
- Add debounced search (300ms) instead of on-every-keystroke
- Stagger animations should cap at 8 cards (animate first 8, rest appear instantly)
- Download should show a progress indicator and success confirmation
- Long-press or right-click on a card should show a context menu: Preview, Download, Add to Favorites

---

### 3.3 Entrance Exams (`/exams` -> renamed to `/entrance` -- Exams.tsx)

#### Current Issues

- **Same visual pattern as Sessions page** -- students cannot distinguish between the two exam pages at a glance.
- **Subject filter tabs (All, French, English, Math, Economics)** use a pill-button pattern that is inconsistent with the sidebar filter pattern on Sessions.
- **No difficulty indicator in the card** -- the `difficulty` field exists in the data model but is not displayed on the card.
- **No grouping by subject** -- exams are shown in a flat grid. Grouping by subject with section headers would aid discovery.
- **Description is truncated (line-clamp-2)** but there is no way to expand it without a detail page.

#### Proposed Redesign

- **Visual identity:** Use a distinct color scheme (use the green gradient consistently for entrance exams, red for course exams). Add a large "Entrance Exams" label with the university crest/icon.
- **Group by subject:** Show exams grouped under subject headers (French, English, Math, Economics) with collapsible sections.
- **Difficulty badges:** Add colored difficulty indicators: Easy (green), Medium (amber), Hard (red).
- **Year timeline:** Instead of a simple filter, show a horizontal timeline with years (2022, 2023, 2024, 2025) that students can click to filter.
- **Detail drawer:** Clicking a card opens a side drawer with full description, difficulty, rating breakdown, and download button.
- **Study path suggestion:** "If you scored well on Math 2024, try Math 2025 next" -- sequential recommendations.

---

### 3.4 Events (`/events` -- Events.tsx)

#### Current Issues

- **Tab switcher (Upcoming | Past)** is functional but the "Past" tab shows stale data. There is no indication of how old the past events are.
- **Featured event gets first position** but there is no way for the admin to mark an event as featured -- it just takes the first item in the array.
- **Register button calls `toast.success` immediately** with no form, no email capture, no confirmation. The registration is fake.
- **No event detail page** -- all information is crammed into cards.
- **No calendar view** -- events are shown as a list/grid. University students are accustomed to seeing events on a calendar.
- **Tag filter is missing** -- events have tags (Academic, Workshop, Cultural, etc.) but there is no way to filter by tag.

#### Proposed Redesign

```
+---------------------------------------------------------------+
| Events                            [Calendar] [List] toggle    |
+---------------------------------------------------------------+
| Tags: [All] [Academic] [Workshop] [Cultural] [Tech] [Sports] |
+---------------------------------------------------------------+

CALENDAR VIEW:
+---------------------------------------------------------------+
| << March 2026 >>                                              |
| Mon  Tue  Wed  Thu  Fri  Sat  Sun                            |
|                          1    2    3                           |
| 4    5    6    7    8    9    10                              |
| ...  ...  25*  ...  ...  ...  ...                            |
|              * Annual Academic Conference                     |
+---------------------------------------------------------------+

LIST VIEW:
+---------------------------------------------------------------+
| UPCOMING                                                      |
| [Featured Event Banner -- full width with gradient bg]        |
| [Event Row: Date | Title | Location | Tag | Register CTA]    |
| [Event Row: ...]                                              |
+---------------------------------------------------------------+
| PAST                                                          |
| [Event Row: Date | Title | Location | Tag | [View Recap]]    |
+---------------------------------------------------------------+
```

**Key changes:**
- Add a calendar view as the default, with list view as toggle
- Add tag-based filtering
- Replace fake toast registration with a registration modal (name, email, confirmation)
- Add event detail page/modal with full description, map location, attendee count, and sharing options
- Allow admin to set a "featured" flag on events
- Add "Add to Calendar" button (generate .ics file)
- Past events should show a "Recap" link if available

---

### 3.5 Bookstore (`/books` -- Books.tsx)

#### Current Issues

- **Book covers are fake** -- each book shows a solid color rectangle with the major's first letter. There are no actual book cover images.
- **No book detail page** -- clicking a book does nothing. The only interaction is "Add to Cart."
- **Cart is a slide-over panel** that opens from the right side. It has no checkout flow.
- **Price is shown in DZD only** -- no price formatting (thousands separator), and no price comparison or discount indicators.
- **Filter bar uses inline pill buttons** (different from Sessions sidebar) -- this inconsistency confuses users.
- **"In stock" / "Out of stock" badge** exists but there is no "Notify me" option for out-of-stock items.
- **No book search** -- the Books page has major and track filters but no text search (unlike Sessions which has a search bar).
- **No related content** -- each book has a `relatedCourses` array but this relationship is not surfaced in the UI.

#### Proposed Redesign

- **Add text search:** Mirror the search bar pattern from the Exam Archive page.
- **Book detail modal/page:** Click a book card to see full details: description, table of contents, related courses, related exams, reviews.
- **Book cover images:** Use placeholder images with book title overlay. In the future, support actual cover image uploads.
- **Price formatting:** Format prices with thousands separator (e.g., "3,200 DZD" not "3200 DZD").
- **"Notify me" for out-of-stock:** Add email notification sign-up for out-of-stock books.
- **Related content links:** Show "Used in: Accounting 1, Accounting 2" with links to the course catalog.
- **Quantity selector:** The current cart model is binary (in cart or not). Add quantity support.
- **Checkout flow:** See Section 3.6 below.

#### Cart Panel Improvements

- Add a checkout step with order summary, contact info form, and confirmation
- Show estimated total with any applicable discounts
- Add "Save for Later" functionality
- Show order confirmation with reference number
- Persist order history

---

### 3.6 Checkout Flow [NEW]

```
Step 1: Cart Review
+---------------------------------------------------------------+
| Your Cart (3 items)                                           |
| [Book] Principles of Accounting -- Qty: 1 -- 2,500 DZD       |
| [Book] Corporate Finance       -- Qty: 1 -- 3,800 DZD       |
| [Book] Data Science             -- Qty: 1 -- 2,900 DZD       |
|                                                               |
| Subtotal: 9,200 DZD                                          |
| [Continue to Details]                                         |
+---------------------------------------------------------------+

Step 2: Contact & Delivery
+---------------------------------------------------------------+
| Full Name:    [.........................]                      |
| Phone:        [.........................]                      |
| Email:        [.........................]                      |
| Pickup:       ( ) Campus Pickup  ( ) Home Delivery           |
| Notes:        [.........................]                      |
| [Back]                          [Review Order]                |
+---------------------------------------------------------------+

Step 3: Order Confirmation
+---------------------------------------------------------------+
| Order #EDU-2026-0042                                          |
| 3 books -- Total: 9,200 DZD                                  |
| Pickup at: Campus Bookstore, Room B-102                       |
| Estimated ready: 2-3 business days                            |
| [Done]                                                        |
+---------------------------------------------------------------+
```

---

### 3.7 Admin Panel (`/admin` -- Admin.tsx)

#### Current Issues

- **Plaintext password** (`admin123`) stored in the Zustand store. This is a security risk, even for a demo.
- **Login form visible to all users** -- the admin route is in the sidebar. Students will try default passwords.
- **No edit functionality for exams and books** -- only add/delete. Events have edit, but exams and books do not.
- **CRUD forms are long and inline** -- the add forms expand inside the table card, pushing content down. On mobile, the form fields are too small.
- **No bulk operations** -- deleting 10 items requires 10 individual button clicks.
- **No data validation** -- submitting an exam with year "abc" is accepted.
- **No confirmation for destructive actions** -- clicking the trash icon immediately removes the item with only a toast notification.
- **Table has no sorting or searching** -- with 32 exams, finding a specific one to edit requires scrolling.

#### Proposed Redesign

- **Role-based access:** Replace hardcoded password with proper role-based access (admin role flag in user profile). For demo, keep a simple password but hash it.
- **Remove admin from sidebar:** Access via `/admin` direct URL only, or through a "Manage" button visible only to admin users.
- **Full CRUD for all entities:** Add edit forms for exams and books (matching the existing edit form for events).
- **Data table with search and sort:** Replace the simple list with a proper data table component (column headers, sort arrows, search).
- **Bulk select and delete:** Add checkboxes and a "Delete Selected" button.
- **Confirmation dialogs:** All destructive actions must show a confirmation modal: "Delete 'Accounting 1' exam? This cannot be undone."
- **Form validation:** Required fields must be visually marked. Year must be a valid 4-digit number. Price must be a positive number.
- **Dashboard stats:** Show counts, recent additions, and a quick activity log.

---

## 4. New Pages Needed

### 4.1 Authentication Page (`/auth`)

**Purpose:** Allow students to create an account and sign in.

```
+---------------------------------------------------------------+
|              [EduSphere Logo]                                 |
|                                                               |
|   [Tab: Sign In | Register]                                  |
|                                                               |
|   SIGN IN:                                                    |
|   Email:    [.........................]                        |
|   Password: [.........................]                        |
|   [Sign In]                                                   |
|   [Forgot Password?]                                          |
|                                                               |
|   REGISTER:                                                   |
|   Full Name:  [.........................]                      |
|   Email:      [.........................]                      |
|   Password:   [.........................]                      |
|   Major:      [Dropdown: Audit/Finance/Marketing/...]         |
|   Semester:   [Dropdown: LS1-LS6]                             |
|   Track:      [Radio: French | English]                       |
|   [Create Account]                                            |
+---------------------------------------------------------------+
```

**Implementation notes:**
- For an MVP without a backend, use Zustand with localStorage persistence
- Store hashed passwords (bcrypt or similar)
- Registration captures the data needed for personalization (major, semester, track)
- Consider adding Google OAuth as a future enhancement

### 4.2 Course Catalog (`/courses`)

**Purpose:** Browse all courses by major and semester. See related exams and books.

```
+---------------------------------------------------------------+
| Course Catalog                                                |
+---------------------------------------------------------------+
| [Major tabs: Common | Audit | Finance | Marketing | ...]     |
| [Semester pills: LS1 | LS2 | LS3 | LS4 | LS5 | LS6]         |
+---------------------------------------------------------------+
| COMMON -- LS1 (6 courses, 28 credits)                        |
| +-- Accounting 1 (5 cr) -- [2 exams] [1 book]               |
| +-- Math 1 (5 cr) -- [1 exam] [1 book]                      |
| +-- ...                                                       |
+---------------------------------------------------------------+
```

**Features:**
- Group courses by semester with section headers
- Show credit count and total credits per semester
- Link to related exams and books with click-through
- Indicate which exams are available for each course
- Show course availability by track (French/English icons)

### 4.3 Favorites Page (`/favorites`)

**Purpose:** Bookmarked exams, books, and events for quick access.

**Features:**
- Three tabs: Exams, Books, Events
- One-click unfavorite
- Sort by date added
- Export list (print-friendly view)

### 4.4 Order History (`/orders`)

**Purpose:** Track past and current book orders.

**Features:**
- Order number, date, items, total, status (Processing / Ready for Pickup / Completed)
- Reorder functionality
- Contact support link per order

### 4.5 Profile Page (`/profile`)

**Purpose:** User settings and preferences.

**Sections:**
- Personal info (name, email, phone)
- Academic info (major, semester, track)
- Preferences (language, theme, notification settings)
- Account security (change password, logout)
- Data export (download your data)

---

## 5. Design System Improvements

### 5.1 Color System

#### Current Problems
- **Red (#dc2626) as primary is aggressive.** Red is universally associated with errors and danger. Using it as the primary action color creates false urgency and conflicting mental models (is this button dangerous or is it the main action?).
- **Two-color system (red + green) is limiting.** With only red and green, there is no neutral accent color for informational states.
- **Dark mode contrast issues.** The muted-foreground (`0 0% 55%`) on the card background (`0 0% 8%`) produces a contrast ratio of approximately 3.5:1, which fails WCAG AA for normal text (requires 4.5:1).

#### Proposed Color System

| Role | Current | Proposed | Rationale |
|------|---------|----------|-----------|
| Primary | Red #dc2626 | Blue #2563eb | Blue is universally trustworthy, safe for primary actions |
| Secondary | Green #16a34a | Emerald #059669 | Keep green but shift warmer for better dark-mode contrast |
| Accent | (none) | Amber #d97706 | For highlights, badges, ratings |
| Danger | (same as primary) | Red #dc2626 | Red should ONLY mean danger/destructive |
| Success | (none explicit) | Green #16a34a | Success toasts and confirmations |
| Info | (none) | Cyan #0891b2 | Informational banners and tooltips |
| Muted text | 55% lightness | 62% lightness | Bump up for WCAG AA compliance |
| Border | 15% lightness | 18% lightness | Slightly more visible borders |

#### Alternative: Keep Red Brand Identity
If the brand identity requires red, then restrict red to the logo, brand header, and accent decorations. Primary interactive elements (buttons, links, focus rings) should use blue or a less aggressive color.

### 5.2 Typography

#### Current Problems
- **Syne (display font) is used for almost everything** -- button text, nav items, badge labels, form labels. This dilutes its impact. Display fonts should be reserved for headings and hero text.
- **No type scale defined** -- font sizes are ad-hoc (text-xs, text-sm, text-base, text-lg, text-xl, text-2xl, text-3xl, text-4xl, text-5xl) with no consistent hierarchy.
- **DM Sans body text** is fine but could benefit from slightly increased line-height for readability in paragraphs.

#### Proposed Type Scale

| Level | Size | Weight | Font | Use |
|-------|------|--------|------|-----|
| H1 | 36px / 2.25rem | 800 (ExtraBold) | Syne | Page titles only |
| H2 | 24px / 1.5rem | 700 (Bold) | Syne | Section headers |
| H3 | 18px / 1.125rem | 700 (Bold) | Syne | Card titles, subsection headers |
| Body | 15px / 0.9375rem | 400 (Regular) | DM Sans | Paragraphs, descriptions |
| Body Small | 13px / 0.8125rem | 400 (Regular) | DM Sans | Meta text, secondary info |
| Caption | 12px / 0.75rem | 500 (Medium) | DM Sans | Labels, badges, timestamps |
| Button | 14px / 0.875rem | 600 (SemiBold) | DM Sans | Buttons, interactive text |
| Nav | 14px / 0.875rem | 600 (SemiBold) | DM Sans | Sidebar nav items |

**Rule:** Syne should only be used for H1, H2, H3, and the logo. All other text should use DM Sans.

### 5.3 Spacing System

Adopt an 4px base with the following scale:

| Token | Value | Use |
|-------|-------|-----|
| space-1 | 4px | Icon gaps, tight padding |
| space-2 | 8px | Badge padding, inline spacing |
| space-3 | 12px | Card internal padding (small) |
| space-4 | 16px | Standard padding |
| space-5 | 20px | Card padding |
| space-6 | 24px | Section gaps |
| space-8 | 32px | Major section separators |
| space-10 | 40px | Page top/bottom padding |
| space-12 | 48px | Hero section vertical padding |

### 5.4 Component Patterns

#### Cards
All cards should follow a consistent structure:

```
+--[ Status indicator: top border or left border, color-coded ]--+
| [Badge row: Major | Semester | Type]                           |
| [Title: H3, bold, hover color change]                          |
| [Description: Body Small, 2-line clamp]                        |
| [Meta row: Year . Pages . Track]                               |
| +--------------------------------------------------------------+
| [Action row: Rating | Primary CTA button]                      |
+----------------------------------------------------------------+
```

- **Consistent border-radius:** Use `rounded-xl` (12px) for all cards, not `rounded-2xl` (16px). The current 16px is too rounded for data-heavy interfaces.
- **Consistent hover effect:** Subtle `translateY(-2px)` with shadow increase. Remove the glow effects (`card-glow`, `card-glow-green`) -- they are too flashy for a utilitarian student portal.
- **Consistent accent colors by major:** Every card should carry its major's color as a visual identifier.

#### Buttons

| Type | Style | Use |
|------|-------|-----|
| Primary | Solid fill, primary color, white text | Main actions: Download, Register, Add to Cart |
| Secondary | Border + light fill, secondary color | Alternative actions: View Details, Save |
| Ghost | No fill, text only, hover shows fill | Tertiary actions: Cancel, Clear, Reset |
| Danger | Red fill or red border | Destructive: Delete, Remove |
| Icon | Square, 36x36, rounded-lg | Toolbar actions: Edit, Trash, Share |

- All interactive buttons must have a minimum touch target of 44x44px (WCAG 2.1 AA)
- Active/pressed state: `scale(0.97)` with 100ms transition
- Disabled state: 50% opacity, `cursor-not-allowed`, no hover effect

#### Empty States
Current empty states are adequate (icon + heading + subtext + action) but should be enhanced:
- Add illustration SVGs instead of plain icons
- Include contextual suggestions ("Try removing some filters" or "Add events in the admin panel")
- For zero-data states (not filter-zero-results), show onboarding content

---

## 6. Mobile-First Specifications

### 6.1 Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile | 0-639px | Single column, hamburger nav, bottom actions |
| Tablet | 640-1023px | 2-column grid, sidebar overlay |
| Desktop | 1024-1279px | Sidebar + 2-col content |
| Wide | 1280px+ | Sidebar + 3-col content |

### 6.2 Mobile Navigation

**Current:** Top bar (56px) with hamburger menu that opens a slide-in drawer.

**Proposed:** Keep the hamburger drawer for full navigation but add a **bottom tab bar** for the top 4 destinations:

```
+----+----+----+----+----+
| Home | Exams | Events | Books |
+----+----+----+----+----+
```

- Fixed at the bottom of the viewport
- Active tab shows filled icon + label
- Inactive tabs show outlined icon only
- Cart badge overlays the Books tab icon
- The bottom bar should be `position: fixed` with a `safe-area-inset-bottom` for notched devices

### 6.3 Mobile Filter System (Critical Fix)

**Current:** Filters are `hidden md:block` -- completely inaccessible on mobile.

**Proposed:** Two-tier filter system:

1. **Horizontal scroll chips** at the top of the page showing the most common filters (Major, Semester) as horizontally scrollable pill groups. These are always visible.

2. **"All Filters" bottom sheet** triggered by a filter icon button. This bottom sheet contains all filter groups in a stacked layout with large touch targets. Includes an "Apply" button and "Reset" button.

```
Mobile Filter Bottom Sheet:
+---------------------------------------------------------------+
| [Drag handle]                                                 |
| Filters                                          [Reset All]  |
+---------------------------------------------------------------+
| Major                                                         |
| [All] [Common] [Audit] [Finance] [Marketing] [Mgmt] [MIS]   |
+---------------------------------------------------------------+
| Semester                                                      |
| [All] [LS1] [LS2] [LS3] [LS4] [LS5] [LS6]                   |
+---------------------------------------------------------------+
| Exam Type                                                     |
| [All] [Final] [Midterm] [Resit]                               |
+---------------------------------------------------------------+
| Year                                                          |
| [All] [2025] [2024] [2023]                                    |
+---------------------------------------------------------------+
| [Apply Filters (12 results)]                                  |
+---------------------------------------------------------------+
```

### 6.4 Mobile Card Layouts

- Cards should stack in a single column on mobile with increased padding
- Book cards should show a smaller cover area (100px height instead of 144px)
- Event cards should prioritize date and title, truncating description to 1 line
- Exam cards should show badges as a single horizontal row with horizontal scroll if needed
- Touch target for download/action buttons: minimum 44x44px

### 6.5 Mobile-Specific Interactions

- **Swipe-to-dismiss** on cart items (swipe left to remove)
- **Pull-to-refresh** on exam and event lists
- **Haptic feedback** on cart add/remove (via `navigator.vibrate` if supported)
- **Sticky search bar** on exam pages that pins to top on scroll
- **FAB (Floating Action Button)** on admin pages for "Add New" actions

---

## 7. Accessibility Requirements (WCAG 2.1 AA)

### 7.1 Color Contrast

| Element | Current Contrast | Required | Status |
|---------|-----------------|----------|--------|
| Muted text on card bg | ~3.5:1 | 4.5:1 | FAIL |
| Primary red on dark bg | ~4.8:1 | 4.5:1 | PASS (marginal) |
| Secondary green on dark bg | ~4.2:1 | 4.5:1 | FAIL |
| Badge text on badge bg | varies | 4.5:1 | NEEDS AUDIT |
| Placeholder text in inputs | ~2.8:1 | 4.5:1 | FAIL |

**Fixes:**
- Increase muted-foreground from 55% to 62% lightness
- Increase secondary green lightness slightly or use a lighter variant for text
- Placeholder text should be at least 45% lightness
- All badge combinations must be tested against their backgrounds

### 7.2 Keyboard Navigation

**Current issues:**
- Filter sidebar buttons are keyboard-accessible but there are no visible focus indicators beyond the default browser outline
- The cart panel opens from the sidebar via a nested button inside a NavLink -- this creates a confusing focus trap where clicking the badge stops the link navigation
- No skip-to-content link exists
- Tab order in the admin form follows DOM order but does not skip hidden form sections

**Required fixes:**
- Add a visible focus ring on all interactive elements: `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`
- Add a "Skip to main content" link as the first focusable element
- Ensure the cart panel traps focus when open (focus should cycle within the panel)
- Ensure the mobile drawer traps focus when open
- Implement `Escape` key to close all modals, drawers, and overlays
- Add `aria-expanded` to filter group collapse toggles
- Add `role="dialog"` and `aria-modal="true"` to the mobile nav drawer (currently only the cart panel has `role="dialog"`)

### 7.3 Screen Reader Support

**Current issues:**
- Stat cards on the dashboard have no semantic meaning -- they are `div` elements with no `role` or `aria-label`
- Filter groups use `button` elements correctly but do not announce their expanded/collapsed state
- The language toggle buttons have `aria-pressed` (good) but no group label
- Exam cards have `aria-label` on the download button (good) but no accessible name on the card itself
- The cart badge count is communicated via `aria-label` (good)

**Required fixes:**
- Add `aria-label` or `aria-labelledby` to stat cards: "32 Previous Exams available"
- Add `aria-expanded={open}` to filter group toggle buttons
- Wrap the language toggle in a `role="radiogroup"` with `aria-label="Language"`
- Add `role="list"` to card grids and `role="listitem"` to individual cards
- Announce filter changes to screen readers via `aria-live="polite"` region
- Announce cart additions/removals via `aria-live="assertive"`

### 7.4 Focus Management

- When opening the cart panel, focus should move to the close button or the first interactive element
- When closing the cart panel, focus should return to the trigger element
- When opening a filter bottom sheet (mobile), focus should move to the sheet
- After applying a filter, focus should move to the results count announcement
- When navigating between pages, focus should move to the page heading

### 7.5 Reduced Motion

- Wrap all Framer Motion animations in a `useReducedMotion()` check
- When `prefers-reduced-motion: reduce` is active, disable all card stagger animations, translate effects, and spring transitions
- Keep opacity transitions (they are generally safe)
- The background mesh and grid patterns should not animate

### 7.6 Internationalization (i18n)

- Set `lang` attribute on `<html>` element based on selected language (`fr` or `en`)
- Ensure RTL support is not needed (French and English are both LTR)
- All user-facing strings must support bilingual rendering (currently done via inline ternaries -- consider extracting to a proper i18n library like `react-i18next` for maintainability)
- Date and number formatting should respect locale (French dates use DD/MM/YYYY, English uses MM/DD/YYYY)
- The "All" filter option should be translated to "Tout" in French
- Currency formatting should use locale-appropriate thousands separator

---

## 8. Animation and Micro-interaction Specification

### 8.1 Page Transitions

**Current:** Each page applies its own `motion.div` with `initial={{ opacity: 0, y: 20 }}`. This creates a jarring effect when navigating because the old page disappears instantly and the new page slides up.

**Proposed:** Use `AnimatePresence` at the layout level with `mode="wait"`:
- Exit: `opacity: 0` over 150ms
- Enter: `opacity: 1` over 200ms
- No vertical translation (removes the "jumping" feeling)

### 8.2 Loading States

**Current:** None. All data is in-memory from the Zustand store, so there is no loading state.

**Proposed:** Even with client-side data, add skeleton screens for perceived performance:
- When navigating to a page, show skeleton cards for 100ms before rendering actual content
- When applying filters, show a brief skeleton overlay on the card grid (150ms)
- When the app first loads, show a branded splash screen (500ms) while Zustand hydrates

**Skeleton card specification:**
```
+-----------------------------------+
| [--- Shimmer bar 40% width ---]   |   <- Badge placeholder
| [--- Shimmer bar 80% width ---]   |   <- Title placeholder
| [--- Shimmer bar 60% width ---]   |   <- Description placeholder
| [---] [---] [---]                 |   <- Meta placeholders
+-----------------------------------+
```

Use a shimmer animation: `background: linear-gradient(90deg, transparent, hsla(0,0%,100%,0.06), transparent)` moving from left to right over 1.5s.

### 8.3 Error States

**Current:** No error states exist. If data fails to load (in a future backend scenario), the app would show an empty page with no explanation.

**Proposed error states:**
- **Network error:** Full-page error with illustration, message, and retry button
- **Not found (404):** Custom 404 page with navigation back to dashboard
- **Empty search results:** Current implementation is adequate (icon + message + reset button)
- **Form validation errors:** Inline red text below fields, field border turns red, error icon appears
- **Failed action (download, register, order):** Toast with error type and retry action

### 8.4 Success Feedback

**Current:** All success feedback uses `toast.success()` from Sonner. This is fine for non-critical actions.

**Proposed enhancements:**
- **Cart add:** Toast + brief green flash on the cart badge + badge count animates (scale up then back)
- **Order placed:** Full-screen success overlay with order number, confetti animation, and auto-redirect to order history after 3 seconds
- **Exam downloaded:** Toast + download icon animates (bounces once) + card briefly highlights
- **Event registered:** Toast + "You're in!" confirmation with calendar add option
- **Admin item added:** Toast + new item briefly highlights in the list with a green left border flash

### 8.5 Interaction Micro-animations

| Interaction | Animation | Duration | Easing |
|-------------|-----------|----------|--------|
| Button hover | `scale(1.02)`, slight shadow increase | 200ms | ease-out |
| Button press | `scale(0.97)` | 100ms | ease-in |
| Card hover | `translateY(-2px)`, shadow increase | 300ms | ease-out |
| Nav item active | Background slide (layoutId animation) | 300ms | spring (current is good) |
| Filter chip add | `scale(0.85) -> scale(1)` | 200ms | spring |
| Filter chip remove | `scale(1) -> scale(0.85), opacity(0)` | 150ms | ease-in |
| Cart panel open | `translateX(100%) -> translateX(0)` | 350ms | spring (current is good) |
| Mobile nav open | `translateX(-100%) -> translateX(0)` | 300ms | spring (current is good) |
| Toast appear | `translateY(16px) -> translateY(0), opacity` | 300ms | spring |
| Skeleton shimmer | Infinite linear gradient slide | 1500ms | linear |

### 8.6 Scroll Behavior

- **Smooth scroll** for anchor links and "scroll to top" actions
- **Intersection Observer** for lazy-loading card animations (only animate cards when they enter viewport, not on page load)
- **Sticky elements:** Search bar, filter chips, and page header should become sticky on scroll with a subtle backdrop blur
- **Scroll restoration:** When navigating back from a detail page, restore the previous scroll position

---

## Appendix A: Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Mobile filter drawer (Sessions page) | Medium | Critical |
| P0 | Fix muted text contrast (WCAG) | Low | High |
| P0 | Add skip-to-content link | Low | High |
| P1 | Rename routes (/sessions -> /exams, /exams -> /entrance) | Low | Medium |
| P1 | Add bottom tab bar for mobile | Medium | High |
| P1 | Add book detail modal | Medium | High |
| P1 | Add checkout flow | High | High |
| P1 | Add exam preview modal | Medium | High |
| P2 | Add Course Catalog page | High | Medium |
| P2 | Add user authentication | High | High |
| P2 | Add profile page with major/semester | Medium | High |
| P2 | Add favorites system | Medium | Medium |
| P2 | Add calendar view to Events | High | Medium |
| P3 | Redesign color system (red -> blue primary) | Medium | Medium |
| P3 | Add event registration form | Medium | Medium |
| P3 | Add order history page | Medium | Low |
| P3 | Admin panel improvements (bulk ops, data table) | High | Low |
| P3 | Add light theme toggle | Medium | Low |
| P3 | Extract i18n to react-i18next | High | Medium |

---

## Appendix B: File Mapping

| Current File | Proposed Changes |
|-------------|-----------------|
| `src/pages/Index.tsx` | Rewrite with personalized dashboard |
| `src/pages/Sessions.tsx` | Rename to ExamArchive.tsx, add mobile filters, pagination |
| `src/pages/Exams.tsx` | Rename to EntranceExams.tsx, add difficulty badges, grouped view |
| `src/pages/Books.tsx` | Add search, detail modal, price formatting |
| `src/pages/Events.tsx` | Add calendar view, tag filter, registration modal |
| `src/pages/Admin.tsx` | Add edit forms, data table, confirmation dialogs |
| `src/components/Layout.tsx` | Add bottom tab bar for mobile |
| `src/components/Sidebar.tsx` | Remove admin link, add profile card, restructure nav groups |
| `src/components/CartPanel.tsx` | Add checkout steps, quantity selector |
| `src/components/FilterChips.tsx` | No major changes (works well) |
| `src/index.css` | Update color variables, add contrast-safe values |
| `src/store/appStore.ts` | Add user profile, favorites, order history |
| `src/pages/Auth.tsx` | NEW: Login/Register page |
| `src/pages/Profile.tsx` | NEW: User profile settings |
| `src/pages/Courses.tsx` | NEW: Course catalog |
| `src/pages/Favorites.tsx` | NEW: Bookmarked items |
| `src/pages/Orders.tsx` | NEW: Order history |
| `src/pages/Checkout.tsx` | NEW: Checkout flow |
| `src/components/MobileFilterDrawer.tsx` | NEW: Bottom sheet filter for mobile |
| `src/components/BottomTabBar.tsx` | NEW: Mobile bottom navigation |
| `src/components/ExamPreviewModal.tsx` | NEW: Exam preview dialog |
| `src/components/BookDetailModal.tsx` | NEW: Book detail dialog |
| `src/components/SkeletonCard.tsx` | NEW: Skeleton loading card |
| `src/components/ConfirmDialog.tsx` | NEW: Confirmation modal for destructive actions |

---

*End of UX Redesign Specification*
