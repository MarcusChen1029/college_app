# UK, Canada and Australia applications, Part 2 (after the offer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Plan 1 must be merged first.** That is `docs/superpowers/plans/2026-11-04-uk-ca-au-part1-application-steps.md`, with its migration applied and edge function v7 live. This plan uses Plan 1's interfaces by their exact names.

**Goal:**
- After an offer, a UK, Canadian or Australian college shows that country's next steps up to the visa, with sourced "when / how much" lines.
- A new optional Citizenship field decides who sees the visa steps.
- UK offers get an offer type, conditions and a Firm / Insurance / Decline reply, plus a reply-by date that is reminded everywhere.
- English test results warn before they expire (all countries, US too).
- Scholarships get a currency (USD, GBP, CAD, AUD), with totals kept per currency.

**Architecture:**
- Plan 1's `afterOfferSteps(c, status, ctx, opts)` gets its GB/CA/AU branches, plus a `citizenship` option. Step state is stored as booleans in the same checklist jsonb and never counts in `progress()`.
- Step facts come from a generated, sourced file `web/lib/data/after-offer.json`.
- The UK offer and reply also live in the checklist jsonb. `redact_checklist` strips the free-text conditions, so teachers see only the type, the reply and the date.
- The reply-by date reaches every deadline view through Plan 1's call sites (`deadlinesForEntry` + a new `withReplyBy`) and a new branch in `upcoming_deadlines_for`. Reminders get their own `due_reply_reminders` and log table, because `reminder_log` needs a `deadlines` row.
- English expiry is a pure check over existing test dates plus a sourced validity file.
- Scholarships get a `currency` column next to the unchanged `amount_usd`.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, supabase-js 2.118, Postgres (Supabase), Deno Edge Function, Python 3 builder (unittest), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-04-uk-ca-au-applications-design.md`. This plan covers Part D (D1, D2), B4 and Part E. Research: `docs/superpowers/research/2026-11-04-uk-international-and-after-offer.md`, `…-canada-after-offer-and-permit.md`, `…-australia-after-offer-and-visa.md`.

## Global Constraints

- All of Plan 1's Global Constraints apply unchanged: checks by exit code, i18n en + zh-TW, `ui.ts` tones, Next 16 rules, signed-out browser checks, `00NN` placeholders, one owner-present live task, never re-seed, conventional commits with the session's attribution line.
- US after-offer output stays byte-for-byte `intlSteps()`. Plan 1's `checklist-us-pin.test.ts` already pins `intlSteps`, and Task 1 adds a pin that the US branch ignores `citizenship`. Neither test is edited later.
- After-offer steps never count in `progress()` or "Ready".
- Never invent data. A "when / how much" line exists only for a fact the research files tag **official-scraped** or **official-summary** with a URL. Each line carries its source URL plus verified-on date, and anything the research marks unconfirmed (for example Australia's AUD 2,500 visa fee) stays out. No line is shown when unknown.
- Citizenship is never shown to teachers, parents or the AI views:
  - `AI_PROFILE_COLUMNS` and the `ai_*` views stay as they are, and `ai-views.test.ts` must still pass;
  - the MCP profile patch refuses it;
  - the OAuth guard refuses writes to it.
  The privacy page, the data map and `LEGAL_UPDATED` describe it (CLAUDE.md: legal pages describe what the code does).
- UK offer conditions (free text) never reach teachers, parents or emails.
- English expiry is a warning only: never a block, and never a change to `isDone`.
- Scholarships: `amount_usd` is not renamed in this plan (live code reads it). Totals are per currency, never converted.
- Branch `feat/uk-ca-au-part2`, merged only at Task 12's merge step. The new web code selects `student_profiles.citizenship` and writes `scholarships.currency`, so it must not deploy before the migration.

## Review Focus

Each line has a test in the owning task.

1. **Citizenship unset** (most students today). Expected: UK/CA/AU visa steps show, with a "set your citizenship" note; US colleges are unaffected. Tests: Task 1 `unset citizenship shows visa steps`, `US ignores citizenship`.
2. **Two Firm choices in stored data** (an AI connector write, two devices, an old tab). Expected: the UI blocks a second Firm, and when two already exist it shows a conflict note instead of picking one. Tests: Task 4 `canSetReply`, `replyConflicts`.
3. **Missing, malformed or undated English results**: no date, "2025-13-40", a test that isn't in the validity file, plan `not_required`, or Cambridge with no university rule. Expected: no warning, no crash. Test: Task 8 `no warning without a usable date`.
4. **A reply-by date that is malformed (`2027-5-5`, `2027-02-30`), in the past, or already answered.** That covers `uk_reply` set on this college, **any UK college set to Firm**, or the status not admitted. Expected: no chip and no reminder. The TS and SQL agree. Tests: Task 6 `replyByDeadline` and `no reply-by once any UK college is Firm`; Task 10 smoke (c)-(e).
5. **Mixed-currency scholarships with missing amounts.** Expected: one total per currency, missing amounts skipped, no cross-currency sum anywhere (page, AI context, email). Tests: Task 9 `totalsByCurrency`, grep step.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `web/lib/checklist.ts` (modify), `web/lib/after-offer-model.test.ts` (create) | After-offer step lists, visa gating, committed rule, UK offer/reply keys | 1 |
| `data/after_offer_2026_27/{gb,ca,au}.json` (create), `scripts/build_after_offer.py` + `scripts/test_build_after_offer.py` (create), `web/lib/data/after-offer.json` (generated), `web/lib/after-offer.ts` + test (create) | Sourced "when / how much" facts and lookup | 2 |
| `web/lib/citizenship.ts` + test (create), `web/lib/fit.ts`, `web/lib/student-rows.ts`, profile form, `web/lib/mcp/*`, privacy messages, `docs/legal/2026-10-29-privacy-data-map.md`, `web/lib/legal.ts` (modify) | Citizenship field end to end | 3 |
| `web/lib/uk-offers.ts` + test, `web/components/my-list/UkOfferSection.tsx` (create) | Offer type, conditions, reply, reply-by entry | 4 |
| `web/components/ChecklistPanel.tsx`, `web/components/my-list/AfterOfferSection.tsx` (create/modify) | After-offer steps UI | 5 |
| `web/lib/uk-offers.ts` (`replyByDeadline`, `withReplyBy`), Plan 1's call sites (modify) | Reply-by date in student deadline views | 6 |
| `docs/superpowers/research/2026-11-05-english-validity-brief.md`, `web/lib/data/english-test-validity.json` (create) | Sourced validity per test (+ university rules) | 7 |
| `web/lib/english-expiry.ts` + test (create), the checklist English section (modify) | Expiry warning | 8 |
| `web/lib/scholarships.ts` + test, `ScholarshipsPage.tsx`, the scholarship row mapping in `student-rows.ts` (modify; these are every reader of amounts, see Task 9) | Currencies | 9 |
| `supabase/migrations/00NN_uk_ca_au_after_offer.sql`, `supabase/patches/2026-11-06_uk_ca_au_after_offer_smoke_test.sql` (create) | Schema, SQL rules, reply reminders | 10 |
| `supabase/functions/deadline-reminders/index.ts`, `_shared/student-digest.ts`, `web/lib/student-digest-parity.test.ts` (modify) | Reply-by in reminder and weekly emails; currency in emails | 11 |

## Shared interfaces (defined once; every task uses these exact names)

From Plan 1 (consumed, unchanged):
- `CountryCode`, `Intake`, `CollegeContext` (`country`, `course`, `hasCourses`, `steps`, `researched`, `admissionsUrl`), `US_CONTEXT`, `AfterOfferStep = { key; done; when }`, `afterOfferSteps`, `progress`, `checklistItems`, `itemLabel` (`checklist.ts`)
- `contextFor`, `countryOf`, `collegeSteps`, `courseFor`, `listHasCountry` (`application-steps.ts`)
- `deadlinesForEntry`, `universityDeadlines`, `normalIntake` (`course-deadlines.ts`); `deadlineApplies`
- `stage(status, c, ctx)`; `ucasSharedPatches`; Plan 1's migration versions of `upcoming_deadlines_for`, `due_reminders`, `parent_view`

`web/lib/checklist.ts` additions (Task 1):

```ts
export const UK_OFFER_TYPES = ["conditional", "unconditional"] as const; export type UkOfferType = (typeof UK_OFFER_TYPES)[number];
export const UK_REPLIES = ["firm", "insurance", "decline"] as const; export type UkReply = (typeof UK_REPLIES)[number];
export const AFTER_OFFER = {
  GB: [["uk_conditions_met", false], ["uk_place_confirmed", false], ["uk_deposit", false], ["uk_cas", true], ["uk_visa_applied", true], ["uk_visa_granted", true], ["uk_accommodation", false]],
  CA: [["ca_offer_accepted", false], ["ca_deposit", false], ["ca_pal", true], ["ca_permit_applied", true], ["ca_biometrics", true], ["ca_permit_approved", true], ["ca_housing", false]],
  AU: [["au_offer_accepted", false], ["au_deposit_oshc", false], ["au_coe", true], ["au_visa_applied", true], ["au_visa_granted", true], ["au_housing", false]],
} as const; // [key, isVisaStep]
export type AfterOfferKey = (typeof AFTER_OFFER)[keyof typeof AFTER_OFFER][number][0];
// Checklist gains: Partial<Record<AfterOfferKey, boolean>> & { uk_offer?: UkOfferType | null; uk_conditions?: string; uk_reply?: UkReply | null; uk_reply_by?: string | null }
export function visaNeeded(country: Exclude<CountryCode, "US">, citizenship: string | null | undefined): boolean; // citizenship !== country (unset → true)
export function isCommitted(c: Checklist, status: string, country: CountryCode): boolean; // status "enrolled", or GB with uk_reply "firm" and status admitted|enrolled
// afterOfferSteps opts gain: citizenship?: string | null
```

`web/lib/after-offer.ts` (Task 2):
- `type AfterOfferFact = { text: string; link: string | null; sourceUrl: string; verifiedOn: string; onlyCitizenship: string[] | null }`
- `afterOfferFacts(slug: string, key: AfterOfferKey, citizenship: string | null): AfterOfferFact[]` returns university facts first, then country facts, filtered by `onlyCitizenship`.
- `stepVariant(slug: string, key: AfterOfferKey): "caq" | null`

`web/lib/citizenship.ts` (Task 3):
- `CITIZENSHIP_OPTIONS = ["TW", "HK", "MO", "CN", "US", "GB", "CA", "AU", "ZZ"] as const` (`ZZ` = another country)
- `normalCitizenship(v: unknown): string | null` (a value in `CITIZENSHIP_OPTIONS`, else null; "UK" is not "GB")
- `StudentProfile.citizenship?: string | null`
- DB column `student_profiles.citizenship text`

`web/lib/uk-offers.ts` (Tasks 4 and 6):
- `UK_CONDITIONS_MAX = 500`
- `INSURANCE_RULE_SOURCE: string | null`
- `canSetReply(list, slug, reply: UkReply): boolean`
- `replyConflicts(list): { firm: string[]; insurance: string[] }`
- `replyByDeadline(entry, list, today: string): Deadline | null`
- `withReplyBy(rows, entry, list, today: string)`
- `REPLY_BY_LABEL = "UCAS reply-by date"`

`web/lib/english-expiry.ts` (Task 8):
- `relevantEnglishDate(...)`
- `englishExpiry(...)`
- type `ExpiryWarning`

`web/lib/scholarships.ts` (Task 9):
- `CURRENCIES = ["USD", "GBP", "CAD", "AUD"] as const`, `Currency`
- `totalsByCurrency`, `formatMoney`
- `Scholarship.currency`

SQL (Task 10):
- `student_profiles.citizenship`, `scholarships.currency`
- table `reply_reminder_log`
- `due_reply_reminders(today date)`
- replaced `redact_checklist`, `upcoming_deadlines_for`

---

## Part D1: after-offer steps per country

### Task 1: After-offer model for UK, Canada and Australia

**Files:**
- Modify: `web/lib/checklist.ts`
- Create: `web/lib/after-offer-model.test.ts`

**Interfaces:**
- Consumes: Plan 1's `afterOfferSteps`, `intlSteps`, `CollegeContext`, `US_CONTEXT`, `progress`.
- Produces: the `checklist.ts` additions in Shared interfaces.

**Rules** (`afterOfferSteps`, in `AFTER_OFFER` order, `when: null` for non-US):

| Country | Shown when |
|---|---|
| US | `intlSteps(c, status, opts)` returned as is. `citizenship` is ignored and `is_international` still decides. |
| GB | Nothing unless status is `admitted` or `enrolled`, and nothing when `c.uk_reply === "decline"`. Otherwise:<br>• Non-visa steps show from `admitted`: `uk_place_confirmed`, `uk_deposit`, `uk_accommodation`, plus `uk_conditions_met` when `c.uk_offer === "conditional"`.<br>• Visa steps (`uk_cas`, `uk_visa_applied`, `uk_visa_granted`) show only when `isCommitted` (the Firm choice, or Committed) **and** `visaNeeded("GB", citizenship)`. |
| CA / AU | At `admitted` or `enrolled`: the non-visa steps (`*_offer_accepted`, `ca_deposit` / `au_deposit_oshc`, `*_housing`). Visa steps (`ca_pal`, `ca_permit_applied`, `ca_biometrics`, `ca_permit_approved` / `au_coe`, `au_visa_applied`, `au_visa_granted`) only at `enrolled` (Committed) and when `visaNeeded`. Otherwise nothing. |

For non-US colleges `opts.international` is ignored (spec D1: `is_international` means "not a US student"). `done = c[key] === true`.

My calls:
- `uk_deposit` is shown to every admitted UK student, labelled "if your university asks".
- `au_coe` counts as a visa step, since CoE is issued for the student visa.
- `ca_pal` uses the CAQ label where Task 2's data says so (McGill).

- [ ] **Step 1: Write the failing tests** (`after-offer-model.test.ts`)

```ts
const ctx = (country: CountryCode): CollegeContext => ({ ...US_CONTEXT, country });
const keys = (c: Checklist, status: string, country: CountryCode, citizenship?: string | null) =>
  afterOfferSteps(c, status, ctx(country), { international: true, citizenship }).map((s) => s.key);
test("US ignores citizenship", () => {
  for (const cz of [undefined, null, "US", "TW"]) for (const st of ["planning", "admitted", "enrolled"])
    assert.deepEqual(afterOfferSteps({}, st, US_CONTEXT, { international: true, citizenship: cz }), intlSteps({}, st, { international: true }));
});
test("GB before and after reply", () => {
  assert.deepEqual(keys({ uk_offer: "conditional" }, "admitted", "GB"), ["uk_conditions_met", "uk_place_confirmed", "uk_deposit", "uk_accommodation"]);
  assert.deepEqual(keys({ uk_offer: "unconditional" }, "admitted", "GB"), ["uk_place_confirmed", "uk_deposit", "uk_accommodation"]);
  assert.deepEqual(keys({ uk_offer: "conditional", uk_reply: "insurance" }, "admitted", "GB"), ["uk_conditions_met", "uk_place_confirmed", "uk_deposit", "uk_accommodation"]);
  assert.deepEqual(keys({ uk_offer: "conditional", uk_reply: "firm" }, "admitted", "GB"),
    ["uk_conditions_met", "uk_place_confirmed", "uk_deposit", "uk_cas", "uk_visa_applied", "uk_visa_granted", "uk_accommodation"]);
  assert.deepEqual(keys({ uk_reply: "decline" }, "admitted", "GB"), []);
  assert.deepEqual(keys({}, "planning", "GB"), []);
});
test("unset citizenship shows visa steps", () => assert.ok(keys({ uk_reply: "firm" }, "admitted", "GB", null).includes("uk_cas")));
test("own country hides visa steps", () => {
  assert.deepEqual(keys({ uk_reply: "firm" }, "admitted", "GB", "GB"), ["uk_place_confirmed", "uk_deposit", "uk_accommodation"]);
  assert.deepEqual(keys({}, "enrolled", "CA", "CA"), ["ca_offer_accepted", "ca_deposit", "ca_housing"]);
  assert.deepEqual(keys({}, "enrolled", "AU", "AU"), ["au_offer_accepted", "au_deposit_oshc", "au_housing"]);
});
test("CA and AU by status", ...);
// admitted gives [ca_offer_accepted, ca_deposit, ca_housing] / [au_offer_accepted, au_deposit_oshc, au_housing] (no visa steps);
// enrolled + TW gives all 7 / 6 keys
test("visa steps wait for the committed college", ...);
// GB admitted with no reply, or with Insurance, has no uk_cas; CA/AU admitted has no ca_pal / au_coe
test("international flag ignored outside US", ...); // GB firm with international false still has uk_cas
test("done reads booleans", ...);       // { uk_reply: "firm", uk_cas: true }: uk_cas done, uk_deposit not done
test("never counts in progress", ...);  // progress(c + every AFTER_OFFER key true, ctx) deepEquals progress(c, ctx) for GB, CA, AU
test("isCommitted", ...);               // GB admitted + firm true; GB admitted + insurance false; CA admitted false; CA enrolled true
```

- [ ] **Step 2: Run them to see them fail**: `cd web; node --test lib/after-offer-model.test.ts`. Expected: FAIL (exports missing).
- [ ] **Step 3: Implement** the constants, types, `visaNeeded`, `isCommitted`, the GB/CA/AU branches and the `citizenship` option. The US branch stays `return intlSteps(c, status, opts)`.
- [ ] **Step 4: Run this test, Plan 1's `checklist-us-pin.test.ts` (unedited) and the full checks.** Expected: `tsc=0 lint=0 test=0`.
- [ ] **Step 5: Commit**: `feat(checklist): UK, Canada and Australia after-offer steps (US unchanged)`

### Task 2: Sourced "when / how much" facts per step

**Files:**
- Create: `data/after_offer_2026_27/gb.json`, `ca.json`, `au.json`; `scripts/build_after_offer.py`, `scripts/test_build_after_offer.py`
- Generated: `web/lib/data/after-offer.json`
- Create: `web/lib/after-offer.ts`, `web/lib/after-offer.test.ts`
- Modify: `CLAUDE.md` (one line under Data pipeline)

**Interfaces:**
- Consumes: `AFTER_OFFER`, `AfterOfferKey` (Task 1); the slugs and `country_code` in `data/colleges`.
- Produces: the `after-offer.ts` block of Shared interfaces.

**Input contract** (one file per country):

```json
{ "country": "CA",
  "steps": { "ca_permit_applied": [ { "text": "Show first-year tuition + CAD 23,448 living costs + return travel (applications from 1 Sep 2026).",
      "link": "https://www.canada.ca/…/financial-support.html", "source_url": "https://www.canada.ca/…/financial-support.html",
      "verified_on": "2026-11-04", "research_ref": "2026-11-04-canada-after-offer-and-permit.md:113",
      "evidence": "CAD 23,448 per year, excl. tuition and travel | IRCC 2026-08-28 [page]", "only_citizenship": null } ] },
  "universities": { "mcgill": { "variants": { "ca_pal": "caq" }, "steps": { "ca_permit_applied": [ … ] } } } }
```

**Which facts may go in.** Only facts that the research file marks as read from an official page:
- UK file: `[gov]` / `[uni]`; UCAS file: `official-scraped` / `official-summary`;
- Canada: `[page]`;
- Australia: table rows whose source column is an official URL.

Never anything tagged `[snippet]`, `[inference]`, "derived", "possibly outdated", or listed in a file's open questions. Examples that stay out:
- Australia's AUD 2,500 visa fee (`australia-after-offer-and-visa.md:264` unconfirmed);
- U of T's CAD 5,000 deposit (`[snippet]`, `canada…:26`);
- McGill's deposit (`canada…:148` reports conflicting official figures; my call: leave it out).

Starting set (builder confirms each line's tag before using it):
- CA:
  - UBC `ca_deposit` CAD 3,000 (`canada…:26`, evidence "UBC CAD 3,000 [page]");
  - `ca_pal` "accept and pay to get your PAL/TAL" (`:67`);
  - McGill `ca_pal` variant `caq`, plus the CAQ steps (`:87`, Quebec living figure CAD 24,617 at `:90`);
  - `ca_permit_applied` CAD 23,448 (`:113`, `:184`);
  - no medical exam for Taiwan (`:168`, `only_citizenship: ["TW"]`; builder finds the official-tagged line it summarises, else drop it).
- AU: Melbourne `au_deposit_oshc` AUD 17,000 credited to the first instalment. Use `australia…:246` (URL + figure, no rejected marker). `:23` mixes in "not found".
- GB:
  - `uk_visa_granted` eVisa: set up a UKVI account and link the passport (`uk-international…:83`);
  - `uk_visa_applied` "Taiwan is not on the UK TB-test list" (`:189`, `only_citizenship: ["TW"]`);
  - `uk_cas` "a CAS is valid for 6 months" (`:148`).
- Add any further accepted facts the three files hold. Text is English (it is data) and at most 200 characters.

**Validator rules** (each one a test):
- `country` is GB/CA/AU, and step keys are in that country's `AFTER_OFFER` list (mirror it in Python; the TS test in Step 5 checks the mirror against the generated file).
- University slugs exist in `data/colleges` with that country.
- `text` is 1-200 characters; `link` is null or https; `source_url` is https; `verified_on` is YYYY-MM-DD.
- `research_ref` matches `^2026-11-04-[a-z-]+\.md:\d+$`, the file exists, and the line number is within it.
- Each fact carries `evidence`: an exact substring of that research line covering the fact. The builder reads the line and checks:
  - the line contains `evidence`;
  - `evidence` holds an official tag (`[gov]`, `[uni]`, `[page]`, `official-scraped`, `official-summary`) or an `https://` URL;
  - `evidence` holds none of `[snippet]`, `[inference]`, `derived`, `possibly outdated`, `not found`, `not confirmed`, `unconfirmed` (case-insensitive).
  Otherwise the fact is rejected. A line can mix sources: `canada…:26` has "UBC CAD 3,000 [page]" and "U of T about CAD 5,000 [snippet]", which is why the check is on `evidence`, not the whole line.
- `only_citizenship` is null or a list of `^[A-Z]{2}$`.
- `variants` allows only `{"ca_pal": "caq"}`.

Output: `{ "<country>": { steps: { key: Fact[] } }, "universities": { "<slug>": { variants, steps } } }` in camelCase. `--check` exits 1 on a diff.

- [ ] **Step 1: Write the failing Python tests** (unittest, layout of `scripts/test_build_supplements.py`):
  - `test_step_key_must_belong_to_country`, `test_university_must_be_that_country`, `test_research_ref_must_exist`, `test_text_length`, `test_https_only`, `test_variant_enum`
  - `test_snippet_fact_rejected`: a U of T `ca_deposit` fact with ref `canada…:26` and evidence "U of T about CAD 5,000 [snippet]" is rejected.
  - `test_official_evidence_accepted`: evidence "UBC CAD 3,000 [page]" on the same line passes.
  - `test_evidence_must_be_on_the_line`
  - on real data, `test_no_unconfirmed_au_visa_fee`: no AU fact text contains "2,500".
- [ ] **Step 2: Run them to see them fail**: `python -I -m unittest scripts/test_build_after_offer.py`. Expected: errors (module missing).
- [ ] **Step 3: Implement the builder and write the three data files.**
- [ ] **Step 4: Run** `python -I scripts/build_after_offer.py` and the tests. Expected: OK.
- [ ] **Step 5: Write the failing TS test** (`after-offer.test.ts`)

```ts
test("keys in the data are AFTER_OFFER keys", ...);   // every country/university step key is in AFTER_OFFER[country]
test("university facts come first", ...);              // afterOfferFacts("ubc", "ca_deposit", null)[0].text includes "3,000"
test("country facts apply to every university", ...);  // afterOfferFacts("toronto", "ca_permit_applied", null) has the 23,448 fact
test("citizenship-only facts", () => {
  assert.ok(afterOfferFacts("ucl", "uk_visa_applied", "TW").some((f) => /TB/.test(f.text)));
  assert.ok(!afterOfferFacts("ucl", "uk_visa_applied", null).some((f) => /TB/.test(f.text)));
});
test("McGill uses the CAQ variant", () => { assert.equal(stepVariant("mcgill", "ca_pal"), "caq"); assert.equal(stepVariant("ubc", "ca_pal"), null); });
test("unknown slug or key gives []", ...);
```

- [ ] **Step 6: Run it to see it fail**: `cd web; node --test lib/after-offer.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 7: Implement `after-offer.ts`** (`import raw from "./data/after-offer.json" with { type: "json" };`).
- [ ] **Step 8: Run the TS test and full checks; `python -I scripts/build_after_offer.py --check` exits 0.** Add the CLAUDE.md line.
- [ ] **Step 9: Commit**: `feat(data): sourced after-offer facts for UK, Canada and Australia`

### Task 3: Citizenship on the profile (student-only)

**Files:**
- Create: `web/lib/citizenship.ts`, `web/lib/citizenship.test.ts`
- Modify:
  - `web/lib/fit.ts:17-36` (`StudentProfile.citizenship`, with a comment like `weeklyDigest`'s at :27)
  - `web/lib/student-rows.ts`: `ProfileRow` (:78), `PROFILE_COLUMNS` (:101) plus its pre-column fallback chain (:109-114), `toProfile` (:237/:254), `fromProfile` (:265)
  - the profile form that edits `international` (builder confirms which component with a Grep for `international` in `web/components/Profile*.tsx`, `SettingsPage.tsx`, `StartWizard.tsx`)
  - `web/lib/mcp/rules.ts:471` (refusal reason)
  - `web/lib/i18n/messages/privacy.ts` (en + zh-TW item next to `:60`), `docs/legal/2026-10-29-privacy-data-map.md`, `web/lib/legal.ts` (`LEGAL_UPDATED`)

**Interfaces:**
- Consumes: the `weeklyDigest` patterns as the model (`student-rows.ts:109-156`, `student-digest.test.ts:391`, `mcp/rules.ts:471`).
- Produces: `CITIZENSHIP_OPTIONS`, `normalCitizenship`, `StudentProfile.citizenship`; `citizenship` in `PROFILE_COLUMNS`; DB column `student_profiles.citizenship` (Task 10).

**Behaviour:**
- An optional select labelled `profile.citizenship` ("Citizenship"), with the hint "Used only to decide which visa steps you see. Never shown to teachers, parents or connected AI."
- The options are `CITIZENSHIP_OPTIONS`, with names from `Intl.DisplayNames([locale], { type: "region" })` and `ZZ` labelled `profile.citizenshipOther` ("Another country"). It is stored as the code, or null.
- Use the i18n prefix that form already uses for its keys.

My calls:
- Short list plus "Another country", because only GB/CA/AU equality matters in this plan; the next project can widen it.
- `fromProfile` writes it, since it is a normal student-edited field, unlike `weekly_digest`. It **omits** the key when the value is undefined, and whenever the column-known fallback says the column is missing (the same flag the select fallback sets). A save before the migration therefore still succeeds.
- The select keeps a fallback, as `weekly_digest` does, so a missing column doesn't break profile loads.

What doesn't change:
- `AI_PROFILE_COLUMNS` and the `ai_student_profiles` view stay unchanged, and `ai-views.test.ts` passes as is.
- `ai-context.ts` doesn't add it.
- Teacher and parent RPCs return explicit lists, so nothing changes there; Task 10's smoke test proves it.
- The OAuth guard's allow-list (`0041:113-156`) already refuses the new column; Task 10's smoke test proves it.

- [ ] **Step 1: Write the failing tests**

```ts
// citizenship.test.ts
test("normalCitizenship", () => {
  for (const ok of ["TW", "GB", "ZZ"]) assert.equal(normalCitizenship(ok), ok);
  for (const bad of ["tw", "TWN", "", null, 7, "G1", "UK", "FR"]) assert.equal(normalCitizenship(bad), null); // only CITIZENSHIP_OPTIONS
});
test("profile round trip", () => {
  assert.equal(toProfile({ ...profileRow, citizenship: "TW" }).citizenship, "TW");
  assert.equal(toProfile({ ...profileRow, citizenship: "bad" }).citizenship, null);
  assert.equal(fromProfile(uid, { ...profile, citizenship: "GB" }).citizenship, "GB");
  assert.ok(!("citizenship" in fromProfile(uid, { ...profile, citizenship: undefined })));
  // With the column-missing fallback flag set (as after a select that failed on citizenship): no citizenship key either.
  assert.match(PROFILE_COLUMNS, /\bcitizenship\b/);
});
test("never in the AI columns", () => assert.doesNotMatch(AI_PROFILE_COLUMNS, /citizenship/));
test("MCP profile patch refuses citizenship", ...); // the refusal map in mcp/rules.ts has a citizenship entry, and a patch carrying it is refused (follow the weeklyDigest test)
```

The fallback-chain test in `profile-tests.test.ts:71-72` gets `citizenship` added the same way as `weekly_digest`.

- [ ] **Step 2: Run them to see them fail**: `cd web; node --test lib/citizenship.test.ts lib/profile-tests.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the lib, the row mapping and fallback, the form field, the MCP refusal, and the privacy item (what it is, why, who can't see it, the table `student_profiles.citizenship`). Add the data-map row and set `LEGAL_UPDATED` to the commit date.
- [ ] **Step 4: Run the tests and full checks.** Expected: `tsc=0 lint=0 test=0` (incl. `ai-views.test.ts`, `i18n.test.ts`, `legal.test.ts`).
- [ ] **Step 5: Browser check, signed out:** set Citizenship to Taiwan and reload; it persists in localStorage. `/privacy` shows the new item in both languages.
- [ ] **Step 6: Commit**: `feat(profile): optional citizenship for visa steps (student-only)`

## Part D2: UK offers and replies

### Task 4: Offer type, conditions, Firm / Insurance / Decline, reply-by date

**Files:**
- Create: `web/lib/uk-offers.ts`, `web/lib/uk-offers.test.ts`, `web/components/my-list/UkOfferSection.tsx`
- Modify:
  - `web/components/ChecklistPanel.tsx`: render `UkOfferSection` above the after-offer steps for GB colleges whose status is `admitted` or `enrolled`
  - `application.*` messages (en + zh-TW)
  - `web/lib/i18n/messages/privacy.ts`: the teacher-visibility item gains "your UCAS reply and reply-by date, not your offer conditions"; bump `LEGAL_UPDATED`

**Interfaces:**
- Consumes: `UK_OFFER_TYPES`, `UK_REPLIES`, `UkReply` (Task 1); `countryOf` (Plan 1); `isIsoDate` (`recommenders.ts`).
- Produces:
  - `UK_CONDITIONS_MAX = 500`
  - `canSetReply(list: readonly Pick<ListEntry, "slug" | "status" | "checklist" | "custom">[], slug: string, reply: UkReply): boolean`
  - `replyConflicts(list): { firm: string[]; insurance: string[] }`
  - `INSURANCE_RULE_SOURCE: string | null`

  The stored keys are in the checklist: `uk_offer`, `uk_conditions` (trimmed, at most 500), `uk_reply`, `uk_reply_by` (YYYY-MM-DD or null). Invalid stored values (`"FIRM"`, `3`, `"2027-13-01"`) read as unset everywhere.

**Rules:**
- A reply holder is a GB, non-custom entry with status `admitted` or `enrolled`.
- `canSetReply`:
  - `firm` / `insurance` are allowed only when no *other* holder has that reply;
  - `decline` is always allowed;
  - a non-GB slug gives false.
- If Step 1 confirms it: `insurance` is not allowed while another holder's Firm is an unconditional offer, and setting an unconditional offer as Firm is not allowed while an Insurance exists.
- In the UI, the Firm and Insurance options are disabled with `application.ukOffer.taken` ("Already your {reply}: {college}"). If `replyConflicts` finds more than one Firm or Insurance (old data, AI write, another device), show `application.ukOffer.conflict` and pick nothing automatically.
- Reply-by help text (`application.ukOffer.replyByHelp`, from `uk-ucas-process.md:45-52`, source `:193`): "Copy the date from UCAS Hub. It is 5 May 2027 if all your decisions arrived by 31 Mar, 2 Jun 2027 if by 12 May, or 21 Jul 2027 if by 14 Jul."
- Change help (`application.ukOffer.changeHelp`, from `:73`): "After replying you have 14 days to change your replies, once."
- My call: the reply lives on the checklist panel, next to the steps it unlocks, not on Results.

- [ ] **Step 1: Check the Insurance rule on an official UCAS page.** Look for "no Insurance with an unconditional Firm" on ucas.com, fetching it directly.
  - Found: set `INSURANCE_RULE_SOURCE` to the URL, plus a comment with a quote of 15 words or fewer and the date.
  - Not found: `null`, skip its test, and say so in the report.
- [ ] **Step 2: Write the failing tests** (`uk-offers.test.ts`)

```ts
// Fixtures use real slugs, because countryOf reads the static file: "kcl" below stands for "kings-college-london".
// list: ucl { status: "admitted", checklist: { uk_reply: "firm" } }, kcl admitted {}, harvard admitted {}, custom GB entry
test("one Firm across UK colleges", () => {
  assert.equal(canSetReply(list, "kcl", "firm"), false);
  assert.equal(canSetReply(list, "ucl", "firm"), true);
  assert.equal(canSetReply(list, "kcl", "insurance"), true);
  assert.equal(canSetReply(list, "kcl", "decline"), true);
  assert.equal(canSetReply(list, "harvard", "firm"), false);
});
test("not admitted yet can't reply", ...); // kcl at "submitted" gives false for firm and insurance
test("replyConflicts", ...);               // two stored Firms give { firm: ["ucl", "kcl"], insurance: [] }; a clean list gives empty arrays
test("invalid stored values read as unset", ...); // uk_reply "FIRM" doesn't block another Firm
test("unconditional Firm blocks Insurance", ...); // only when INSURANCE_RULE_SOURCE (test.skip otherwise)
```

- [ ] **Step 3: Run them to see them fail**: `cd web; node --test lib/uk-offers.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 4: Implement** the lib and `UkOfferSection`, with:
  - an offer type select;
  - a conditions textarea, `maxLength 500`, with `application.ukOffer.conditionsPrivate` ("Only you see this");
  - a reply select (Not yet / Firm / Insurance / Decline);
  - a date input for reply-by, plus the two help lines.
  Writes spread the stored checklist.
- [ ] **Step 5: Run the tests and full checks.** Expected: `tsc=0 lint=0 test=0`.
- [ ] **Step 6: Browser check, signed out.** Mark UCL and KCL as Admitted. Set UCL to Firm: KCL's Firm option is disabled and names UCL. Set Insurance on KCL, then reload; both persist.
- [ ] **Step 7: Commit**: `feat(uk): offer type, conditions and Firm/Insurance reply`

### Task 5: After-offer steps in the checklist panel

**Files:**
- Create: `web/components/my-list/AfterOfferSection.tsx`
- Modify:
  - `web/components/ChecklistPanel.tsx`: add the prop `citizenship: string | null`; MyList passes `student.profile.citizenship ?? null`
  - `application.*` messages (en + zh-TW)

**Interfaces:**
- Consumes: `afterOfferSteps` + `AFTER_OFFER` (Task 1); `afterOfferFacts`, `stepVariant` (Task 2); `contextFor` (Plan 1); the panel's exported `Section` / `Check` (Plan 1 Task 4).
- Produces: `AfterOfferSection({ entry, ctx, citizenship, set }: { entry: ListEntry; ctx: CollegeContext; citizenship: string | null; set: (patch: Partial<Checklist>) => void })`.

**Behaviour:**
- US colleges keep Plan 1's international-steps section JSX untouched. GB/CA/AU colleges render `AfterOfferSection` from `afterOfferSteps(c, entry.status, ctx, { international, financeWhen, citizenship })` instead.
- Title: `application.offer.title` ("After the offer"). Hint: `application.offer.notReady` ("Doesn't count toward Ready").
- Each step is a `Check` labelled `application.offer.<key>`. `ca_pal` uses `application.offer.ca_pal_caq` ("CAQ received") when `stepVariant(slug, "ca_pal") === "caq"`. `uk_deposit` reads "Deposit paid (if your university asks)".
- Under a step, each `afterOfferFacts(slug, key, citizenship)` item shows its `text`, plus an `application.offer.officialPage` link to `link ?? sourceUrl`. A step with no facts shows no line.
- When the list contains a visa step and `citizenship` is null: `application.offer.citizenshipNote` ("Visa steps show because your citizenship isn't set. Set it in your profile.") with a link to the profile form's route.
- Keys: `application.offer.title`, `notReady`, `officialPage`, `citizenshipNote`, `ca_pal_caq`, plus one per `AFTER_OFFER` key (20).

- [ ] **Step 1: Implement**, plus the i18n keys.
- [ ] **Step 2: Run the full checks.** Expected: `tsc=0 lint=0 test=0` (`i18n.test.ts` finds every new key used; build the per-key labels with a template the test recognises, e.g. `` `application.offer.${key}` ``).
- [ ] **Step 3: Browser check, signed out**
  - Harvard Admitted with international on: the I-20 step, exactly as before.
  - Oxford Admitted, conditional, Firm: the 7 UK steps; with Citizenship GB, the 3 visa steps disappear.
  - UBC Committed: the PAL step and the CAD 3,000 deposit fact with its link.
  - McGill Committed: "CAQ received".
  - Melbourne Committed: the AUD 17,000 fact.
  - Citizenship unset: the note shows.
  - Ticking a step and reloading keeps it, and the Ready count doesn't change.
- [ ] **Step 4: Commit**: `feat(my-list): after-offer steps for UK, Canada and Australia`

### Task 6: The reply-by date in every student deadline view

**Files:**
- Modify: `web/lib/uk-offers.ts`, `web/lib/uk-offers.test.ts`
- Modify Plan 1's student-level call sites, which already run `deadlinesForEntry(...)` and then `deadlineApplies`; each gets `withReplyBy(..., entry, list, today)` right after `deadlinesForEntry`, where `list` is the student's whole list:
  - `MyList.tsx:314`, `ProfileDashboard.tsx:155`
  - `crunch.ts:41`, `ai-context.ts:127`, `mcp/rules.ts:650`
  - `weekly-changes.ts` (its due-soon list)
  - the Recommenders brief (Plan 1 Task 14)
- Modify: the chip / row label renderer: when `d.label === REPLY_BY_LABEL`, show `application.ukOffer.replyByLabel` (en + zh-TW).

**Interfaces:**
- Consumes: `Deadline` (incl. Plan 1's `program_id`, `intake`); `countryOf`; `isIsoDate`.
- Produces:
  - `REPLY_BY_LABEL = "UCAS reply-by date"`
  - `replyByDeadline(entry: Pick<ListEntry, "slug" | "status" | "checklist" | "custom">, list: readonly Pick<ListEntry, "slug" | "checklist" | "custom">[], today: string): Deadline | null`. It returns a row `{ id: "reply-by:" + slug, kind: "other", plan_key: null, label: REPLY_BY_LABEL, due_date: uk_reply_by, notes: null, notification_date: null, program_id: null, intake: null }`, filling any other `Deadline` field with null (builder confirms the type at `types.ts:78`).
  - `withReplyBy<D>(rows: D[], entry, list, today: string): (D | Deadline)[]`

**Rule** (Task 10's SQL branch mirrors it exactly). A row exists only when all of these hold:
- the entry is GB and not custom;
- status is `admitted`;
- `uk_reply_by` matches `^\d{4}-\d{2}-\d{2}$`, is a real calendar date (`isIsoDate` rejects `2027-02-30`), and is ≥ `today`;
- the entry's `uk_reply` is not a valid `UK_REPLIES` value;
- **no** GB, non-custom entry in `list` has a valid `uk_reply === "firm"`. Once the student replies, UCAS declines every other offer ("Everything else is declined", `uk-ucas-process.md:73`), so no UK college keeps a reply-by date.

My call: the kind is `other`, so it is reminded like other dates and isn't hidden as an application deadline once submitted.

- [ ] **Step 1: Write the failing tests**

```ts
const e = (status: string, checklist: Checklist, slug = "ucl") => ({ slug, status, checklist });
const r = (x: ReturnType<typeof e>, list = [x]) => replyByDeadline(x, list, "2027-04-01");
test("replyByDeadline", () => {
  assert.equal(r(e("admitted", { uk_reply_by: "2027-05-05" }))?.due_date, "2027-05-05");
  assert.equal(r(e("admitted", { uk_reply_by: "2027-05-05", uk_reply: "firm" })), null);
  assert.equal(r(e("submitted", { uk_reply_by: "2027-05-05" })), null);
  for (const bad of ["2027-5-5", "2027-02-30", "not-a-date"]) assert.equal(r(e("admitted", { uk_reply_by: bad })), null);
  assert.equal(r(e("admitted", { uk_reply_by: "2027-03-01" })), null); // past
  assert.equal(r(e("admitted", { uk_reply_by: "2027-05-05" }, "harvard")), null);
  assert.equal(r(e("admitted", { uk_reply_by: "2027-05-05", uk_reply: "FIRM" as never }))?.due_date, "2027-05-05");
});
test("no reply-by once any UK college is Firm", () => {
  // 4 offers: ucl Firm, kings-college-london Insurance, bristol and warwick still "Not yet", each with uk_reply_by 2027-05-05
  // replyByDeadline for bristol and for warwick, with that list, is null for both.
  // The same list without the Firm (ucl unanswered) gives rows for ucl, bristol and warwick.
});
test("withReplyBy appends once", ...); // the rows plus one reply row; calling it on its own output doesn't add a second (dedupe by id)
```

- [ ] **Step 2: Run them to see them fail**: `cd web; node --test lib/uk-offers.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement and wire the call sites.** Then Grep for `deadlinesForEntry(` and confirm every student-level hit is followed by `withReplyBy`; paste the list in the report.
- [ ] **Step 4: Run the tests and full checks.** Expected: `tsc=0 lint=0 test=0`.
- [ ] **Step 5: Browser check, signed out.** UCL Admitted, reply-by set to a date 10 days from today: My list and the profile calendar show "UCAS reply-by date" with the soon tone. Set Firm and the chip disappears.
- [ ] **Step 6: Commit**: `feat(uk): reply-by date in My list, calendar, AI context and weekly changes`

## Part B4: English test expiry

### Task 7: Source each test's validity (process task, not TDD)

**Files:**
- Create: `docs/superpowers/research/2026-11-05-english-validity-brief.md`, `web/lib/data/english-test-validity.json`

**Data contract:**

```json
{ "tests": { "toefl": { "months": 24, "source_url": "https://…", "verified_on": "2026-11-04", "note": null },
             "ielts": { … }, "duolingo": { … }, "pte": { … }, "cambridge": { "months": null, "note": "Results do not expire", … } },
  "universities": { "<slug>": { "measured_at": "deadline" | "course_start", "cambridge_max_months": null,
             "semester_starts": { "s1": "YYYY-MM-DD", "s2": null } | null, "source_url": "https://…", "verified_on": "…", "research_ref": "…" } } }
```

`toefl` covers both stored keys `toefl` and `toefl_band` (`scores.ts:40-41`).

- [ ] **Step 1: Write the brief** (one page):
  - one sonnet agent, 10 web fetches at most, **no Supabase MCP calls**, no git;
  - test validity from each test maker's own official page only (ETS, IELTS, Duolingo, Pearson, Cambridge English);
  - university rules (`measured_at`, `cambridge_max_months`, AU `semester_starts`) only from lines in `docs/superpowers/research/2026-11-04-*.md` tagged as read from an official page, each with `research_ref`;
  - a university with no such line gets no entry, so the deadline is used;
  - unknown stays out; the final message is 150 words or fewer.
- [ ] **Step 2: Dispatch the agent** in the background; resume it with SendMessage on a stall.
- [ ] **Step 3: Check the output.** Every test key is present. Every `source_url` is https and on that test maker's own domain; the builder opens each URL's host and confirms it belongs to ETS, IELTS, Duolingo, Pearson or Cambridge English respectively, and a third-party host fails. `verified_on` is no later than the run date. `verified_on` is an ISO date; university slugs exist in `web/lib/data/application-steps.json`. Task 8's test also enforces this.
- [ ] **Step 4: Commit**: `data: English test validity periods with official sources`

### Task 8: English expiry warning (every country, US too)

**Files:**
- Create: `web/lib/english-expiry.ts`, `web/lib/english-expiry.test.ts`
- Modify:
  - `web/components/MyList.tsx`: compute the warning per entry and pass it as the `englishWarning` prop
  - `web/components/ChecklistPanel.tsx`: the English test section shared by both branches (Plan 1 Task 4) shows a `Warn` line with `toneClass("soon")`
  - `application.*` messages

**Interfaces:**
- Consumes:
  - `TestDetails`, `EnglishTestKey`, `EnglishScore` (`scores.ts:60-69`);
  - `EnglishPlan` (`checklist.ts`), `contextFor`, `deadlinesForEntry`, `courseFor`, `normalIntake` (Plan 1); `deadlineApplies`, `isIsoDate`;
  - `web/lib/data/english-test-validity.json` (Task 7).
- Produces:
  - `type RelevantDate = { date: string; basis: "deadline" | "course_start" }`
  - `relevantEnglishDate(slug: string, status: Status, c: Checklist, plan: string | null, rows: readonly Deadline[], today: string, v = VALIDITY): RelevantDate | null`
  - `type ExpiryWarning = { test: EnglishTestKey; takenOn: string; expiresOn: string; relevant: RelevantDate }`
  - `englishExpiry(english: TestDetails["english"], englishPlan: string | null | undefined, slug: string, relevant: RelevantDate | null, v = VALIDITY): ExpiryWarning | null`
  - `addMonths(iso: string, months: number): string` (clamps to the month end: `2024-02-29 + 24 = 2026-02-28`)

**Rules:**
- **Relevant date.**
  - A university with `measured_at: "course_start"`: GB/CA use `2027-09-01`. My call: the spec's "September 2027" needs a day, and the first of the month is the earliest. AU uses `semester_starts[normalIntake(c.intake) ?? "s1"]` when sourced, else falls through to the deadline.
  - Otherwise (US always): the earliest application row ≥ `today` after `deadlinesForEntry` + `deadlineApplies` with the entry's plan. **Only while the application isn't in yet** (status `researching`, `planning` or `in_progress`; `!isSubmitted(status)`). Once submitted or later there is no deadline basis, so no warning.
  - The course-start basis applies until the status is `withdrawn` or `rejected`, because the result must still be valid at the start.
  - None: null.
- **Which result.**
  - Plan `not_required`: none.
  - Plan set: that test family's newest dated result (`toefl` covers `toefl` and `toefl_band`).
  - Plan unset: the newest dated result of any test. My call: that is the one a student would send.
  - Dates must pass `isIsoDate`.
- **Validity.**
  - `tests[family].months`.
  - Cambridge (`months: null`) warns only when the university entry has `cambridge_max_months`.
  - Warn when `expiresOn < relevant.date`.
- **Text:** `application.cl.englishExpires` ("Your {test} result from {taken} expires on {expires}, before {what} on {date}"), where `{what}` is `application.cl.basisDeadline` / `basisCourseStart`. It is a warning only; `isDone` is unchanged.

- [ ] **Step 1: Write the failing tests** (fixtures pass their own validity object `V = { tests: { toefl: { months: 24 }, ielts: { months: 24 }, cambridge: { months: null } }, universities: { ucl: { measured_at: "course_start" }, cambridge: { cambridge_max_months: 24 } } }`)

```ts
test("warns when the result expires before the deadline", () => {
  const w = englishExpiry({ toefl: { total: 100, sections: {}, date: "2025-01-10" } }, "toefl", "harvard", { date: "2027-01-13", basis: "deadline" }, V);
  assert.deepEqual([w?.expiresOn, w?.test], ["2027-01-10", "toefl"]);
  assert.equal(englishExpiry({ toefl: { total: 100, sections: {}, date: "2025-01-20" } }, "toefl", "harvard", { date: "2027-01-13", basis: "deadline" }, V), null);
});
test("toefl plan covers toefl_band and takes the newest", ...);
test("no warning without a usable date", ...);
// date missing / "2025-13-40"; plan not_required; a test missing from V; relevant null: each gives null
test("Cambridge only with a university rule", ...);
// cambridge result from 2024-01-01: at "ucl" null; at "cambridge" (24 months) it warns
test("course start basis", ...);
// relevantEnglishDate("ucl", "planning", {}, null, rows, "2026-11-05", V) deepEquals { date: "2027-09-01", basis: "course_start" }
test("no deadline warning once the application is in", ...);
// harvard "submitted" / "admitted" give null; "in_progress" gives the deadline; ucl "admitted" still gives the course start; ucl "rejected" gives null
test("deadline basis uses the course deadline", ...); // Plan 1 GB fixture rows with course X: the date is CX's
test("addMonths clamps", () => { assert.equal(addMonths("2024-02-29", 24), "2026-02-28"); assert.equal(addMonths("2025-01-31", 1), "2025-02-28"); });
test("real validity file is well formed", ...);
// every family in VALIDITY.tests has https source_url + ISO verified_on; university slugs exist (countryOf !== "US")
```

- [ ] **Step 2: Run them to see them fail**: `cd web; node --test lib/english-expiry.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement**, wire MyList and the panel, and add the i18n keys.
- [ ] **Step 4: Run the tests and full checks.** Expected: `tsc=0 lint=0 test=0`.
- [ ] **Step 5: Browser check, signed out.** On the Tests form, enter a TOEFL from 2024-12-01. Harvard's checklist then warns before its deadline; change the date to 2026-01-01 and the warning goes. UCL (if its rule is sourced) names the course start.
- [ ] **Step 6: Commit**: `feat(checklist): warn when an English result expires before it is needed`

## Part E: scholarship currencies

### Task 9: Currency per scholarship, totals per currency

**Files:**
- Modify: `web/lib/scholarships.ts`, `web/lib/scholarships.test.ts`, `web/components/ScholarshipsPage.tsx`, `web/lib/student-rows.ts` (the scholarship row mapping), and the scholarships messages (en + zh-TW)

These four web files are every reader of scholarship amounts. A grep on 2026-11-04 of `scholarship|amount` over `supabase/functions`, `web/lib/mcp`, `web/lib/ai-context.ts` and `0027` found:
- `due_scholarship_reminders` returns name and provider, not the amount (`0027:50-51`);
- the MCP tools and the AI context don't read scholarships;
- `parent_view` returns counts only.
Step 4 repeats the grep; any reader found that prints an amount must show its currency.

**Interfaces:**
- Consumes: the existing `Scholarship` type and validator in `scholarships.ts`, which mirror `0027` check constraints.
- Produces:
  - `CURRENCIES = ["USD", "GBP", "CAD", "AUD"] as const; type Currency`
  - `Scholarship.currency: Currency`. A missing or invalid stored value reads as `"USD"`, so old rows stay USD.
  - The TS field `amountUsd` is renamed to `amount`; the row mapping keeps the DB column `amount_usd`. My call: the name no longer says USD, and the DB column is not renamed in this plan.
  - `totalsByCurrency(list: readonly Pick<Scholarship, "amount" | "currency">[]): { currency: Currency; total: number }[]`: in `CURRENCIES` order, only currencies with at least one amount, null amounts skipped.
  - `formatMoney(amount: number, currency: Currency, locale: Locale): string` (`Intl.NumberFormat`, `style: "currency"`, 0 decimals).

**Rollout:**
- If the scholarships select names its columns, add `currency` with a column-known fallback that drops it when the column is missing, like `PROFILE_COLUMNS`.
- An **update always sends `currency`**, so GBP → USD persists. An insert sends it whenever the column is known.
- Only while the fallback says the column is missing (before the migration) is `currency` left out of both, and then the currency select is hidden.
- Task 12 still applies the migration first.

- [ ] **Step 1: Write the failing tests**

```ts
test("totalsByCurrency never mixes currencies", () => assert.deepEqual(
  totalsByCurrency([{ amount: 1000, currency: "USD" }, { amount: 500, currency: "GBP" }, { amount: null, currency: "CAD" }, { amount: 250, currency: "USD" }]),
  [{ currency: "USD", total: 1250 }, { currency: "GBP", total: 500 }]));
test("old rows read as USD", ...);           // the row mapper with no currency, or "EUR", gives "USD"
test("validator rejects other currencies", ...);
test("formatMoney", ...);                     // formatMoney(5000, "GBP", "en") includes "£" and "5,000"; the AUD and CAD symbols differ from the USD one
test("changing GBP back to USD is written", ...);
// The update row for an edit from GBP to USD has currency "USD"; an insert has its currency.
// With the column-missing flag, neither row has a currency key.
```

- [ ] **Step 2: Run them to see them fail**: `cd web; node --test lib/scholarships.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the lib changes, the currency select next to the amount, and the totals line ("USD 1,250 · GBP 500") in place of today's single total.
- [ ] **Step 4: Grep** twice:
  - `amountUsd|amount_usd` over `web/` and `supabase/functions/`: only the row mapping and the migration may still use `amount_usd`, and nothing uses `amountUsd`.
  - `scholarship` together with amount formatting (`amount`, `fmtUsd`, `Intl.NumberFormat`) over `web/lib`, `web/components`, `web/app` and `supabase/functions`: every hit that prints an amount uses `formatMoney` with the row's currency.
  Paste both results.
- [ ] **Step 5: Run the tests and full checks; browser check, signed out:** add a USD and a GBP scholarship; two totals show and no grand total. If the Scholarships page needs sign-in (builder confirms in the store), this check moves to Task 12 Step 10 and the task report says so.
- [ ] **Step 6: Commit**: `feat(scholarships): GBP, CAD and AUD amounts, totals per currency`

## Database and email

### Task 10: Migration and smoke test (written and reviewed, not applied)

**Files:**
- Create: `supabase/migrations/00NN_uk_ca_au_after_offer.sql`, `supabase/patches/2026-11-06_uk_ca_au_after_offer_smoke_test.sql`

**Interfaces:**
- Consumes: Plan 1's migration versions of `upcoming_deadlines_for` (with the course/intake rules) and `parent_view`; `redact_checklist` (`0022:17`); `safe_date`; the TS rules in Tasks 3, 4, 6 and 9.
- Produces: the SQL objects in Shared interfaces.

**Migration contents:**
1. `alter table public.student_profiles add column citizenship text check (citizenship ~ '^[A-Z]{2}$');`
   - No grant is needed: `student_profiles` keeps its 0001 table-level grants (`0051:34`).
   - OAuth tokens can't write `citizenship`. They can't reach the base table at all (0043's restrictive `no_oauth_clients` policy), and `ai_student_profiles` lists its columns explicitly. The guard trigger's allow-list (`guard_oauth_student_writes`, `0041:113-156`) is a third layer. Nothing new is needed, and the smoke test proves it.
   - `ai_student_profiles` is not touched.
2. `alter table public.scholarships add column currency text not null default 'USD' check (currency in ('USD','GBP','CAD','AUD'));`. Builder confirms in `0027`/`0043`/`0044` whether `scholarships` has column-level grants. If it does, grant `select, insert, update (currency)` to `authenticated` the same way.
3. The reply reminder log:
   - `create table public.reply_reminder_log (user_id uuid not null references auth.users(id) on delete cascade, student_college_id uuid not null references public.student_colleges(id) on delete cascade, due_date date not null, days_before smallint not null, sent_at timestamptz not null default now(), primary key (student_college_id, due_date, days_before));`
   - RLS on, no policy, no grant: only the service-role Edge Function uses it.
   - `due_date` is in the key, so a changed reply-by date is reminded again.
4. `create or replace function public.redact_checklist(...)`: the same signature, language, volatility and security as `0022:17`, copied from there. It removes `'uk_conditions'` from the result in every branch (`… - 'uk_conditions'`). Every teacher RPC uses it, so teachers never see the conditions; `parent_view` already lists its keys explicitly.
5. `create or replace function public.upcoming_deadlines_for(...)`: Plan 1's body plus a third `union all` branch, with the full header restated (`security definer`, `set search_path = ''`):

```sql
select sc.user_id, sc.id, i.name, i.slug, public.safe_date(sc.checklist ->> 'uk_reply_by'), 'other', 'UCAS reply-by date', null, sc.status
from public.student_colleges sc join public.institutions i on i.id = sc.institution_id
where sc.user_id = any (p_students) and i.country_code = 'GB' and sc.status = 'admitted'
  and coalesce(sc.checklist ->> 'uk_reply', '') not in ('firm', 'insurance', 'decline')
  and coalesce(sc.checklist ->> 'uk_reply_by', '') ~ '^\d{4}-\d{2}-\d{2}$'
  and public.safe_date(sc.checklist ->> 'uk_reply_by') between p_from and p_to
  -- once any UK college is the Firm choice, UCAS declines the rest (uk-ucas-process.md:73)
  and not exists (select 1 from public.student_colleges o join public.institutions oi on oi.id = o.institution_id
                  where o.user_id = sc.user_id and oi.country_code = 'GB' and o.checklist ->> 'uk_reply' = 'firm')
```

`safe_date` must return null for `2027-02-30`. Builder confirms its body; if it doesn't, add an explicit round-trip check (`to_char(d, 'YYYY-MM-DD') = text`).

   This feeds `teacher_deadlines`, `teacher_student`, `teacher_digest_data` and `parent_view` deadlines. `teacher_roster.next_deadline` keeps only application/priority, so it doesn't change.
6. `create function public.due_reply_reminders(today date default current_date) returns table (user_id uuid, email text, student_college_id uuid, days_before smallint, due_date date, college_name text, college_slug text, label text)`:
   - `language sql stable security definer set search_path = ''`;
   - the same profile join as `due_reminders` (`reminder_emails` and `reminder_days`, `0005:44-67`);
   - the step-5 conditions (including the regex and the other-college-Firm `not exists`) with `(due - today) = any (sp.reminder_days)`, plus `not exists` in `reply_reminder_log`.
   - `revoke execute … from public, anon, authenticated; grant execute … to service_role;`
7. A header comment with the rollout order (Task 12): migration, then edge v8, then web merge. It says why live code keeps working: columns are additive with defaults, there is a new table and function, replaced functions keep their signatures, and the old client never writes `uk_reply_by`.

**Smoke test** (`begin; … rollback;`, the Plan 1 / classroom smoke-test pattern). Fixture: a GB and a US institution; a student with GB and US colleges and `reminder_days {14}`; a linked teacher; a parent link. Every negative check runs on the same fixture as a passing positive check, so none can pass on an empty result:
- (a) As the student, setting `citizenship = 'TW'` reads back `TW`; `'tw'` raises the check violation. With OAuth claims (a `client_id` claim), `update public.student_profiles set citizenship = 'GB'` affects **0 rows** (`get diagnostics n = row_count; n = 0`) and the value stays `TW`. A comment says the protection is the `no_oauth_clients` policy plus the AI view's column list, which is why 0 rows rather than an error.
- (b) `information_schema.columns` shows no `citizenship` on `ai_student_profiles`. `teacher_student(...)::text` and `parent_view(...)::text` (called as `anon`) each contain the GB slug and do not contain `citizenship`.
- (c) The GB college is admitted with `uk_reply_by '2027-05-05'` and no reply. `upcoming_deadlines_for(…, '2027-04-01', '2027-06-01')` has `UCAS reply-by date` on 2027-05-05, and so do `teacher_deadlines` (p_today `'2027-04-01'`) and `parent_view` deadlines.
- (d) Each of these gives no reply-by row, while (c)'s row is present again after each case is reset:
  - `uk_reply = 'firm'`;
  - status `submitted`;
  - `uk_reply_by` = `'not-a-date'`, `'2027-5-5'` or `'2027-02-30'`;
  - the same keys on the US college;
  - **another UK college Firm**: the fixture has 4 admitted GB colleges. One is set to Firm and one to Insurance, and two stay at Not yet with `uk_reply_by '2027-05-05'`; neither of those two returns a row.
- (e) `due_reply_reminders('2027-04-21')` returns (c)'s row. Every (d) case, including the other-college-Firm case, is also run against `due_reply_reminders('2027-04-21')` and returns nothing for that college. After a `reply_reminder_log` insert the positive case returns nothing too. `has_function_privilege('authenticated', 'public.due_reply_reminders(date)', 'execute')` is false.
- (f) Run twice, with the student's `share_essays` set **true** and then **false**. With `uk_conditions 'A*AA in Maths'` and `uk_reply 'firm'`, each `teacher_student` output contains `"uk_reply"` and does not contain `A*AA`.
- (g) A scholarship inserted without `currency` reads back `USD`; `'GBP'` is accepted; `'EUR'` raises.

- [ ] **Step 1: Write the migration.**
- [ ] **Step 2: Write the smoke test.**
- [ ] **Step 3: Static review by two fresh agents**, opus for the migration and sonnet for the smoke test. Give each line ranges, at most 8 tool calls and a 300-word limit. Ask each to check:
  - SQL = the TS rules (Task 6 reply-by, Task 3 citizenship, Task 9 currency);
  - every replaced body restates its header;
  - grants;
  - live code still works after apply;
  - vacuous checks.
  Fix the findings.
- [ ] **Step 4: Run the full web checks.**
- [ ] **Step 5: Commit**: `feat(db): citizenship, scholarship currency, UCAS reply-by in deadlines and reminders (not applied)`

### Task 11: Reply-by in the reminder and weekly emails (edge function v8)

**Files:**
- Modify: `supabase/functions/deadline-reminders/index.ts`, `supabase/functions/_shared/student-digest.ts`, `web/lib/student-digest-parity.test.ts`
- Modify: `CLAUDE.md` (version 8; deploy file list unchanged from Plan 1's v7 list)

**Interfaces:**
- Consumes:
  - `due_reply_reminders` and `reply_reminder_log` (Task 10);
  - `replyByDeadline` / `withReplyBy` rules (Task 6), copied into the Deno twin, which can't import from `web/`;
  - the `render()` lines in `index.ts:54-95`.
- Produces: v8 behaviour.
  - Each student's reminder email merges `due_reminders` rows and `due_reply_reminders` rows into one digest, sorted by date. A reply-by line reads "UCAS reply-by date: <college>, <date>".
  - The call is `rpc("due_reply_reminders", { today })`, with the **same clamped `today` value** that is passed to `due_reminders` (`index.ts:242`), not a second computation.
  - The weekly twin of `withReplyBy` receives the student's whole college list, for the other-college-Firm rule.
  - After an accepted send it inserts `reply_reminder_log` rows. As today, a dry run writes no log rows.
  - The weekly student digest's due-soon list includes the reply-by row (twin of `withReplyBy`).

- [ ] **Step 1: Write the failing tests** (`student-digest-parity.test.ts`)
- `digest reply-by equals web replyByDeadline`: run over Task 6's fixture cases.
- The 600 seeded random cases also get random `status`, `uk_reply_by` and `uk_reply`, and must still agree.
- `index.ts calls due_reply_reminders and logs to reply_reminder_log`: read `index.ts` as text and assert it contains `rpc("due_reply_reminders"` and `from("reply_reminder_log")`. Also assert that the `today` argument of both RPC calls is the same identifier. Also assert the log insert sits on the sent path, inside the same branch that writes `reminder_log` (match the existing pattern).
- [ ] **Step 2: Run them to see them fail**: `cd web; node --test lib/student-digest-parity.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Type-check the function with CLAUDE.md's stub tsconfig. Calling the RPC on a database without the function would fail, so Task 12 deploys v8 only after the migration.
- [ ] **Step 4: Run the tests and full checks.** Expected: `tsc=0 lint=0 test=0`.
- [ ] **Step 5: Commit**: `feat(email): UCAS reply-by date in reminder and weekly emails (v8, not deployed)`

---

## Final

### Task 12: Owner-present live run, build, merge (all live database work happens here)

The order is: migration, then edge v8, then web merge. The migration is safe for today's code: additive columns with defaults, a new table and function, replaced functions keep their signatures. v8 and the new web code need the migration.

**Files:**
- Rename: `supabase/migrations/00NN_uk_ca_au_after_offer.sql` → `<N>_uk_ca_au_after_offer.sql`
- Modify: `CLAUDE.md` (next migration number, Part 2 live, edge v8, citizenship and currency notes); `web/lib/data/refresh-log.json` only if a data entry is due (none expected)

- [ ] **Step 1: Confirm Plan 1 is live.** Its migration is in `list_migrations`, `get_edge_function` shows v7, and main contains Plan 1. Otherwise STOP. Confirm the owner is present for about 30 minutes, with UPDATE approvals expected; request keep-awake.
- [ ] **Step 2: Re-sync.** `git fetch origin; git merge origin/main`, then the full checks plus `cd web; npm run build; "build=$LASTEXITCODE"` (use `next typegen` if route types fail).
- [ ] **Step 3: Migration number.**
  - `list_migrations` plus the highest file on `origin/main`; N = next free. Rename the file and update its header and CLAUDE.md.
  - Grep the migrations after Plan 1's for `function public.(redact_checklist|upcoming_deadlines_for|due_reminders|parent_view)`. If any newer migration redefines one, rebase the body on it and re-run Task 10's review.
- [ ] **Step 4: Dry run.**
  - One `execute_sql`: `begin;` + migration + smoke body + `rollback;`. Expected: "passed".
  - Then prove nothing persisted: `information_schema.columns` has no `student_profiles.citizenship`, and `to_regclass('public.reply_reminder_log')` is null.
- [ ] **Step 5: Apply** with `apply_migration` (name `uk_ca_au_after_offer`).
  - Re-run this plan's smoke test **and Plan 1's** (`begin … rollback`), expecting "passed" from both.
  - Catalog checks:
    - `prosecdef` true and `search_path=""` on `upcoming_deadlines_for` and `due_reply_reminders`;
    - `redact_checklist` keeps its original attributes;
    - `has_function_privilege`: `service_role` → `due_reply_reminders` true; `anon` / `authenticated` → `due_reply_reminders` and `upcoming_deadlines_for` false; `anon` → `parent_view` still true.
  - Any mismatch: STOP and fix in a follow-up migration.
- [ ] **Step 6: Deploy `deadline-reminders` v8** (verify_jwt off), strictly after Step 5. Include every file it imports: `index.ts`, `_shared/fafsa.ts`, `pass.ts`, `teacher-digest.ts`, `student-digest.ts`, `application-steps.json`, plus whatever a grep of the imports shows. `get_edge_function` shows 8. Invoke it once only if it is in dry-run mode (CLAUDE.md); expected 200 with no errors.
- [ ] **Step 7: Push, PR, merge to main** (owner's auto-ship rule). Wait for the Vercel production deploy; `curl -s -o NUL -w "%{http_code}"` on `/application/list` returns 200.
- [ ] **Step 8: Reply reminder dry run on real data.** In `begin … rollback`, a throwaway student with UCL admitted, `uk_reply_by` = 14 days from today and `reminder_days {14}`: `select * from public.due_reply_reminders(current_date)` returns it. It doesn't with `uk_reply 'firm'` on UCL, nor with UCL left at Not yet while King's College London (also admitted) is set to Firm.
- [ ] **Step 9: Browser check on production, signed out.**
  - Oxford Firm: the 7 UK steps with facts.
  - Citizenship GB: the visa steps hide.
  - McGill: "CAQ received".
  - The reply-by chip.
  - An English expiry warning.
  - `/privacy` shows the citizenship item in both languages.
- [ ] **Step 10: Signed-in check** (the owner signs in; the agent can't).
  - Citizenship saves.
  - Scholarships in GBP and USD save, and their totals are separate.
  - The linked teacher sees the UK reply-by date in teacher deadlines and the reply, but not the conditions or citizenship.
  - The parent link shows no citizenship.
  If the owner can't, write "signed-in screens unverified" in CLAUDE.md and the report.
- [ ] **Step 11: Docs and commit**: CLAUDE.md (migration N applied, v8, Part 2 live). Commit `docs: UK/CA/AU part 2 live` and push to main.

---

## Spec coverage (self-review)

| Spec item | Task(s) |
|---|---|
| D1 steps per country (UK / Canada / Australia lists), by status, visa steps only at the committed college (UK: Firm) | 1, 5 |
| D1 Citizenship: visa steps unless citizenship = the college's country; unset = shown with a note; US keeps `is_international`; never shown to teachers/parents/AI | 1, 3, 5, 10 |
| D1 "when / how much" lines + official link from a sourced per-country / per-university file; none when unknown | 2, 5 |
| D1 never counts toward progress / Ready | 1 (test), 5 |
| D2 offer type + conditions; Firm / Insurance / Decline, one Firm + one Insurance; reply-by typed by the student with the 5 May / 2 Jun / 21 Jul explanation | 4 |
| D2 reply-by in chips, reminder emails (and weekly email, teacher deadlines, parent view); UK visa steps at the Firm choice | 1, 6, 10, 11 |
| B4 English expiry for every country from existing test dates; validity per test from official pages; Cambridge only with a university rule; relevant date per country; warning, never a block | 7, 8 |
| E currency USD default + GBP/CAD/AUD; totals per currency, never converted | 9, 10 |
| Spec §7 "a reminder dry run includes a student-entered UCAS reply-by date" | 10 (e), 12 (Step 8) |
| Next project hook: citizenship stored as a country code (UK English waivers by nationality) | 3 |
