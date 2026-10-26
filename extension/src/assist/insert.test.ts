import assert from "node:assert/strict";
import { test } from "node:test";
import { html } from "../commonapp/test-dom.ts";
import { siteOf } from "../sites.ts";
import { ASSIST_TIMING, insertValue, labelOf } from "./insert.ts";
import { fillableBoxes, nextBox } from "./next.ts";

ASSIST_TIMING.stepMs = 5;
ASSIST_TIMING.optionsMs = 60;

test("types into a text box and fires input + change", async () => {
  const doc = html(`<label for="n">Course name</label><input id="n">`);
  const input = doc.getElementById("n") as HTMLInputElement;
  const seen: string[] = [];
  input.addEventListener("input", () => seen.push("input"));
  input.addEventListener("change", () => seen.push("change"));
  assert.deepEqual(await insertValue(input, "English 10"), { ok: true, how: "typed" });
  assert.equal(input.value, "English 10");
  assert.deepEqual(seen, ["input", "change"]);
  assert.equal(labelOf(input), "Course name");
});

test("picks a native select option by exact text, ignoring case and dash style", async () => {
  const doc = html(`<select id="s"><option value="">Choose</option><option value="a">A – History/Social Science</option><option value="b">B – English</option></select>`);
  const sel = doc.getElementById("s") as HTMLSelectElement;
  assert.deepEqual(await insertValue(sel, "b - english"), { ok: true, how: "picked" });
  assert.equal(sel.selectedIndex, 2);
  const miss = await insertValue(sel, "English");
  assert.equal(miss.ok, false); // never a partial match
});

test("ticks and unticks a checkbox from Yes / No", async () => {
  const doc = html(`<input type="checkbox" id="c">`);
  const box = doc.getElementById("c") as HTMLInputElement;
  box.checked = false;
  box.addEventListener("click", () => (box.checked = !box.checked)); // linkedom's click() does not toggle like a browser
  assert.equal((await insertValue(box, "Yes")).ok, true);
  assert.equal(box.checked, true);
  assert.equal((await insertValue(box, "No")).ok, true);
  assert.equal(box.checked, false);
  assert.equal((await insertValue(box, "Maybe")).ok, false);
});

test("chooses a radio in the group by its label", async () => {
  const doc = html(`<label><input type="radio" name="len" value="1">Semester</label><label><input type="radio" name="len" value="2">Full Year</label>`);
  const [first, second] = [...doc.querySelectorAll("input")] as HTMLInputElement[];
  let clicked = "";
  second!.addEventListener("click", () => (clicked = "Full Year"));
  assert.deepEqual(await insertValue(first!, "Full Year"), { ok: true, how: "chose" });
  assert.equal(clicked, "Full Year");
});

test("ARIA combobox: types, then clicks the option whose text matches exactly", async () => {
  const doc = html(`<div role="combobox"><input id="q"></div><ul role="listbox"></ul>`);
  const input = doc.getElementById("q") as HTMLInputElement;
  // The option list appears after typing, like a real autocomplete.
  input.addEventListener("input", () => {
    doc.querySelector("ul")!.innerHTML = `<li role="option">English Literature</li><li role="option">English</li>`;
    doc.querySelectorAll("li")[1]!.addEventListener("click", () => (input.dataset.picked = "English"));
  });
  assert.deepEqual(await insertValue(input, "English"), { ok: true, how: "picked" });
  assert.equal(input.dataset.picked, "English");
});

test("refuses with a sentence when nothing is focused", async () => {
  const doc = html(`<p>x</p>`);
  const r = await insertValue(doc.body, "A");
  assert.equal(r.ok, false);
  assert.equal(await insertValue(null, "A").then((x) => x.ok), false);
});

test("nextBox walks boxes in page order, counting a radio group once", () => {
  const doc = html(`<input id="a"><label><input type="radio" name="r" id="r1">X</label><label><input type="radio" name="r" id="r2">Y</label><select id="s"></select><input type="hidden"><textarea id="t"></textarea>`);
  assert.deepEqual(fillableBoxes(doc).map((e) => e.id), ["a", "r1", "s", "t"]);
  assert.equal(nextBox(doc.getElementById("a")!)!.id, "r1");
  assert.equal(nextBox(doc.getElementById("r2")!)!.id, "s");
  assert.equal(nextBox(doc.getElementById("t")!), null);
});

test("siteOf matches portal origins exactly", () => {
  assert.equal(siteOf("https://apply.universityofcalifornia.edu/my-application/academic-history"), "uc");
  assert.equal(siteOf("https://srar.selfreportedtranscript.com/Coursework.aspx"), "stars");
  assert.equal(siteOf("https://calstate.cas.myliaison.com/applicant/x"), "csu");
  assert.equal(siteOf("https://myillini.illinois.edu/Apply"), "uiuc");
  assert.equal(siteOf("https://apply.commonapp.org/common/13/55"), "common_app");
  assert.equal(siteOf("https://apply.universityofcalifornia.edu.evil.com/"), null);
  assert.equal(siteOf("not a url"), null);
});

test("Telerik RadComboBox (STARS): opens the list with its arrow and clicks the matching li", async () => {
  const doc = html(`<div class="RadComboBox" id="w"><input class="rcbInput" readonly id="x_Input"><span class="rcbArrowCell"><a id="arrow">select</a></span></div><div class="rcbList"></div>`);
  let picked = "";
  doc.getElementById("arrow")!.addEventListener("click", () => {
    doc.querySelector(".rcbList")!.innerHTML = `<li class="rcbItem">Science</li><li class="rcbItem">Computer Science</li>`;
    doc.querySelectorAll("li")[1]!.addEventListener("click", () => (picked = "Computer Science"));
  });
  const input = doc.getElementById("x_Input") as HTMLInputElement;
  input.readOnly = true;
  assert.deepEqual(await insertValue(input, "Computer Science"), { ok: true, how: "picked" });
  assert.equal(picked, "Computer Science");
});
