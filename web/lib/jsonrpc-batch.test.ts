import assert from "node:assert/strict";
import { test } from "node:test";
import { isBatchBody } from "./jsonrpc-batch.ts";

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
