import assert from "node:assert/strict";
import { test } from "node:test";
import { isBatchBody, isJsonContentType, isOversizedBody, isRejectedMethod, jsonRpcId, MAX_BODY_BYTES } from "./jsonrpc-batch.ts";

const call = (id: number) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "get_college", arguments: { slug: "rice" } } });

test("a JSON array is a batch: rejected", () => {
  assert.equal(isBatchBody(JSON.stringify([call(1), call(2), call(3)])), true);
  assert.equal(isBatchBody(JSON.stringify([call(1)])), true);
  assert.equal(isBatchBody(JSON.stringify(Array.from({ length: 100 }, (_, i) => call(i + 1)))), true);
});

test("an empty array and an array with leading whitespace are still batches", () => {
  assert.equal(isBatchBody("[]"), true);
  assert.equal(isBatchBody('  \n\t [ {"jsonrpc":"2.0","id":1,"method":"tools/list"} ]'), true);
});

test("a single JSON-RPC object is allowed", () => {
  assert.equal(isBatchBody(JSON.stringify(call(1))), false);
  assert.equal(isBatchBody('{"jsonrpc":"2.0","id":1,"method":"tools/list"}'), false);
  assert.equal(isBatchBody("{}"), false);
});

test("an object that merely contains an array is not a batch", () => {
  assert.equal(isBatchBody('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"arguments":{"list":[1,2,3]}}}'), false);
  assert.equal(isBatchBody('{"batch":[1,2]}'), false);
});

test("text that is not JSON is allowed through (the MCP handler answers with its own parse error)", () => {
  assert.equal(isBatchBody(""), false);
  assert.equal(isBatchBody("not json"), false);
  assert.equal(isBatchBody('[{"jsonrpc":"2.0","id":1,"method":'), false);
  assert.equal(isBatchBody("[1, 2,"), false);
});

test("JSON that is not an object or array is allowed through", () => {
  for (const text of ["null", "5", '"x"', "true"]) assert.equal(isBatchBody(text), false);
});

test("subscriptions/listen opens a stream that never answers: rejected", () => {
  assert.equal(isRejectedMethod('{"jsonrpc":"2.0","id":1,"method":"subscriptions/listen","params":{}}'), true);
  assert.equal(isRejectedMethod('  {"method":"subscriptions/listen"}'), true);
  // A notification (no id) is rejected too: the method itself is the problem.
  assert.equal(isRejectedMethod('{"jsonrpc":"2.0","method":"subscriptions/listen"}'), true);
});

test("the methods this connector serves are not rejected", () => {
  for (const method of ["initialize", "tools/list", "tools/call", "prompts/list", "ping", "notifications/initialized"]) {
    assert.equal(isRejectedMethod(JSON.stringify({ jsonrpc: "2.0", id: 1, method })), false, method);
  }
});

test("only the top-level method counts: a tool argument that mentions subscriptions/listen is fine", () => {
  assert.equal(isRejectedMethod(JSON.stringify(call(1))), false);
  const arg = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_colleges", arguments: { query: "subscriptions/listen" } } };
  assert.equal(isRejectedMethod(JSON.stringify(arg)), false);
  assert.equal(isRejectedMethod(JSON.stringify({ jsonrpc: "2.0", id: 1, params: { method: "subscriptions/listen" } })), false);
});

test("bodies that are not a single JSON-RPC object are not 'rejected methods' (batches and parse errors have their own answers)", () => {
  for (const text of ["", "not json", "[]", '[{"method":"subscriptions/listen"}]', "null", "5", '"subscriptions/listen"', "{}", '{"method":5}']) {
    assert.equal(isRejectedMethod(text), false, text);
  }
});

test("a body over the size cap is oversized; the cap is read from content-length", () => {
  assert.equal(MAX_BODY_BYTES, 4 * 1024 * 1024);
  assert.equal(isOversizedBody(String(MAX_BODY_BYTES + 1)), true);
  assert.equal(isOversizedBody(String(MAX_BODY_BYTES)), false);
  assert.equal(isOversizedBody("1024"), false);
  assert.equal(isOversizedBody("0"), false);
});

test("a missing or unreadable content-length is not oversized (the body is read after the type check)", () => {
  assert.equal(isOversizedBody(null), false);
  assert.equal(isOversizedBody(undefined), false);
  assert.equal(isOversizedBody(""), false);
  assert.equal(isOversizedBody("abc"), false);
  assert.equal(isOversizedBody("-5"), false);
});

test("application/json with or without parameters is JSON; anything else is left to the SDK", () => {
  for (const type of ["application/json", "application/json; charset=utf-8", "Application/JSON", " application/json ;charset=utf-8"]) {
    assert.equal(isJsonContentType(type), true, type);
  }
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "application/jsonp", "application/vnd.api+json", "", null, undefined]) {
    assert.equal(isJsonContentType(type), false, String(type));
  }
});

test("jsonRpcId echoes a string or number id and is null for everything else", () => {
  assert.equal(jsonRpcId('{"jsonrpc":"2.0","id":7,"method":"subscriptions/listen"}'), 7);
  assert.equal(jsonRpcId('{"id":"abc","method":"x"}'), "abc");
  assert.equal(jsonRpcId('{"jsonrpc":"2.0","method":"subscriptions/listen"}'), null, "a notification has no id");
  assert.equal(jsonRpcId('{"id":{"a":1}}'), null);
  assert.equal(jsonRpcId("[1]"), null);
  assert.equal(jsonRpcId("not json"), null);
});
