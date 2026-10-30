import assert from "node:assert/strict";
import { test } from "node:test";
import { pairWithAccount, type SlotPassword } from "./portal-slots.ts";
import { afterAdd, afterDiscard, keptCopy, localOffer } from "./sign-in-merge.ts";
import { agreedFor, EMPTY_LOCAL, localWrites, parseLocal, parseMove, serializeMove, type LocalData } from "./student-local.ts";
import type { ListEntry } from "./student-rows.ts";

const USER = "u-1";
const id = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${String(n).repeat(12)}`;
const entry = (inst: string, addedAt: string, slug = inst.slice(0, 4)): ListEntry =>
  ({ slug, institutionId: inst, plan: null, status: "in_progress", notes: `notes ${slug}`, checklist: {}, portal: { url: "", username: "" }, addedAt }) as ListEntry;

// The account already holds 4 colleges; Free allows 5, so one local college fits (the older one) and one is kept.
const LIMIT = 5;
const account = [1, 2, 3, 4].map((n) => entry(id(n), `2026-01-0${n}T00:00:00.000Z`));
const FIT = id(5);
const KEEP = id(6);
const fitEntry = entry(FIT, "2026-02-01T00:00:00.000Z", "fits");
const keepEntry = entry(KEEP, "2026-03-01T00:00:00.000Z", "kept");
const local: LocalData = { ...EMPTY_LOCAL, profile: { sat: 1300 }, list: [keepEntry, fitEntry] };

// One password of each kind: agreed at an earlier sign-in (the vault was locked), a kept college's own, and one the
// dialog may offer.
const agreedPw: SlotPassword = { slot: "system:commonapp", password: "agreed-secret" };
const keptPw: SlotPassword = { slot: `college:${KEEP}`, password: "kept-secret" };
const offeredPw: SlotPassword = { slot: "system:uc", password: "offered-secret" };
const passwords = [agreedPw, keptPw, offeredPw];
const move = serializeMove({ userId: USER, slots: [agreedPw.slot] });
const agreed = agreedFor(parseMove(move), USER);

const slots = (ps: readonly SlotPassword[]) => ps.map((p) => p.slot);

test("the dialog offers only the password that is neither agreed nor a kept college's own; its counts say so", () => {
  const offer = localOffer(local, passwords, account, LIMIT, agreed);
  assert.deepEqual(offer.pw.offered, [offeredPw]);
  assert.deepEqual(offer.pw.stay, [keptPw]);
  assert.deepEqual(offer.pw.agreed, [agreedPw]);
  assert.deepEqual(offer.fit.insert, [fitEntry]);
  assert.deepEqual(offer.fit.keep, [keepEntry]);
  assert.equal(offer.fit.leftover, 1);
  assert.deepEqual(offer.found, { colleges: 1, logins: 1, passwords: 1 });
  // Another account's agreement protects nothing: the agreed password is offered too (the kept college's still isn't).
  assert.deepEqual(slots(localOffer(local, passwords, account, LIMIT, agreedFor(parseMove(move), "u-2")).pw.offered), [agreedPw.slot, offeredPw.slot]);
  // With room for everything (a pass) the kept college joins and its password is offered; the agreed one never is.
  const pass = localOffer(local, passwords, account, null, agreed);
  assert.deepEqual(slots(pass.pw.offered), [keptPw.slot, offeredPw.slot]);
  assert.deepEqual(pass.fit.keep, []);
  assert.deepEqual(pass.found, { colleges: 2, logins: 2, passwords: 2 });
});

test("the dialog is not shown when only agreed passwords and kept colleges (with their passwords) are left", () => {
  const left = localOffer(keptCopy([keepEntry]), [agreedPw, keptPw], [...account, fitEntry], LIMIT, agreed);
  assert.equal(left.found, null);
  assert.deepEqual(left.pw.offered, []);
  assert.equal(left.fit.leftover, 1, "My list still explains the kept college");
  // Something addable (the profile) brings it back, still without the agreed or kept password in its count.
  const withProfile = localOffer({ ...keptCopy([keepEntry]), profile: { sat: 1300 } }, [agreedPw, keptPw], [...account, fitEntry], LIMIT, agreed);
  assert.deepEqual(withProfile.found, { colleges: 0, logins: 0, passwords: 0 });
});

test(`"Don't add" deletes only the offered password; the agreed one, the kept college and its password stay`, () => {
  const offer = localOffer(local, passwords, account, LIMIT, agreed);
  const after = afterDiscard(passwords, offer);
  assert.deepEqual(after.passwords, [agreedPw, keptPw]);
  assert.deepEqual(after.local, { ...EMPTY_LOCAL, list: [keepEntry] });
  assert.equal(after.local.list[0].notes, "notes kept", "the kept college is untouched");
  // What the store writes: LEGACY_KEY keeps both and drops the offered one; MOVE_KEY is not written, so the agreed
  // password still moves when the vault opens.
  const w = localWrites(after.local, after.passwords);
  assert.deepEqual(parseLocal(w.copy, w.legacy).passwords, [agreedPw, keptPw]);
  assert.ok(w.legacy && !w.legacy.includes("offered-secret"));
  assert.ok(agreedFor(parseMove(move), USER).has(agreedPw.slot));
  // The values the store emits: localPasswordCount 2 (agreed + kept college's), localLeftover 1.
  assert.equal(after.passwords.length, 2);
  assert.equal(offer.fit.leftover, 1);
  // Nothing kept: the copy goes entirely (only the agreed password stays).
  const roomy = localOffer(local, passwords, account, null, agreed);
  const all = afterDiscard(passwords, roomy);
  assert.deepEqual(all.passwords, [agreedPw]);
  assert.equal(all.local, EMPTY_LOCAL);
});

test(`"Add" with a locked vault sends only the offered password; the agreement grows, kept college passwords stay unsent`, () => {
  const offer = localOffer(local, passwords, account, LIMIT, agreed);
  const paired = pairWithAccount(offer.pw.offered, { portals: undefined, list: account }, { portals: local.profile.portals, list: local.list });
  assert.deepEqual(slots(paired.send), [offeredPw.slot], "never a kept college's or an agreed password");
  // importPasswords while the vault is locked or not set up: nothing sent, every entry comes back as not stored.
  const notStored = [...paired.send];
  const after = afterAdd(offer.pw, { notStored, hold: paired.hold });
  assert.deepEqual(after.passwords, [offeredPw, keptPw, agreedPw], "nothing leaves the browser");
  assert.deepEqual(after.moveSlots, [offeredPw.slot, agreedPw.slot], "agreed + sent-but-not-stored; never the kept college's");
  assert.equal(after.failed, 1, "the kept and the earlier agreed password were never sent, so they didn't fail");
  const written = parseMove(serializeMove({ userId: USER, slots: after.moveSlots }));
  assert.deepEqual(written, { userId: USER, slots: [offeredPw.slot, agreedPw.slot] });
  // The copy keeps the kept college (and only it) once the rest is in the account.
  assert.deepEqual(keptCopy(offer.fit.keep).list, [keepEntry]);
  // The next read (the account now has 5 colleges) offers nothing: the kept college doesn't fit, every password waits.
  const next = localOffer(keptCopy(offer.fit.keep), after.passwords, [...account, fitEntry], LIMIT, agreedFor(written, USER));
  assert.equal(next.found, null);
  assert.deepEqual(next.pw.stay, [keptPw]);
});

test(`"Add" with an open vault: the stored password leaves; the earlier agreement and the kept college's password stay`, () => {
  const offer = localOffer(local, passwords, account, LIMIT, agreed);
  const after = afterAdd(offer.pw, { notStored: [], hold: [] });
  assert.deepEqual(after.passwords, [keptPw, agreedPw]);
  assert.deepEqual(after.moveSlots, [agreedPw.slot]);
  assert.equal(after.failed, 0);
});

test(`a password held back for a different username stays, is not agreed, counts as not stored and is offered again`, () => {
  const localWithUc: LocalData = { ...local, profile: { portals: { systems: { uc: { url: "", username: "local-uc" } } } } as LocalData["profile"] };
  const offer = localOffer(localWithUc, passwords, account, LIMIT, agreed);
  const paired = pairWithAccount(offer.pw.offered, { portals: { systems: { uc: { url: "", username: "account-uc" } } }, list: account }, { portals: localWithUc.profile.portals, list: localWithUc.list });
  assert.deepEqual(paired, { send: [], hold: [offeredPw] });
  const after = afterAdd(offer.pw, { notStored: [], hold: paired.hold });
  assert.deepEqual(after.passwords, [offeredPw, keptPw, agreedPw]);
  assert.deepEqual(after.moveSlots, [agreedPw.slot], "held passwords never move on their own");
  assert.equal(after.failed, 1);
  const again = localOffer(keptCopy([keepEntry]), after.passwords, [...account, fitEntry], LIMIT, agreedFor(parseMove(serializeMove({ userId: USER, slots: after.moveSlots })), USER));
  assert.deepEqual(again.pw.offered, [offeredPw]);
  assert.deepEqual(again.found, { colleges: 0, logins: 1, passwords: 1 });
});

test("a kept college's password that was already agreed stays agreed, appears once, and is never offered", () => {
  const both = agreedFor(parseMove(serializeMove({ userId: USER, slots: [agreedPw.slot, keptPw.slot] })), USER);
  const offer = localOffer(local, passwords, account, LIMIT, both);
  assert.deepEqual(offer.pw.offered, [offeredPw]);
  assert.deepEqual(offer.pw.stay, [keptPw]);
  assert.deepEqual(offer.pw.agreed, [agreedPw, keptPw]);
  const added = afterAdd(offer.pw, { notStored: [offeredPw], hold: [] });
  assert.deepEqual(added.passwords, [offeredPw, keptPw, agreedPw]);
  assert.deepEqual(added.moveSlots, [offeredPw.slot, keptPw.slot, agreedPw.slot]);
  assert.deepEqual(afterDiscard(passwords, offer).passwords, [agreedPw, keptPw]);
});
