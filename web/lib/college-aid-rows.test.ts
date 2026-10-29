import assert from "node:assert/strict";
import { test } from "node:test";
import { aidRowUsOnly } from "../components/college/aid-rows.ts";

// The college page greys a financial-aid deadline as "not for international applicants" only when the whole row is for
// US applicants. Titles, notes and intl aid policies below are the exact live rows (Supabase deadlines, kind financial_aid).

test("Miami: CSS Profile is for all applicants, so neither aid row is greyed (the FAFSA clause limits only the FAFSA)", () => {
  assert.equal(aidRowUsOnly("Financial aid deadline (ED I / EA)", "CSS Profile required for all applicants seeking aid; FAFSA only for U.S. citizens and eligible non-citizens.", "need_aware_limited"), false);
  assert.equal(aidRowUsOnly("Financial aid deadline (ED II / RD)", "CSS Profile required for all applicants seeking aid.", "need_aware_limited"), false);
});

test("Boston University: the note limits the whole CSS + FAFSA row to US citizens and permanent residents", () => {
  assert.equal(aidRowUsOnly("CSS Profile and FAFSA (Early Decision)", "US citizens and permanent residents only.", "merit_only"), true);
  assert.equal(aidRowUsOnly("CSS Profile and FAFSA (ED2 and Regular Decision)", "US citizens and permanent residents only.", "merit_only"), true);
  // The same note at a college that does aid internationals still limits this row.
  assert.equal(aidRowUsOnly("CSS Profile and FAFSA (Early Decision)", "US citizens and permanent residents only.", "need_aware_limited"), true);
});

test("Northeastern and Santa Clara: merit-only colleges, so their need-based form deadlines are greyed with or without a note", () => {
  assert.equal(aidRowUsOnly("FAFSA/CSS Profile - Early Decision I", "US citizens, permanent residents and eligible non-citizens only.", "merit_only"), true);
  assert.equal(aidRowUsOnly("FAFSA/CSS Profile - Early Decision II", null, "merit_only"), true);
  assert.equal(aidRowUsOnly("FAFSA/CSS Profile - Regular Decision", null, "merit_only"), true);
  assert.equal(aidRowUsOnly("CSS Profile / FAFSA (EA and ED I)", null, "merit_only"), true);
  assert.equal(aidRowUsOnly("CSS Profile / FAFSA (ED II)", null, "merit_only"), true);
  assert.equal(aidRowUsOnly("CSS Profile / FAFSA (RD)", null, "merit_only"), true);
});

test("ASU and Rhode Island: 'international students are not eligible' is a negation, not a row for internationals", () => {
  assert.equal(aidRowUsOnly("FAFSA priority filing date", "Applies to U.S. citizens/eligible noncitizens; international students are not eligible for federal aid.", "merit_only"), true);
  assert.equal(
    aidRowUsOnly("FAFSA priority filing date", "Applies to U.S. citizens/eligible noncitizens; international students are not eligible for need-based aid (CDS H5 priority date Mar. 1).", "merit_only"),
    true,
  );
  // The same notes at a need-aware college are still US-only: "Applies to U.S. citizens" limits the row.
  assert.equal(aidRowUsOnly("FAFSA priority filing date", "Applies to U.S. citizens/eligible noncitizens; international students are not eligible for federal aid.", "need_aware_limited"), true);
});

test("SMU: 'all applicants (US citizens and permanent residents)' narrows 'all' to US applicants", () => {
  assert.equal(aidRowUsOnly("FAFSA priority deadline", "Priority deadline for all applicants (US citizens and permanent residents).", "merit_only"), true);
  assert.equal(aidRowUsOnly("CSS Profile priority deadline", "Priority deadline for all applicants (US citizens and permanent residents).", "need_aware_limited"), true);
});

test("USC: every financial-aid row at a merit-only college is a need-based form, with or without a note", () => {
  assert.equal(aidRowUsOnly("Financial aid deadline - Early Decision", "FAFSA and CSS Profile (US citizens/eligible non-citizens).", "merit_only"), true);
  assert.equal(aidRowUsOnly("Financial aid deadline - Early Action", null, "merit_only"), true);
  assert.equal(aidRowUsOnly("Financial aid deadline - Regular Decision", null, "merit_only"), true);
});

test("rows for international applicants stay live, whatever else their notes say", () => {
  assert.equal(aidRowUsOnly("Financial aid, Early Action (international citizens)", "US citizens/permanent residents: November 1, 2026.", "need_blind_full_need"), false);
  assert.equal(aidRowUsOnly("International aid application (ED)", "Deadline for international students; missing it forfeits aid eligibility for the whole undergraduate career.", "need_aware_full_need"), false);
  assert.equal(aidRowUsOnly("CSS Profile priority deadline (international applicants, new students)", "St. Edward's CSS Profile code is 6619. No CSS Profile fee waiver.", "need_aware_limited"), false);
  assert.equal(aidRowUsOnly("CSS Profile (ED I / EA applicants)", "Also the CSS Profile deadline for international Global Scholars consideration.", "need_aware_limited"), false);
});

test("a FAFSA clause beside the CSS Profile limits only the FAFSA (Vassar)", () => {
  assert.equal(aidRowUsOnly("Financial aid (ED I)", "CSS Profile (code 2956), IDOC; FAFSA for US citizens/permanent residents.", "need_aware_full_need"), false);
  assert.equal(aidRowUsOnly("CSS Profile and FAFSA", "FAFSA only for US citizens.", "need_aware_limited"), false);
});

test("FAFSA alone is US federal aid; no aid for internationals greys every row; unknown policy guesses nothing", () => {
  assert.equal(aidRowUsOnly("FAFSA priority deadline", null, "need_aware_limited"), true);
  assert.equal(
    aidRowUsOnly("FAFSA/WASFA priority date", "Applies to US citizens, permanent residents and eligible students only; the UW does not provide aid to undergraduate international students.", "none"),
    true,
  );
  assert.equal(aidRowUsOnly("Financial aid deadline (EA/RD)", null, "none"), true);
  assert.equal(aidRowUsOnly("Financial aid deadline (EA/RD)", null, null), false);
});
