import assert from "node:assert/strict";
import { test } from "node:test";
import type { FeatureCollection } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import statesTopology from "us-atlas/states-10m.json" with { type: "json" };
import { fitWorld, fitWorldAsync, regionGeo, regionGeoAsync } from "./region-geo.ts";

// The sliced versions (used so the map's construction never runs as one long task) must give exactly what the one-shot ones give.

test("regionGeoAsync builds the same US land as the one-shot conversion, in the same order", async () => {
  const topology = statesTopology as unknown as Topology;
  const once = feature(topology, topology.objects.states as GeometryCollection) as FeatureCollection;
  const sliced = (await regionGeoAsync("US")).land;
  assert.equal(sliced.features.length, once.features.length);
  assert.deepEqual(
    sliced.features.map((f) => f.id),
    once.features.map((f) => f.id),
  );
  assert.equal(JSON.stringify(sliced), JSON.stringify(once));
  assert.equal(regionGeo("US"), await regionGeoAsync("US"), "the async result is the cached one");
});

test("fitWorldAsync fits every region exactly as d3's fitExtent does", async () => {
  for (const region of ["US", "GB", "CA", "AU"] as const) {
    const g = regionGeo(region);
    const byD3 = g.projection().fitExtent(
      [
        [-g.halfW, -g.halfD],
        [g.halfW, g.halfD],
      ],
      g.land,
    );
    const sliced = await fitWorldAsync(g);
    assert.ok(Math.abs(sliced.scale() - byD3.scale()) < 1e-9, `${region} scale ${sliced.scale()} vs ${byD3.scale()}`);
    const [sx, sy] = sliced.translate();
    const [dx, dy] = byD3.translate();
    assert.ok(Math.abs(sx - dx) < 1e-9 && Math.abs(sy - dy) < 1e-9, `${region} translate [${sx}, ${sy}] vs [${dx}, ${dy}]`);
    // and where it puts places
    const places: [number, number][] = { US: [[-87.6, 41.9], [-122.4, 37.8], [-80.2, 25.8]], GB: [[-0.1, 51.5], [-3.2, 55.9]], CA: [[-79.4, 43.7], [-123.1, 49.3]], AU: [[151.2, -33.9], [144.9, -37.8]] }[region] as [number, number][];
    for (const p of places) {
      const a = sliced(p);
      const b = byD3(p);
      assert.ok(a && b && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9, `${region} ${p}`);
    }
    assert.equal(fitWorld(g), sliced, "fitWorld() returns the cached projection");
  }
});
