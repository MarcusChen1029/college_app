# Transcript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Transcript page where a student keeps one standardized coursework record, imports it from any AI (copy-prompt/paste-JSON or MCP), edits it, and views it mapped onto Common App, STARS, Cal State Apply and UC.

**Architecture:** Pure TypeScript model + validators in `web/lib/transcript.ts`; per-system mapping tables as data in `web/lib/transcript-maps*`; import/prompt logic in `web/lib/transcript-import.ts`. Two new Supabase tables (schools, courses) with per-user RLS, wired into `student-store.ts` exactly like Recommenders. UI is one page with three views (edit, import, "view as"). MCP gets five tools that reuse the same validators.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, Supabase (RLS), `zod` (already used by MCP tools), `node --test` with `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-10-26-transcript-design.md` (research with source URLs: `docs/superpowers/research/2026-10-26-*.md`). Read the spec first; every mapping value below comes from it.

## Global Constraints

- Read `web/node_modules/next/dist/docs/` before writing any Next code (CLAUDE.md: Next 16 has breaking changes).
- `npm test` runs `node --test lib/*.test.ts`: it does **not** recurse. Tests live flat in `web/lib/`. Library code under test uses relative imports **with the `.ts` extension** and no TS-only runtime features (no `enum`, no `@/` alias) because Node strips types. Components may use `@/`.
- Migration file is `supabase/migrations/0030_transcript.sql` and must be applied to project `eyvmtaggayqizllaseiu`. The next free number afterwards is **0031**.
- Colors/buttons only via `lib/ui.ts` (`buttonClass`, `toneClass`) and `lib/status.ts`; never raw red/amber/green/rose/emerald classes; never `bg-white`/`border-zinc-*` next to a tone/button class. No dark mode.
- Grades are stored exactly as printed. Never convert, average or "fix" a grade anywhere in the code.
- Every mapping entry has a status `verified | unverified | none` and a source; unverified values never get a copy button.
- Teachers get no access: no teacher RPC, roster or context-pack code may read the new tables.
- MCP writes save directly, with `source = "mcp"` and an "AI" badge in the UI; pasted-JSON import always goes through the review table first.
- Run before every commit that touches `web/`: `cd web && npx tsc --noEmit && npm run lint && npm test`. Commit messages are conventional (`feat:`, `docs:`).
- Work on branch `claude/inspiring-hypatia-817lp8`; run `git branch --show-current` before the first commit.

## Review Focus

Each line has a test in the owning task.

1. A course with term grades but no `final_grade` (and the reverse) must still map and display (Tasks 1, 3).
2. A course with no credit or no grade must give a warning in the Common App view, not crash or print "null" (Task 3).
3. The same JSON pasted twice must not create duplicate courses; an unknown enum value or a CJK/very long course name must become a review issue, not an exception (Task 5).
4. `transcript_*` tables missing (migration not applied) must not stop the rest of the student list from loading (Task 4).
5. Signed-out edits survive reload and are merged into the account on first sign-in without duplicates (Tasks 1, 4).

## File Structure

| File | Responsibility |
|---|---|
| `web/lib/transcript.ts` | enums, types, validators, content key, derived status, merge |
| `web/lib/transcript-maps.ts` | mapping types, `SYSTEMS` registry, `mapCourse` |
| `web/lib/transcript-maps/{common-app,stars,csu,uc}.ts` | one `SystemMap` each (data + system rules) |
| `web/lib/transcript-import.ts` | format text, prompt builder, JSON parse, import plan |
| `web/lib/student-rows.ts` (modify) | row types and mappers for the two tables |
| `web/lib/student-store.ts` (modify) | state, load/merge, actions |
| `supabase/migrations/0030_transcript.sql` | tables, RLS |
| `web/components/Transcript*.tsx` | page, course form, import, mapped view |
| `web/app/(app)/application/transcript/page.tsx` + `application/layout.tsx` (modify) | route and tab |
| `web/lib/mcp/tools.ts` (modify) | five MCP tools |

---

### Task 1: Model, validators, merge (`web/lib/transcript.ts`)

**Files:**
- Create: `web/lib/transcript.ts`
- Test: `web/lib/transcript.test.ts`

**Interfaces:**
- Produces (exact names later tasks import):
  - Enum arrays (`as const`) and union types: `PERIOD_TYPES` = full_year, semester, trimester, quarter; `TERM_CODES` = FY, S1, S2, T1, T2, T3, Q1, Q2, Q3, Q4; `TERM_STATUSES` = graded, in_progress, planned, none; `GRADE_SCALES` = letter_plus_minus, letter, percent_100, gpa_decimal, ib_7, a_level, gcse_9_1, pass_fail, narrative, other; `CREDIT_UNITS` = carnegie, semester_hours, quarter_hours, other, not_listed; `SCHOOL_KINDS` = high_school, college, other; `CURRICULA` = us, ib, a_level, igcse, other; `SOURCES` = manual, ai_import, mcp; `LEVELS` = regular, accelerated, advanced, honors, high_honors, ap, ib_hl, ib_sl, ib, pre_ib, a_level, gcse_igcse, college_prep, dual_enrollment, enriched, gifted, intensive, regents, other, none.
  - `SUBJECTS` = english, mathematics, science, history_social, world_language, arts, computer_science, business, pe_health, career_technical, other; `SUB_SUBJECTS: Record<Subject, readonly string[]>` with mathematics → algebra_1, geometry, algebra_2, precalculus, calculus, statistics, other; science → biology, chemistry, physics, earth_space, integrated, other; arts → visual, music, theater, dance, interdisciplinary; world_language → other only (language goes in `languageName`); every other subject → `[]`. Plus `LABELS` record for display (level, subject, sub-subject, period, scale).
  - `type Term = { term: TermCode; grade: string; gradeWeighted?: string; status: TermStatus }`
  - `type TranscriptSchool = { id; name; country: string; kind; curriculum; defaultScale: GradeScale; defaultPeriod: PeriodType; firstYear: number|null; lastYear: number|null; printedGpa: string; printedGpaScale: string; gpaWeighted: boolean|null; classRank: string; notes: string; createdAt: string }`; `SchoolInput` = same minus `id`/`createdAt`.
  - `type TranscriptCourse = { id; schoolId; academicYear: number; gradeLevel: number|null; name; period: PeriodType; terms: Term[]; finalGrade: string|null; scale: GradeScale; scaleMax: number|null; level: Level; credit: number|null; creditUnit: CreditUnit; subject: Subject; subSubject: string|null; languageName: string; isSummer; isRepeat; isCollege; collegeName: string; isWithdrawn: boolean; notes: string; source: Source; overrides: Overrides; sortOrder: number; createdAt: string }`; `CourseInput` = minus `id`/`createdAt`; `Overrides = Partial<Record<"common_app"|"stars"|"csu"|"uc", Partial<Record<"level"|"subject"|"subSubject"|"period"|"credit", string>>>>`.
  - `LIMITS = { schoolName: 200, courseName: 200, grade: 40, notes: 500, credit: 100 }`
  - `validateSchool(i: Partial<Record<keyof SchoolInput, unknown>>): { ok: true; value: SchoolInput } | { ok: false; errors: string[] }` and `validateCourse(i: Partial<Record<keyof CourseInput, unknown>>)` same shape (collects **all** errors, trims strings, defaults optional fields, rejects unknown enum values, term codes that don't belong to the course's period, credit outside 0–100).
  - `newTranscriptId(): string`, `emptyCourse(schoolId: string, school?: Pick<TranscriptSchool,"defaultScale"|"defaultPeriod">): CourseInput`, `emptySchool(): SchoolInput`.
  - `courseKey(schoolName: string, c: Pick<CourseInput,"academicYear"|"name"|"period">): string` — lowercase, collapse whitespace, NFKC-normalize the name, join with `|`.
  - `courseStatus(c: Pick<CourseInput,"terms"|"finalGrade">): "graded"|"in_progress"|"planned"` — in_progress if any term is in_progress; planned if there are terms and all are planned; else graded.
  - `mergeTranscripts(local: {schools; courses}, remote: {schools; courses}): { schools; courses; toInsertSchools; toInsertCourses }` — remote wins on id and on `courseKey` conflicts (school matched by lowercase name); local-only items are returned for insertion with `schoolId` remapped to the remote school id.

- [ ] **Step 1: Write the failing tests** in `transcript.test.ts`:
  - `validateCourse trims, defaults and mirrors the table checks`: a valid input round-trips; name of 201 chars → `ok:false`; `level: "super_honors"` → error mentions level; `credit: 101` → error; period `semester` with term `Q1` → error; a CJK name `"微積分 AP"` is accepted.
  - `validateCourse collects every error` (empty name + bad level → `errors.length === 2`).
  - `courseStatus` cases: all graded → `graded`; one `in_progress` → `in_progress`; all `planned` → `planned`; **terms empty with `finalGrade: "A"` → `graded`; terms graded with `finalGrade: null` → `graded`** (Review Focus 1).
  - `courseKey ignores case, spacing and full-width characters` (`"AP  Calculus BC"` vs `"ap calculus bc"` equal; different year differs).
  - `mergeTranscripts dedupes by key and remaps school ids` (local course duplicates a remote one → not in `toInsertCourses`; local-only course is, with the remote `schoolId`) (Review Focus 5).
  - `SUB_SUBJECTS.arts` equals `["visual","music","theater","dance","interdisciplinary"]` (keeps performing arts distinguishable).
- [ ] **Step 2: Run** `cd web && node --test lib/transcript.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `transcript.ts` per the Interfaces block, following the style of `web/lib/recommenders.ts` (same `oneOf` helper idea, same `newId` approach).
- [ ] **Step 4: Run** the same command — Expected: all PASS.
- [ ] **Step 5: Commit**
```bash
git add web/lib/transcript.ts web/lib/transcript.test.ts
git commit -m "feat: transcript model, validators and merge"
```

---

### Task 2: Mapping framework + Common App + STARS

**Files:**
- Create: `web/lib/transcript-maps.ts`, `web/lib/transcript-maps/common-app.ts`, `web/lib/transcript-maps/stars.ts`
- Test: `web/lib/transcript-maps.test.ts`

**Interfaces:**
- Consumes: Task 1 types and enums.
- Produces:
  - `type MapStatus = "verified" | "unverified" | "none"`
  - `type MapEntry = { value: string | null; status: MapStatus; note?: string; source?: string }`
  - `type SystemId = "common_app" | "stars" | "csu" | "uc"`
  - `type SystemMap = { id: SystemId; label: string; level: Record<Level, MapEntry>; subject: Record<Subject, MapEntry>; subSubject: (subject: Subject, sub: string | null) => MapEntry; period: Record<PeriodType, MapEntry>; rules: (school: TranscriptSchool, course: TranscriptCourse) => string[] }` (`rules` returns warnings text)
  - `type MappedField = { key: "name"|"subject"|"subSubject"|"level"|"period"|"grades"|"credit"|"gradeLevel"|"year"; label: string; value: string | null; status: MapStatus; note?: string; overridden?: boolean }`
  - `type MappedCourse = { system: SystemId; fields: MappedField[]; warnings: string[] }`
  - `SYSTEMS: Record<SystemId, SystemMap>`, `SYSTEM_IDS: SystemId[]`, `mapCourse(system: SystemId, school: TranscriptSchool, course: TranscriptCourse): MappedCourse` — a per-course override (`course.overrides[system]`) replaces the table value and sets `overridden: true`; the `grades` field value lists each term as `S1: A-, S2: B` (or the `finalGrade` when there are no terms); a missing grade or credit adds a warning, never throws.
- In this task `SYSTEMS` contains `common_app` and `stars` only (Task 3 adds the rest; the completeness test iterates `SYSTEM_IDS`).

Mapping data to encode (all from the spec table; anything not listed → `{ value: null, status: "unverified" }`, or `status: "none"` if the system has no such concept):

| Canonical | Common App level (verified list) | STARS level |
|---|---|---|
| regular | Regular/Standard | Standard |
| accelerated / advanced / enriched / intensive / gifted* / high_honors / honors | Accelerated / Advanced / Enriched / Intensive / Gifted / High Honors / Honors | honors → Honors; gifted → Gifted and Talented; the rest → null, unverified |
| ap | Advanced Placement (AP) | Advanced Placement (AP) |
| ib_hl, ib_sl, ib | International Baccalaureate (IB) (note: HL/SL not distinguished) | International Baccalaureate (IB) |
| pre_ib | Pre-IB | null, unverified |
| a_level | AS/A-level/International A-level, Cambridge AICE (status unverified: may be two options) | null, unverified |
| gcse_igcse | GCSE, IGCSE (unverified: may be two options) | null, unverified |
| college_prep, dual_enrollment, regents | College Prep, Dual Enrollment, Regents | same labels |
| other, none | N/A | Standard (unverified) |

- Common App `period`: semester → Semester, trimester → Trimester, quarter → Quarterly, full_year → Yearly (all verified). Common App `subject`: every entry `unverified`, best guess = the STARS-style name, `note: "Common App's Subject dropdown could not be verified"`. Common App `rules`: warn when a course has no graded term and no credit ("Common App needs at least one grade and one credit; tick N/A if the transcript lists no credit"); warn when `finalGrade` is set but no terms ("enter the term grades if the transcript shows them").
- STARS `subject` (verified): english → English; mathematics → Mathematics; science → Science; history_social → History / Social Studies; world_language → World Language; arts → Fine Arts / Music; computer_science → Computer Science; business → Business; pe_health → Physical Education / Health / Gym; career_technical, other → Other Subject Area (unverified). STARS `subSubject` → `unverified` (Generic Course Title lists not retrieved). STARS `period` (verified): Full Year / Semester / Trimester / Quarterly. STARS `rules`: "Use the unweighted grade" when any `gradeWeighted` exists; "Enter IP for courses without a final grade" for in-progress terms.

- [ ] **Step 1: Write the failing tests** in `transcript-maps.test.ts`:
  - `every system has an entry for every level, subject and period` (loop `SYSTEM_IDS` × `LEVELS`/`SUBJECTS`/`PERIOD_TYPES`; entries must have `status` in the allowed set; a `verified` entry must have a non-null `value`).
  - `Common App maps AP, honors and quarter exactly` (assert `"Advanced Placement (AP)"`, `"Honors"`, `"Quarterly"`).
  - `STARS maps arts to Fine Arts / Music for every arts sub-subject`.
  - `an override wins and is flagged` (override `level` for `common_app` → `overridden: true`, value replaced).
  - `a course with no grades and no credit yields a warning and no throw` (Review Focus 2); a course with `finalGrade` only maps with a `grades` field value equal to that grade (Review Focus 1).
  - `unverified entries never claim verified` (value null ⇒ status ≠ verified).
- [ ] **Step 2: Run** `cd web && node --test lib/transcript-maps.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the framework in `transcript-maps.ts` and the two system files with the data above; each non-obvious value carries a `source` URL copied from the research files.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git add web/lib/transcript-maps.ts web/lib/transcript-maps web/lib/transcript-maps.test.ts` → `feat: transcript mapping framework with Common App and STARS`

---

### Task 3: Cal State Apply and UC maps

**Files:**
- Create: `web/lib/transcript-maps/csu.ts`, `web/lib/transcript-maps/uc.ts`
- Modify: `web/lib/transcript-maps.ts` (register both in `SYSTEMS`/`SYSTEM_IDS`)
- Test: extend `web/lib/transcript-maps.test.ts`

**Interfaces:** Consumes Task 2's `SystemMap`/`MapEntry`. Produces `CSU_MAP`, `UC_MAP`.

Data:
- **CSU level** (verified): ap → Advanced Placement; ib_hl/ib_sl/ib → International Baccalaureate; honors → Honors (note: approved honors only; high_honors → Honors, unverified); everything else → None. **CSU subject** → A-G area: history_social → A, english → B, mathematics → C, science → D, world_language → E, arts → F, everything else → G; letters C, D, E, G verified, A, B, F `unverified` (names not on the page researched). **CSU period**: no term dropdown documented → `unverified`, value = the Common App-style wording. CSU `rules`: grade statuses are letter grade / Pass / In Progress / Planned / No Grade; warn when a school's `kind` isn't a US `high_school` ("Applicants who attended only foreign high schools skip course entry"); warn on weighted grades ("enter what the transcript shows").
- **UC level** (honors codes): ap → AP (verified); ib_hl, ib_sl, ib → IB (verified); honors → HL (note: only if the course is UC-approved honors; status unverified); dual_enrollment → CL (verified; note: goes in the Colleges attended tab); everything else → NH (verified). **UC subject**: A–G as in CSU, same status split but the UC area letters are all verified (QRG Aug 2026): A history_social, B english, C mathematics, D science, E world_language, F arts, G other subjects. **UC `subSubject`**: arts → Dance / Music / Theater / Visual Arts / Interdisciplinary Arts (verified as policy disciplines; note the application may not ask); others → `none`. **UC period**: unverified. UC `rules`: strip `+`/`-` from letter grades in the view's `grades` field (UC ignores them) and add a warning; Pass/Fail grades or `pass_fail` scale → warning "UC does not accept Pass/Fail for A-G"; `in_progress` → "IP", `planned` → "PL", `none` → "NO"; `isCollege` → "Enter under Colleges attended, not the high school"; `isSummer` → "Check the summer box for this grade"; non-A-G subjects (`pe_health`, `career_technical`, `business`) → "Not reportable as A-G; may go under Other coursework"; `credit` field → `{ value: null, status: "none", note: "UC has no per-course credit field" }`.

- [ ] **Step 1: Write the failing tests:** CSU maps `ap` → `Advanced Placement`, `regular` → `None`, `ib_hl` → `International Baccalaureate`; CSU warns for a `college`-kind or non-US school; UC maps `honors` → `HL` with status `unverified`, `dual_enrollment` → `CL`, `regular` → `NH`; UC view of grade `"B+"` shows `B` with a warning; UC view of `"P"` warns; UC credit field status is `none`; UC arts sub-subject `music` → `Music`; the Task 2 completeness test now covers four systems and passes.
- [ ] **Step 2: Run** `cd web && node --test lib/transcript-maps.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** both maps and register them; keep each file to data plus its `rules` function.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Cal State Apply and UC transcript maps`

---

### Task 4: Database, row mappers, store

**Files:**
- Create: `supabase/migrations/0030_transcript.sql`
- Modify: `web/lib/student-rows.ts` (append after the recommenders block), `web/lib/student-store.ts`
- Test: `web/lib/student-rows.test.ts` if it exists, otherwise create `web/lib/transcript-rows.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `mergeTranscripts`.
- Produces (student-rows): `TranscriptSchoolRow`, `TranscriptCourseRow`, `TRANSCRIPT_SCHOOL_COLUMNS`, `TRANSCRIPT_COURSE_COLUMNS`, `toTranscriptSchool(r)`, `transcriptSchoolColumns(s)`, `fromTranscriptSchool(userId, s)`, `toTranscriptCourse(r)`, `transcriptCourseColumns(c)`, `fromTranscriptCourse(userId, c)` — same shape and naming as `toRecommender`/`recommenderColumns`/`fromRecommender`.
- Produces (store): state fields `transcriptSchools: TranscriptSchool[]`, `transcriptCourses: TranscriptCourse[]`; actions `addTranscriptSchool(input: SchoolInput): string`, `updateTranscriptSchool(id: string, patch: Partial<SchoolInput>)`, `removeTranscriptSchool(id: string)`, `addTranscriptCourses(schoolId: string, inputs: CourseInput[], source: Source)`, `updateTranscriptCourse(id: string, patch: Partial<CourseInput>)`, `removeTranscriptCourse(id: string)`, `replaceSchoolCourses(schoolId: string, inputs: CourseInput[], source: Source)`.

Migration (model on `0026_recommenders.sql`, same four owner-only RLS policies and `touch_updated_at` trigger per table): `transcript_schools` (id uuid pk, user_id, name text, country text, kind, curriculum, default_scale, default_period, first_year int, last_year int, printed_gpa text, printed_gpa_scale text, gpa_weighted boolean, class_rank text, notes text, created_at, updated_at) and `transcript_courses` (id uuid pk, user_id, `school_id uuid not null references transcript_schools(id) on delete cascade`, academic_year int, grade_level int, name text, period_type text, terms jsonb not null default '[]', final_grade text, grade_scale text, scale_max numeric, level text, credit numeric, credit_unit text, subject text, sub_subject text, language_name text, is_summer, is_repeat, is_college, is_withdrawn boolean, college_name text, notes text, source text, overrides jsonb not null default '{}', sort_order int, created_at, updated_at). Add `check` constraints mirroring the enums and `LIMITS` in `transcript.ts`; note in a header comment that the two must be kept in step. Indexes on `user_id` and on `transcript_courses(school_id)`.

Store rules: follow the Recommenders code paths one-for-one (EMPTY state, `loadLocal`/`saveLocal`, `loadRemote`, `remote()`-wrapped writes). `loadRemote` reads each new table in **its own try-block** so a missing table sets an error message (`Couldn't load your transcript: …`) and leaves the rest of the list intact; on first sign-in it uses `mergeTranscripts` and upserts `toInsertSchools` then `toInsertCourses` with `onConflict: "id", ignoreDuplicates: true`. `removeTranscriptSchool` also drops that school's courses from state (the database cascades). `replaceSchoolCourses` deletes the school's rows then inserts (state and DB).

- [ ] **Step 1: Write the failing test** `transcript-rows.test.ts`: `toTranscriptCourse(fromTranscriptCourse(uid, c))` equals `c` (with `terms`, `overrides`, nulls and an empty `finalGrade`); `transcriptCourseColumns` has no `id`, `user_id`, `created_at`; same for schools.
- [ ] **Step 2: Run** `cd web && node --test lib/transcript-rows.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the row mappers in `student-rows.ts`.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Write `0030_transcript.sql` and apply it** to project `eyvmtaggayqizllaseiu` with the Supabase `apply_migration` tool (DDL works without owner approval; name the migration `transcript`). Then run `get_advisors` (security) and confirm no new "RLS disabled" warning for the two tables. Expected: tables listed by `list_tables` with RLS enabled.
- [ ] **Step 6: Implement the store changes** as described.
- [ ] **Step 7: Verify** `cd web && npx tsc --noEmit && npm run lint && npm test` — Expected: exit 0. Start the dev server and confirm `/application/list` still loads with no console errors.
- [ ] **Step 8: Missing-table check (Review Focus 4).** Temporarily change the table name in the new `loadRemote` read to a table that does not exist, sign in, and confirm the list, recommenders and scholarships still load and an error message mentioning the transcript appears; then revert the name. If no signed-in session is available in the sandbox (Google OAuth cannot be driven), do not claim this passed: report it as "unverified: read is wrapped in its own try-block, not exercised".
- [ ] **Step 9: Commit** `feat: transcript tables, row mappers and store`

---

### Task 5: Format spec, prompt builder, importer

**Files:**
- Create: `web/lib/transcript-import.ts`
- Test: `web/lib/transcript-import.test.ts`

**Interfaces:**
- Consumes: Task 1 (`validateCourse`, `validateSchool`, `courseKey`, enums).
- Produces:
  - `TRANSCRIPT_FORMAT_VERSION = "transcript.v1"`
  - `transcriptFormatText(): string` — the format spec: the JSON shape (`{ "version": "transcript.v1", "schools": [ { "name", "country", "kind", "curriculum", "defaultScale", "defaultPeriod", "printedGpa", "printedGpaScale", "gpaWeighted", "classRank", "courses": [ { "academicYear", "gradeLevel", "name", "period", "terms": [ { "term", "grade", "gradeWeighted", "status" } ], "finalGrade", "scale", "scaleMax", "level", "credit", "creditUnit", "subject", "subSubject", "languageName", "isSummer", "isRepeat", "isCollege", "collegeName", "isWithdrawn", "notes" } ] } ] }`), every enum list, and the rules from the spec (copy grades exactly; never convert; unweighted grade in `grade`, weighted in `gradeWeighted`; `null` when unknown, never guess; in-progress terms use status `in_progress`; put doubts in `notes`; output JSON only). It names the 100-point percent, IB 7-point and A-level scales in examples.
  - `buildPrompt(): string` — wraps `transcriptFormatText()` with the instruction to read the student's attached transcript and answer with the JSON only.
  - `parseImportText(text: string): { ok: true; data: unknown } | { ok: false; error: string }` — strips ``` fences and any prose before the first `{` / after the last `}`.
  - `type ImportRow = { schoolName: string; input: CourseInput | null; raw: unknown; errors: string[]; duplicateOf: string | null }`; `type ImportPlan = { schools: { name: string; existingId: string | null; input: SchoolInput | null; errors: string[] }[]; rows: ImportRow[] }`
  - `buildImportPlan(data: unknown, existing: { schools: TranscriptSchool[]; courses: TranscriptCourse[] }, source: Source): ImportPlan` — matches schools by case-insensitive name; marks a row `duplicateOf` the existing course id when `courseKey` matches (also against earlier rows in the same paste); invalid rows keep `input: null` with every error.
  - `planMcpAdd(args: { school: Partial<SchoolInput> & { name: string }; courses: unknown[] }, existing: { schools; courses }): { schoolId: string | null; newSchool: SchoolInput | null; accepted: CourseInput[]; rejected: { index: number; errors: string[] }[]; duplicates: number }` — same validators, `source: "mcp"`; duplicates are skipped and counted.

- [ ] **Step 1: Write the failing tests:**
  - `parseImportText strips code fences and surrounding prose`; plain invalid text → `ok:false`.
  - `buildPrompt contains the version, every level value and the words "exactly as printed"`.
  - `a valid fixture (IB 7-point school, one A-level school, one 100-point school) produces rows with no errors`.
  - `an unknown level and a missing name produce errors on that row only, and the other rows stay valid` (Review Focus 3).
  - `the same JSON planned twice against its own result marks every row as a duplicate` (Review Focus 3).
  - `a CJK course name of 200 characters is accepted, 201 is an error`.
  - `planMcpAdd` accepts valid rows with `source: "mcp"`, rejects bad rows with their index, reports duplicates, and creates `newSchool` only when the school name is unknown.
- [ ] **Step 2: Run** `cd web && node --test lib/transcript-import.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `transcript-import.ts`. Generate the enum lists in the prompt from the exports in `transcript.ts` so the prompt cannot drift from the validators.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: transcript AI format, prompt and importer`

---

### Task 6: Transcript page (view and edit)

**Files:**
- Create: `web/components/TranscriptPage.tsx`, `web/components/TranscriptCourseForm.tsx`, `web/app/(app)/application/transcript/page.tsx`
- Modify: `web/app/(app)/application/layout.tsx` (add `["/application/transcript", "Transcript"]` after Recommenders)

**Interfaces:**
- Consumes: Task 4 store (`useStudent`) and Task 1 validators/labels/enums; mirrors `RecommendersPage.tsx` (form, `field` class, `buttonClass`, `Modal`/Dialog usage) and `app/(app)/application/recommenders/page.tsx`.
- Produces: `TranscriptPage` (default export of the route) with a tab strip **Edit | Import | View as**; Tasks 7 and 8 fill the last two tabs, so render placeholder text there until then. `TranscriptCourseForm({ initial: CourseInput; school: TranscriptSchool; onSave(v: CourseInput): void; onCancel?(): void })`.

Required behavior: schools listed as sections (add/edit/remove school, with a confirm before removing because it deletes its courses); under each school, courses grouped by academic year, sorted by `sortOrder` then name; each row shows name, level, subject, per-term grades (or the final grade), credit, status chip (`courseStatus`) and an "AI" badge when `source` is `mcp` or `ai_import`; add/edit course form with all fields from `CourseInput`, term inputs that change with the chosen period (Full year → FY; semester → S1, S2, FY; trimester → T1–T3, FY; quarter → Q1–Q4, FY), sub-subject select that depends on the chosen subject, and the validation errors shown inline; delete a course; empty state explaining the page. A signed-out student can use everything (localStorage).

- [ ] **Step 1:** Create the route page, layout tab, and `TranscriptPage` with school management; run `cd web && npx tsc --noEmit` — Expected: exit 0.
- [ ] **Step 2:** Implement `TranscriptCourseForm` and the grouped course list.
- [ ] **Step 3: Verify in the browser** (start the dev server with `preview_start`; `web/.env.local` must exist, copy from `.env.example`): signed out, add a school, add an AP Calculus BC course (semester, S1 `A`, S2 `A-`, credit 1), reload the page — the course is still there; edit it; delete it; the error for an empty course name appears inline. Check the console has no errors and capture a screenshot.
- [ ] **Step 4:** `cd web && npx tsc --noEmit && npm run lint && npm test` — Expected: exit 0.
- [ ] **Step 5: Commit** `feat: transcript page with school and course editing`

---

### Task 7: Import tab (copy prompt, paste JSON, review)

**Files:**
- Create: `web/components/TranscriptImport.tsx`
- Modify: `web/components/TranscriptPage.tsx` (render it in the Import tab)

**Interfaces:** Consumes `buildPrompt`, `parseImportText`, `buildImportPlan` (Task 5) and the store actions (Task 4). Produces `TranscriptImport()` with no props.

Required behavior: (1) a "Copy prompt for your AI" button (clipboard, with a visible "Copied" state) and one sentence on how to use it with a transcript PDF/photo; (2) a textarea for the AI's JSON and a "Review" button; parse errors show the message; (3) the review table: one row per course with its school, year, name, level, subject, credit, a green/red state, the errors, and for duplicates "Already in your transcript" (row skipped by default); the student can untick any row; (4) per school a choice **Add to existing** or **Replace this school's courses**, and the replace choice states "This deletes N courses and their per-system overrides" before the confirm button; (5) Save calls `addTranscriptSchool` for new schools, then `addTranscriptCourses`/`replaceSchoolCourses` with `source: "ai_import"`; invalid rows cannot be saved; after saving, switch to the Edit tab.

- [ ] **Step 1:** Implement the component and wire the tab.
- [ ] **Step 2: Verify in the browser** with a fixture JSON saved at `docs/superpowers/fixtures/transcript-sample.json` (create it: two schools, an IB 7-point course, an A-level course, a 100-point course, one row with an invalid level): paste it, see the invalid row flagged and unsaveable, save the rest, and confirm they appear on the Edit tab with the AI badge. Paste the same JSON again: every row shows "Already in your transcript". Capture a screenshot.
- [ ] **Step 3:** `cd web && npx tsc --noEmit && npm run lint && npm test` — Expected: exit 0.
- [ ] **Step 4: Commit** `feat: transcript AI import with review table`

---

### Task 8: "View as" tab

**Files:**
- Create: `web/components/TranscriptMappedView.tsx`
- Modify: `web/components/TranscriptPage.tsx` (render it in the View-as tab)

**Interfaces:** Consumes `mapCourse`, `SYSTEMS`, `SYSTEM_IDS` (Tasks 2–3), `MappedField.status`, and `updateTranscriptCourse` for overrides. Produces `TranscriptMappedView()` with no props.

Required behavior: a selector for the four systems; per school, courses laid out in that system's own order and wording — Common App: grouped by grade level 9–12 plus "Other courses" with columns Subject, Course Name, Course Level, per-term grades, Credit; STARS: Subject Area → Course Name → Course Level → Course Length → Grade(s) → Credit; Cal State Apply: Course Title, Grade Level, Course Type, A–G area, grades; UC: sections by A–G area with Honors code and IP/PL/NO codes. Each value cell shows a status badge (`verified` plain, `unverified` with an "unverified" badge and greyed text, `none` with the note); only `verified` values get a click-to-copy button. Warnings render above each course. An "Override" control on level, subject and period writes `overrides[system]` through `updateTranscriptCourse` and shows an "overridden" badge. A short banner per system states the headline rule (UC: no +/-, no Pass/Fail; Common App: grade and credit required; STARS: unweighted grade; CSU: foreign-school-only applicants skip course entry). For a non-US school every system's view adds "Type grades as printed; do not convert". Each school header also shows the school-level fields that system asks for and nothing else: Common App → printed GPA, GPA scale (4–20 or 100) and weighted flag, class rank; STARS → cumulative GPA, class rank, grade scale; CSU and UC → none.

- [ ] **Step 1:** Implement the component and wire the tab.
- [ ] **Step 2: Verify in the browser** with the Task 7 fixture loaded (it must include one school with `country` outside the US): switch through all four systems; confirm the non-US banner shows; confirm an unverified Common App subject shows the badge and no copy button, a UC "B+" shows `B` with the warning, and an override on level shows the badge and survives a reload. Capture one screenshot per system.
- [ ] **Step 3:** `cd web && npx tsc --noEmit && npm run lint && npm test` — Expected: exit 0.
- [ ] **Step 4: Commit** `feat: transcript mapped views for Common App, STARS, CSU and UC`

---

### Task 9: MCP tools

**Files:**
- Modify: `web/lib/mcp/tools.ts` (register after the activity tools, inside `registerTools`)
- Test: covered by `transcript-import.test.ts` (`planMcpAdd`) plus the manual check below

**Interfaces:** Consumes `transcriptFormatText`, `planMcpAdd` (Task 5), row mappers (Task 4), `guarded`, `reply`/`json`/`toolError`, `READ`/`WRITE`/`DESTROY` annotations and `check` already in `tools.ts`. Reads use `s.db.from(...)` with the explicit column constants, never `*`.

Tools (all `guarded`, so Senior plan only like the other tools):
- `get_transcript_format` (READ, no input) → `transcriptFormatText()` plus the version.
- `get_transcript` (READ, no input) → schools with their courses, each course with its derived `status` and `source`.
- `add_transcript_courses` (WRITE) input `z.object({ school: z.object({ name: z.string().min(1).max(200) }).passthrough(), courses: z.array(z.unknown()).min(1).max(100) })` → `planMcpAdd`, inserts the new school if needed, inserts accepted courses with `source = "mcp"`, returns `{ added: n, duplicatesSkipped: n, rejected: [{ index, errors }] }`.
- `update_transcript_course` (WRITE) input `{ id: string, patch: z.record(z.string(), z.unknown()) }` → merge onto the existing course, run `validateCourse`, update; errors returned as tool errors.
- `delete_transcript_course` (DESTROY, description tells the AI to confirm with the student first) input `{ id }`.
- No tool replaces a whole school's courses.

- [ ] **Step 1:** Implement the five tools.
- [ ] **Step 2:** `cd web && npx tsc --noEmit && npm run lint && npm test && npm run build` — Expected: exit 0 for all four.
- [ ] **Step 3: Verify the tools run** by calling them through the MCP endpoint locally if an OAuth token flow is available in dev; otherwise state in the report "MCP tools type-checked and unit-tested via planMcpAdd, not exercised end to end" (do not claim more).
- [ ] **Step 4: Commit** `feat: MCP tools for the transcript`

---

### Task 10: Docs and final checks

**Files:**
- Modify: `CLAUDE.md` (repo root), `docs/competitor-analysis-and-roadmap.md`

- [ ] **Step 1:** In `CLAUDE.md`: change the "next number" for migrations to **0031**, add a short Transcript bullet under Stack (tables, lib files, page, MCP tools, the unverified-mapping rule, teachers have no access), and add the two verified gaps to Next tasks (Common App Subject/Grading Scale screenshot; UIUC SRAR and UC dropdown strings).
- [ ] **Step 2:** In `docs/competitor-analysis-and-roadmap.md`, add or update a status row for "Transcript + standardized coursework" as built.
- [ ] **Step 3:** Confirm teachers cannot see the data: `Grep` the repo for `transcript_` in `supabase/migrations/0022*`–`0029*` and in `web/lib/roster.ts` and `web/lib/ai-context.ts` — Expected: no matches.
- [ ] **Step 4:** `cd web && npx tsc --noEmit && npm run lint && npm test && npm run build` — Expected: exit 0 for all.
- [ ] **Step 5: Commit** `docs: transcript feature notes and migration number`
