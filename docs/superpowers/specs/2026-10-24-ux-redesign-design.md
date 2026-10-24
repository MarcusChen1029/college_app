# UX redesign: navigation, page grouping, color system

Status: draft for the owner's review (2026-10-24). Nothing is built yet.

## 1. Why

The site grew feature by feature: Colleges, Compare, My application (5 tabs), Activities, Resume, Connect AI,
Pricing, Profile, Settings, Help, plus a teacher side. Each piece works, but together they ask the student to
remember where things live. Today:

- The nav has 7 items plus "Get started", with no "you are here" marker and no mobile menu (`SiteNav.tsx:15`,
  `app/layout.tsx:33`).
- The same information shows up in two places: deadlines on Profile (calendar) and on My list ("Upcoming dates");
  list balance (fit counts) on both (`ProfileDashboard.tsx:90-142`, `MyList.tsx:318-353`).
- Color has no rules. The same meaning gets different colors (super reach is `rose-600` on the badge but
  `rose-300` on Profile). Red means "super reach", "deadline soon", "test required" and "rejected", and green means
  "safety", "done" and "accepted". Nothing in the color tells a student which red needs action today.
- There are 3 primary button styles, 3 card styles, 3 heading sizes and 5 tab designs, so pages look like they
  come from different apps.
- Settings, Help and Profile are reachable only from the username menu, and Settings is a hidden panel, not a page.

Goal: a student can open the site and know **what to do next** within a few seconds, find any page on the
first try, and read a color as a single meaning everywhere.

## 2. Who does what, and when (the journeys the design is built around)

| Moment | What they're thinking | Where they should land | What's wrong today |
|---|---|---|---|
| **First visit, signed out** | "Is this useful? Which colleges could I get into?" | Landing, then Explore | "Get started" and "Sign in" compete; it's not clear data is kept in the browser until sign-in |
| **Exploring / shortlisting** (weeks, many short sessions) | "Show me colleges like X; save the good ones; compare two" | Explore (map or table) → college page → save | Map and table have different filters; Compare can only be reached from table mode; the college page is 12 stacked sections |
| **Weekly check-in** (the most common visit in application season) | "What's due soon? What haven't I done?" | **Home** | No home page: signed-in students land on My list, and deadlines are split between Profile and My list |
| **Writing sessions** (long, focused) | "Continue my UC essay / activity list" | Essays, Activities, Resume | They are spread across two nav items and a tab |
| **Submitting** | "Which portal, which login, what code?" | The college's row in My colleges | Portals is a separate tab grouped by country, apart from the college it belongs to |
| **Decisions** (spring) | "Record results, compare offers" | My colleges → Decisions | Results is a separate tab |
| **Teacher, morning triage** | "Who is in trouble? What's due this week across my students?" | Teacher home | The dashboard shows only "Needs attention" (top 5) and a link |

Design principles this produces:

1. **Lead with the next action.** Every home and list view starts with "what needs you", then the rest.
2. **One place per thing.** Deadlines, fit and progress each have one main component, reused everywhere they appear.
3. **Group by the student's task, not by data type**: explore, apply, write.
4. **Show the summary, reveal the detail.** Long pages get a sticky summary and section navigation; tables start
   with fewer columns plus a column picker.
5. **Color carries meaning, never decoration** (section 4). Every colored mark also has text or an icon.

## 3. New structure (information architecture)

### Student nav (5 items)

| Nav item | Contains | Replaces |
|---|---|---|
| **Home** (new, `/home`) | Next up · deadlines (one timeline) · list balance · continue writing · profile gaps | Profile's calendar and "How my list looks", My list's "Upcoming dates" |
| **Explore** (`/colleges`) | Map and Table as two views of one filter state · Compare tray available in both views | Colleges and Compare in the nav (Compare becomes a tray plus `/compare` for the full table) |
| **My colleges** (`/application/*`) | Tabs: **Shortlist** (was Interested) · **Applying** (was My list) · **Decisions** (was Results). Each college row opens a drawer with checklist, portal/login, codes and essays for that college | My application, with Portals folded into the drawer and kept as a "Portals" tab only for whole-country systems (Common App, UCAS) |
| **Writing** (`/writing/*` or keep URLs) | Tabs: Essays · Activities · Résumé | Activities and Resume nav items, Essays tab |
| **Profile** (`/profile`) | Scores and background only (5 score cards), "where you're applying from", target regions | Profile's extra sections move to Home |

**Account menu** (username, top right): My profile · Settings (a real page, `/settings`) · Connect AI ·
Plan & billing (was Pricing) · Help · Sign out.

**Signed out**: Explore · Pricing · Help, plus "Sign in" (text button) and "Get started" (primary). Once the
student has finished `/start`, "Get started" disappears.

Signed-in students land on **Home** (`homePathFor` in `lib/roles.ts:25-29` changes from `/application/list` to `/home`).

### Teacher nav (4 items)

**Home** (Needs attention: the full list, grouped by severity · deadlines in the next 14 days across all students · class
summary) · **Students** (roster, then student detail) · **Classes** · **Deadlines**. Explore stays in the nav too
(5 items), because teachers look up colleges while advising. Compare is reachable as the tray in Explore.

### Every page

- **Active nav state**: underline plus ink-colored text on the current section.
- **Mobile**: below `md`, the nav collapses into a menu button that opens a sheet with the same items.
  Tap targets are at least 44px.
- **Breadcrumb** only where pages go 3 levels deep: college detail (Explore › Harvard) and teacher student detail
  (Students › Name).
- **Old URLs keep working.** Every moved route redirects (bookmarks, reminder emails, the help page).

### Things that move with the routes (found in review)

- **Reminder emails** (`supabase/functions/deadline-reminders/index.ts:29,40-43`) link to `/my-list`, `/account` and
  `/colleges/<slug>`. Update them to `/application/list` (or Home) and `/settings#reminders`, then redeploy the function.
  The "turn them off" link must land on the reminders switch.
- **Google Docs callback** (`app/api/google/callback/route.ts:14`) redirects to `/application/essays?google=...`. If Essays
  moves, update it, and make the redirect keep the query string.
- **Sign in.** Today signed-out users reach Google sign-in through `/profile#account` plus `OPEN_SETTINGS_EVENT`
  (`AccountPanel.tsx:92`, also `MyList.tsx:100`, `ActivitiesEditor.tsx:383`, `help/page.tsx:33`). Replace it with a
  `SignInDialog` any page can open. "Sign in" in the nav opens it, and so do the links above.
- **`/settings` is shared by both roles**, so it is not added to `STUDENT_ONLY_PATHS`. It shows the student or teacher
  sections by role, like `SettingsPanel` does today. `/home` and `/writing` are added to the list, and so is `/account`.
- **Tests:** `lib/roles.test.ts:28,50,63` assert `homePathFor` and the teacher nav. Update them with the new values.
- **Signed-in student on `/`:** the landing page stays, and its hero button becomes "Go to Home". No forced redirect.
- **"Finished /start"** (which hides "Get started") = the student has saved at least one score or one college.
  That is my call, and it uses data the store already has.

## 4. Color system

Three separate layers, so a hue never means two things.

### Layer 1: brand and UI (most of the screen)

Keep the current identity (navy ink, sky blue, Bricolage Grotesque + Figtree). Tighten its use:

| Role | Token | Value | Use |
|---|---|---|---|
| Text | `ink` | `#12304a` | body text, headings, primary buttons |
| Muted text | `zinc-600` | `#3f5a73` | secondary text (≥4.5:1 on white) |
| Interactive | `blue-700` | `#0a6ba1` | links, selected tabs, focus ring, toggles |
| Surfaces | white / `zinc-50` / `zinc-100` | as today | page / card / sunken areas |
| Highlight | `sun` | `#ffd84d` | the marker effect and "new" only; never status |
| Decoration | `coral`, `mint`, `lilac`, `sky` | as today | illustrations and the landing page only; never in app screens with status |

One **primary button** style site-wide (`rounded-full bg-ink text-white`), one secondary (outline ink), one quiet
(text), one destructive (red outline, filled only in the confirm step).

### Layer 2: status (the only place red, amber and green appear)

| Meaning | Color | Icon | Used for |
|---|---|---|---|
| **Urgent / problem** | red-700 on red-50 | alert | deadline overdue or ≤7 days with items left, missing required item, error |
| **Soon / attention** | amber-800 on amber-50 | clock | deadline in 8-21 days, incomplete profile, waitlisted |
| **Done / good** | green-700 on green-50 | check | checklist item done, submitted, accepted, saved |
| **In progress** | ink on `sky` `#cdeafc` | half-circle | drafting, applying |
| **Not started / neutral** | zinc-600 on zinc-100 | empty circle | not started, later deadlines, withdrawn |

"Rejected" is neutral, not red: it isn't something the student can act on, and red there only adds stress.

**Deadline chip**: one component computes the urgency from the date and the checklist, so a deadline 5 days
away with everything submitted shows as **done**, not urgent. The same chip appears on Home, My colleges,
college detail and teacher pages. The thresholds (7 / 21 days) are my call and live in one constant
(today the teacher side uses `SOON_DAYS = 14`, `lib/roster.ts:179`).

### Layer 3: data categories (fit and tier), kept away from status hues

- **Fit** (the main planning signal) gets its own ordinal scale outside red/amber/green/blue, always shown with its
  label plus a 4-dot meter (●●●○), so it reads without color:
  Super reach fuchsia-800 · Reach purple-700 · Target indigo-700 · Safety teal-700 (each on its -50 tint).
  This stops "reach" looking like "urgent" and "safety" looking like "done".
- **Tier** (prestige, S to D) becomes typographic instead of colorful: an ink letter badge whose weight steps
  down from S (filled ink) to D (thin outline), with `++`/`+` printed. Tier is reference information, not
  something to act on, so it shouldn't compete with status and fit for attention.
  - Map pins: brand blue, sized by tier; when the student has scores, a toggle colors pins by fit.

All colors live as tokens in `globals.css` (`--color-status-urgent-fg`, `--color-fit-reach-bg`, ...) and are read through
one `lib/colors.ts` map. No component writes `rose-600` directly. Text pairs meet 4.5:1 contrast (reviewer's check:
fuchsia-800 7.7, purple-700 6.5, indigo-700 7.1, teal-700 5.3, red-700 5.9, amber-800 6.8, green-700 about 4.8,
`#0a6ba1` 5.8, `#3f5a73` 7.2, all on white or a -50 tint; green-700 is the tightest, so re-check it with Tailwind 4's oklch values).
"In progress" is a filled sky pill with ink text and an icon, while links are underlined blue-700 text, so the brand blue still
means only "you can click this".

**Dark mode: not in this redesign.** The tokens make it possible later. The ~159 dead `dark:` classes get removed so
they stop misleading.

## 5. Shared components (built first, then used everywhere)

`Button` · `Card` (one style: `rounded-2xl border border-zinc-200 bg-white`) · `PageHeader` (title, one-line
description, the page's main action on the right) · `Tabs` (one accessible, URL-synced component replacing the 5
patterns) · `StatusPill` (icon + text) · `DeadlineChip` · `FitBadge` (label + meter) · `TierBadge` · `EmptyState`
(one sentence + one button) · `Drawer` (side panel on desktop, bottom sheet on mobile) · `Toast` (with Undo).

## 6. Page-by-page changes

**Home (new).** Top to bottom:
1. "Next up": at most 3 action cards picked by rules: overdue or ≤7-day deadlines with unchecked items, essays
   not started for colleges due within 21 days, missing scores that block fit labels.
2. Deadlines: the existing `DeadlineCalendar` plus a list view (toggle), one component.
3. List balance: fit counts with the meter, plus a short nudge when the list has no safeties.
4. Continue writing: the last 2 essays or activities edited.

Empty state for a brand-new user: "Find colleges to start your list" → Explore.

**Explore.**
- One filter bar shared by Map and Table (search, region, tier, fit, test policy, size, cost). The view toggle
  keeps the filters.
- Compare checkbox on table rows, map cards and college pages feeds a bottom "Compare (2)" tray.
- Table starts with 6 columns (name, location, tier, fit, admit rate, next deadline) plus a column picker.

**College page.**
- A sticky summary bar: name, tier, fit for me, next deadline chip, "Add to list" / "Applying" status.
- Sections regrouped into 6, with an "On this page" side nav on desktop and a chip row on mobile:
  Overview · Admissions & scores · Deadlines & plans · Tests & English · Cost & aid · Majors & tiers.
- Sources stay as small links per section, plus a full list at the bottom.

**Compare.** Rows grouped into collapsible sections that match the college page sections. The best value in each row
gets a subtle highlight. A "Show only differences" toggle.

**My colleges.**
- The Applying table keeps fit, plan, status and progress.
- The busy banner (`MyList.tsx:90-146`) shrinks to the page's main action ("Add college") plus a "More" menu
  (custom college, school codes, Copy for AI).
- Clicking a row opens the Drawer: checklist, portal and login for that college, school codes, and links to its essays.
- Removing a college shows an Undo toast instead of a confirm dialog.

**Writing.**
- Essays are grouped by status (Not started / Drafting / Done). Done is collapsed, and a filter by college is added.
- Activities and Résumé keep their editors and move under the shared tabs.
- A "Saved" indicator replaces silent autosave.

**Profile and Settings.**
- Profile is only scores and background.
- Settings becomes `/settings`: account, role switch, counselors, reminder emails (moved from the Profile calendar).

**Teacher.**
- Home becomes a real triage page.
- The roster and student detail use the same `StatusPill`/`DeadlineChip`/`FitBadge` as students, so a teacher and
  student see the same colors for the same thing.

## 7. Quick fixes (do first; independent of the redesign)

- `/account` isn't in `STUDENT_ONLY_PATHS` (`lib/roles.ts:19`), so a teacher there sees the student Profile.
- The Help page's Settings link `/profile#account` (`help/page.tsx:33`) breaks for teachers.
- Stale copy: `TeacherAttention.tsx:46` ("codes below"), `TeacherRoster.tsx:68-70`, `CollegeActions.tsx:42`
  ("add scores on the Colleges page").
- `/colleges` and `/colleges/[slug]` sit in different layout groups with different widths.

## 8. Phases (each one ships on its own)

0. Quick fixes (section 7) + active nav state.
1. Foundations: color tokens + `lib/colors.ts` + shared components; swap existing badges and buttons to them. No layout moves yet.
2. Navigation and structure: new nav, account menu, mobile sheet, `SignInDialog`, `/settings`, route moves with redirects,
   reminder-email links + Google callback updated (section 3, "Things that move").
3. Student Home; merge the deadline views; slim Profile.
4. Explore (shared filters, compare tray), college page, Compare.
5. My colleges (tabs, drawer, portals folded in) and Writing.
6. Teacher side.

Checks for every phase: `npx tsc --noEmit && npm run lint && npm test && npm run build`, plus a browser walk through the
journeys in section 2 at 375px and 1440px. Signed-in screens are checked with the mock Supabase approach already
used for the teacher work.

## 9. Not in scope

- Dark mode.
- New data or features (counselor comments, task assignment, etc.).
- Changing the fonts or the brand.
- The landing page's look (only its nav and CTAs change).

## 10. Decisions (locked by the owner, 2026-10-24, after the visual preview)

1. **Tier badges use ink weight, not color.** S is filled ink, A is a 2px ink outline, B is a 1.5px `zinc-500` outline,
   C is a 1px `zinc-400` outline, and D is a dashed `zinc-400` outline. `++` and `+` are printed.
2. **Signed-in students land on Home** instead of My list.
3. **Fit hues: fuchsia-800 / purple-700 / indigo-700 / teal-700** on their -50 tints (border -300), plus the 4-dot meter.
4. **"Writing"** groups Essays, Activities and Résumé. **"My colleges"** groups Interested (Shortlist), My list (Applying)
   and Results (Decisions).

Preview: https://claude.ai/artifact/MGKjpjhqCLh7uJc19buvXm (color system, Home desktop, Home phone).
