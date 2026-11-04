# Applying to the UK, Canada and Australia: design

Date: 2026-11-04. Status: draft for owner approval.
Research (read these for facts and sources; every fact there is tagged by how it was verified):
- `docs/superpowers/research/2026-11-04-uk-ucas-process.md`
- `docs/superpowers/research/2026-11-04-uk-international-and-after-offer.md`
- `docs/superpowers/research/2026-11-04-canada-application-process.md`
- `docs/superpowers/research/2026-11-04-canada-after-offer-and-permit.md`
- `docs/superpowers/research/2026-11-04-australia-application-process.md`
- `docs/superpowers/research/2026-11-04-australia-after-offer-and-visa.md`

## 1. Intent

The site already lists 38 universities outside the US (18 UK, 10 Canada, 10 Australia) with course-level offers
(`programs` table), maps, and application-system groups on My list. But everything after browsing is built for US
applications. A student who saves UCL or UBC gets the US checklist (SAT/ACT plan, Common App essays,
recommendations) and no after-offer or visa steps. That is wrong guidance, not just missing guidance.

This project makes the application flow follow each country's real process, from choosing a course to arriving. It
also includes the improvements the research surfaced that help US applicants too (teacher brief, English test
expiry, scholarship currencies), because most users apply to the US.

Who it serves: students on the site applying to UK, Canadian or Australian universities, alone or alongside US
colleges (assumed mostly Taiwanese, like the rest of the users; not verified). Usage today is tiny (6 profiles,
1 user with a non-US college saved, checked 2026-11-04), so this is built for the next users, not measured demand.

## 2. Goals, non-goals, anti-goals

Goals
- A saved UK/CA/AU university shows that country's steps and real dates, not US ones.
- The student can say which course they are applying to; the course's offer, test and deadline follow.
- After an offer, the student sees that country's next steps up to the visa, like the US I-20/visa steps today.
- Shared upgrades that also help US applicants: a brief for the teacher writing the recommendation/reference, an
  English test expiry warning, scholarship amounts in GBP/CAD/AUD.

Non-goals (this project)
- "Can I apply directly with my diploma, or do I need a foundation year?" (Taiwan diploma + GSAT / US diploma + AP /
  IB against each course). Next project; it needs a per-university data wave.
- Autofill for UCAS, OUAC, EducationPlannerBC or Australian portals.
- Visa or living-cost calculators (amounts change yearly; link to official pages instead).
- Education agents, UCAS Extra, Clearing, adding more universities.

Anti-goals (a failure even if it works)
- Showing a date, amount or rule without an official source (repo rule: never invent data).
- Breaking or losing checklists students already saved.
- Changing how US colleges' progress and "Ready" are counted.
- Teachers or parents seeing anything they can't see today (essay text, portal data), or seeing progress that
  disagrees with what the student sees.

## 3. Constraints

- All new UI text in English and Traditional Chinese (`web/lib/i18n/`; `i18n.test.ts` fails on missing keys).
  Data values (course names, official labels) stay English.
- Data goes through the existing files and build: `data/cycle_2026_27/<slug>.json` → `scripts/build_seed.py`
  (`--check` passes). The full seed's DELETE cascades to students' rows, so existing colleges get INSERT-only
  patches in `supabase/patches/`, never a re-seed.
- Schema changes = new numbered migration. CLAUDE.md's "next number 0038" is stale; take the next free number with
  `list_migrations` right before applying (other sessions apply migrations too).
- The Supabase MCP holds UPDATE/DELETE/DROP for the owner's approval (60 s timeout): every live DB run (dry run,
  apply, smoke test) goes in one owner-present step.
- Next 16 rules in `web/AGENTS.md`; status/tone classes from `web/lib/ui.ts` (no raw red/amber/green classes).
- Checks before each commit: `cd web && npx tsc --noEmit && npm run lint && npm test && npm run build`.

## 4. What exists to build on

- Checklist model: `web/lib/checklist.ts` (`CHECKLIST` 5 items, `TEST_PLANS` SAT/ACT/optional, `ENGLISH_PLANS`,
  `INTL_STEPS` + `intlSteps()` for the US proof of funds → I-20 → passport/SEVIS/visa interview, shown by status;
  `AFTER_APPLY` for STARS). Stored in `student_colleges.checklist` (jsonb, additive keys).
- Statuses: `student_colleges.status` already has admitted / waitlisted / rejected / withdrawn / enrolled.
- Deadlines: `deadlines` table, kinds `application, priority, scholarship, financial_aid, interview_signup, deposit,
  other`; deposit rows are reminded only once admitted. 54 non-US rows are live today (UK 20, CA 26, AU 8).
  Courses have their own `programs.application_deadline`, which reminders don't read today.
- Shared essays on the profile: `web/lib/personal-essays.ts` (Common App PS + UC PIQs, status + Google Doc link,
  stored in `student_profiles.essays`; essay text is never stored).
- Recommenders (`/application/recommenders`, migration 0026) and scholarships (`/application/scholarships`, 0027,
  `amount_usd` only).
- English test dates already exist: `test_details.english[test].date` (`web/lib/scores.ts:64`).
- Teacher views get the checklist through `redact_checklist()` (0022/0023) and compute progress in
  `web/lib/roster.ts`; the parent share view (0032) returns an explicit list of checklist keys.
- Portals already has optional accounts for UKVI, IRCC and ImmiAccount (`web/lib/portals.ts`).

## 5. What gets built

### Part A: each country's own checklist, and the course choice

A1. Checklist by country. For a saved college, the checklist items come from its country. US colleges keep today's
five items, unchanged. Non-US items:

| Country | Items (shown only where they apply) |
|---|---|
| UK (UCAS) | Personal statement (shared: one for all UK choices, from the Essays page) · Reference and predicted grades (shared: one per UCAS application) · Admissions test (only when the chosen course lists one, e.g. TMUA, ESAT, LNAT, UCAT) · University's own extra step (only where data says, e.g. Cambridge's My Cambridge Application, Oxford written work) · English test |
| Canada | Grades / transcript sent · Supplementary form (only where data says, e.g. Waterloo AIF, UofT Engineering profile, UBC Personal Profile, McMaster Engineering) · English test · Test scores only where the course asks (e.g. UofT Engineering's SAT/ACT disclosure) |
| Australia | Documents sent (transcripts, certified copies) · Course extras (only where data says: portfolio, interview, UCAT ANZ / ISAT) · English test |

- "Shared" items follow the STARS pattern (`web/components/useStarsSync`): one profile-level source of truth (the
  UCAS personal statement status in `student_profiles.essays`; one "reference attached" mark for the reference) is
  copied as a boolean into every UK college's checklist, on load and on every change, so a UK college added later
  gets ticked too. The per-college copies are not edited directly; the student changes the source. Teachers and
  parents therefore see only per-college booleans, exactly as today (no essay status or link beyond done / not done).
- "Only where data says" items come from a new per-university data file (`data/application_steps_2026_27/<slug>.json`,
  or a section of the cycle files; builder's pick), filled by the B1 data wave. Each step: kind (supplementary form,
  university form, written work, portfolio, interview, test), name, which courses it applies to (all or a list),
  link to its deadline row, official source URL, verified-on date. Each university is marked researched or not.
  Not researched shows "Extra steps not checked yet" with the admissions link, never "none".
- Progress and "Ready" for a college count only that college's own items.
- Stored values already saved on non-US colleges stay in the jsonb; items that no longer apply are hidden, not
  deleted.
- Teacher roster progress and the parent share view show the same progress as the student (both need to know the
  college's country and the new keys; the parent view's explicit key list needs a migration).

A2. Course choice. On My list, a saved non-US college gets a "Course" picker listing that university's `programs`
rows, plus "Not decided". The chosen course's name, UCAS code, offer, admissions test and deadline show on the row.
Linked teachers may see the chosen course name (same kind of information as which college).
- One course per saved university in this project. UCAS counts two courses at one university as two choices; the
  picker says so in a note.
- Intake: every saved non-US college is for 2027 entry. UK and Canada: September 2027 only (no deferred entry, no
  winter intake). Australia: an intake picker next to the course (Semester 1 2027 / Semester 2 2027); the row shows
  that intake's deadlines, or both when none is picked.

A3. UK choice limit. When more than 5 UK colleges are past "researching" and not "withdrawn", My list warns that UCAS
allows 5 choices. If the data holds medicine, dentistry or veterinary courses, the warning also applies the
4-course limit for those subjects; if it holds none, skip that rule and note it for later. Also warn when both
Oxford and Cambridge are active choices, but only after the builder confirms that rule on an official UCAS, Oxford
or Cambridge page (the research did not cover it); record the source, and drop the warning if none is found.

### Part B: deadlines that match the course and the country

B1. Data wave for the 38 universities, 2027 entry: application deadline(s) per intake, supplementary/extra form and
document deadlines, scholarship deadlines for international first-years, acceptance/deposit deadlines, plus the
extra-steps file from A1. Each row with an official source; mapped to the existing kinds. Start from the dates already in the research files (for
example UCAS 13 Jan 2027 18:00 UK; Waterloo AIF 1 Feb; McMaster Engineering 28 Jan; UBC documents 15 Feb; Melbourne
and UQ 30 Nov 2026; Sydney 1 Dec 2026; UNSW offshore 15 Nov 2026; UWA 11 Jan 2027), confirm each on the official
page, then research the missing ones. Process lessons from earlier waves apply: one shared brief, 3 universities per
agent, fetch pages directly when search credits run out, DB-side fingerprint check after loading.

B2. Course deadline wins. When a chosen course has its own `application_deadline`, that is the date shown on the
row, in deadline chips, in reminder emails and in teacher deadlines; otherwise the university's dates are used.

B3. Times. Dates stay date-only. When the official deadline has a time (UCAS: 18:00 UK time), the label or note says
the time and the Taiwan time (13 Jan 2027 18:00 UK = 14 Jan 2027 02:00 Taiwan). No time-zone engine.

B4. English test expiry (all countries, US too). Using the test dates students already enter, warn when a result
will be more than its validity period old at the college's relevant date (US: application deadline; UK/CA/AU: the
deadline, or course start where the research says the university measures it then; course start = September 2027
for UK/CA, the picked semester for Australia). The validity period per test
comes from each test maker's official page (source recorded); Cambridge English results don't expire but some
universities limit their age, so only warn there when a university's own rule says so. A warning, never a block.

### Part C: the UK personal statement and the teacher brief

C1. UCAS personal statement on the Writing > Essays page, shown when the list has a UK college. Same pattern as the
Common App essay: the three official questions, status, Google Doc link (+ New Google Doc), stored in
`student_profiles.essays` under a new key. It drives the UK "Personal statement" checklist item.

C2. Character checker next to it: three boxes, live counts including spaces, 4,000 total, at least 350 per answer,
warnings when over or under. The text stays in this browser only (not saved to the account), matching the site's
rule of storing essay links, not essay text. Label the count "approximate; UCAS's own counter is final" (how UCAS
counts line breaks is unverified).

C3. Teacher brief (US recommendations and UK references). On the Recommenders page, "Make a brief": a one-page
summary built from what the student already entered (activities, honors and other résumé items, intended subject,
their colleges or courses and deadlines), plus a free-text "what I'd like you to highlight". Downloadable/printable,
in English or Traditional Chinese (student picks). When the list has UK colleges it adds a short UCAS section: one
reference covers all 5 choices, it must be in English, the student can't submit until it's attached, and predicted
grades have an official "unable to provide" option. The site doesn't send it anywhere; the student hands it over.

### Part D: after the offer

D1. Steps per country, built like `intlSteps()`: shown by status, with the visa steps only at the college the
student commits to. Who sees them: today's `is_international` flag means "not a US student", which is wrong for
other countries (a US citizen needs a UK visa; a Canadian doesn't need a study permit). So the profile gets an
optional "Citizenship" (country). For a UK/CA/AU college the visa steps show unless the student's citizenship is that
country; when citizenship is not set they show, with a note. US colleges keep using `is_international`, unchanged.
Citizenship is not shown to teachers or parents. (It also feeds the next project: UK English waivers depend on
nationality.)

| Country | Steps (in order) |
|---|---|
| UK | Offer conditions met (conditional offers) · Place confirmed · Deposit paid (if the university asks) · CAS received · Student visa applied · Visa granted (eVisa) · Accommodation applied |
| Canada | Offer accepted · Deposit paid · Provincial attestation letter received (or CAQ for Quebec, e.g. McGill) · Study permit applied · Biometrics done · Permit approved · Housing applied |
| Australia | Offer accepted · Deposit and OSHC paid · CoE received · Student visa (500) applied, including the Genuine Student answers · Visa granted · Housing applied |

- Each step may carry a short "when / how much" line and an official link from a sourced data file (per country,
  and per university where known, e.g. Melbourne's AUD 17,000 deposit before CoE, UBC's CAD 3,000 deposit). No line
  when unknown.
- These steps never count toward application progress or "Ready" (same rule as the US international steps).

D2. UK offers and replies. For a UK college with status "admitted": offer type (conditional / unconditional) and
conditions (free text). Reply choice: Firm, Insurance or Decline, with at most one Firm and one Insurance across UK
colleges. The reply-by date is entered by the student from UCAS Hub (UCAS computes it per student; the page explains
the 5 May / 2 Jun / 21 Jul 2027 rule), and it appears in deadline chips and reminder emails. The UK visa steps show at
the Firm choice.

### Part E: scholarship currencies

Scholarships get a currency (USD default; GBP, CAD, AUD). Totals are shown per currency, never converted.

## 6. Order and timing (builder's sequence)

The UK equal-consideration deadline is 13 Jan 2027 and Canadian supplementary forms fall in late Jan to Feb, so ship
in this order: A (checklist + course choice) → B1-B3 (deadline data and course deadlines) → C (personal statement,
checker, teacher brief) → D (after-offer, needed from Feb as offers arrive) → B4 and E. Australia's Semester 1 2027
applications mostly close in November 2026, so its parts mainly serve the July 2027 intake.

## 7. How we'll know it works

- Each of the 38 universities shows its country's checklist; US colleges' checklists and existing tests are unchanged.
- Picking a course shows its offer, test and deadline; a sixth active UK choice shows the warning.
- Every new date and amount has a source; `build_seed.py --check` passes; DB fingerprint matches local data.
- A reminder dry run includes a UK course deadline and a student-entered UCAS reply-by date.
- Teacher roster and parent view progress equal the student's for a UK, a Canadian and an Australian college.
- `i18n.test.ts`, `tsc`, lint, tests and build pass; the signed-in screens are checked in the browser.

## 8. Calls I made (owner can overturn)

- One course per saved university (UCAS allows two at one university; noted in the UI).
- 2027 entry only; UK and Canada September only; Australia gets a Semester 1 / Semester 2 picker.
- Shared UK items are copied into each college's checklist from one source, like STARS.
- A new optional "Citizenship" profile field decides who sees UK/CA/AU visa steps; not shown to teachers or parents.
- Extra per-university steps live in a new sourced data file; "not researched" never reads as "none".
- The Oxford + Cambridge warning ships only with an official source.
- Personal statement text stays in the browser only; the account stores status + Google Doc link.
- The UCAS reply-by date is typed in by the student rather than computed by the site.
- Linked teachers see the chosen course name.
- The teacher brief is a file the student hands over, with no share link.
- No time-zone handling beyond a written time in the label.

## 9. Left to the builder

Checklist key names, where the course choice is stored (column vs jsonb), how course deadlines and the reply-by date
reach the reminder and teacher RPCs, component layout, the exact data-file shape for after-offer steps (keep sources
and "verified on" dates), and whether the medicine 4-course rule has any data to act on.
