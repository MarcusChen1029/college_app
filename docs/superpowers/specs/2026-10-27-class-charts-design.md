# Class charts (roadmap #11) - design

Date: 2026-10-27. Status: built on a branch; **migration 0033 is written, not applied** (the owner must apply it, then
run `supabase/patches/2026-10-27_class_outcomes_smoke_test.sql`). The owner was asleep and asked for decisions to be made
without asking; every decision is listed below with its reason.

## What it is

A teacher page, `/teacher/charts` (nav item "Charts"), with Naviance-style scattergrams: for one college, each of the
teacher's own linked students who has a final decision there is one anonymous point, x = GPA, y = SAT (or ACT), marker
shape and colour = admitted / waitlisted / denied. A class picker narrows it to one of the teacher's classes; a college
picker lists only colleges that pass the privacy floor. Counts per outcome sit in the legend, and a "Show as a table"
disclosure lists the same points for screen readers and copying.

## Data used

| Need | Where it lives |
|---|---|
| Decision per college | `student_colleges.status` (the student records it on Results, `/application/results`) |
| GPA | `student_profiles.gpa_unweighted` (0-4, unweighted) |
| SAT | `student_profiles.sat_total` |
| ACT | `student_profiles.act_composite` |
| Plan | `student_colleges.plan_key` (ED/EA/REA/RD...) |
| Who is in scope | `teacher_links` (the access grant), `class_members` for the class filter |

Outcome mapping (decision): `admitted` and `enrolled` -> admitted; `waitlisted` -> waitlisted; `rejected` -> denied.
`deferred` and `withdrawn` are not final and are not counted. Custom colleges (no `institution_id`) are left out: their
names are free text typed by one student and could identify them.

ACT is a separate field, not converted: the code has no SAT/ACT concordance table (`web/lib/scores.ts` only holds
scales), and inventing one would break the repo's "never invent data" rule. The page has an SAT/ACT toggle and picks
whichever the college's points have more of.

## Privacy

Teachers still have no SELECT on student tables. The only new read is `public.teacher_outcomes(p_class_id uuid default
null)`, SECURITY DEFINER, `search_path = ''`, executable by `authenticated` only, refusing anyone without the teacher
role (`teachers only`) and any class the caller does not own (`class not found`, same as an unknown id).

**Floor: `MIN_STUDENTS = 5`.** Defined as `min_students` in `supabase/migrations/0033_class_outcomes.sql` and mirrored
as `MIN_STUDENTS` in `web/lib/class-charts.ts`; keep them in step.

- If fewer than 5 distinct in-scope students have any final outcome, the result has `enough: false` and no colleges.
- A college is returned only when at least 5 distinct in-scope students have a final outcome there.
- The floor is applied after the class filter, so a 3-student class shows nothing even if the teacher has 50 students.
- The client parser (`parseClassOutcomes`) enforces the same floor again, so an old or malformed payload cannot draw a
  chart for a smaller group.

**Returned:** `min_students`, `students_with_outcomes` (a count of the teacher's own students, which the roster already
shows), `enough`, `hidden_colleges` (count only), and per college `college_id`, `slug`, `name`, `points`. Each point is
exactly `{gpa, sat, act, outcome, plan}`, GPA rounded to 0.05.

**Never returned:** student ids, names, emails, display names, class ids or names, school years, dates (applied, decided,
updated), notes, checklist, portal data, English scores, intended major, international flag, or any per-student key.
Points are ordered by their own values (gpa, sat, act, outcome, plan), so position does not encode identity. The chart's
fan-out of identical points is value-based too.

**Known limit (accepted):** a teacher can already see each linked student's name, GPA, SAT and per-college status in the
roster (`teacher_roster`, 0023). So the anonymity here protects the chart when it is projected in class or shown to
students, not against the teacher, who could re-identify points with the roster. The plan key is included because
ED-vs-RD context is the main reason teachers use these charts; with a floor of 5 it can single out a lone ED applicant
to someone who already knows who applied ED, which the teacher already does. If the owner wants charts shown to
students later, raise the floor or drop `plan` for groups under ~10.

## Code

- `supabase/migrations/0033_class_outcomes.sql` - the RPC. Not applied.
- `supabase/patches/2026-10-27_class_outcomes_smoke_test.sql` - rolled-back transaction with asserts: 4 students ->
  nothing; 5 -> one college with 5 points, only allowed keys, no ids/emails/names in the payload, GPA rounded, outcome
  mapping; a 3-student class -> nothing; another teacher's class -> refused; teacher B sees only their one student and no
  data; a student caller -> refused.
- `web/lib/class-charts.ts` (+ `class-charts.test.ts`) - parser with floor, value sorting, counts, axis domains/ticks,
  linear scale, chart layout. Pure, node:test.
- `web/lib/charts-api.ts` - client wrapper `teacherOutcomes(classId)`.
- `web/components/TeacherCharts.tsx`, `web/app/(app)/teacher/charts/page.tsx` - the page. Inline SVG, no chart library.
- `web/lib/roles.ts` - "Charts" added to the teacher nav (`roles.test.ts` updated).

## UI decisions

- Colours are the existing status tokens (`text-done` / `text-soon` / `text-urgent`, from `globals.css`), never raw
  red/green classes. Shapes differ (filled circle = admitted, filled triangle = waitlisted, cross = denied) so the chart
  reads without colour; the legend shows the same markers with counts.
- Axes snap to 0.5 GPA and 100 SAT / 2 ACT steps around the data, clamped to the real scale.
- Points with no GPA or no score for the chosen test are counted in the legend but not drawn; a caption says how many.
- Empty states: below the overall floor ("So far: N of 5") and "no college has 5+ decisions yet" (with the hidden count).
- No dark mode (site is light-only).

## Not done / next

- Apply 0033 and run the smoke test (owner).
- Not verified against live data: no signed-in teacher session was available. Checked: tsc, lint, unit tests and build
  pass, and `GET /teacher/charts` returns 200 from `next dev` without a session. The chart itself has not been seen
  rendered in a browser with real points.
- Ideas: aggregate across years once students carry a graduation year (would need its own floor), CDS 25-75 bands
  drawn behind the points, export as PNG for counselor presentations.
