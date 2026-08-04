# Interface language vs. course track

EduSphere has **two independent language settings**. They are frequently
confused, and conflating them produces wrong content for real students. This
document is the rule.

## 1. Interface language — `profiles.language` / `useAppStore().language`

Values: `fr` | `en`

The language the **site chrome** is rendered in: navigation, buttons, labels,
empty states, error messages, dates. Chosen by the user, toggled from the
sidebar footer, and changeable at any time. It carries no academic meaning.

## 2. Course track — `profiles.track` / `courses.track` / `previous_exams.track`

Values: `french` | `english`

The language a **course is taught and examined in**. It is a property of the
course and of the student's enrolment, set by the university and delivered
through the university API. A student cannot change it from the UI, and the
interface toggle must never write to it.

## The rule

> Interface language decides how *the app* speaks to the reader.
> Course track decides what *the content* actually is.

A student on the French track who prefers the English interface must see
English navigation and French course material. Both at once. This is the normal
case at FSEG, not an edge case.

## Consequences in code

| Situation | Use |
|---|---|
| Button, label, heading, toast, empty state | `language` |
| Course name (`title` vs `title_fr`) | `track`, via `courseTitle()` in `services/academics.ts` |
| Filtering exams or courses by teaching language | `track` — never `language` |
| Deciding which resources a student may see | `track` and enrolment — never `language` |
| Date and number formatting | `language` |

`courseTitle(course)` in `src/services/academics.ts` is the single helper for
course naming. Use it rather than re-deriving `isFr ? title_fr : title`, which
is the bug this document exists to prevent.

## Anti-patterns

```ts
// WRONG — shows a French-track course under its English name because the
// reader happens to prefer the English interface.
const name = language === "fr" ? course.title_fr : course.title;

// WRONG — silently filters out every English-track exam for a French-UI user.
query.eq("track", language === "fr" ? "french" : "english");

// RIGHT
const name = courseTitle(course);          // follows course.track
query.eq("track", profile.track);          // follows the student's enrolment
```

## Where each is surfaced to the user

- Sidebar footer FR/EN toggle → interface language. Labelled
  "Interface language" for assistive technology.
- Profile → two separate cards, "Teaching language" and "Interface language",
  deliberately adjacent so they read as distinct.
- My Courses → an `FR`/`EN` badge per course showing its teaching language.
- Exam Archive → "Track" is its own filter, independent of the UI toggle.
