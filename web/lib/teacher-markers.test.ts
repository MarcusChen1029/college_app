import assert from "node:assert/strict";
import { test } from "node:test";
import type { Anchor } from "./anchors.ts";
import type { AnchorInfo, Conversation } from "./classroom.ts";
import { markerRoute, teacherMarkers, type TeacherMarker } from "./teacher-markers.ts";

const general: AnchorInfo = { anchor: { kind: "general", ref: null }, label: null, available: true };
const about = (kind: Anchor["kind"], ref: string): AnchorInfo => ({ anchor: { kind, ref }, label: null, available: true });
const at = (kind: Anchor["kind"], ref: string): Anchor => ({ kind, ref });

const conv = (o: Partial<Conversation>): Conversation => ({
  id: "c",
  otherId: "s1",
  otherName: "Ana",
  about: general,
  status: "open",
  startedBy: "teacher",
  lastMessageAt: "2026-11-01T00:00:00Z",
  lastAuthor: "teacher",
  lastBody: "hi",
  unread: 0,
  ...o,
});

const marker = (o: Partial<TeacherMarker> = {}): TeacherMarker => ({ conversationId: null, unread: 0, notes: 0, openTasks: 0, firstTaskId: null, firstNoteId: null, ...o });

test("teacherMarkers: only this student's conversations count; general ones leave no marker", () => {
  const m = teacherMarkers({
    studentId: "s1",
    conversations: [
      conv({ id: "c1", about: about("college", "mit"), unread: 2 }),
      conv({ id: "c2", otherId: "s2", about: about("college", "mit"), unread: 9 }), // another student of the same teacher
      conv({ id: "cg", about: general, unread: 4 }),
    ],
  });
  assert.deepEqual([...m.keys()], ["college:mit"]);
  assert.deepEqual(m.get("college:mit"), marker({ conversationId: "c1", unread: 2 }));
});

test("teacherMarkers: notes count per item and the first (newest) one is remembered; general notes leave no marker", () => {
  const m = teacherMarkers({
    studentId: "s1",
    notes: [
      { id: "n-new", anchor: at("college", "mit") },
      { id: "n-gen", anchor: { kind: "general", ref: null } },
      { id: "n-none", anchor: null },
      { id: "n-old", anchor: at("college", "mit") },
      { id: "n-ps", anchor: at("essay", "ps") },
    ],
  });
  assert.deepEqual([...m.keys()].sort(), ["college:mit", "essay:ps"]);
  assert.deepEqual(m.get("college:mit"), marker({ notes: 2, firstNoteId: "n-new" }));
  assert.deepEqual(m.get("essay:ps"), marker({ notes: 1, firstNoteId: "n-ps" }));
});

test("teacherMarkers: open tasks count, done ones do not, and all three kinds merge on one item", () => {
  const m = teacherMarkers({
    studentId: "s1",
    conversations: [conv({ id: "c1", about: about("activity", "a1"), unread: 1 })],
    notes: [{ id: "n1", anchor: at("activity", "a1") }],
    tasks: [
      { id: "t1", about: about("activity", "a1"), done: false },
      { id: "t2", about: about("activity", "a1"), done: true },
      { id: "t3", about: null, done: false },
    ],
  });
  assert.deepEqual([...m.keys()], ["activity:a1"]);
  assert.deepEqual(m.get("activity:a1"), { conversationId: "c1", unread: 1, notes: 1, openTasks: 1, firstTaskId: "t1", firstNoteId: "n1" });
});

test("teacherMarkers: nothing in, nothing out", () => {
  assert.equal(teacherMarkers({ studentId: "s1" }).size, 0);
  assert.equal(teacherMarkers({ studentId: "s1", conversations: [], notes: [], tasks: [] }).size, 0);
});

test("markerRoute: the speech bubble opens the conversation on the Messages tab", () => {
  assert.deepEqual(markerRoute("comments", marker({ conversationId: "c1", unread: 1 })), { tab: "messages", openConversation: true, scrollTo: null });
  assert.deepEqual(markerRoute("comments", undefined), { tab: "messages", openConversation: true, scrollTo: null });
});

test("markerRoute: the lock scrolls the Notes tab to the newest note, the box the Tasks tab to the first open task", () => {
  assert.deepEqual(markerRoute("notes", marker({ notes: 2, firstNoteId: "n1" })), { tab: "notes", openConversation: false, scrollTo: "note:n1" });
  assert.deepEqual(markerRoute("tasks", marker({ openTasks: 1, firstTaskId: "t1" })), { tab: "tasks", openConversation: false, scrollTo: "task:t1" });
});

test("markerRoute: with nothing to scroll to it still opens the tab", () => {
  assert.deepEqual(markerRoute("notes", marker({ notes: 1 })), { tab: "notes", openConversation: false, scrollTo: null });
  assert.deepEqual(markerRoute("tasks", undefined), { tab: "tasks", openConversation: false, scrollTo: null });
});
