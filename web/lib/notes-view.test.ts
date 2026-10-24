import assert from "node:assert/strict";
import { test } from "node:test";
import { noteDate, noteEdited, noteErrorMessage, noteSaveable } from "./notes-view.ts";

test("noteDate formats date and time, and tolerates garbage", () => {
  assert.equal(noteDate("2026-10-24T15:05:00Z", "en-US", "UTC").replace(/\s/g, " "), "Oct 24, 2026, 3:05 PM");
  assert.equal(noteDate("not a date"), "");
});

test("noteEdited needs more than a minute between created and updated", () => {
  assert.equal(noteEdited("2026-10-24T15:05:00Z", "2026-10-24T15:05:00Z"), false);
  assert.equal(noteEdited("2026-10-24T15:05:00Z", "2026-10-24T15:06:00Z"), false);
  assert.equal(noteEdited("2026-10-24T15:05:00Z", "2026-10-24T15:06:01Z"), true);
  assert.equal(noteEdited("2026-10-24T15:05:00Z", "garbage"), false);
});

test("noteSaveable rejects blank and over-long text", () => {
  assert.equal(noteSaveable("", 10), false);
  assert.equal(noteSaveable("  \n\t ", 10), false);
  assert.equal(noteSaveable("hello", 10), true);
  assert.equal(noteSaveable("x".repeat(10), 10), true);
  assert.equal(noteSaveable("x".repeat(11), 10), false);
});

test("noteErrorMessage turns database errors into plain sentences", () => {
  assert.match(noteErrorMessage('insert or update on table "teacher_notes" violates foreign key constraint "teacher_notes_teacher_id_student_id_fkey"'), /no longer linked/);
  assert.match(noteErrorMessage("note not found"), /no longer exists/);
  assert.match(noteErrorMessage('new row for relation "teacher_notes" violates check constraint'), /4000/);
  assert.equal(noteErrorMessage("network down"), "network down");
  assert.ok(noteErrorMessage("").length > 0);
});
