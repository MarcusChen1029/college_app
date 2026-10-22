// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";
import { cardSideFor, fitWorld, regionGeo } from "./region-geo.ts";
import type { RegionCode } from "./regions.ts";

const samples: Record<RegionCode, { name: string; lat: number; lng: number }[]> = {
  US: [
    { name: "Boston", lat: 42.36, lng: -71.06 },
    { name: "Los Angeles", lat: 34.05, lng: -118.24 },
  ],
  GB: [
    { name: "London", lat: 51.51, lng: -0.13 },
    { name: "Edinburgh", lat: 55.95, lng: -3.19 },
    { name: "Oxford", lat: 51.75, lng: -1.26 },
  ],
  CA: [
    { name: "Toronto", lat: 43.65, lng: -79.38 },
    { name: "Vancouver", lat: 49.28, lng: -123.12 },
    { name: "Halifax", lat: 44.65, lng: -63.57 },
    { name: "Edmonton", lat: 53.55, lng: -113.49 },
  ],
  AU: [
    { name: "Sydney", lat: -33.87, lng: 151.21 },
    { name: "Perth", lat: -31.95, lng: 115.86 },
    { name: "Brisbane", lat: -27.47, lng: 153.03 },
    { name: "Hobart", lat: -42.88, lng: 147.33 },
  ],
};

for (const region of Object.keys(samples) as RegionCode[]) {
  test(`${region}: sample colleges project inside the fitted world box`, () => {
    const g = regionGeo(region);
    assert.ok(g.land.features.length > 0, "has land to draw");
    const projection = fitWorld(g);
    for (const s of samples[region]) {
      const xy = projection([s.lng, s.lat]);
      assert.ok(xy, `${s.name} projects`);
      const [x, y] = xy;
      assert.ok(Number.isFinite(x) && Number.isFinite(y), `${s.name} is finite`);
      assert.ok(Math.abs(x) <= g.halfW && Math.abs(y) <= g.halfD, `${s.name} (${x}, ${y}) inside ±${g.halfW} × ±${g.halfD}`);
    }
  });

  test(`${region}: every sample gets a card side`, () => {
    for (const s of samples[region]) assert.ok(["left", "right"].includes(cardSideFor(region, s.lng)));
  });
}

test("cardSideFor keeps the US rule and puts the card away from the pin", () => {
  assert.equal(cardSideFor("US", -71.06), "left");
  assert.equal(cardSideFor("US", -118.24), "right");
  assert.equal(cardSideFor("GB", -0.13), "left");
  assert.equal(cardSideFor("GB", -3.19), "right");
  assert.equal(cardSideFor("CA", -79.38), "left");
  assert.equal(cardSideFor("CA", -123.12), "right");
  assert.equal(cardSideFor("AU", 151.21), "left");
  assert.equal(cardSideFor("AU", 115.86), "right");
});

test("Canada and Australia are cut into a few pieces, not hundreds of islands", () => {
  for (const code of ["CA", "AU"] as const) {
    const g = regionGeo(code);
    assert.ok(g.land.features.length >= 2 && g.land.features.length <= 14, `${code} has ${g.land.features.length} pieces`);
  }
  assert.ok(regionGeo("CA").context.features.length > 0, "the US is drawn next to Canada for context");
});

test("the US config is the original Albers USA box", () => {
  const g = regionGeo("US");
  assert.equal(g.halfW, 480);
  assert.equal(g.halfD, 300);
  assert.equal(g.land.features.length, 51 + 5); // states + DC + territories in us-atlas states-10m
  assert.equal(regionGeo(), g);
});

test("the UK map has Great Britain as a piece and Ireland only as context", () => {
  const g = regionGeo("GB");
  assert.ok(g.land.features.length > 1, "islands are separate pieces");
  assert.deepEqual(g.context.features.map((f) => f.properties?.name), ["Ireland"]);
});
