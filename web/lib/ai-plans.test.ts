import assert from "node:assert/strict";
import { test } from "node:test";
import { AGE_RULES, CHECKED_ON, PLAN_ROWS, type PlanRow } from "./ai-plans.ts";
import { PUBLIC_MCP_PATH } from "./connect-ai.ts";
import { en as miscEn, zhTW as miscZh } from "./i18n/messages/misc.ts";

// Each vendor's own help or docs host (the plan table is sourced from these only).
const PLAN_HOSTS = [
  "help.openai.com",
  "platform.openai.com",
  "developers.openai.com",
  "support.claude.com",
  "support.anthropic.com",
  "docs.claude.com",
  "docs.anthropic.com",
  "support.google.com",
];
// The age rules may also cite a vendor's terms or policy host.
const AGE_HOSTS = [...PLAN_HOSTS, "openai.com", "anthropic.com", "www.anthropic.com", "policies.google.com"];

const hostOf = (url: string) => {
  const u = new URL(url);
  assert.equal(u.protocol, "https:", `${url} is not https`);
  return u.hostname;
};

const row = (vendor: PlanRow["vendor"], plan: string): PlanRow => {
  const r = PLAN_ROWS.find((x) => x.vendor === vendor && x.plan === plan);
  assert.ok(r, `no row for ${vendor} ${plan}`);
  return r;
};

test("every row has an https source on the vendor's own help or docs domain", () => {
  assert.ok(PLAN_ROWS.length > 0);
  for (const r of PLAN_ROWS) assert.ok(PLAN_HOSTS.includes(hostOf(r.source)), `${r.vendor} ${r.plan}: ${r.source}`);
});

test("every age rule has an https source on the vendor's own help, docs, terms or policy domain", () => {
  for (const a of AGE_RULES) assert.ok(AGE_HOSTS.includes(hostOf(a.source)), `${a.vendor}: ${a.source}`);
});

test("a source link belongs to its vendor", () => {
  const own: Record<PlanRow["vendor"], string[]> = {
    ChatGPT: ["help.openai.com", "platform.openai.com", "developers.openai.com", "openai.com"],
    Claude: ["support.claude.com", "support.anthropic.com", "docs.claude.com", "docs.anthropic.com", "anthropic.com", "www.anthropic.com"],
    Gemini: ["support.google.com", "policies.google.com"],
  };
  for (const r of PLAN_ROWS) assert.ok(own[r.vendor].includes(hostOf(r.source)), `${r.vendor} ${r.plan}: ${r.source}`);
  for (const a of AGE_RULES) assert.ok(own[a.vendor].includes(hostOf(a.source)), `${a.vendor} age: ${a.source}`);
});

test("rows match the research", () => {
  const claudeFree = row("Claude", "Free");
  assert.equal(claudeFree.connect, "yes");
  assert.match(claudeFree.note ?? "", /one (custom )?connector/i);

  assert.equal(row("ChatGPT", "Pro").changes, "readOnly");
  for (const plan of ["Free", "Go", "Plus"]) {
    assert.equal(row("ChatGPT", plan).connect, "notConfirmed", `ChatGPT ${plan} connect`);
    assert.equal(row("ChatGPT", plan).changes, "notConfirmed", `ChatGPT ${plan} changes`);
  }
  assert.equal(row("ChatGPT", "Business").changes, "yes");

  const gemini = PLAN_ROWS.find((r) => r.vendor === "Gemini" && /personal/i.test(r.plan));
  assert.ok(gemini, "no Gemini personal-account row");
  assert.match(gemini.note ?? "", /\bUS\b/);
  assert.match(gemini.note ?? "", /18\+/);
  // The limits sit in the visible row label too, so a Yes can't be read without them; the research confirms no tier.
  assert.match(gemini.plan, /\bUS\b/);
  assert.match(gemini.plan, /18\+/);
  assert.doesNotMatch(`${gemini.plan} ${gemini.note ?? ""}`, /AI Pro|Ultra/);
  // Work or school Google accounts cannot use it at all.
  assert.equal(PLAN_ROWS.find((r) => r.vendor === "Gemini" && /work or school/i.test(r.plan))?.connect, "no");
  // The research could not confirm the Claude Education plan.
  assert.equal(row("Claude", "Education").connect, "notConfirmed");
});

test("the table lists every plan the brief names, once each", () => {
  const key = (r: PlanRow) => `${r.vendor} | ${r.plan}`;
  assert.equal(new Set(PLAN_ROWS.map(key)).size, PLAN_ROWS.length);
  const count = (v: PlanRow["vendor"]) => PLAN_ROWS.filter((r) => r.vendor === v).length;
  assert.equal(count("ChatGPT"), 6); // Free, Go, Plus, Pro, Business, Enterprise / Edu
  assert.equal(count("Claude"), 5); // Free, Pro / Max, Team, Enterprise, Education
  assert.equal(count("Gemini"), 3); // personal account, work or school account, Gemini Enterprise
});

test("support values are one of the four labels", () => {
  const ok = ["yes", "readOnly", "no", "notConfirmed"];
  for (const r of PLAN_ROWS) {
    assert.ok(ok.includes(r.connect), `${r.vendor} ${r.plan} connect`);
    assert.ok(ok.includes(r.changes), `${r.vendor} ${r.plan} changes`);
  }
});

test("AGE_RULES: Claude 18, ChatGPT 13, Gemini 18, one each, with a note", () => {
  const age = (v: PlanRow["vendor"]) => AGE_RULES.filter((a) => a.vendor === v);
  for (const v of ["Claude", "ChatGPT", "Gemini"] as const) assert.equal(age(v).length, 1, v);
  assert.equal(age("Claude")[0].minAge, 18);
  assert.equal(age("ChatGPT")[0].minAge, 13);
  assert.equal(age("Gemini")[0].minAge, 18);
  // ChatGPT: 13 and over, but under 18 needs a parent's permission (research: help center).
  assert.match(age("ChatGPT")[0].note, /parent/i);
  for (const a of AGE_RULES) assert.ok(a.note.trim() !== "", a.vendor);
});

test("the ChatGPT age rule says it was not re-checked (its help-center source could not be confirmed current); the others are not flagged", () => {
  const flagged = AGE_RULES.filter((a) => a.notRechecked).map((a) => a.vendor);
  assert.deepEqual(flagged, ["ChatGPT"]);
  const chatgpt = AGE_RULES.find((a) => a.vendor === "ChatGPT")!;
  assert.equal(new URL(chatgpt.source).hostname, "help.openai.com");
  const text = (messages: Record<string, string>) => messages["misc.connect.ageNotRechecked"];
  assert.match(text(miscEn), /OpenAI/);
  assert.match(text(miscEn), /not re-checked on \{date\}/);
  assert.match(text(miscZh), /OpenAI/);
  assert.match(text(miscZh), /\{date\}/);
});

test("CHECKED_ON is an ISO date", () => {
  assert.match(CHECKED_ON, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!Number.isNaN(Date.parse(`${CHECKED_ON}T00:00:00Z`)));
  assert.equal(new Date(`${CHECKED_ON}T00:00:00Z`).toISOString().slice(0, 10), CHECKED_ON);
});

test("the public lookup path is outside /mcp, so private OAuth discovery never applies", () => {
  assert.equal(PUBLIC_MCP_PATH, "/public/mcp");
});
