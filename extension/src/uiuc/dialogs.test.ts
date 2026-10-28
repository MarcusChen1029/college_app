import assert from "node:assert/strict";
import { test } from "node:test";
import { DIALOG_CONTROL, DIALOG_REPORT, installDialogHook, newNonce, pageDialogs } from "./dialogs.ts";

/** A page window with a spy for what it shows, plus the hook installed on it and the content-script side talking to it. */
function pageWith(makeNonce?: () => string) {
  const shown: string[] = [];
  const win = Object.assign(new EventTarget(), {
    alert: (m?: string) => void shown.push(`alert:${m}`),
    confirm: (m?: string) => (shown.push(`confirm:${m}`), true),
    CustomEvent,
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) as unknown as number,
    clearTimeout: (t: number) => clearTimeout(t as unknown as NodeJS.Timeout),
  });
  installDialogHook(win as never);
  const side = pageDialogs(win as never, makeNonce);
  /** What a page script can do: fire the same event names with its own details. */
  const page = {
    control: (detail: unknown) => win.dispatchEvent(new CustomEvent(DIALOG_CONTROL, { detail })),
    report: (detail: unknown) => win.dispatchEvent(new CustomEvent(DIALOG_REPORT, { detail })),
  };
  return { win, shown, side, page };
}

test("newNonce is 128 random bits as hex, different every time", () => {
  const a = newNonce();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, newNonce());
});

test("a page that fires the switch-on event without the fill's nonce changes nothing", () => {
  const p = pageWith();
  for (const detail of ["on", JSON.stringify({ cmd: "on" }), JSON.stringify({ cmd: "on", nonce: "short" }), JSON.stringify({ cmd: "on", nonce: "G".repeat(32) }), JSON.stringify({ cmd: "on", nonce: 5 }), "{not json", 7, null, undefined]) p.page.control(detail);
  p.win.alert("hello");
  assert.deepEqual(p.shown, ["alert:hello"], "alert is still the page's own");
});

test("reports a page forges are not taken: no nonce, a wrong nonce, or a replay of an earlier fill's nonce", () => {
  const nonces = ["a".repeat(32), "b".repeat(32)];
  const p = pageWith(() => nonces.shift()!);
  p.side.start(); // fill 1, nonce "aaaa"
  p.win.alert("real 1");
  p.page.report(JSON.stringify({ kind: "alert", text: "forged: no nonce" }));
  p.page.report(JSON.stringify({ kind: "alert", text: "forged: wrong nonce", nonce: "c".repeat(32) }));
  p.page.report("not json");
  p.page.report(42);
  assert.deepEqual(p.side.take(), ["real 1"]);
  p.side.stop();
  p.side.start(); // fill 2, nonce "bbbb"
  p.page.report(JSON.stringify({ kind: "alert", text: "replay of fill 1", nonce: "a".repeat(32) }));
  p.win.alert("real 2");
  assert.deepEqual(p.side.take(), ["real 2"]);
  p.side.stop();
});

test("a page cannot switch the hook off, or hijack its reports, without the fill's nonce", () => {
  const p = pageWith(() => "d".repeat(32));
  p.side.start();
  p.page.control(JSON.stringify({ cmd: "off", nonce: "e".repeat(32) })); // wrong nonce
  p.page.control("off"); // the old plain wording
  p.win.alert("still hooked");
  assert.deepEqual(p.shown, [], "the hook is still on: nothing reached the page's own alert");
  assert.deepEqual(p.side.take(), ["still hooked"]);
  p.side.stop(); // the real nonce
  p.win.alert("after");
  assert.deepEqual(p.shown, ["alert:after"]);
});

test("after the fill, switch-off restores the page's functions and later reports are ignored", () => {
  const p = pageWith(() => "f".repeat(32));
  p.side.start();
  assert.equal(p.win.confirm("A Level?"), false);
  assert.deepEqual(p.side.take(), ["(asked) A Level?"]);
  p.side.stop();
  assert.equal(p.win.confirm("again"), true); // the page's own confirm is back
  p.page.report(JSON.stringify({ kind: "alert", text: "late", nonce: "f".repeat(32) }));
  assert.deepEqual(p.side.take(), [], "nothing is collected once the fill is over");
});

test("a new fill takes over a hook that an abandoned fill left on", () => {
  const nonces = ["1".repeat(32), "2".repeat(32)];
  const p = pageWith(() => nonces.shift()!);
  p.side.start(); // fill 1 never stops (its panel was closed)
  const second = pageDialogs(p.win as never, () => nonces.shift() ?? "2".repeat(32));
  second.start();
  p.win.alert("for fill 2");
  assert.deepEqual(second.take(), ["for fill 2"]);
  second.stop();
  p.win.alert("restored");
  assert.deepEqual(p.shown, ["alert:restored"]);
});
