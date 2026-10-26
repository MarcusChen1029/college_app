import assert from "node:assert/strict";
import { test } from "node:test";
import { html } from "../commonapp/test-dom.ts";
import { CSU_TIMING, existingTitles, onCourseworkPage, schoolButton, topDrawer } from "./fill.ts";

CSU_TIMING.stepMs = 5;
CSU_TIMING.drawerMs = 200;

// Shaped like the live page (2026-10-27): one card per school with its course button; the course list opens in an MUI Drawer.
const page = (cards: string, drawer = "") =>
  html(`<main><h1>High School Coursework</h1>${cards}</main><div class="cky-modal MuiDrawer-root"></div>${drawer}`);
const card = (name: string, label: string) => `<div><div><h3>${name}</h3><p>PORTLAND, Oregon</p></div><div><button>${label}</button></div><p>Semester System</p></div>`;

test("finds the coursework page and the named school's button", () => {
  const doc = page(card("CENTRAL CATHOLIC HIGH SCHOOL", "1 Courses") + card("LINCOLN HIGH SCHOOL", "Add course"));
  assert.ok(onCourseworkPage(doc));
  assert.equal(schoolButton(doc, "Lincoln High School").textContent, "Add course");
  assert.equal(schoolButton(doc, "central catholic high school").textContent, "1 Courses");
  assert.throws(() => schoolButton(doc, "Kang Chiao"), /Could not tell which school/);
});

test("with one school on the page its button is used whatever the tracker calls it", () => {
  const doc = page(card("CENTRAL CATHOLIC HIGH SCHOOL", "Add course"));
  assert.equal(schoolButton(doc, "Central Catholic HS").textContent, "Add course");
});

test("existing titles come from the school's course list drawer; none when the button says Add course", async () => {
  const empty = page(card("LINCOLN HIGH SCHOOL", "Add course"));
  assert.deepEqual(await existingTitles(empty, "Lincoln High School"), []);
  const doc = page(card("CENTRAL CATHOLIC HIGH SCHOOL", "2 Courses"));
  doc.querySelector("main button")!.addEventListener("click", () => {
    doc.body.insertAdjacentHTML("beforeend", `<div class="MuiDrawer-root"><h2>High School Courses</h2><table><tr><th>Course Title</th></tr><tr><td>English 9</td><td>A</td></tr><tr><td>Algebra 1</td><td>B</td></tr></table></div>`);
  });
  assert.deepEqual(await existingTitles(doc, "Central Catholic High School"), ["English 9", "Algebra 1"]);
  assert.ok(topDrawer(doc)?.textContent?.includes("High School Courses")); // the cookie dialog is never the top drawer
});
