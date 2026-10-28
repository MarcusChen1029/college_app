import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { html } from "./commonapp/test-dom.ts";
import { controlLabel, pressSaveLater, saveButtonRefusal } from "./save-guard.ts";
import { pressStarsSave, StarsStop, starsPageKind, starsPageYear } from "./stars/fill.ts";
import { pressUcSave, UcStop } from "./uc/fill.ts";

const STARS_SAVE = "ctl00_mainContent_btn_submit";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A STARS page whose Save Course button has the given markup; clicks are counted. */
function stars(button: string) {
  const doc = html(`<form>${button}</form>`);
  const clicks: string[] = [];
  doc.getElementById(STARS_SAVE)?.addEventListener("click", () => clicks.push("save"));
  return { doc, clicks, el: doc.getElementById(STARS_SAVE) as HTMLElement | null };
}
function uc(button: string) {
  const doc = html(`<div>${button}</div>`);
  const clicks: string[] = [];
  doc.getElementById("save")?.addEventListener("click", () => clicks.push("save"));
  return { doc, clicks, el: doc.getElementById("save") as HTMLElement | null };
}

test("saveButtonRefusal: Save buttons pass; submit-like, unlabelled and other buttons are refused", () => {
  const el = (markup: string) => html(markup).body.firstElementChild!;
  for (const ok of ['<input type="submit" value="Save Course">', "<button>Save &amp; continue</button>", '<a href="#"><span>Save</span> course</a>', '<input type="image" alt="Save Course">', '<button aria-label="Save Course"></button>']) {
    assert.equal(saveButtonRefusal(el(ok)), null, ok);
  }
  for (const bad of [
    '<input type="submit" value="Submit">',
    '<input type="button" value="Submit Page">',
    '<input type="button" value="I\'m done! Submit my record.">',
    "<button>Save and submit</button>",
    "<button>Save &amp; certify</button>",
    "<button>Finalize</button>",
    "<button>Sign and save</button>",
    "<button>Agree and save</button>",
    "<button>Save, then pay</button>",
    "<button>Continue</button>",
    "<button>Remove</button>",
    "<button></button>",
  ]) {
    assert.notEqual(saveButtonRefusal(el(bad)), null, bad);
  }
  assert.match(controlLabel(el('<input value="Save Course" title="Saves">')), /Save Course/);
});

test("STARS: a button that reads like Save Course is pressed; a submit-like one under the same id is not", async () => {
  const good = stars(`<input type="submit" id="${STARS_SAVE}" value="Save Course">`);
  pressStarsSave(good.doc);
  await wait(90);
  assert.deepEqual(good.clicks, ["save"]);

  for (const value of ["Submit", "Submit Page", "I'm done! Submit my record.", "Certify and send", "Continue", ""]) {
    const bad = stars(`<input type="submit" id="${STARS_SAVE}" value="${value}">`);
    assert.throws(() => pressStarsSave(bad.doc), (e) => e instanceof StarsStop && /Refused to press/.test(e.message), value);
    await wait(90);
    assert.deepEqual(bad.clicks, [], `"${value}" must not be pressed`);
  }
  assert.throws(() => pressStarsSave(html("<form></form>")), /Save Course button is not on the page/);
});

test("UC: Save & continue is pressed; a submit-like button with the same id is not", async () => {
  const good = uc('<button id="save">Save &amp; continue</button>');
  pressUcSave(good.doc);
  await wait(90);
  assert.deepEqual(good.clicks, ["save"]);

  for (const label of ["Submit application", "Submit", "I'm done", "Pay and submit", "Next", ""]) {
    const bad = uc(`<button id="save">${label}</button>`);
    assert.throws(() => pressUcSave(bad.doc), (e) => e instanceof UcStop && /Refused to press/.test(e.message), label);
    await wait(90);
    assert.deepEqual(bad.clicks, [], `"${label}" must not be pressed`);
  }
  assert.throws(() => pressUcSave(html("<div></div>")), /Save & continue button is not on the page/);
});

test("the label is checked again when the press happens: a button the page rewrote in between is not pressed", async () => {
  const p = stars(`<input type="submit" id="${STARS_SAVE}" value="Save Course">`);
  pressSaveLater(p.el!, 20);
  (p.el as HTMLInputElement).value = "Submit My Application"; // a page script swaps the label before the click
  await wait(60);
  assert.deepEqual(p.clicks, []);
});

test("STARS page kinds match the whole coursework file name, not just its start", () => {
  const kind = (pathname: string) => starsPageKind({ pathname });
  assert.equal(kind("/srt/EnterInternationalCoursework-yr-2024.aspx"), "intl");
  assert.equal(kind("/srt/EnterCoursework-yr-2023.aspx"), "us");
  assert.equal(kind("/SRT/entercoursework-yr-2023.ASPX"), "us");
  for (const other of ["/srt/EnterCourseworkReview.aspx", "/srt/EnterCoursework-yr-2023.aspx/extra", "/srt/EnterCoursework", "/srt/ReviewAndSubmit.aspx", "/srt/EnterInternationalCourseworkSubmit.aspx", "/x/srt/EnterCoursework-yr-2023.aspx.evil"]) {
    assert.equal(kind(other), null, other);
  }
  assert.equal(starsPageYear({ pathname: "/srt/EnterCoursework-yr-2023.aspx", search: "?yr=2024" }), 2024);
  assert.equal(starsPageYear({ pathname: "/srt/EnterCourseworkReview.aspx", search: "?yr=2024" }), null);
});

test("SAFETY (source): STARS and UC never click their Save button except through the label guard", () => {
  for (const file of ["stars/fill.ts", "uc/fill.ts"]) {
    const lines = readFileSync(new URL(file, import.meta.url), "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
      assert.ok(!/\bsave\.click\(\)/.test(line), `${file}:${i + 1} clicks Save without the label guard`);
    });
    assert.ok(readFileSync(new URL(file, import.meta.url), "utf8").includes("pressSaveLater(save)"), `${file} presses through pressSaveLater`);
  }
});
