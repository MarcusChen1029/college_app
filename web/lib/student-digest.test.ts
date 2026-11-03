import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildStudentDigest,
  clampTaipeiToday,
  isEmptyDigest,
  renderStudentDigest,
  runStudentDigests,
  toDigestCollege,
  type DigestCollege,
  type DigestDeadline,
  type DigestDeps,
  type DueStudent,
  type StudentDigest,
} from "../../supabase/functions/_shared/student-digest.ts";
import { applyProfilePatch } from "./mcp/rules.ts";
import {
  AI_COLLEGE_COLUMNS,
  AI_PROFILE_COLUMNS,
  fromProfile,
  PROFILE_COLUMN_FALLBACKS,
  PROFILE_COLUMNS,
  PROFILE_COLUMNS_BEFORE_0049,
  PROFILE_COLUMNS_BEFORE_0051,
  readProfileRow,
  toProfile,
  UNDEFINED_COLUMN,
  weeklyDigestRow,
  type ProfileRow,
} from "./student-rows.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const TODAY = "2026-11-03"; // a Tuesday (Taipei)
const APP = "https://trakur.example";

const college = (slug: string, over: Partial<DigestCollege> = {}): DigestCollege => ({
  slug,
  institutionId: `i-${slug}`,
  name: slug.toUpperCase(),
  plan: null,
  status: "in_progress",
  checklist: {},
  ...over,
});
const dl = (institution: string, due: string | null, kind = "application", plan: string | null = null, label: string | null = null): DigestDeadline => ({
  institution_id: institution,
  kind,
  plan_key: plan,
  label,
  due_date: due,
});
const digestOf = (list: DigestCollege[], deadlines: DigestDeadline[] = [], lastCheckedBySlug: Record<string, string | null> = {}, today = TODAY): StudentDigest =>
  buildStudentDigest({ today, list, deadlines, lastCheckedBySlug });

// ── render ──

test("an empty digest renders nothing (so nothing is sent)", () => {
  const empty = digestOf([college("rice")]);
  assert.equal(isEmptyDigest(empty), true);
  assert.equal(renderStudentDigest({ digest: empty, appUrl: APP }), null);
  // Any one part is enough to send.
  assert.equal(isEmptyDigest(digestOf([college("rice", { updatedAt: "2026-11-01T01:00:00+00:00" })])), false);
  assert.equal(isEmptyDigest(digestOf([college("rice")], [dl("i-rice", "2026-11-10")])), false);
  assert.equal(isEmptyDigest(digestOf([college("rice")], [dl("i-rice", "2026-10-30")])), false);
  assert.equal(isEmptyDigest(digestOf([college("rice")], [], { rice: "2026-11-01" })), false);
});

test("college names are HTML-escaped, and nothing student-typed or link-shaped gets through unescaped", () => {
  const evil = `<img src=x onerror=alert(1)> & "Q" 'z'`;
  const digest = digestOf([college("rice", { name: evil })], [dl("i-rice", "2026-11-10", "application", "RD", `<b>Aid</b> "x"`)]);
  const email = renderStudentDigest({ digest, appUrl: APP })!;
  assert.ok(email);
  assert.ok(!email.html.includes("<img"), "raw tag in html");
  assert.ok(!email.html.includes("<b>Aid</b>"), "raw label in html");
  assert.ok(email.html.includes("&#60;img src=x onerror=alert(1)&#62; &#38; &#34;Q&#34; &#39;z&#39;"));
  // The subject is plain text, but must stay one line.
  assert.ok(!/[\r\n]/.test(email.subject));
  // A slug is encoded in the link.
  const odd = renderStudentDigest({ digest: digestOf([college('x"y z')], [dl('i-x"y z', "2026-11-10")]), appUrl: APP })!;
  assert.ok(odd.html.includes(`${APP}/colleges/x%22y%20z`));
  assert.ok(!odd.html.includes('colleges/x"y'));
});

test("sections with nothing in them are left out; the three links are always there", () => {
  const onlyDue = renderStudentDigest({ digest: digestOf([college("rice")], [dl("i-rice", "2026-11-10", "application", null, "RD application")]), appUrl: `${APP}/` })!;
  assert.match(onlyDue.html, /Due in the next 14 days/);
  for (const heading of [/Overdue/, /Updated this week/, /re-checked/]) assert.doesNotMatch(onlyDue.html, heading);
  assert.doesNotMatch(onlyDue.text, /Overdue|Updated this week|re-checked/);
  for (const out of [onlyDue.html, onlyDue.text]) {
    assert.ok(out.includes(`${APP}/application/list`), "link to My list");
    assert.ok(out.includes(`${APP}/data-updates`), "link to data updates");
    assert.ok(out.includes(`${APP}/settings#reminders`), "turn this email off");
    assert.ok(!out.includes(`${APP}//`), "no double slash from a trailing-slash app URL");
  }

  const everything = renderStudentDigest({
    digest: digestOf(
      [college("rice", { updatedAt: "2026-11-01T01:00:00+00:00", status: "submitted", plan: "ED" }), college("mit")],
      [dl("i-rice", "2026-11-10", "application", "ED"), dl("i-mit", "2026-10-30", "application", "RD")],
      { rice: "2026-11-02" },
    ),
    appUrl: APP,
  })!;
  for (const heading of [/Overdue/, /Due in the next 14 days/, /Updated this week/, /re-checked/]) assert.match(everything.html, heading);
});

test("the email says what is still missing per college, or that the checklist is complete", () => {
  const full = { no_essays: true, recommendations: true, transcript: true, test_plan: "optional", english_plan: "not_required" } as const;
  const email = renderStudentDigest({
    digest: digestOf([college("half", { checklist: { recommendations: true } }), college("done", { checklist: full })], [dl("i-half", "2026-11-05"), dl("i-done", "2026-11-06")]),
    appUrl: APP,
  })!;
  assert.match(email.text, /HALF[^\n]*\n?[^\n]*Still to do: Essays, Transcript sent, Test scores, English test/);
  assert.match(email.text, /DONE[^\n]*Checklist complete|DONE[^\n]*\n[^\n]*Checklist complete/);
  assert.match(email.html, /Still to do: Essays, Transcript sent, Test scores, English test/);
  assert.match(email.html, /Checklist complete/);
});

test("the subject counts overdue and due-soon deadlines, and is plain when there is only an update", () => {
  const both = renderStudentDigest({
    digest: digestOf([college("a"), college("b")], [dl("i-a", "2026-10-30"), dl("i-b", "2026-11-08"), dl("i-b", "2026-11-09", "financial_aid")]),
    appUrl: APP,
  })!;
  assert.equal(both.subject, "Your week on Trakur: 1 overdue, 2 due in the next 14 days");
  const updateOnly = renderStudentDigest({ digest: digestOf([college("a", { updatedAt: "2026-11-02T01:00:00+00:00" })]), appUrl: APP })!;
  assert.equal(updateOnly.subject, "Your week on Trakur");
  assert.match(updateOnly.html, /Updated this week/);
});

test("deadline names: the deadline's label, else the application plan's label, else the kind", () => {
  const digest = digestOf(
    [college("a")],
    [dl("i-a", "2026-11-04", "application", "ED", "Early Decision I"), dl("i-a", "2026-11-05", "application", "EA"), dl("i-a", "2026-11-06", "financial_aid"), dl("i-a", "2026-11-07", "interview_signup")],
  );
  const text = renderStudentDigest({ digest, appUrl: APP, planLabels: { EA: "Early Action", ED: "Early Decision" } })!.text;
  // The kind is worded the way the daily reminder does it (SQL initcap(replace(kind, '_', ' '))).
  for (const name of ["Early Decision I", "Early Action", "Financial Aid", "Interview Signup"]) assert.ok(text.includes(name), name);
});

test("long sections are cut with 'and N more'", () => {
  const list = Array.from({ length: 14 }, (_, i) => college(`c${String(i).padStart(2, "0")}`));
  const deadlines = list.map((c, i) => dl(c.institutionId, `2026-11-${String(4 + (i % 8)).padStart(2, "0")}`));
  const email = renderStudentDigest({ digest: digestOf(list, deadlines), appUrl: APP })!;
  assert.match(email.html, /and 4 more/);
  assert.match(email.text, /and 4 more/);
  assert.equal((email.text.match(/^- /gm) ?? []).length, 10 + 1);
});

test("site-update titles never appear, even if the digest object carries them", () => {
  const digest = { ...digestOf([college("rice")], [dl("i-rice", "2026-11-10")]), siteUpdates: [{ date: "2026-11-01", title: "SECRET SITE UPDATE TITLE" }] } as StudentDigest;
  const email = renderStudentDigest({ digest, appUrl: APP })!;
  assert.ok(!email.html.includes("SECRET SITE UPDATE") && !email.text.includes("SECRET SITE UPDATE"));
});

test("dates read the way the other emails read them (UTC calendar day), overdue says how long ago", () => {
  const email = renderStudentDigest({ digest: digestOf([college("a"), college("b")], [dl("i-a", "2026-10-30", "application", "RD", "RD"), dl("i-b", "2026-11-03", "application", "RD", "RD")]), appUrl: APP })!;
  assert.match(email.text, /Fri, Oct 30, 2026/);
  assert.match(email.text, /4 days ago/);
  assert.match(email.text, /Tue, Nov 3, 2026[^\n]*today/);
});

// ── the Taipei day ──

test("clampTaipeiToday honours a caller date only within a day of the Taipei date", () => {
  const now = new Date("2026-11-02T16:30:00Z"); // 00:30 on 2026-11-03 in Taipei, still 2026-11-02 in UTC
  assert.equal(clampTaipeiToday(undefined, now), "2026-11-03");
  assert.equal(clampTaipeiToday("2026-11-02", now), "2026-11-02");
  assert.equal(clampTaipeiToday("2026-11-04", now), "2026-11-04");
  assert.equal(clampTaipeiToday("2026-11-09", now), "2026-11-03");
  assert.equal(clampTaipeiToday("2020-01-01", now), "2026-11-03");
  assert.equal(clampTaipeiToday("not a date", now), "2026-11-03");
  assert.equal(clampTaipeiToday("2026-13-45", now), "2026-11-03");
  assert.equal(clampTaipeiToday(20261103, now), "2026-11-03");
  // The daily run (14:07 UTC = 22:07 Taipei) is on the same date in both zones.
  assert.equal(clampTaipeiToday(undefined, new Date("2026-11-02T14:07:00Z")), "2026-11-02");
});

// ── reading rows ──

test("a student_colleges row becomes a digest college: short name first, custom colleges and missing joins skipped", () => {
  const row = { institution_id: "i1", plan_key: "ED", status: "submitted", checklist: { transcript: true }, updated_at: "2026-11-01T00:00:00+00:00", institutions: { slug: "ut-austin", name: "The University of Texas at Austin", short_name: "UT Austin" } };
  assert.deepEqual(toDigestCollege(row), { slug: "ut-austin", institutionId: "i1", name: "UT Austin", plan: "ED", status: "submitted", checklist: { transcript: true }, updatedAt: "2026-11-01T00:00:00+00:00" });
  assert.equal(toDigestCollege({ ...row, institutions: { slug: "x", name: "Full Name", short_name: null } })!.name, "Full Name");
  assert.equal(toDigestCollege({ ...row, institutions: [row.institutions] })!.slug, "ut-austin", "an embed that arrives as a one-element array");
  assert.equal(toDigestCollege({ ...row, checklist: null })!.checklist.transcript, undefined);
  assert.equal(toDigestCollege({ ...row, institution_id: null, institutions: null }), null, "a college the student typed in");
  assert.equal(toDigestCollege({ ...row, institutions: null }), null);
});

// ── the run ──

type Sent = Parameters<DigestDeps["send"]>[0];

function setup(over: Partial<DigestDeps> = {}, due: DueStudent[] = [{ user_id: "u1", email: "a@x.test", week_start: "2026-10-26" }]) {
  const calls = { due: [] as string[], shared: [] as string[], student: [] as string[], sent: [] as Sent[], marked: [] as [string, string][] };
  const deps: DigestDeps = {
    async dueStudents(today) {
      calls.due.push(today);
      return due;
    },
    async sharedData(since) {
      calls.shared.push(since);
      return { deadlines: [dl("i-rice", "2026-11-08", "application", "RD", "RD application")], sources: [{ institution_id: "i-rice", accessed_on: "2026-11-01" }], plans: [{ key: "RD", label: "Regular Decision" }] };
    },
    async studentData(userId) {
      calls.student.push(userId);
      return { international: false, list: [college("rice", { name: "Rice" })] };
    },
    async send(m) {
      calls.sent.push(m);
      return { ok: true };
    },
    async markSent(userId, weekStart) {
      calls.marked.push([userId, weekStart]);
      return null;
    },
    ...over,
  };
  return { deps, calls };
}
const run = (deps: DigestDeps, dryRun = false) => runStudentDigests(deps, { today: TODAY, dryRun, appUrl: APP });

test("a real run sends once per due student and logs the week_start it was given, not one it works out itself", async () => {
  const { deps, calls } = setup();
  const results = await run(deps);
  assert.deepEqual(calls.due, [TODAY]);
  assert.equal(calls.sent.length, 1);
  assert.equal(calls.sent[0].to, "a@x.test");
  assert.equal(calls.sent[0].idempotencyKey, "student-digest-u1-2026-10-26");
  assert.match(calls.sent[0].html, /Rice/);
  // TODAY is in the week of Monday 2026-11-02; the database said 2026-10-26, and that is what is logged.
  assert.deepEqual(calls.marked, [["u1", "2026-10-26"]]);
  assert.deepEqual(results, [{ student: "u1", count: 2, status: "sent" }]);
});

test("a dry run reads and renders but never sends and never writes a log row", async () => {
  const { deps, calls } = setup();
  const results = await run(deps, true);
  assert.equal(calls.sent.length, 0);
  assert.equal(calls.marked.length, 0);
  assert.equal(results.length, 1);
  assert.match(results[0].status, /^dry-run: Your week on Trakur: 1 due in the next 14 days$/);
});

test("a failed send is reported and not logged, so the next daily run tries again", async () => {
  const { deps, calls } = setup({ async send() { return { ok: false, status: 429, body: "slow down" }; } });
  assert.deepEqual(await run(deps), [{ student: "u1", count: 2, status: "send failed 429: slow down" }]);
  assert.equal(calls.marked.length, 0);
});

test("one student's trouble never stops the others (a thrown send, a thrown read)", async () => {
  const due = [
    { user_id: "u1", email: "one@x.test", week_start: "2026-11-02" },
    { user_id: "u2", email: "two@x.test", week_start: "2026-11-02" },
    { user_id: "u3", email: "three@x.test", week_start: "2026-11-02" },
  ];
  const { deps, calls } = setup(
    {
      async studentData(userId) {
        if (userId === "u1") throw new Error("student_colleges: boom");
        return { international: false, list: [college("rice", { name: "Rice" })] };
      },
      async send(m) {
        if (m.to === "two@x.test") throw new TypeError("fetch failed");
        calls.sent.push(m);
        return { ok: true };
      },
    },
    due,
  );
  const results = await run(deps);
  assert.deepEqual(results.map((r) => [r.student, r.status]), [["u1", "data failed: student_colleges: boom"], ["u2", "send failed: fetch failed"], ["u3", "sent"]]);
  assert.deepEqual(calls.marked, [["u3", "2026-11-02"]]);
});

test("one student's bad stored data is reported as 'build failed' and the students around them are still sent and logged", async () => {
  const due = ["u1", "u2", "u3"].map((u) => ({ user_id: u, email: `${u}@x.test`, week_start: "2026-11-02" }));
  const { deps, calls } = setup(
    {
      async studentData(userId) {
        calls.student.push(userId);
        // essay_list stored as text instead of a list: isDone() calls .every on it and throws a TypeError.
        const checklist = userId === "u2" ? ({ essay_list: "oops" } as never) : {};
        return { international: false, list: [college("rice", { name: "Rice", checklist })] };
      },
    },
    due,
  );
  const results = await run(deps);
  assert.deepEqual(results.map((r) => [r.student, r.status.startsWith("build failed: ") ? "build failed" : r.status]), [["u1", "sent"], ["u2", "build failed"], ["u3", "sent"]]);
  assert.match(results[1].status, /every is not a function/);
  assert.equal(results[1].count, 0);
  assert.deepEqual(calls.sent.map((m) => m.to), ["u1@x.test", "u3@x.test"]);
  assert.deepEqual(calls.marked, [["u1", "2026-11-02"], ["u3", "2026-11-02"]], "the bad student gets no log row, so they are tried again tomorrow");
  // A dry run reports it the same way.
  assert.equal((await run(setup({ async studentData() { return { international: false, list: [college("rice", { checklist: { essay_list: "oops" } as never })] }; } }).deps, true))[0].status.slice(0, 13), "build failed:");
});

test("a log row that can't be written is reported after the send", async () => {
  const { deps } = setup({ async markSent() { return "permission denied"; } });
  assert.equal((await run(deps))[0].status, "sent, log failed: permission denied");
});

test("an empty digest sends nothing and logs nothing, like the teacher digest: the student is looked at again tomorrow", async () => {
  const { deps, calls } = setup({ async studentData() { return { international: false, list: [college("rice")] }; }, async sharedData() { return { deadlines: [], sources: [], plans: [] }; } });
  const results = await run(deps);
  assert.deepEqual(results, [{ student: "u1", count: 0, status: "nothing to report" }]);
  assert.equal(calls.sent.length, 0);
  assert.equal(calls.marked.length, 0);
});

test("nobody due: nothing else is read at all", async () => {
  const { deps, calls } = setup({}, []);
  assert.deepEqual(await run(deps), []);
  assert.deepEqual(calls.shared, []);
  assert.deepEqual(calls.student, []);
});

test("the shared tables are read once, from a week before today; the due list failing is thrown to the caller", async () => {
  const due = [1, 2, 3].map((n) => ({ user_id: `u${n}`, email: `${n}@x.test`, week_start: "2026-11-02" }));
  const { deps, calls } = setup({}, due);
  await run(deps);
  assert.deepEqual(calls.shared, ["2026-10-27"]);
  assert.deepEqual(calls.student, ["u1", "u2", "u3"]);
  await assert.rejects(run(setup({ async dueStudents() { throw new Error("due_student_digests: function does not exist"); } }).deps), /due_student_digests: function does not exist/);
});

test("the source dates feed 'data re-checked', and an international student's FAFSA-only date is left out", async () => {
  const { deps, calls } = setup({
    async sharedData() {
      return { deadlines: [dl("i-rice", "2026-11-05", "financial_aid", null, "FAFSA priority"), dl("i-rice", "2026-11-06", "financial_aid", null, "CSS Profile")], sources: [{ institution_id: "i-rice", accessed_on: "2026-10-31" }, { institution_id: "i-rice", accessed_on: "2026-10-20" }], plans: [] };
    },
    async studentData() {
      return { international: true, list: [college("rice", { name: "Rice" })] };
    },
  });
  await run(deps);
  const { html } = calls.sent[0];
  assert.match(html, /re-checked/);
  assert.match(html, /Sat, Oct 31, 2026/);
  assert.match(html, /CSS Profile/);
  assert.doesNotMatch(html, /FAFSA priority/);
});

// ── the Edge Function wiring (index.ts uses Deno.serve, so node can't run it; read it as text like weekly-changes.test.ts does) ──

test("deadline-reminders runs the student summary after the student reminders, apart from the teacher digest, and keeps its own dry-run rule", () => {
  const src = read("../../supabase/functions/deadline-reminders/index.ts");
  assert.match(src, /from "\.\.\/_shared\/student-digest\.ts"/);
  // Taipei date, clamped like the teacher digest's date.
  assert.match(src, /clampTaipeiToday\(body\?\.today\)/);
  // A failure is caught and reported, never thrown into the response.
  const call = src.indexOf("await sendStudentDigests(");
  assert.ok(call > 0, "sendStudentDigests is called");
  const tryAt = src.lastIndexOf("try {", call);
  const catchAt = src.indexOf("} catch", call);
  assert.ok(tryAt > src.indexOf("render(items, scholarships, appUrl)"), "the call sits after the student reminders loop");
  assert.ok(tryAt > 0 && catchAt > call && catchAt - tryAt < 600, "inside its own try/catch");
  assert.match(src, /studentDigestError/);
  // Same dry-run rule as the teacher digest: no API key, body.dryRun, or no APP_URL (the 'turn it off' link must be real).
  assert.equal((src.match(/dryRun: dryRun \|\| !Deno\.env\.get\("APP_URL"\)/g) ?? []).length, 2);
  // The list of who is due comes from the database function, with the Taipei date, and the log is written in exactly one place.
  assert.match(src, /rpc\("due_student_digests", \{ p_today: today \}\)/);
  assert.equal((src.match(/student_digest_log/g) ?? []).length, 1);
  assert.match(src, /upsert\(\{ user_id: userId, week_start: weekStart \}/);
  assert.match(src, /"Idempotency-Key": m\.idempotencyKey/);
  // Bulk reads page past the 1000-row cap.
  assert.match(src, /allRows\(/);
  assert.match(src, /\.range\(from, to\)/);
});

// ── the website side ──

const profileRow: ProfileRow = {
  sat_total: null,
  act_composite: null,
  gpa_unweighted: null,
  is_international: false,
  target_regions: [],
  reminder_emails: true,
  plan: "free",
  test_details: null,
  interested: null,
  activities: null,
  resume: null,
  essays: null,
};

test("weekly_digest is read with the profile (off unless the row says true), and only weeklyDigestRow writes it", () => {
  assert.match(PROFILE_COLUMNS, /\bweekly_digest\b/);
  assert.equal(toProfile({ ...profileRow, weekly_digest: true }).weeklyDigest, true);
  assert.equal(toProfile({ ...profileRow, weekly_digest: false }).weeklyDigest, false);
  assert.equal(toProfile(profileRow).weeklyDigest, false, "a row read without the column");
  assert.equal(toProfile({ ...profileRow, weekly_digest: null }).weeklyDigest, false);
  assert.equal(toProfile({ ...profileRow, weekly_digest: "true" as never }).weeklyDigest, false);
  assert.deepEqual(weeklyDigestRow("u1", true), { user_id: "u1", weekly_digest: true });
  assert.deepEqual(weeklyDigestRow("u1", false), { user_id: "u1", weekly_digest: false });
  // A whole-profile save (any other setting) never sends it, so a tab that loaded before the student changed it can't turn the email back on.
  assert.equal("weekly_digest" in fromProfile("u1", { ...toProfile({ ...profileRow, weekly_digest: true }), weeklyDigest: true }), false);
});

test("the profile fallback selects drop only the columns a database may lack, and keep everything else", () => {
  const all = PROFILE_COLUMNS.split(", ");
  // Without 0051: weekly_digest goes, password_storage (0049) stays.
  assert.deepEqual(PROFILE_COLUMNS_BEFORE_0051.split(", "), all.filter((c) => c !== "weekly_digest"));
  assert.ok(PROFILE_COLUMNS_BEFORE_0051.split(", ").includes("password_storage"));
  // Without 0049 (so without 0051 either): both go.
  assert.deepEqual(PROFILE_COLUMNS_BEFORE_0049.split(", "), all.filter((c) => c !== "password_storage" && c !== "weekly_digest"));
  assert.equal(PROFILE_COLUMNS_BEFORE_0049.split(", ").length, all.length - 2);
  // Nothing else is ever dropped, and the order is newest migration first.
  for (const col of ["sat_total", "reminder_emails", "plan", "plan_windows", "portals", "study_fields", "activities"]) {
    assert.ok(all.includes(col) && PROFILE_COLUMNS_BEFORE_0051.includes(col) && PROFILE_COLUMNS_BEFORE_0049.includes(col), col);
  }
  assert.deepEqual([...PROFILE_COLUMN_FALLBACKS], [PROFILE_COLUMNS_BEFORE_0051, PROFILE_COLUMNS_BEFORE_0049]);
});

test("a database that lacks a newer column still loads the profile: readProfileRow retries with fewer columns on 42703 only", async () => {
  const missing = { code: UNDEFINED_COLUMN, message: 'column student_profiles.weekly_digest does not exist' };
  const reader = (lacks: string[]) => {
    const asked: string[] = [];
    const read = async (columns: string) => {
      asked.push(columns);
      const bad = lacks.find((c) => columns.split(", ").includes(c));
      return bad ? { data: null as unknown, error: { ...missing, message: `column student_profiles.${bad} does not exist` } } : { data: { sat_total: 1 } as unknown, error: null };
    };
    return { read, asked };
  };
  // 0051 applied: one read, every column.
  const full = reader([]);
  assert.equal((await readProfileRow(full.read)).error, null);
  assert.deepEqual(full.asked, [PROFILE_COLUMNS]);
  // 0049 applied, 0051 not (the live database today): the second read works and still has password_storage.
  const noWeekly = reader(["weekly_digest"]);
  const r1 = await readProfileRow(noWeekly.read);
  assert.equal(r1.error, null);
  assert.deepEqual(noWeekly.asked, [PROFILE_COLUMNS, PROFILE_COLUMNS_BEFORE_0051]);
  // Neither applied: the third read.
  const neither = reader(["weekly_digest", "password_storage"]);
  assert.equal((await readProfileRow(neither.read)).error, null);
  assert.deepEqual(neither.asked, [PROFILE_COLUMNS, PROFILE_COLUMNS_BEFORE_0051, PROFILE_COLUMNS_BEFORE_0049]);
  // A missing column the fallbacks don't cover is still an error for the caller to throw.
  const broken = reader(["plan"]);
  const r2 = await readProfileRow(broken.read);
  assert.match(r2.error!.message, /plan does not exist/);
  assert.equal(broken.asked.length, 3);
  // Any other error is not retried.
  let calls = 0;
  const r3 = await readProfileRow(async () => {
    calls++;
    return { data: null as unknown, error: { code: "42501", message: "permission denied" } };
  });
  assert.equal(calls, 1);
  assert.equal(r3.error!.code, "42501");
  // Read without the column, a profile is simply "off".
  assert.equal(toProfile(r1.data as ProfileRow).weeklyDigest, false);
});

test("the store loads the profile through readProfileRow, so every fallback applies to it", () => {
  const store = read("./student-store.ts");
  assert.match(store, /readProfileRow\(readProfile\)/);
  assert.doesNotMatch(store, /PROFILE_COLUMNS_BEFORE_0049/, "no second, hand-rolled fallback in the store");
});

test("no Connect AI path can read or write weekly_digest", () => {
  assert.doesNotMatch(AI_PROFILE_COLUMNS, /weekly_digest/);
  assert.doesNotMatch(AI_COLLEGE_COLUMNS, /weekly_digest/);
  // The tools read and write only through the two AI views and AI_PROFILE_COLUMNS; none of these files names the setting.
  for (const file of ["./mcp/tools.ts", "./mcp/prompts.ts", "../app/mcp/route.ts"]) {
    const src = read(file).replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /weekly_digest|weeklyDigest/, file);
  }
  // The profile patch the AI tools apply refuses the setting by name (the one mention in rules.ts), like reminderEmails.
  assert.equal((read("./mcp/rules.ts").match(/weeklyDigest/g) ?? []).length, 1);
  const r = applyProfilePatch({}, { weeklyDigest: true });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /weekly summary email/i);
});

test("the store writes the setting with its own one-column upsert and never from a whole-profile save or a signed-out copy", () => {
  const store = read("./student-store.ts");
  assert.match(store, /weeklyDigestRow\(a\.userId, on\)/);
  assert.match(store, /delete profile\.weeklyDigest/);
  const profileSave = store.slice(store.indexOf("const setProfile"), store.indexOf("Turns the weekly summary email"));
  assert.ok(profileSave.includes("fromProfile(a.userId, profile, storedPortals)"), "sliced the whole-profile save");
  assert.doesNotMatch(profileSave, /weekly/i);
});
