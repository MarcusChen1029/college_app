import assert from "node:assert/strict";
import { test } from "node:test";
import type { Anchor } from "./anchors.ts";
import {
  CLASSROOM_LIMITS,
  TEACHER_NEVER_SEES,
  TEACHER_SEES,
  byRecentActivity,
  classroomErrorMessage,
  filterConversations,
  findConversation,
  markersByAnchor,
  needsReply,
  pairClasses,
  parseAnchorInfo,
  parseConversation,
  parseMessage,
  parseStudentPost,
  parseTeacherPost,
  parseUnread,
  replyWaitingStudents,
  shownConversations,
  shownPosts,
  sortPosts,
  studentMarkers,
  validateMessage,
  validatePost,
  type AnchorInfo,
  type Conversation,
  type StudentPost,
} from "./classroom.ts";

const general: AnchorInfo = { anchor: { kind: "general", ref: null }, label: null, available: true };
const about = (kind: Anchor["kind"], ref: string, label: string | null = null, available = true): AnchorInfo => ({ anchor: { kind, ref }, label, available });

const post = (o: Partial<StudentPost>): StudentPost => ({
  id: "p",
  teacherId: "t1",
  classId: null,
  className: null,
  title: "T",
  body: "B",
  link: null,
  pinned: false,
  createdAt: "2026-11-01T00:00:00Z",
  read: false,
  ...o,
});

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

test("CLASSROOM_LIMITS matches the spec", () => {
  assert.deepEqual(CLASSROOM_LIMITS, {
    postTitle: 120,
    postBody: 4000,
    link: 500,
    message: 2000,
    anchorLabel: 120,
    teacherMessagesPerDay: 300,
    studentMessagesPerDay: 50,
    teacherPostsPerDay: 20,
    activePostsPerTeacher: 200,
    conversationsPerPair: 100,
  });
});

test("validatePost trims and checks lengths", () => {
  const ok = validatePost({ title: "  Deadlines  ", body: " Read this. ", link: "", pinned: true });
  assert.deepEqual(ok, { ok: true, value: { title: "Deadlines", body: "Read this.", link: null, pinned: true } });
  assert.equal(validatePost({ title: "a".repeat(120), body: "b" }).ok, true);
  assert.equal(validatePost({ title: "a".repeat(121), body: "b" }).ok, false);
  assert.equal(validatePost({ title: "a", body: "b".repeat(4000) }).ok, true);
  assert.equal(validatePost({ title: "a", body: "b".repeat(4001) }).ok, false);
  assert.equal(validatePost({ title: "   ", body: "b" }).ok, false);
  assert.equal(validatePost({ title: "a", body: "  " }).ok, false);
  assert.equal(validatePost({ body: "b" }).ok, false);
});

test("validatePost only keeps http(s) links of at most 500 characters", () => {
  assert.equal(validatePost({ title: "a", body: "b", link: "javascript:alert(1)" }).ok, false);
  assert.equal(validatePost({ title: "a", body: "b", link: "data:text/html,x" }).ok, false);
  assert.equal(validatePost({ title: "a", body: "b", link: "ftp://x.org/a" }).ok, false);
  const kept = validatePost({ title: "a", body: "b", link: "https://x.org/a" });
  assert.deepEqual(kept, { ok: true, value: { title: "a", body: "b", link: "https://x.org/a", pinned: false } });
  assert.equal(validatePost({ title: "a", body: "b", link: null }).ok, true);
  const long = "https://x.org/" + "a".repeat(486); // 500 characters
  assert.equal(long.length, 500);
  assert.equal(validatePost({ title: "a", body: "b", link: long }).ok, true);
  assert.equal(validatePost({ title: "a", body: "b", link: long + "a" }).ok, false);
});

test("validateMessage trims and caps at 2000", () => {
  assert.equal(validateMessage("").ok, false);
  assert.equal(validateMessage("   ").ok, false);
  assert.equal(validateMessage(undefined).ok, false);
  assert.equal(validateMessage("a".repeat(2001)).ok, false);
  assert.deepEqual(validateMessage("a".repeat(2000)), { ok: true, value: "a".repeat(2000) });
  assert.deepEqual(validateMessage("  hi \n"), { ok: true, value: "hi" });
});

test("sortPosts puts pinned first, then newest first", () => {
  const items = [post({ id: "old", createdAt: "2026-10-01T00:00:00Z" }), post({ id: "pin", pinned: true, createdAt: "2026-09-01T00:00:00Z" }), post({ id: "new", createdAt: "2026-11-01T00:00:00Z" })];
  assert.deepEqual(sortPosts(items).map((p) => p.id), ["pin", "new", "old"]);
  assert.deepEqual(items.map((p) => p.id), ["old", "pin", "new"]); // input untouched
});

test("shownPosts: every unread post, then the newest read ones up to max", () => {
  const unread = (n: number) => Array.from({ length: n }, (_, i) => post({ id: `u${i}`, createdAt: `2026-11-0${i + 1}T00:00:00Z` }));
  const read = (n: number) => Array.from({ length: n }, (_, i) => post({ id: `r${i}`, read: true, createdAt: `2026-10-0${i + 1}T00:00:00Z` }));
  assert.equal(shownPosts([...unread(5), ...read(2)]).length, 5);
  assert.ok(shownPosts([...unread(5), ...read(2)]).every((p) => !p.read));
  assert.deepEqual(shownPosts([...unread(1), ...read(4)]).map((p) => p.id), ["u0", "r3", "r2"]);
  assert.deepEqual(shownPosts(read(4), 2).map((p) => p.id), ["r3", "r2"]);
  assert.deepEqual(shownPosts([]), []);
  const pinnedRead = post({ id: "pin", read: true, pinned: true, createdAt: "2026-09-01T00:00:00Z" });
  const newerRead = post({ id: "new", read: true, createdAt: "2026-10-30T00:00:00Z" });
  assert.deepEqual(shownPosts([newerRead, pinnedRead], 1).map((p) => p.id), ["pin"]);
});

test("needsReply is true only for an unread student message", () => {
  assert.equal(needsReply(conv({ lastAuthor: "student", unread: 2 })), true);
  assert.equal(needsReply(conv({ lastAuthor: "teacher", unread: 0 })), false);
  assert.equal(needsReply(conv({ lastAuthor: "student", unread: 0 })), false);
  assert.equal(needsReply(conv({ lastAuthor: "teacher", unread: 3 })), false);
});

test("replyWaitingStudents collects the students with a message the teacher has not answered", () => {
  const list = [
    conv({ id: "a", otherId: "s1", lastAuthor: "student", unread: 1 }),
    conv({ id: "b", otherId: "s1", lastAuthor: "student", unread: 3 }), // a second one for the same student: still one id
    conv({ id: "c", otherId: "s2", lastAuthor: "teacher", unread: 0 }),
    conv({ id: "d", otherId: "s3", lastAuthor: "student", unread: 0 }), // read already
  ];
  assert.deepEqual([...replyWaitingStudents(list)], ["s1"]);
  assert.equal(replyWaitingStudents([]).size, 0);
});

test("filterConversations filters by state and class set, newest first", () => {
  const list = [
    conv({ id: "a", otherId: "s1", lastMessageAt: "2026-11-01T00:00:00Z", lastAuthor: "student", unread: 1 }),
    conv({ id: "b", otherId: "s2", lastMessageAt: "2026-11-03T00:00:00Z", status: "resolved" }),
    conv({ id: "c", otherId: "s3", lastMessageAt: "2026-11-02T00:00:00Z" }),
  ];
  const ids = (f: Parameters<typeof filterConversations>[1], set: ReadonlySet<string> | null = null) => filterConversations(list, f, set).map((c) => c.id);
  assert.deepEqual(ids("all"), ["b", "c", "a"]);
  assert.deepEqual(ids("open"), ["c", "a"]);
  assert.deepEqual(ids("resolved"), ["b"]);
  assert.deepEqual(ids("needs_reply"), ["a"]);
  assert.deepEqual(ids("all", new Set(["s1", "s3"])), ["c", "a"]);
  assert.deepEqual(ids("open", new Set(["s2"])), []);
});

test("findConversation matches student and item, never a general one", () => {
  const mit = conv({ id: "m", otherId: "s1", about: about("college", "mit") });
  const other = conv({ id: "o", otherId: "s2", about: about("college", "mit") });
  const gen = conv({ id: "g", otherId: "s1", about: general });
  const list = [gen, other, mit];
  assert.equal(findConversation(list, "s1", { kind: "college", ref: "mit" })?.id, "m");
  assert.equal(findConversation(list, "s2", { kind: "college", ref: "mit" })?.id, "o");
  assert.equal(findConversation(list, "s3", { kind: "college", ref: "mit" }), null);
  assert.equal(findConversation(list, "s1", { kind: "college", ref: "yale" }), null);
  assert.equal(findConversation(list, "s1", { kind: "essay", ref: "mit" }), null);
  assert.equal(findConversation(list, "s1", { kind: "general", ref: null }), null);
});

test("markersByAnchor merges conversations, notes and open tasks per item", () => {
  const college: Anchor = { kind: "college", ref: "mit" };
  const m = markersByAnchor({
    conversations: [conv({ id: "c1", about: about("college", "mit"), unread: 2 }), conv({ id: "cg", about: general, unread: 5 })],
    notes: [{ anchor: college }, { anchor: college }, { anchor: null }, { anchor: { kind: "general", ref: null } }],
    tasks: [
      { id: "t1", about: about("college", "mit"), done: false },
      { id: "t2", about: about("college", "mit"), done: false },
      { id: "t3", about: about("college", "mit"), done: true },
      { id: "t4", about: null, done: false },
      { id: "t5", about: general, done: false },
    ],
  });
  assert.equal(m.size, 1);
  assert.deepEqual(m.get("college:mit"), { conversationId: "c1", unread: 2, notes: 2, openTasks: 2, firstTaskId: "t1" });
});

test("markersByAnchor: done tasks and missing inputs make no marker", () => {
  assert.equal(markersByAnchor({}).size, 0);
  assert.equal(markersByAnchor({ tasks: [{ id: "t", about: about("essay", "ps"), done: true }] }).size, 0);
  const m = markersByAnchor({ notes: [{ anchor: { kind: "essay", ref: "ps" } }], tasks: [{ id: "t", about: about("activity", "a1"), done: false }] });
  assert.deepEqual(m.get("essay:ps"), { conversationId: null, unread: 0, notes: 1, openTasks: 0, firstTaskId: null });
  assert.deepEqual(m.get("activity:a1"), { conversationId: null, unread: 0, notes: 0, openTasks: 1, firstTaskId: "t" });
});

test("parseAnchorInfo reads the anchor columns", () => {
  assert.deepEqual(parseAnchorInfo({ anchor_kind: "college", anchor_ref: "mit", anchor_label: "MIT", anchor_available: true }), about("college", "mit", "MIT", true));
  assert.deepEqual(parseAnchorInfo({ anchor_kind: null, anchor_ref: null, anchor_label: null, anchor_available: null }), general);
  assert.deepEqual(parseAnchorInfo({}), general);
  assert.deepEqual(parseAnchorInfo({ anchor_kind: "bogus", anchor_ref: "x" }), general);
  assert.deepEqual(parseAnchorInfo({ anchor_kind: "essay", anchor_ref: "ps", anchor_label: "", anchor_available: false }), about("essay", "ps", null, false));
});

test("parseConversation keeps a hidden label null", () => {
  const c = parseConversation({
    conversation_id: "c1",
    other_id: "s1",
    other_name: "Ana",
    anchor_kind: "essay",
    anchor_ref: "ps",
    anchor_label: null,
    anchor_available: false,
    status: "resolved",
    started_by: "student",
    last_message_at: "2026-11-02T10:00:00Z",
    last_author: "student",
    last_body: null,
    unread: 3,
  });
  assert.deepEqual(c, {
    id: "c1",
    otherId: "s1",
    otherName: "Ana",
    about: { anchor: { kind: "essay", ref: "ps" }, label: null, available: false },
    status: "resolved",
    startedBy: "student",
    lastMessageAt: "2026-11-02T10:00:00Z",
    lastAuthor: "student",
    lastBody: null,
    unread: 3,
  });
  const d = parseConversation({ conversation_id: "c2" });
  assert.equal(d.status, "open");
  assert.equal(d.startedBy, "teacher");
  assert.equal(d.lastAuthor, "teacher");
  assert.equal(d.unread, 0);
  assert.equal(d.about.anchor.kind, "general");
});

test("parseStudentPost and parseTeacherPost read the RPC columns", () => {
  assert.deepEqual(
    parseStudentPost({ post_id: "p1", teacher_id: "t1", class_id: null, class_name: null, title: "Hi", body: "Body", link_url: "https://x.org", pinned: true, created_at: "2026-11-01T00:00:00Z", is_read: true }),
    { id: "p1", teacherId: "t1", classId: null, className: null, title: "Hi", body: "Body", link: "https://x.org", pinned: true, createdAt: "2026-11-01T00:00:00Z", read: true },
  );
  assert.deepEqual(
    parseTeacherPost({ post_id: "p2", class_id: "k1", class_name: "Seniors", title: "Hi", body: "Body", link_url: null, pinned: false, archived: true, created_at: "a", updated_at: "b", audience: "12", read_count: 5 }),
    { id: "p2", classId: "k1", className: "Seniors", title: "Hi", body: "Body", link: null, pinned: false, archived: true, createdAt: "a", updatedAt: "b", audience: 12, readCount: 5 },
  );
  assert.equal(parseStudentPost({}).read, false);
});

test("parseMessage reads a deleted message as null body", () => {
  assert.deepEqual(parseMessage({ message_id: "m1", author: "student", body: "hello", deleted: false, created_at: "t" }), { id: "m1", author: "student", body: "hello", deleted: false, createdAt: "t" });
  assert.deepEqual(parseMessage({ message_id: "m2", author: "teacher", body: null, deleted: true, created_at: "t" }), { id: "m2", author: "teacher", body: null, deleted: true, createdAt: "t" });
});

test("parseUnread returns zeros for nothing", () => {
  assert.deepEqual(parseUnread(null), { teachers: 0, posts: 0, conversations: 0 });
  assert.deepEqual(parseUnread(undefined), { teachers: 0, posts: 0, conversations: 0 });
  assert.deepEqual(parseUnread({ teachers: 2, posts: "3", conversations: 1 }), { teachers: 2, posts: 3, conversations: 1 });
});

test("TEACHER_SEES and TEACHER_NEVER_SEES list the i18n suffixes", () => {
  assert.deepEqual([...TEACHER_SEES], ["nameEmail", "scores", "plans", "list", "interested", "activities", "essays", "lastActive", "tasks", "postReads", "messages"]);
  assert.deepEqual([...TEACHER_NEVER_SEES], ["portals", "notes", "aid", "transcript", "recommenders", "scholarships", "resume", "passwords"]);
});

test("classroomErrorMessage turns RPC errors into plain wording", () => {
  const msg = (s: string) => classroomErrorMessage(s);
  assert.match(msg("classroom: limit"), /limit/i);
  assert.match(msg("classroom: not linked"), /linked/i);
  assert.match(msg("classroom: not found"), /no longer available/i);
  assert.match(msg("classroom: invalid"), /try again/i);
  assert.match(msg("Error: classroom: rate"), /today/i);
  assert.equal(msg("boom"), "boom");
  assert.equal(msg(""), "Something went wrong. Please try again.");
});

test("shownConversations: every unread conversation, then the newest read ones up to max", () => {
  const unread = (n: number) => Array.from({ length: n }, (_, i) => conv({ id: `u${i}`, unread: 1, lastMessageAt: `2026-11-0${i + 1}T00:00:00Z` }));
  const read = (n: number) => Array.from({ length: n }, (_, i) => conv({ id: `r${i}`, unread: 0, lastMessageAt: `2026-10-0${i + 1}T00:00:00Z` }));
  assert.equal(shownConversations([...unread(5), ...read(2)]).length, 5);
  assert.ok(shownConversations([...unread(5), ...read(2)]).every((c) => c.unread > 0));
  assert.deepEqual(shownConversations([...unread(1), ...read(4)]).map((c) => c.id), ["u0", "r3", "r2"]);
  assert.deepEqual(shownConversations(read(4), 2).map((c) => c.id), ["r3", "r2"]);
  assert.deepEqual(shownConversations([]), []);
  const input = [...read(2), ...unread(1)];
  shownConversations(input);
  assert.deepEqual(input.map((c) => c.id), ["r0", "r1", "u0"]); // input untouched
});

test("pairClasses: names and ids that line up index for index", () => {
  assert.deepEqual(pairClasses(["Senior A", "Senior B"], ["c-a", "c-b"]), [
    { name: "Senior A", id: "c-a" },
    { name: "Senior B", id: "c-b" },
  ]);
  assert.deepEqual(pairClasses(["Senior A", "Senior A"], ["c-1", "c-2"]), [
    { name: "Senior A", id: "c-1" },
    { name: "Senior A", id: "c-2" },
  ]); // two classes with one name stay two entries
  assert.deepEqual(pairClasses([], []), []);
  // Ids that are missing or don't line up with the names (a database that predates class_ids) pair with nothing.
  assert.deepEqual(pairClasses(["Senior A", "Senior B"], []), [
    { name: "Senior A", id: null },
    { name: "Senior B", id: null },
  ]);
  assert.deepEqual(pairClasses(["Senior A", "Senior B"], ["c-a"]), [
    { name: "Senior A", id: null },
    { name: "Senior B", id: null },
  ]);
});
test("byRecentActivity: newest announcement or message first, quiet teachers by link time", () => {
  const teachers = [
    { teacherId: "quiet-old", linkedAt: "2026-08-01T00:00:00Z" },
    { teacherId: "posted", linkedAt: "2026-09-01T00:00:00Z" },
    { teacherId: "talked", linkedAt: "2026-09-02T00:00:00Z" },
    { teacherId: "quiet-new", linkedAt: "2026-10-15T00:00:00Z" },
  ];
  const posts = [
    { teacherId: "posted", createdAt: "2026-10-20T00:00:00Z" },
    { teacherId: "posted", createdAt: "2026-10-01T00:00:00Z" },
  ];
  const conversations = [{ otherId: "talked", lastMessageAt: "2026-11-02T08:00:00+00:00" }];
  assert.deepEqual(byRecentActivity(teachers, posts, conversations).map((x) => x.teacherId), ["talked", "posted", "quiet-new", "quiet-old"]);
  assert.deepEqual(byRecentActivity([], posts, conversations), []);
  assert.equal(teachers[0].teacherId, "quiet-old"); // input untouched
  // A time written with a different offset is still compared as a moment.
  const mixed = [{ teacherId: "x", linkedAt: "2026-01-01T00:00:00Z" }, { teacherId: "y", linkedAt: "2026-01-01T00:00:00Z" }];
  const later = byRecentActivity(mixed, [], [{ otherId: "x", lastMessageAt: "2026-11-02T10:00:00+08:00" }, { otherId: "y", lastMessageAt: "2026-11-02T03:00:00+00:00" }]);
  assert.deepEqual(later.map((x) => x.teacherId), ["y", "x"]); // 03:00Z is after 02:00Z
});

test("studentMarkers: markers per item, one entry per teacher, never mixing two teachers' items", () => {
  const conversations = [
    conv({ id: "c1", otherId: "t1", otherName: "Ms Lin", about: about("college", "mit"), unread: 2 }),
    conv({ id: "c2", otherId: "t2", otherName: "Mr Ayala", about: about("college", "mit"), unread: 0 }),
    conv({ id: "c3", otherId: "t1", otherName: "Ms Lin", about: general, unread: 4 }), // general: no item
    conv({ id: "c4", otherId: "t1", otherName: "Ms Lin", about: about("essay", "ps"), unread: 1 }),
  ];
  const tasks = [
    { id: "k1", teacherId: "t1", teacherName: "Ms Lin", about: about("college", "mit"), done: false },
    { id: "k2", teacherId: "t1", teacherName: "Ms Lin", about: about("college", "mit"), done: false },
    { id: "k3", teacherId: "t1", teacherName: "Ms Lin", about: about("activity", "a1"), done: true }, // done: no marker
    { id: "k4", teacherId: "t3", teacherName: "Dr Kim", about: about("activity", "a1"), done: false }, // a task-only teacher
    { id: "k5", teacherId: "t3", teacherName: "Dr Kim", about: null, done: false }, // no item
  ];
  const m = studentMarkers(conversations, tasks);
  assert.deepEqual([...m.keys()].sort(), ["activity:a1", "college:mit", "essay:ps"]);
  assert.deepEqual(m.get("college:mit"), [
    { teacherId: "t2", teacherName: "Mr Ayala", marker: { conversationId: "c2", unread: 0, notes: 0, openTasks: 0, firstTaskId: null } },
    { teacherId: "t1", teacherName: "Ms Lin", marker: { conversationId: "c1", unread: 2, notes: 0, openTasks: 2, firstTaskId: "k1" } },
  ]); // sorted by teacher name; Ms Lin's tasks never land on Mr Ayala's marker
  assert.deepEqual(m.get("essay:ps"), [{ teacherId: "t1", teacherName: "Ms Lin", marker: { conversationId: "c4", unread: 1, notes: 0, openTasks: 0, firstTaskId: null } }]);
  assert.deepEqual(m.get("activity:a1"), [{ teacherId: "t3", teacherName: "Dr Kim", marker: { conversationId: null, unread: 0, notes: 0, openTasks: 1, firstTaskId: "k4" } }]);
  assert.equal(studentMarkers([], []).size, 0);
});

test("studentMarkers: a teacher's name comes from whichever side has one, and equal names keep a stable order by id", () => {
  const m = studentMarkers(
    [conv({ id: "c1", otherId: "t9", otherName: "", about: about("college", "mit") })],
    [
      { id: "k1", teacherId: "t9", teacherName: "Ms Lin", about: about("college", "mit"), done: false },
      { id: "k2", teacherId: "t2", teacherName: "Ms Lin", about: about("college", "mit"), done: false },
    ],
  );
  assert.deepEqual(m.get("college:mit")?.map((e) => [e.teacherId, e.teacherName]), [["t2", "Ms Lin"], ["t9", "Ms Lin"]]);
});
