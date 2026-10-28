# My list grouped by application system; Portals = after you submit (2026-10-28)

Follows `2026-10-28-portal-progress-design.md` (PR #46, live). That version put every portal, shared system and status
on the Portals page with a summary box. After using it, the owner wants the flow to match how applying actually works:

> We submit on Common App, then we get our portals, so once we have a portal, Common App is assumed done.

So the shared application systems move to **My list** (the "before you submit" view), the colleges sit under the system
they are applied through, and **Portals** becomes the "after you submit" view.

## Goals
1. **Every college gets one application route.** All 454 colleges in the database are classified, not only listed ones.
2. **My list is grouped by route.** Groups: Common App, UC Application, Cal State Apply, ApplyTexas, UCAS, OUAC,
   EducationPlannerBC, Direct (the college's own application). A group appears only when a college on the list is in it.
3. **The group header is the shared system:** its name, open link, the saved login (the same login data as today,
   `profile.portals.systems[<key>]`, so nothing saved is lost), and progress "2 of 5 submitted". A group reads Done when
   every college in it is Submitted. The Direct group has no shared login; it has no header login.
4. **Portals shows only what comes after submitting**, plus accounts that are not a way to apply:
   - Submitted colleges, each with its own portal login and Done / Not done + note (as today).
   - Other accounts: STARS, TOEFL, College Board, MyACT, CSS Profile, FAFSA, visas, IELTS, Duolingo, PTE, custom portals.
     Each keeps its own Done / Not done + note.
5. **STARS is both** an account on Portals and a checklist item on each listed college that requires it
   (`data/application_systems_2026_27.json` -> `stars` members). Marking the STARS account Done ticks STARS on all of
   them; before that, a student can tick it on one college at a time.
6. The summary box at the top of Portals is removed.

## Non-goals
- No per-college switch between routes (owner: "use the more general one").
- No automatic Done for TOEFL, College Board, CSS Profile and the other accounts.
- No new countries.

## Route rule (owner's decision)
A college that takes more than one system goes under the most general one, in this order:
**Common App > Coalition > UC > Cal State Apply > ApplyTexas > UCAS > OUAC > EducationPlannerBC > Direct.**
Examples: UT Austin (Common App + ApplyTexas) -> Common App; Texas Southern (ApplyTexas only) -> ApplyTexas;
UCLA -> UC; Toronto (OUAC or direct) -> OUAC; McGill, UBC, every Australian university -> Direct.
Coalition sits right after Common App, so it only becomes a route for a college that takes Coalition but not Common App;
if none of ours does, no Coalition group ever appears.
A college with only `own` (or no platform data) is Direct. Custom colleges the student typed in are Direct.

## Data
- Extend `scripts/build_application_systems.py` output with `route` per college (the rule above, computed in the
  script so every college has exactly one) next to the existing system lists. `--check` fails if any college in
  `data/colleges/` has no route.
- The four US colleges with no platform data (american, uconn, uga, ut-chattanooga) and every college classified Direct
  only because of `own` keep their current data; the builder flags in the report any Direct college whose official site
  says it takes Common App (spot-check, not a full re-research).
- STARS requirement per college stays as researched (18 colleges, `stars` members).

## Before -> after
A college moves from My list's "before" state to Portals when it is marked **Submitted** on My list (the existing
status). Submitted colleges still appear in their My list group (counted as submitted); their portal row lives on Portals.

## STARS on the checklist
- New checklist key `stars`, shown only for colleges in the `stars` member list (in the college's checklist panel on My
  list, and as a small "STARS" status left of Done / Not done on the college's Portals row). Stored like the other booleans.
- Marking the STARS account Done on Portals writes `checklist.stars = true` to every listed college that requires it.
- Not counted in `progress()` / Ready (see call 2).

## UI notes
- Group headers on My list sit inside the existing table as a header row per group (or one table per group); the columns
  stay College, Fit, Plan, Status, Checklist. Exact layout is the builder's call, but it must work at phone width
  (the table already scrolls sideways at 560px).
- The existing "Mark all sent" buttons and the balance/ED notes keep working across all groups.
- English and zh-TW text for everything new.

## Calls made in the write-up (not discussed with the owner; check these)
1. **STARS Done writes through.** Marking the STARS account Done sets `checklist.stars = true` on every listed college that
   requires STARS (saved like any checklist edit), so teachers, parent links, the AI context and MCP see the same ticks with
   no new RPC fields or migration. Un-marking the account leaves those ticks alone (no mass un-tick).
   Colleges added to the list later while STARS is Done get the tick when added (or the next time the page loads).
2. **The STARS item never counts toward checklist progress or "Ready".** Most colleges ask for STARS after you submit, so
   counting it would stop a STARS college from ever reading Ready (and the MCP "mark submitted" rule would refuse it).
   It works like the international steps (`INTL_STEPS` in `web/lib/checklist.ts`): a stored boolean `checklist.stars`, shown
   only for colleges that require STARS, not part of `progress()`. So no `progress()` signature change and no roster change.
3. **Group counts.** Every list entry in the group counts, whatever its status; "submitted" means `isSubmitted(status)`
   (submitted, interview and every decision status). A group reads Done when all of its entries are submitted.
4. **The build script's route is the only route.** `mainRoute`/`neededSystems` and the "saved data pulls a route in" rule
   from PR #46 go away; a group appears only from routes. Saved logins for a system with no group on the list stay stored,
   and the existing "n logins hidden" note on Portals mentions them.
5. **Old marks.** `progress` entries for application systems (commonapp, uc, ...) are no longer shown; they stay stored and
   unused. `college:<slug>` marks keep working on Portals.
6. **Portals rows** = colleges with `isSubmitted(status)`, as today.

## Left to the builder
Exact header layout and wording, whether the login on the group header opens inline or in a small popover, test names.
