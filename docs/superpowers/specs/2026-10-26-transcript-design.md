# Transcript: standardized coursework record with per-application views

Date: 2026-10-26. Status: draft for owner review. Next migration number: **0030** (CLAUDE.md still says 0026; 0026-0029 are taken).

## Intent and why

Every application system asks the student to retype the same transcript in a different shape: Common App "Courses & Grades", STARS (formerly SRAR/SSAR), Cal State Apply, the UC Academic History, UIUC's own SRAR. Dropdown values differ (course levels, subject areas, terms, credit, grade handling), so students re-decide the same facts four times and make mistakes, especially international students whose grade scales are not in any dropdown.

This feature gives each student **one standardized transcript** in our own superset format, an editable page for it, a way to get it standardized by *any* AI the student already uses (no AI cost to us), and **mapped views** that show the transcript the way each application system asks for it. A later browser extension (not in scope here) will read the mapped data to auto-fill those applications.

## Goals

1. A Transcript page where a signed-in or signed-out student can view, add, edit, delete and reorder courses, grouped by school and academic year.
2. A canonical course record rich enough to map losslessly onto Common App, STARS, CSU and UC (and, later, UIUC SRAR).
3. AI-assisted standardization with zero paid AI in our stack:
   - a "Copy prompt" flow: the student gives the prompt plus their transcript (PDF text, photo, copied text) to any recent AI, and pastes the JSON back;
   - the same via the MCP server (a tool that returns the format spec, and tools that write validated courses).
   Pasted JSON always passes a review table before it is saved. **MCP writes save directly** (owner's decision), tagged `source = mcp` and shown with an "AI" badge, and the student can edit or delete them afterwards.
4. Mapped views for **Common App, STARS, Cal State Apply, UC**, each laid out in that system's own field order and vocabulary, with every mapped value tagged *verified*, *unverified* or *no equivalent*.
5. Never lose the original: the grade is stored exactly as printed on the transcript.

## Non-goals (v1)

- A built-in paid AI/OCR agent. (If it is ever added it is a separate project.)
- The browser extension / auto-fill.
- GPA calculation (UC's capped GPA, weighted GPA, percentiles). Store the school's printed GPA only.
- Mapped views for UIUC SRAR, ApplyTexas/UT Austin, Scoir/Coalition. UIUC: dropdown lists are not published; ApplyTexas/UT: no course-entry enums exist (UT uses transcript or Common App).
- Teacher access. Teachers get **no** access to transcripts in v1; any later sharing goes through an explicit SECURITY DEFINER RPC (see CLAUDE.md teacher rules).
- Adding transcript data to the copy-for-AI context pack (can be a follow-up).
- Official transcript upload/storage of the PDF itself.

## Anti-goals (a technically working build that is still a failure)

- Silently converting or "fixing" grades (every system says: enter exactly as on the transcript; never average, estimate or convert).
- Presenting a guessed dropdown mapping as if it were official. Unverified must be visibly unverified.
- A pasted-JSON import that writes bad data without the student seeing a review step. (MCP writes are the owner-approved exception: they validate per row, save directly, are badged as AI, and stay editable and deletable.)
- Breaking existing student data load/merge in `student-store.ts` if the migration is not applied (new tables must be read in their own try-block, as the store already does).
- Any change that exposes transcripts to teachers or other users.

## Constraints

- Stack and patterns as in CLAUDE.md: Next.js 16 App Router (read `web/node_modules/next/dist/docs/` first), Supabase with per-user RLS, `student-store.ts` (localStorage when signed out, Supabase when signed in, merge on first sign-in), tests via `node --test lib/*.test.ts`.
- Migration `0030_transcript.sql` plus applying it to the project (UPDATE/DELETE via MCP wait for owner approval; INSERT/DDL work).
- Colors/buttons only through `lib/status.ts` / `lib/ui.ts` helpers (no raw red/amber/green classes).
- No invented data: every mapping entry carries a source URL and a status. Gaps are listed, not guessed.
- Student-only route: put the page under an existing student-gated section (`/application/...`).

## The data model (my call unless noted; builder may refine names)

### School (one per school or college attended)
name, country, kind (`high_school | college | other`), grading scale default, default period type (`year | semester | trimester | quarter`), curriculum (`us | ib | a_level | igcse | other`, free label allowed), first/last academic year, printed cumulative GPA + its scale + weighted flag (as printed, optional), class rank text (optional), notes.

### Course (many per school)
- academic year (start year, e.g. 2025), grade level (6-13 or null)
- course name exactly as printed
- period type for this course: `full_year | semester | trimester | quarter` (matches how the school issues *final* grades)
- terms: list of `{term, grade, grade_weighted?, status}` where term is S1/S2, T1-T3, Q1-Q4 or FY, and status is `graded | in_progress | planned | none`; plus `final_grade` (see "Settled details")
- grade scale (per course; defaults from school): `letter_plus_minus | letter | percent_100 | gpa_decimal | ib_7 | a_level | gcse_9_1 | pass_fail | narrative | other` with optional `max` for "other"
- grades are raw strings, exactly as on the transcript (per term, plus `final_grade`)
- level (canonical superset, below)
- credit (number) + credit unit (`carnegie | semester_hours | quarter_hours | other | not_listed`)
- category: `subject` + `sub_subject` (two levels, below)
- flags: summer, repeated, college/dual-enrollment (+ college name), withdrawn
- notes, source (`manual | ai_import | mcp`), per-system overrides (JSON: `{ "common_app": {"level": "honors"} }`)

### Canonical course level (superset of all systems)
regular, accelerated, advanced, honors, high_honors, ap, ib_hl, ib_sl, ib (level unknown), pre_ib, a_level (A/AS/AICE), gcse_igcse, college_prep, dual_enrollment, enriched, gifted, intensive, regents, other, none.

### Canonical category (two levels, deliberately finer than any one system)
Subjects: English; Mathematics; Science; History / Social Science; World Language (+language); Arts; Computer Science; Business; PE / Health; Career-Technical; Other.
Sub-subjects (examples): Mathematics > algebra_1, geometry, algebra_2, precalculus, calculus, statistics, other. Science > biology, chemistry, physics, earth_space, integrated, other. **Arts > visual, music, theater, dance, interdisciplinary** (this keeps "performing arts" distinguishable from "visual arts"; UC area F has exactly these five disciplines, STARS lumps all as "Fine Arts / Music"). The builder finalizes the list but must keep every sub-subject needed by a mapping target.

## Mapping layer (data, not logic)

For each system, a typed table in `web/lib/transcript/maps/` mapping each canonical value (level, subject/sub-subject, period, grade handling) to that system's value, each entry `{ value | null, status: verified | unverified | none, source, asOf }`. A test must fail if any canonical value lacks an entry for any supported system. Per-course overrides win over the table.

Researched values (full notes with source URLs: `docs/superpowers/research/2026-10-26-commonapp-uc-applytexas.md` and `docs/superpowers/research/2026-10-26-uiuc-stars-csu-others.md`):

| System | Verified | Unverified / gaps |
|---|---|---|
| Common App (C&G) | Schedule: Semester, Trimester, Quarterly, Yearly (+Full Year column); Course Level 17 labels (Regular/Standard, Accelerated, Advanced, AP, AS/A-level/Intl A-level/AICE, College Prep, Dual Enrollment, Enriched, GCSE/IGCSE, Gifted, High Honors, Honors, Intensive, IB, Pre-IB, Regents, N/A); credit required per course with "N/A" box; GPA scale 4-20 or 100 | **Subject dropdown values; Grading Scale list; grade option values; credit unit**; whether the A-level and GCSE labels are one option or two |
| STARS | 10 Subject Areas (English, Mathematics, Science, History/Social Studies, World Language, Business, Computer Science, Fine Arts/Music, PE/Health/Gym, Other); Course Length Full Year/Semester/Trimester/Quarterly; grade scales Letter, Number, Letter & Number, Decimal; international Narrative and "Something Not Listed Here"; IP for in-progress | Full Course Level list (named: Honors, AP, IB, Dual Enrollment, College Prep, Regents, Gifted and Talented, Standard); Generic Course Title lists; credit unit |
| Cal State Apply | Course Type: None, AP, IB, Honors; grade statuses: letter grade, Pass, In Progress, Planned, No Grade/No Course; grade conversion chart | A-G area names A, B, F; credit unit; foreign-school-only applicants skip course entry |
| UC Academic History | A-G areas A-G; honors codes AP, HL, IB, NH, CL (college); no +/-; Pass/Fail not accepted; IP / PL / NO codes; F area disciplines (Dance, Music, Theater, Visual Arts, Interdisciplinary) | Exact dropdown strings for term and grading systems; whether manual entry asks the discipline; **no per-course credit field found** |

Rules the mapped view must surface as warnings, not silently apply: UC ignores +/-; UC does not accept Pass/Fail for A-G; Common App needs at least one grade and one credit per course; STARS wants the unweighted grade when both are printed; all systems: enter as printed, no averaging.

## Mapped view behavior

A "View as" selector (Common App / STARS / Cal State Apply / UC) re-renders the transcript in that system's layout and vocabulary (Common App: grade-level grids with Subject, Course Name, Level, per-term grades, credits; UC: A-G area sections with honors code and IP/PL; etc.). Values show a status badge. "No equivalent" shows the nearest option and a hint. The student can override any mapped value per course; overrides are stored. A copy-friendly layout (row-by-row, click-to-copy cell) is enough for v1; the extension will later consume the same mapped data.

## Standardization (AI) flow

1. **Format spec**: a versioned JSON schema (`transcript.v1`) plus rules text, in one module shared by the prompt builder, the importer, and the MCP tool.
2. **Copy prompt**: the page offers "Copy prompt for your AI". The prompt contains the schema, the enum lists, and rules: copy grades exactly; never convert or invent; use null when unknown; record doubts in a `notes` field per course; output JSON only.
3. **Paste JSON**: tolerant parser (strips code fences), schema validation, then a **review table** listing every row with per-row issues (unknown enum, missing credit, ambiguous grade, duplicate of an existing course). Student fixes or drops rows, chooses append vs replace for the school, then saves.
4. **MCP**: tools to read the format spec, read the transcript, add courses (same validation, returns per-row errors; valid rows save immediately with `source = mcp`, invalid rows are rejected with reasons), update and delete a course. Replacing a whole school's courses is not offered over MCP. Follows the existing `registerTools`/`guarded`/RLS pattern in `web/lib/mcp/tools.ts`; pure rules live in `lib/mcp/rules.ts` and are tested.

## Page placement and storage

- Route: `/application/transcript`, a new tab in `app/(app)/application/layout.tsx` (my call; the builder may choose differently if `/writing` or a new section fits the nav better).
- Tables (own migration, per-user RLS, modeled on `0026_recommenders.sql`): `transcript_schools`, `transcript_courses`. Store, row mappers and signed-out localStorage follow the recommenders pattern in `student-store.ts` / `student-rows.ts`. New tables are read in their own try-block.

## Settled details (author's calls after the builder check; owner may override)

- **Grades per course.** `terms[]` holds every per-term grade exactly as printed. Add `final_grade` (raw string, nullable) = the year/final grade as printed. If a transcript shows only term grades, `final_grade` is null; if it shows term grades plus a year grade, store both. Course status is derived: in progress if any term is `in_progress`, planned if all are `planned`, else graded. No separate course-level status column.
- **Weighted vs unweighted.** Each term (and `final_grade`) stores the *unweighted* grade when both are printed, because STARS asks for it and every system says enter what the transcript shows. If a weighted value is also printed it goes in an optional `grade_weighted` string on the same term. The prompt tells the AI to do exactly this.
- **Unverified mapping entries.** An `unverified` entry holds the best-guess value when a reasonable one exists, otherwise `null` (status `none` means "known to have no equivalent"). Views show a guess greyed out with an "unverified" badge and no copy button. Ship with `unverified`; the Common App screenshot is welcome later but does not block v1.
- **Merge and replace.** Sign-in merge and import-append dedupe by content key (school name, academic year, normalized course name, period type). "Replace for this school" deletes that school's courses and their per-system overrides, and the review screen states how many rows will be removed before confirming.
- **School scope in views.** A mapped view still renders for any school, with a warning banner when the system does not use that data (CSU: foreign-school-only applicants skip course entry; UC: non-A-G courses and college courses go to other tabs; non-US schools get "type as printed, do not convert"). School-level printed GPA, scale and rank show in the view only where that system asks for them (Common App GPA scale and weighted flag; STARS cumulative GPA and rank).

## Left to the builder

Table/column names and enum spellings, component structure, validation library choice (check what is already in `web/package.json`), exact sub-subject list, copy of UI text, layout of the mapped views beyond the field order above, sorting/grouping details, test fixtures.

## Open items (need the owner or a live account)

1. Common App Subject and Grading Scale dropdown values: need a logged-in screenshot. Until then they are `unverified`.
2. UIUC SRAR and UC manual-entry dropdown strings: UIUC needs an applicant account or admissions email; UC strings are partly secondary-source.
3. "STARS" is assumed to be the Self-reported Transcript and Academic Record System (strong evidence; the owner has not confirmed).
4. Which home grading systems matter most: the owner did not name any, so the default is 100-point percent, IB 7-point and A-levels first (author's call), covered in prompt examples and test fixtures; others are supported through the "other" scale with a stated maximum.
