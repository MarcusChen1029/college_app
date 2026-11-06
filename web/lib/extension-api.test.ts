import assert from "node:assert/strict";
import { test } from "node:test";
import { extensionDenyRedirect, extensionRedirect, extensionTokenArgs } from "./extension-api.ts";

const ID = "abcdefghijklmnopabcdefghijklmnop";
const OK = `https://${ID}.chromiumapp.org/`;

test("extensionRedirect accepts exactly the extension's chromiumapp.org address", () => {
  assert.equal(extensionRedirect(OK, ID, "t"), `${OK}#token=t`);
});

test("extensionRedirect returns null for a missing redirect_uri", () => {
  assert.equal(extensionRedirect(null, ID, "t"), null);
  assert.equal(extensionRedirect(undefined as unknown as null, ID, "t"), null);
});

test("extensionRedirect refuses another extension id, http, a path, or a lookalike host", () => {
  assert.equal(extensionRedirect(`https://${"b".repeat(32)}.chromiumapp.org/`, ID, "t"), null);
  assert.equal(extensionRedirect(`http://${ID}.chromiumapp.org/`, ID, "t"), null);
  assert.equal(extensionRedirect(`https://${ID}.chromiumapp.org/evil`, ID, "t"), null);
  assert.equal(extensionRedirect(`https://${ID}.chromiumapp.org.evil.com/`, ID, "t"), null);
  assert.equal(extensionRedirect(`${OK}?x=1`, ID, "t"), null);
  assert.equal(extensionRedirect(`${OK}#frag`, ID, "t"), null);
});

test("extensionRedirect needs an extension id and a token", () => {
  assert.equal(extensionRedirect(OK, "", "t"), null);
  assert.equal(extensionRedirect(null, "", "t"), null);
  assert.equal(extensionRedirect(OK, ID, ""), null);
});

test("extensionDenyRedirect returns the exact address with an error and no token, or null", () => {
  assert.equal(extensionDenyRedirect(OK, ID), `${OK}#error=access_denied`);
  assert.equal(extensionDenyRedirect(`https://${ID}.chromiumapp.org.evil.com/`, ID), null);
  assert.equal(extensionDenyRedirect(OK, ""), null);
});

test("extensionTokenArgs asks for transcript and activities by default (new tokens), with or without a label", () => {
  assert.deepEqual(extensionTokenArgs(), { p_scopes: ["transcript", "activities"] });
  assert.deepEqual(extensionTokenArgs("Laptop"), { p_label: "Laptop", p_scopes: ["transcript", "activities"] });
  assert.deepEqual(extensionTokenArgs(undefined, ["transcript"]), { p_scopes: ["transcript"] });
});

test("extensionDenyRedirect returns null for a missing redirect_uri", () => {
  assert.equal(extensionDenyRedirect(null, ID), null);
  assert.equal(extensionDenyRedirect(undefined as unknown as null, ID), null);
});
