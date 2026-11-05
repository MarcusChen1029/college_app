# Exams page (AP, IB, A-levels and other exam curricula): design

Date: 2026-11-05. Owner request: "In the Materials part, add a page for managing AP and IB and other this kind of curriculum…
research it and think about how it can be stored conveniently." The owner opted out of questions, so every product call below is the
builder's (marked **[call]**) unless it is a fact from research. Research: `docs/superpowers/research/2026-11-05-curricula-exams.md`.

## 1. Why

Students record their coursework in the Transcript (`/materials/transcript`), and SAT/ACT/English scores in the profile
(`student_profiles.test_details`). Nothing stores **exam results by subject**: AP exam scores (1-5), IB subject grades (1-7, HL/SL)
plus TOK/EE, A-level / AS / EPQ grades, IGCSE/GCSE grades, HKDSE, Taiwan GSAT. These are what every application form asks for
(Common App Testing, UC test scores, UCAS qualifications), and for UK/IB applicants the **predicted** grades matter as much as the final
ones. Today a student has to keep these in a spreadsheet.

Success: one place where a student enters each exam once (subject, level, exam session, predicted grade, final grade), sees it grouped
by curriculum with a one-line summary per curriculum (e.g. "IB subjects 33/42 predicted", "A-levels predicted A\*AA", "AP: 4 exams"), and can
copy it into any application.

## 2. Goals, non-goals, anti-goals

Goals
- New Materials tab **Exams** at `/materials/exams` (after Transcript).
- One entry per subject exam, any curriculum; official subject names offered as suggestions, own text always allowed.
- Predicted and final grade kept side by side, each **stored exactly as printed** (validated against the curriculum's grade scale).
- Computed summaries: IB subject sum out of 42 plus the diploma total the student enters, A-level/AS grade strings, AP count.
- Works signed out (browser) and signed in (Supabase), like the Transcript.
- English + zh-TW.

Non-goals (v1)
- Teacher/counselor access, parent view, résumé, AI connector (MCP) tools, extension fill of the Common App Testing section.
  Each is a later step; the storage is shaped so they can be added without a data migration.
- Comparing predicted grades with UK course offers (`programs.a_level_offer`, `ib_points`): a good follow-up, not v1.
- Converting grades between systems, UCAS tariff points.

Anti-goals
- Never invent a grade, conversion or rule: every scale and rule in code cites its source (research file).
- Never show an IB total as if it were final when it is built from predicted grades or from fewer than 6 subjects.
- No new data reachable by teachers or AI tokens by accident (fail closed).

## 3. Storage **[call]**

Options considered: (a) a jsonb column on `student_profiles` (like `activities`), (b) one row per exam in a new table (like
`transcript_courses`), (c) **one jsonb document per student in a new table**. Chosen: **(c)**.

- vs (a): every new profile column adds another step to the profile select fallback chain (`PROFILE_COLUMNS_BEFORE_*`, tests in
  `citizenship.test.ts`, `profile-tests.test.ts`, `student-digest.test.ts`) and puts more data on the row teacher RPCs and AI views read
  from. A separate table needs no fallback chain: if the migration isn't applied, the read fails in its own try-block and only this page
  says "not available yet".
- vs (b): a student has at most a few dozen exams, always read and edited together; one document is one read, one upsert, trivial to keep
  in localStorage, to merge at sign-in and (later) to hand to an AI tool or the extension. Row-level tables earn their cost at hundreds of
  rows (the Transcript's 600-course cap); here they would only add merge code.
- The document is versioned (`version: 1`), like activities v2, so the shape can change later with an upgrade function.

### 3.1 Table (migration `0057_student_exams`; 0056 is taken by open PR #117)

```sql
create table public.student_exams (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{"version":1,"entries":[]}'::jsonb
             check (jsonb_typeof(data) = 'object' and jsonb_typeof(data->'entries') = 'array'
                    and jsonb_array_length(data->'entries') <= 80 and pg_column_size(data) <= 65536),
  updated_at timestamptz not null default now()
);
alter table public.student_exams enable row level security;
-- own-row policies for select / insert / update / delete: user_id = auth.uid() (same wording as 0030's "own …" policies)
-- restrictive no_oauth_clients policy for all (same as 0043 on student_profiles): AI tokens never see it
-- touch trigger for updated_at (same function 0030 uses)
grant select, insert, update, delete on public.student_exams to authenticated;   -- 0044: no default grants
```
- `api_request_guard` is **not** changed: its allow-list doesn't name `student_exams`, so AI-connector tokens are refused (fail closed).
- No teacher RPC, parent view, portfolio view or digest reads it.
- Account deletion: cascade from `auth.users`.
- A smoke test `supabase/patches/2026-11-05_student_exams_smoke_test.sql` (begin … rollback): own row insert/select/update works, another
  user's row invisible, anon refused, oversize/non-array refused.

### 3.2 Document shape (TypeScript, `web/lib/exams.ts`, pure)

```ts
type ExamSystem = "ap" | "ib" | "a_level" | "as_level" | "igcse" | "gcse" | "gsat" | "other";
type ExamEntry = {
  id: string;              // random, stable
  system: ExamSystem;
  subject: string;         // 1-120 chars; official name from the list, or the student's own text
  level?: "HL" | "SL" | null;   // IB subjects only (TOK / EE have no level)
  board?: string | null;   // awarding body, a_level/as_level/igcse/gcse only (AQA, OCR, Pearson Edexcel, WJEC/Eduqas, Cambridge International…; suggestions only), ≤60
  session?: string | null; // exam month "YYYY-MM" (AP May; IB May/Nov; A-level Jun/Nov…)
  predicted?: string | null; // grade as printed, on the system's scale
  result?: string | null;    // final grade as printed
  otherName?: string | null; // system "other" only: the curriculum's name (EPQ, O Level, HKDSE, French Baccalauréat, Abitur, CBSE…), ≤80
  note?: string | null;      // ≤300
};
type ExamsDoc = {
  version: 1;
  entries: ExamEntry[];
  // IB Diploma totals out of 45 as printed by the school (predicted) or the IB (result); integers 0-45 or null.
  ibTotals?: { predicted?: number | null; result?: number | null };
};
```
- Curricula **[call]**: only those whose grade scale the research sourced get their own system; EPQ, O Level, HKDSE, Scottish, Abitur,
  Baccalauréat, CBSE, CSAT, 分科測驗 etc. go under **other** (curriculum name + free-text grade) until their scales are sourced.
- Grade scales (`EXAM_SCALES`, research §1-§5): AP 1-5; IB subjects 1-7, TOK/EE A-E; A-level A\*, A, B, C, D, E, U; AS A-E, U, also the
  lowercase a-e, u Cambridge prints (stored as typed); IGCSE and GCSE A\*-G, U and 9-1, U (both scales are in use, research §4);
  GSAT integers 0-15; other: free text ≤20. Except AS, matching is case-insensitive and the stored value is the scale's own spelling
  ("a*" → "A\*").
- `upgradeExams(raw: unknown): ExamsDoc` reads anything (null, wrong types, unknown fields) and returns a valid doc, dropping invalid
  entries rather than throwing. `validateEntry(input) → {ok, entry} | {ok:false, error}` for the form.
- Status is **derived**, never stored: result → "Final"; predicted only → "Predicted"; session in the future → "Planned"; session
  past with no result → "Waiting for result"; else "Not set".
- Subject suggestions: `EXAM_SUBJECTS[system]`: AP = the 42 course names in research §1 (exact names, "AP " prefix kept); IB = the
  34 names in research §2 with their group number, plus "Theory of Knowledge" and "Extended Essay" (the IB list is from a secondary
  source because ibo.org refused fetches; it is suggestions only, so a wrong name costs nothing); GSAT = 國文, 英文, 數學A, 數學B, 社會,
  自然. Other systems: no list (free text), board suggestions only.

### 3.3 Summaries (pure, tested)
- IB **[call]**: the official TOK/EE bonus-point matrix could not be sourced (research §2: secondary sources conflict), so the site
  **never computes bonus points or a diploma total**. It shows the subject sum honestly ("Subjects: 33/42 from 6 subjects, predicted";
  "from 5 of 6 subjects" when fewer), the HL/SL count, TOK/EE grades, and the totals the student typed in `ibTotals` ("Diploma total
  38/45, predicted, as entered"). No HL-count warning (the 3-4 HL rule wasn't sourced).
- A-level / AS: grades best-first, e.g. "A\*AA" (predicted and final separately; U last).
- AP / others: number of exams, number with a result.

### 3.4 Browser and account
- Store (`web/lib/student-store.ts`): new state `exams: ExamsDoc`; signed-out copy in localStorage (`student-local.ts`: `exams` field in
  `LocalData`, `serializeLocal`, parse with `upgradeExams`).
- Signed in: read `student_exams` in its **own try-block** (like the transcript at student-store.ts:461); missing table → state flag
  `examsAvailable = false`, page shows a short "not available yet" note and keeps local editing off for signed-in users.
- Sign-in merge **[call]**: account doc empty → take the local entries; both non-empty → keep the account's and add local entries whose
  (system, subject, level, session) don't already exist; then clear nothing locally beyond what the existing flow already clears for the
  transcript. Pure function `mergeExams(account, local)`.
- Each change updates the screen first, then upserts the whole doc (`onConflict: user_id`); a failed write shows the existing save-error
  pattern.

## 4. Page `/materials/exams` **[call]**

- Tab "Exams" (zh "考試") in `materials/layout.tsx` TABS after Transcript; `NAV_LABEL_KEYS` entry. Route file like
  `materials/transcript/page.tsx` (metadata + Suspense + client component `web/components/ExamsPage.tsx`).
- Top: one-line intro ("Record AP, IB, A-level and other exam results once: predicted and final grades side by side.") and an
  **Add exam** button.
- Body: one card per curriculum that has entries, in a fixed order (AP, IB, A-level, AS, IGCSE, GCSE, GSAT, other; "other" entries grouped by their
  curriculum name). The IB card also has two small number inputs for the diploma total (predicted / final, 0-45). Card header = curriculum name + summary (§3.3). Rows: subject (+HL/SL or board), session, predicted, final, status pill,
  edit / remove. IB card also lists TOK and EE rows under the subjects.
- Add/edit form (inline panel, not a modal): curriculum select → subject input with suggestions (`<datalist>`) → level (IB) or board →
  session (month input) → predicted → final → note. Grade inputs show the allowed scale as hint text; invalid values block Save with the
  validator's message.
- Empty state: short explanation + three quick-start buttons (AP, IB, A-level) that open the form with that curriculum chosen.
- Uses existing UI helpers (`buttonClass`, `StatusPill`/tones from `web/lib/ui.ts` and `status.ts`); no raw red/amber/green classes;
  print-friendly like the Transcript's View tab is **not** in v1.

## 5. Text and legal
- New i18n section `exams` (`web/lib/i18n/messages/exams.ts`, en + zhTW, registered in `sections.ts`, `en.ts`, `zh-TW.ts`); keys follow
  `i18n.test.ts`. Curriculum and subject names stay English (they are official names), UI text is translated.
- Privacy page: new item `privacy.collect.exams` (en + zh) saying what is stored, that it is private to the student, not shared with
  teachers, parents or connected AI; data map row in `docs/legal/2026-10-29-privacy-data-map.md`; bump `LEGAL_UPDATED`.
- CLAUDE.md: a short **Exams** bullet + next migration number 0058.

## 6. Tests and proof
- `web/lib/exams.test.ts`: scales (every system accepts its full list, rejects outside values, normalises case), `upgradeExams` on junk,
  `validateEntry`, derived status with a fixed "today", `ibSummary` (6 subjects, fewer, HL/SL count, TOK/EE, ibTotals range 0-45), A-level string
  ordering, `mergeExams`.
- `student-local` round trip with `exams`.
- Full `tsc`, lint, tests, build. Browser check of `/materials/exams` signed out: add an AP, an IB set (6 subjects + TOK/EE → total), an
  A-level set; reload keeps them.
- Migration: dry run in `begin … rollback` + smoke test, then apply (owner's approval for the apply, per standing rules).

## 7. Left to the builder
Exact component split, copy wording within the tone of existing pages, row layout on phones (stack fields under 640 px).
