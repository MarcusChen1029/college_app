import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPlans } from "./runner.ts";
import { emptyCourse, emptySchool } from "../../web/lib/transcript.ts";
import type { ContentMessage, ContentResponse } from "./messages.ts";
import { createCaDriver, createDriver, DRIVER_TIMING, navigate, waitForReady, type TabsApi } from "./chrome-driver.ts";

type Listener = (tabId: number, change: { status?: string }) => void;

function fakeTabs(opts: { navigationEvents?: Array<{ status: string }>; answer?: (m: ContentMessage) => ContentResponse | undefined | Error } = {}) {
  const listeners = new Set<Listener>();
  const sent: ContentMessage[] = [];
  const updates: string[] = [];
  let readyAnswers = 0;
  const tabs: TabsApi = {
    async update(_id, props) {
      updates.push(props.url);
      // The load events arrive after update() resolves, like in Chrome.
      setTimeout(() => {
        for (const e of opts.navigationEvents ?? [{ status: "loading" }, { status: "complete" }]) for (const l of listeners) l(7, e);
      }, 1);
      return {};
    },
    async sendMessage(_id, m) {
      sent.push(m);
      if (m.type === "ready") {
        readyAnswers++;
        if (readyAnswers < 3) throw new Error("Receiving end does not exist");
        return { type: "ready", path: "/common/13/55" };
      }
      const r = opts.answer?.(m);
      if (r instanceof Error) throw r;
      return r;
    },
    onUpdated: { addListener: (fn) => void listeners.add(fn), removeListener: (fn) => void listeners.delete(fn) },
  };
  return { tabs, sent, updates, listeners };
}

test("navigate waits for loading then complete, and removes its listener", async () => {
  const { tabs, updates, listeners } = fakeTabs();
  await navigate(tabs, 7, "https://apply.commonapp.org/common/13/55");
  assert.deepEqual(updates, ["https://apply.commonapp.org/common/13/55"]);
  assert.equal(listeners.size, 0);
});

test("navigate refuses an address outside Common App before it touches the tab", async () => {
  const { tabs, updates, listeners } = fakeTabs();
  for (const url of [
    "https://evil.example/common/13/55",
    "http://apply.commonapp.org/common/13/55",
    "https://apply.commonapp.org@evil.example/",
    "https://apply.commonapp.org.evil.example/",
    "https://user:pw@apply.commonapp.org/",
    "https://myillini.illinois.edu/", // another portal
  ]) {
    await assert.rejects(navigate(tabs, 7, url), /Refused to open an address outside Common App/, url);
  }
  assert.deepEqual(updates, []);
  assert.equal(listeners.size, 0);
});

test("navigate gives up waiting for a load that never starts, instead of hanging", async () => {
  const saved = { ...DRIVER_TIMING };
  DRIVER_TIMING.noNavigationMs = 20;
  try {
    const { tabs } = fakeTabs({ navigationEvents: [] });
    await navigate(tabs, 7, "https://apply.commonapp.org/common/13/55");
  } finally {
    Object.assign(DRIVER_TIMING, saved);
  }
});

test("navigate rejects when the page never completes", async () => {
  const saved = { ...DRIVER_TIMING };
  DRIVER_TIMING.loadMs = 30;
  try {
    const { tabs } = fakeTabs({ navigationEvents: [{ status: "loading" }] });
    await assert.rejects(navigate(tabs, 7, "https://apply.commonapp.org/common/13/55"), /did not finish loading/);
  } finally {
    Object.assign(DRIVER_TIMING, saved);
  }
});

test("waitForReady retries until the content script answers, and times out with a sentence", async () => {
  const saved = { ...DRIVER_TIMING };
  DRIVER_TIMING.readyPollMs = 5;
  try {
    const { tabs, sent } = fakeTabs();
    await waitForReady(tabs, 7);
    assert.equal(sent.length, 3);
    DRIVER_TIMING.readyMs = 30;
    const dead: TabsApi = { ...tabs, sendMessage: async () => { throw new Error("Receiving end does not exist"); } };
    await assert.rejects(waitForReady(dead, 7), /did not respond/);
  } finally {
    Object.assign(DRIVER_TIMING, saved);
  }
});

const plans = () =>
  buildPlans(
    [{ id: "s", createdAt: "2026-10-01T00:00:00Z", ...emptySchool(), name: "Lincoln High", country: "United States" }],
    [{ id: "c", createdAt: "2026-10-01T00:00:00Z", ...emptyCourse("s"), name: "Drama", academicYear: 2023, gradeLevel: 9, credit: 1, terms: [{ term: "S1", grade: "A", status: "graded" }] }],
  );

test("driver sends the grade's plan and mode, and returns the page result", async () => {
  const { tabs, sent } = fakeTabs({ answer: (m) => (m.type === "fill" ? { type: "fill", ok: true, result: { filled: 1, blanks: [] } } : undefined) });
  const p = plans();
  const driver = createDriver(tabs, 7, p);
  const r = await driver.fill("9", "keep");
  assert.deepEqual(r, { filled: 1, blanks: [] });
  const m = sent.at(-1)!;
  assert.equal(m.type, "fill");
  assert.equal(m.type === "fill" && m.target, "9");
  assert.equal(m.type === "fill" && m.mode, "keep");
  assert.equal(m.type === "fill" && m.plan, p.cg.get("9"));
});

test("driver turns a content-script error, a missing answer and a dead tab into thrown sentences", async () => {
  const p = plans();
  const bad = createDriver(fakeTabs({ answer: () => ({ type: "inspect", ok: false, error: "Answer Yes on the Courses & Grades intro first" }) }).tabs, 7, p);
  await assert.rejects(bad.inspect("9"), /Answer Yes on the Courses & Grades intro first/);
  const none = createDriver(fakeTabs({ answer: () => undefined }).tabs, 7, p);
  await assert.rejects(none.inspect("9"), /did not answer/);
  const dead = createDriver(fakeTabs({ answer: () => new Error("gone") }).tabs, 7, p);
  await assert.rejects(dead.fill("9", "keep"), /stopped responding/);
  await assert.rejects(createDriver(fakeTabs().tabs, 7, p).fill("11", "keep"), /No courses to fill/);
});

test("activities driver: inspect / fill / read go to the content script, reopen loads the page, path polls ready", async () => {
  const plan = { page: "activities" as const, slots: [], blocked: [], blanks: [] };
  const { tabs, sent, updates } = fakeTabs({
    answer: (m) =>
      m.type === "caInspect" ? { type: "caInspect", ok: true, existing: ["Team A"] }
      : m.type === "caFill" ? { type: "caFill", ok: true, result: { filled: 2, blanks: [], firstSlot: 3 } }
      : m.type === "caRead" ? { type: "caRead", ok: true, rows: [{ "Hours spent per week": "10" }] }
      : undefined,
  });
  const saved = { ...DRIVER_TIMING };
  DRIVER_TIMING.readyPollMs = 2;
  try {
    const driver = createCaDriver(tabs, 7, "activities");
    assert.deepEqual(await driver.inspect(), ["Team A"]);
    assert.deepEqual(await driver.fill(plan, "keep", 2), { filled: 2, blanks: [], firstSlot: 3 });
    const fill = sent.find((m) => m.type === "caFill")!;
    assert.deepEqual(fill, { type: "caFill", plan, mode: "keep", existing: 2 });
    await driver.reopen();
    assert.deepEqual(updates, ["https://apply.commonapp.org/common/7/232"]);
    assert.deepEqual(await driver.read(), [{ "Hours spent per week": "10" }]);
    assert.equal(await driver.path(), "/common/13/55");
    await createCaDriver(tabs, 7, "honors").reopen();
    assert.equal(updates.at(-1), "https://apply.commonapp.org/common/4/25");
  } finally {
    Object.assign(DRIVER_TIMING, saved);
  }
});

test("activities driver turns a content-script error and a missing answer into thrown sentences", async () => {
  const bad = createCaDriver(fakeTabs({ answer: () => ({ type: "caInspect", ok: false, error: "Already filling this page" }) }).tabs, 7, "honors");
  await assert.rejects(bad.inspect(), /Already filling this page/);
  const none = createCaDriver(fakeTabs({ answer: () => undefined }).tabs, 7, "honors");
  await assert.rejects(none.read(), /did not answer/);
});
