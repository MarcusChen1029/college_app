import assert from "node:assert/strict";
import { test } from "node:test";
import { DEV_TRACKER_URL, resolveTrackerUrl } from "./tracker-url.mjs";

test("no TRACKER_URL is a dev build that trusts the local tracker", () => {
  assert.equal(resolveTrackerUrl({}), DEV_TRACKER_URL);
  assert.equal(resolveTrackerUrl({ TRACKER_URL: "" }), DEV_TRACKER_URL);
  assert.equal(DEV_TRACKER_URL, "http://localhost:3000");
});

test("a deployed tracker must be a bare https origin", () => {
  assert.equal(resolveTrackerUrl({ TRACKER_URL: "https://www.track-ur-college.com" }), "https://www.track-ur-college.com");
  assert.equal(resolveTrackerUrl({ TRACKER_URL: "https://preview-1.example.vercel.app" }), "https://preview-1.example.vercel.app");
  assert.equal(resolveTrackerUrl({ TRACKER_URL: "https://staging.example.com:8443" }), "https://staging.example.com:8443");
});

test("any other tracker is refused: http, a path, a trailing slash, user:password, another local port", () => {
  for (const url of [
    "http://www.track-ur-college.com",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "https://www.track-ur-college.com/",
    "https://www.track-ur-college.com/extension",
    "https://www.track-ur-college.com?x=1",
    "https://user:pw@www.track-ur-college.com",
    "https://www.track-ur-college.com@evil.example",
    "javascript:alert(1)",
    "www.track-ur-college.com",
  ]) {
    assert.throws(() => resolveTrackerUrl({ TRACKER_URL: url }), /TRACKER_URL must be an https origin/, url);
  }
});
