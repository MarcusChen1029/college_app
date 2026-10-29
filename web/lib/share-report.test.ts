import assert from "node:assert/strict";
import { test } from "node:test";
import { bindShortWords, ems, nameSize, nameUnits, reportDeadlines, stages, type ReportDeadline } from "../components/share/report-logic.ts";
import { parentSummary, type ParentCollege, type ParentView } from "./share-links.ts";

const dl = (college: string, dueDate: string, status: ReportDeadline["status"], kind = "application"): ReportDeadline => ({ college, dueDate, status, kind, label: "RD", plan: "RD" });

test("the next deadline is the soonest OPEN one from the whole list, even behind many submitted ones", () => {
  const all = [
    ...Array.from({ length: 8 }, (_, i) => dl(`Sent ${i}`, `2026-11-0${i + 1}`, "submitted")),
    dl("Open College", "2026-12-09", "in_progress"),
  ];
  const r = reportDeadlines(all, 8);
  assert.equal(r.next?.college, "Open College");
  assert.ok(r.rows.some((d) => d.college === "Open College")); // open ones are chosen first, so it made the cut
  assert.equal(r.rows.length, 8);
  assert.equal(r.more, 1);
});

test("the chosen rows are displayed in date order (an open Dec deadline after a submitted Nov one)", () => {
  const r = reportDeadlines([dl("Sent", "2026-11-09", "submitted"), dl("Open", "2026-12-20", "in_progress")], 8);
  assert.deepEqual(
    r.rows.map((d) => d.dueDate),
    ["2026-11-09", "2026-12-20"],
  );
  assert.equal(r.next?.college, "Open");
});

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("ems: wide, narrow, capital, CJK and other characters", () => {
  close(ems("MWmw@"), 5 * 1.05);
  close(ems("ijlI.,'!"), 8 * 0.3);
  close(ems("AB"), 2 * 0.74);
  close(ems("陳小明"), 3);
  close(ems("ab -"), 4 * 0.6);
  close(ems(""), 0);
});

test("bindShortWords: no lone short word, hyphens and long words untouched", () => {
  assert.equal(bindShortWords("Student A"), "Student A");
  assert.equal(bindShortWords("Ed Lee Smith Jr"), "Ed Lee Smith Jr");
  assert.equal(bindShortWords("Alexandria Montgomery-Fitzgerald"), "Alexandria Montgomery-Fitzgerald");
  assert.equal(bindShortWords("  A  "), "A");
  assert.equal(bindShortWords(null), "");
});

test("nameUnits: one line when unbreakable, else the widest line of the best two-line split", () => {
  // "Student A" binds into one unit: one line.
  close(nameUnits("Student A"), ems("Student A"));
  // a long name: the best of its splits (at the space, or after the hyphen) beats the whole width and is at least as
  // wide as any run.
  const long = "Alexandria Montgomery-Fitzgerald";
  close(nameUnits(long), Math.min(Math.max(ems("Alexandria"), ems("Montgomery-Fitzgerald")), Math.max(ems("Alexandria Montgomery-"), ems("Fitzgerald"))));
  assert.ok(nameUnits(long) < ems(long));
  assert.ok(nameUnits(long) >= ems("Montgomery-"));
  close(nameUnits("CHRISTOPHER MONTGOMERY"), Math.max(ems("CHRISTOPHER"), ems("MONTGOMERY")));
  // CJK names work; empty and null fall back.
  close(nameUnits("陳小明"), 3);
  assert.equal(nameUnits(""), 6);
  assert.equal(nameUnits(null), 6);
  assert.match(nameSize("Student A"), /^clamp\(1\.5rem, calc\(100cqi \/ [\d.]+\), 4\.5rem\)$/);
});

test("with nothing open there is no next deadline; non-application deadlines stay open after submitting", () => {
  assert.equal(reportDeadlines([dl("A", "2026-11-01", "submitted")], 8).next, null);
  const aid = dl("A", "2026-11-05", "submitted", "financial_aid");
  assert.equal(reportDeadlines([aid], 8).next?.kind, "financial_aid");
});

test("the Decisions stage holds exactly what the summary counts as decisions; withdrawn is separate", () => {
  const c = (status: ParentCollege["status"]): ParentCollege => ({ name: status, custom: false, status, plan: null, checklist: {}, deadlines: [] });
  const colleges = [c("admitted"), c("waitlisted"), c("withdrawn"), c("submitted")];
  const view: ParentView = { student: { name: null, school: null, gradYear: null }, updatedAt: null, colleges, recommenders: null, scholarships: null };
  const s = stages(colleges);
  assert.equal(s.find((x) => x.key === "decided")?.colleges.length, parentSummary(view).decisions);
  assert.deepEqual(s.find((x) => x.key === "withdrawn")?.colleges.map((x) => x.status), ["withdrawn"]);
  assert.equal(stages([c("submitted")]).some((x) => x.key === "withdrawn"), false);
});
