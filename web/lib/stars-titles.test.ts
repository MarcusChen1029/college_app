import assert from "node:assert/strict";
import { test } from "node:test";
import { STARS_INTL_TITLES as I, STARS_US_TITLES as U } from "./transcript-maps/stars-lists.ts";
import { matchStarsTitle } from "./transcript-maps/stars-titles.ts";

const intl = (name: string, list: readonly string[], subject = "x", grade: number | null = 10) => matchStarsTitle(name, subject, grade, list, "intl").title;

test("drops level words and lab suffixes; reads Roman numerals; longest title wins", () => {
  assert.equal(intl("AP Calculus BC", I.Mathematics), "CALCULUS");
  assert.equal(intl("Honors Algebra II", I.Mathematics), "ALGEBRA 2");
  assert.equal(intl("AP Statistics", I.Mathematics), "STATISTICS");
  assert.equal(intl("Geometry", I.Mathematics), "GEOMETRY");
  assert.equal(intl("AP Chemistry- Laboratory", I.Science), "CHEMISTRY");
  assert.equal(intl("AP Physics 1", I.Science), "PHYSICS");
  assert.equal(intl("Honors Biology", I.Science), "BIOLOGY");
  assert.equal(intl("Honors Chinese Language and Culture I", I.Languages), "CHINESE LANGUAGE & CULTURE");
  assert.equal(intl("World Language Japanese I", I.Languages), "JAPANESE 1 (FIRST YEAR)");
  assert.equal(intl("Honors English Literature", I.Languages, "english"), "ENGLISH LITERATURE");
  assert.equal(intl("Early World History", I["History / Social Studies"]), "WORLD HISTORY");
  assert.equal(intl("AP United States Government and Politics", I["History / Social Studies"]), "GOVERNMENT AND POLITICS");
  assert.equal(intl("Physical Education and Health 9", I["Phys. Ed / Health / Gym"]), "PHYSICAL EDUCATION AND HEALTH");
  assert.equal(intl("Health Education 9", I["Phys. Ed / Health / Gym"]), "HEALTH EDUCATION");
  assert.equal(intl("Information Technology", I["Computer Science / Info Tech"]), "INFORMATION TECHNOLOGY");
  assert.equal(intl("AP Seminar", I["Other Subject Area"]), "SEMINAR");
});

test("English named by grade takes STARS's year title on each page", () => {
  assert.equal(intl("English 9 Level 1", I.Languages, "english", 9), "ENGLISH 9 (FIRST YEAR)");
  assert.equal(intl("English 12-Imagined Realities: Science Fiction, Fantasy, and the Modern World", I.Languages, "english", 12), "ENGLISH 12 (FOURTH YEAR)");
  assert.equal(matchStarsTitle("English 11", "english", 11, U.English, "us").title, "ENGLISH 3");
});

test("nothing to match -> the subject's OTHER title, said so", () => {
  assert.deepEqual(matchStarsTitle("Swimming 10", "pe_health", 10, I["Phys. Ed / Health / Gym"], "intl"), { title: "OTHER PHYSICAL EDUCATION", how: "other" });
  assert.equal(intl("College Counseling 11", I["Other Subject Area"]), "OTHER");
  assert.equal(intl("Performing Arts 9", I["Fine Arts / Music"]), "OTHER FINE ART");
  assert.equal(matchStarsTitle("Algebra 1", "mathematics", 9, I.Mathematics, "intl").how, "exact");
});
