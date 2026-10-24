import assert from "node:assert/strict";
import { test } from "node:test";
import { CSV_BOM, csvCell, toCsv } from "./csv.ts";

test("plain values pass through; null and undefined are empty", () => {
  assert.equal(csvCell("Sam"), "Sam");
  assert.equal(csvCell(1420), "1420");
  assert.equal(csvCell(false), "false");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("commas, quotes and newlines are quoted and quotes doubled", () => {
  assert.equal(csvCell("Rivera, Sam"), '"Rivera, Sam"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("a\nb"), '"a\nb"');
});

test("cells a spreadsheet would run as a formula get a leading apostrophe", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://evil\",\"x\")"), '"\'=HYPERLINK(""http://evil"",""x"")"');
  assert.equal(csvCell("+1+1"), "'+1+1");
  assert.equal(csvCell("-2"), "'-2");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("\tcmd"), "'\tcmd");
});

test("a negative number is not treated as text", () => {
  assert.equal(csvCell(-5), "-5");
});

test("toCsv joins cells with commas and rows with CRLF", () => {
  assert.equal(toCsv([["Name", "SAT"], ["Sam, R", 1400], ["Sue", null]]), 'Name,SAT\r\n"Sam, R",1400\r\nSue,');
});

test("names starting with a plus or minus are neutralised, quoted when they contain a comma", () => {
  assert.equal(csvCell("+Anna"), "'+Anna");
  assert.equal(csvCell("-"), "'-");
  assert.equal(csvCell("\r=1+1"), "\"'\r=1+1\"");
  assert.equal(csvCell("=1,2"), "\"'=1,2\"");
});

test("CSV_BOM is the single U+FEFF byte-order mark", () => {
  assert.equal(CSV_BOM.length, 1);
  assert.equal(CSV_BOM.charCodeAt(0), 0xfeff);
});
