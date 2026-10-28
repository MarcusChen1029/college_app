import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCsuPlans } from "../../web/lib/csu-fill.ts";
import { fromTranscriptCourse, fromTranscriptSchool } from "../../web/lib/student-rows.ts";
import { buildStarsPlans } from "../../web/lib/stars-fill.ts";
import { buildSystemPlan, FILL_SYSTEMS } from "../../web/lib/system-fill.ts";
import { emptyCourse, emptySchool, LEVELS, SUBJECTS, type TranscriptCourse, type TranscriptSchool } from "../../web/lib/transcript.ts";
import { buildUcPlans } from "../../web/lib/uc-fill.ts";
import { buildUiucPlans } from "../../web/lib/uiuc-fill.ts";
import { parseTokenFromRedirect, parseTranscriptResponse, REVOKE_TIMEOUT_MS, signOut, loadTranscript } from "./auth.ts";
import { SUPABASE_KEY, SUPABASE_URL } from "./config.ts";
import { buildPlans } from "./runner.ts";

test("parseTokenFromRedirect reads the token from the fragment", () => {
  assert.equal(parseTokenFromRedirect("https://x.chromiumapp.org/#token=ab12"), "ab12");
});

test("parseTokenFromRedirect returns null without a token", () => {
  assert.equal(parseTokenFromRedirect("https://x.chromiumapp.org/"), null);
  assert.equal(parseTokenFromRedirect("https://x.chromiumapp.org/#"), null);
  assert.equal(parseTokenFromRedirect("https://x.chromiumapp.org/#token="), null);
  assert.equal(parseTokenFromRedirect("not a url"), null);
});

test("parseTokenFromRedirect returns null on access_denied / error", () => {
  assert.equal(parseTokenFromRedirect("https://x.chromiumapp.org/#error=denied"), null);
  assert.equal(parseTokenFromRedirect("https://x.chromiumapp.org/#error=access_denied"), null);
});

test("parseTranscriptResponse maps error bodies", () => {
  assert.deepEqual(parseTranscriptResponse({ ok: false, error: "invalid_token" }), { ok: false, reason: "signed_out" });
  assert.deepEqual(parseTranscriptResponse({ ok: false, error: "students_only" }), { ok: false, reason: "students_only" });
  assert.deepEqual(parseTranscriptResponse({ ok: false, error: "something_else" }), { ok: false, reason: "network" });
});

test("parseTranscriptResponse treats garbage as a network failure", () => {
  assert.deepEqual(parseTranscriptResponse("x"), { ok: false, reason: "network" });
  assert.deepEqual(parseTranscriptResponse(null), { ok: false, reason: "network" });
  assert.deepEqual(parseTranscriptResponse({ ok: true }), { ok: false, reason: "network" });
  assert.deepEqual(parseTranscriptResponse({ ok: true, schools: "x", courses: [] }), { ok: false, reason: "network" });
});

test("parseTranscriptResponse camel-cases school and course rows", () => {
  const school = {
    id: "s1", name: "Lincoln High", country: "US", kind: "high_school", curriculum: "us",
    default_scale: "percent", default_period: "semester", first_year: 2022, last_year: 2026,
    printed_gpa: "3.9", printed_gpa_scale: "4.0", gpa_weighted: true, class_rank: null, notes: null,
    created_at: "2026-10-01T00:00:00Z",
  };
  const course = {
    id: "c1", school_id: "s1", academic_year: 2024, grade_level: 11, name: "AP Biology",
    period_type: "year", terms: null, final_grade: "A", grade_scale: "letter", scale_max: "4",
    level: "ap", credit: "1.0", credit_unit: "units", subject: "science", sub_subject: null,
    language_name: null, is_summer: false, is_repeat: false, is_college: false, college_name: null,
    is_withdrawn: false, notes: null, source: "manual", overrides: null, sort_order: 0,
    created_at: "2026-10-01T00:00:00Z",
  };
  const r = parseTranscriptResponse({ ok: true, schools: [school], courses: [course] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.schools.length, 1);
  assert.equal(r.courses.length, 1);
  assert.equal(r.schools[0].defaultScale, "percent");
  assert.equal(r.schools[0].printedGpa, "3.9");
  assert.equal(r.courses[0].academicYear, 2024);
  assert.equal(r.courses[0].gradeLevel, 11);
  assert.equal(r.courses[0].schoolId, "s1");
  assert.equal(r.courses[0].scaleMax, 4);
});

// ---- Sign out revokes the token on the server first (EXT-1) ----------------------------------------------------------------

type FetchCall = { url: string; init: RequestInit };

/** Fakes chrome.storage.local and fetch for one test, logging the order of storage and network calls. */
function withFakes(initial: Record<string, unknown>, fetchImpl: (call: FetchCall) => Promise<unknown>) {
  const g = globalThis as unknown as { chrome?: unknown; fetch?: unknown };
  const saved = { chrome: g.chrome, fetch: g.fetch };
  const store: Record<string, unknown> = { ...initial };
  const log: string[] = [];
  const calls: FetchCall[] = [];
  g.chrome = {
    storage: {
      local: {
        async get(k: string) { log.push("storage.get"); return k in store ? { [k]: store[k] } : {}; },
        async set(o: Record<string, unknown>) { log.push("storage.set"); Object.assign(store, o); },
        async remove(k: string) { log.push("storage.remove"); delete store[k]; },
      },
    },
  };
  g.fetch = async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    log.push(`fetch:${url.slice(SUPABASE_URL.length)}`);
    return fetchImpl(call);
  };
  return { store, log, calls, restore: () => Object.assign(g, saved) };
}

test("signOut revokes the token on the server, then clears it from storage", async () => {
  const f = withFakes({ token: "tok123" }, async () => ({ ok: true, json: async () => ({ ok: true }) }));
  try {
    await signOut();
    assert.deepEqual(f.log, ["storage.get", "fetch:/rest/v1/rpc/revoke_my_extension_token", "storage.remove"], "revoke happens before the local clear");
    const { url, init } = f.calls[0];
    assert.equal(url, `${SUPABASE_URL}/rest/v1/rpc/revoke_my_extension_token`);
    assert.equal(init.method, "POST");
    assert.deepEqual(init.headers, { apikey: SUPABASE_KEY, "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(init.body as string), { p_token: "tok123" });
    assert.ok(init.signal, "a timeout so an unreachable server cannot hold Sign out");
    assert.ok(REVOKE_TIMEOUT_MS > 0 && REVOKE_TIMEOUT_MS <= 10000);
    assert.equal("token" in f.store, false);
  } finally {
    f.restore();
  }
});

test("signOut still clears the token when the server cannot be reached or refuses", async () => {
  for (const impl of [
    async () => { throw new TypeError("Failed to fetch"); }, // offline
    async () => ({ ok: false, status: 404, json: async () => ({}) }), // the server predates migration 0042
    async () => ({ ok: false, status: 500, json: async () => { throw new Error("no body"); } }),
  ]) {
    const f = withFakes({ token: "tok123" }, impl);
    try {
      await signOut();
      assert.equal(f.calls.length, 1);
      assert.equal("token" in f.store, false);
    } finally {
      f.restore();
    }
  }
});

test("signOut with no token makes no request and still clears storage", async () => {
  const f = withFakes({}, async () => ({ ok: true }));
  try {
    await signOut();
    assert.equal(f.calls.length, 0);
    assert.deepEqual(f.log, ["storage.get", "storage.remove"]);
  } finally {
    f.restore();
  }
});

test("loadTranscript: a token the server calls invalid is cleared locally without a second request", async () => {
  const f = withFakes({ token: "dead" }, async () => ({ ok: true, json: async () => ({ ok: false, error: "invalid_token" }) }));
  try {
    assert.deepEqual(await loadTranscript(), { ok: false, reason: "signed_out" });
    assert.deepEqual(f.calls.map((c) => c.url.slice(SUPABASE_URL.length)), ["/rest/v1/rpc/extension_transcript"]);
    assert.equal("token" in f.store, false);
  } finally {
    f.restore();
  }
});

// ---- extension_transcript returns only what the fill reads (EXT-6) -------------------------------------------------------------

const MIGRATION = readFileSync(new URL("../../supabase/migrations/0042_extension_hardening.sql", import.meta.url), "utf8");
/** The columns the migration's extension_transcript selects from `table`, minus created_at (selected only to order the rows). */
function selectedColumns(table: string): string[] {
  const m = MIGRATION.match(new RegExp(`\\(\\s*select\\s+([^()]*?)\\s+from public\\.${table}\\b`));
  assert.ok(m, `0042 selects from ${table}`);
  return m[1].split(",").map((c) => c.trim()).filter((c) => c && c !== "created_at");
}

test("migration 0042 leaves out the notes, class rank and GPA fields the fill never reads", () => {
  const schools = selectedColumns("transcript_schools");
  const courses = selectedColumns("transcript_courses");
  for (const gone of ["notes", "class_rank", "printed_gpa", "printed_gpa_scale", "gpa_weighted"]) {
    assert.ok(!schools.includes(gone), `schools: ${gone}`);
    assert.ok(!courses.includes(gone), `courses: ${gone}`);
  }
  assert.ok(!courses.includes("source") && !courses.includes("is_withdrawn"));
  for (const kept of ["id", "name", "country", "kind", "default_period", "school_code"]) assert.ok(schools.includes(kept), `schools: ${kept}`);
  for (const kept of ["school_id", "overrides", "terms", "sort_order", "college_name", "language_name", "sub_subject", "level", "subject"]) assert.ok(courses.includes(kept), `courses: ${kept}`);
  // The old revoked/expired/role checks and the new revoke RPC are still there.
  assert.match(MIGRATION, /revoked_at is null and expires_at > now\(\)/);
  assert.match(MIGRATION, /'students_only'/);
  assert.match(MIGRATION, /function public\.revoke_my_extension_token\(p_token text\)/);
  assert.match(MIGRATION, /grant execute on function public\.revoke_my_extension_token\(text\) to anon, authenticated/);
});

/** A transcript where every column the migration drops holds a real, non-default value, so a planner that read one would show it. */
function fixture() {
  const schools: TranscriptSchool[] = [
    { ...emptySchool(), id: "s1", createdAt: "2026-01-01T00:00:00Z", name: "Lincoln High", country: "United States", curriculum: "ib", defaultScale: "percent_100", defaultPeriod: "semester",
      firstYear: 2022, lastYear: 2026, printedGpa: "3.9", printedGpaScale: "4.0", gpaWeighted: true, classRank: "5/130", notes: "SECRET SCHOOL NOTE" },
    { ...emptySchool(), id: "s2", createdAt: "2026-01-02T00:00:00Z", name: "Kang Chiao International School", country: "Taiwan", curriculum: "a_level", defaultScale: "a_level", defaultPeriod: "trimester",
      schoolCode: "694132", firstYear: 2021, lastYear: 2025, printedGpa: "95", gpaWeighted: false, classRank: "top 10%", notes: "SECRET SCHOOL NOTE 2" },
    { ...emptySchool(), id: "s3", createdAt: "2026-01-03T00:00:00Z", name: "Community College", country: "United States", kind: "college", notes: "SECRET SCHOOL NOTE 3" },
  ];
  const courses: TranscriptCourse[] = [];
  let n = 0;
  for (const school of schools) {
    for (const [i, subject] of SUBJECTS.entries()) {
      const gradeLevel = 9 + (i % 4);
      const period = school.defaultPeriod;
      const terms = period === "trimester"
        ? [{ term: "T1" as const, grade: "A", status: "graded" as const }, { term: "T2" as const, grade: "B+", status: "graded" as const }, { term: "T3" as const, grade: "A-", status: "graded" as const }]
        : [{ term: "S1" as const, grade: "A", status: "graded" as const, credit: 0.5 }, { term: "S2" as const, grade: i === 3 ? "" : "B", status: i === 3 ? ("in_progress" as const) : ("graded" as const), credit: 0.5 }];
      n++;
      courses.push({
        ...emptyCourse(school.id, school), id: `c${n}`, createdAt: "2026-02-01T00:00:00Z", name: `${subject} course ${n}`, subject,
        subSubject: subject === "mathematics" ? "algebra_2" : subject === "science" ? "biology" : null,
        level: LEVELS[n % LEVELS.length], academicYear: 2022 + (i % 4), gradeLevel, period, terms, credit: 1, sortOrder: n,
        languageName: subject === "world_language" ? "Chinese" : "", isCollege: school.kind === "college" || n % 7 === 0, collegeName: n % 7 === 0 ? "State University" : "",
        isRepeat: n % 5 === 0, isSummer: n % 11 === 0, isWithdrawn: n % 13 === 0, notes: `SECRET COURSE NOTE ${n}`, source: "mcp",
        overrides: n % 3 === 0 ? { uc: { subject: "Elective" }, common_app: { level: "Honors" } } : {},
      });
    }
  }
  return { schools, courses };
}

const allPlans = (schools: TranscriptSchool[], courses: TranscriptCourse[]) => ({
  commonApp: buildPlans(schools, courses),
  stars: buildStarsPlans(schools, courses),
  csu: buildCsuPlans(schools, courses),
  uc: buildUcPlans(schools, courses),
  uiuc: buildUiucPlans(schools, courses),
  systems: FILL_SYSTEMS.map((s) => buildSystemPlan(s, schools, courses)),
});

test("rows with only the columns migration 0042 returns give every fill planner exactly the plans the full rows gave", () => {
  const { schools, courses } = fixture();
  const keep = (row: Record<string, unknown>, cols: string[]) => Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c]]));
  const fullSchools = schools.map((s) => ({ ...fromTranscriptSchool("u1", s), created_at: s.createdAt, updated_at: s.createdAt }));
  const fullCourses = courses.map((c) => ({ ...fromTranscriptCourse("u1", c), created_at: c.createdAt, updated_at: c.createdAt }));
  const reducedSchools = fullSchools.map((r) => keep(r, selectedColumns("transcript_schools")));
  const reducedCourses = fullCourses.map((r) => keep(r, selectedColumns("transcript_courses")));
  assert.ok(Object.keys(reducedSchools[0]).length < Object.keys(fullSchools[0]).length);
  assert.ok(!JSON.stringify(reducedCourses).includes("SECRET") && !JSON.stringify(reducedSchools).includes("SECRET"), "no free-text notes in what the server sends");

  const full = parseTranscriptResponse({ ok: true, schools: fullSchools, courses: fullCourses });
  const reduced = parseTranscriptResponse({ ok: true, schools: reducedSchools, courses: reducedCourses });
  assert.ok(full.ok && reduced.ok);
  if (!full.ok || !reduced.ok) return;

  const a = allPlans(full.schools, full.courses);
  const b = allPlans(reduced.schools, reduced.courses);
  // Not vacuous: the fixture produces real plans in every system.
  assert.ok(a.commonApp.cg.size > 0 && a.uc.length > 0 && a.stars.length > 0 && a.uiuc.length > 0 && a.csu.length > 0);
  assert.ok(a.systems.every((s) => s.groups.length > 0), "every assistant plan has courses");
  assert.deepEqual(b, a);
  assert.ok(!JSON.stringify(a).includes("SECRET"), "no planner output carries a note");
});

test("parseTranscriptResponse fills the columns the server no longer sends, and a row that is not an object is a failure", () => {
  const r = parseTranscriptResponse({
    ok: true,
    schools: [{ id: "s1", name: "Lincoln High", country: "United States", kind: "high_school", default_period: "semester", school_code: "694132" }],
    courses: [{ id: "c1", school_id: "s1", academic_year: 2024, grade_level: 11, name: "AP Biology", period_type: "year", terms: null, final_grade: "A", grade_scale: "letter", scale_max: "4", level: "ap", credit: "1.0", credit_unit: "carnegie", subject: "science", sub_subject: null, language_name: null, is_summer: false, is_repeat: false, is_college: false, college_name: null, overrides: null, sort_order: 0 }],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.schools[0].schoolCode, "694132");
  assert.equal(r.schools[0].defaultPeriod, "semester");
  assert.equal(r.schools[0].notes, "");
  assert.equal(r.schools[0].classRank, "");
  assert.equal(r.courses[0].notes, "");
  assert.equal(r.courses[0].scaleMax, 4);
  assert.deepEqual(r.courses[0].overrides, {});
  assert.deepEqual(parseTranscriptResponse({ ok: true, schools: [null], courses: [] }), { ok: false, reason: "network" });
  assert.deepEqual(parseTranscriptResponse({ ok: true, schools: [], courses: ["x"] }), { ok: false, reason: "network" });
});
