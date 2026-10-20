// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";
import { angleDelta, flight, overviewDistance, rigPosition, type Rig } from "./map-camera.ts";

const base: Rig = { tx: 0, ty: 0, tz: 0, dist: 1000, polar: 0.8, az: 0, ax: 0.5, ay: 0.5 };
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("angleDelta takes the short way round", () => {
  close(angleDelta(0.1, -0.1), -0.2);
  close(angleDelta(3, -3), 2 * Math.PI - 6);
  close(angleDelta(-3, 3), -(2 * Math.PI - 6));
});

test("a flight starts and ends exactly on its rigs", () => {
  const to: Rig = { tx: 300, ty: 6, tz: -120, dist: 380, polar: 1, az: -0.2, ax: 0.3, ay: 0.5 };
  const f = flight(base, to);
  assert.deepEqual(f.at(0), base);
  const end = f.at(1);
  for (const k of Object.keys(to) as (keyof Rig)[]) close(end[k], to[k]);
});

test("short hops do not zoom out, long ones rise above both ends", () => {
  const a = { ...base, dist: 380 };
  const near = flight(a, { ...a, tx: 20 });
  assert.ok(near.at(0.5).dist <= 380 + 1e-9);
  const far = flight(a, { ...a, tx: 800 });
  assert.ok(far.at(0.5).dist > 700);
  assert.ok(far.duration > near.duration);
});

test("overview distance grows on narrow screens", () => {
  assert.ok(overviewDistance(0.6, 32, 0.8) > overviewDistance(1.8, 32, 0.8));
});

test("rigPosition puts the camera straight above at polar 0", () => {
  const [x, y, z] = rigPosition({ ...base, polar: 0, tx: 5, tz: 7 });
  close(x, 5);
  close(y, 1000);
  close(z, 7);
});
