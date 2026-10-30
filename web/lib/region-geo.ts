// Per-region geography for the college maps (3D and SVG): which land to draw, how to project it, and the
// world-space extent the camera and colours are sized from. Free of three.js so it can be unit tested.
import { geoAlbersUsa, geoArea, geoCentroid, geoConicConformal, geoPath, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import statesTopology from "us-atlas/states-10m.json" with { type: "json" };
import countriesTopology from "world-atlas/countries-50m.json" with { type: "json" };
import type { RegionCode } from "./regions";
import { breathe } from "./yield-to-main.ts";

export type RegionGeo = {
  region: RegionCode;
  /** Half-size of the box the land is fitted into, in world units (x across, z/y down the map). */
  halfW: number;
  halfD: number;
  /** A fresh, unfitted projection; fit it with fitWorld() or your own extent. */
  projection: () => GeoProjection;
  /** Pieces that are extruded, hovered and lifted (US states; UK islands). The projection is fitted to these. */
  land: FeatureCollection;
  /** Neighbouring land drawn muted for context, never selectable (Ireland next to the UK). */
  context: FeatureCollection;
  /** Land top colours from west to east. */
  bands: readonly [string, string, string];
  ariaLabel: string;
};

const collection = (features: Feature[]): FeatureCollection => ({ type: "FeatureCollection", features });

function usGeo(builtLand?: FeatureCollection): RegionGeo {
  const topology = statesTopology as unknown as Topology;
  return {
    region: "US",
    // The lower 48 (plus the Alaska/Hawaii insets) span about 960 × 600, centred on the origin.
    halfW: 480,
    halfD: 300,
    projection: () => geoAlbersUsa(),
    land: builtLand ?? (feature(topology, topology.objects.states as GeometryCollection) as FeatureCollection),
    context: collection([]),
    // Mint in the west through sky blue to lilac in the east.
    bands: ["#c9f2df", "#d3ecfd", "#e2d9ff"],
    ariaLabel: "Map of the United States with college locations",
  };
}

function gbGeo(): RegionGeo {
  const topology = countriesTopology as unknown as Topology;
  const countries = (feature(topology, topology.objects.countries as GeometryCollection) as FeatureCollection).features;
  const named = (name: string) => countries.find((f) => f.properties?.name === name);
  const uk = named("United Kingdom");
  const ireland = named("Ireland");
  // world-atlas has no nations, so each island (Great Britain, Northern Ireland's part of Ireland, Shetland, …)
  // becomes its own piece; that keeps the puzzle-piece look and lets the island holding a college lift.
  const islands: Feature[] =
    uk?.geometry.type === "MultiPolygon"
      ? (uk.geometry as MultiPolygon).coordinates.map((coordinates, i) => ({
          type: "Feature",
          id: `GB-${i}`,
          properties: {},
          geometry: { type: "Polygon", coordinates },
        }))
      : uk
        ? [uk]
        : [];
  return {
    region: "GB",
    // The UK is tall and narrow: a portrait box with about the same overview distance as the US.
    halfW: 260,
    halfD: 420,
    // North-up Lambert conformal conic on the UK's central meridian (2°W).
    projection: () => geoConicConformal().parallels([50, 58]).rotate([2, 0]),
    land: collection(islands),
    context: collection(ireland ? [{ ...ireland, id: "IE" }] : []),
    bands: ["#c9f2df", "#d3ecfd", "#e2d9ff"],
    ariaLabel: "Map of the United Kingdom with college locations",
  };
}

// world-atlas has countries but no provinces or states, so a country made of many islands is cut into its
// `biggest` largest polygons (each its own piece, so the one holding a college can lift) plus one piece
// holding every smaller island. Keeps the puzzle-piece look without hundreds of Arctic specks.
function pieces(country: Feature | undefined, id: string, biggest: number): Feature[] {
  if (!country) return [];
  if (country.geometry.type !== "MultiPolygon") return [{ ...country, id }];
  const polys = (country.geometry as MultiPolygon).coordinates
    .map((coordinates) => ({ coordinates, area: geoArea({ type: "Polygon", coordinates }) }))
    .sort((a, b) => b.area - a.area);
  const out: Feature[] = polys.slice(0, biggest).map((p, i) => ({
    type: "Feature",
    id: `${id}-${i}`,
    properties: {},
    geometry: { type: "Polygon", coordinates: p.coordinates },
  }));
  const rest = polys.slice(biggest);
  if (rest.length) out.push({ type: "Feature", id: `${id}-rest`, properties: {}, geometry: { type: "MultiPolygon", coordinates: rest.map((p) => p.coordinates) } });
  return out;
}

const countryFeatures = () => {
  const topology = countriesTopology as unknown as Topology;
  return (feature(topology, topology.objects.countries as GeometryCollection) as FeatureCollection).features;
};

function caGeo(): RegionGeo {
  const countries = countryFeatures();
  const named = (name: string) => countries.find((f) => f.properties?.name === name);
  // The US next to Canada for context: the lower 48 and Alaska, without Hawaii and the Pacific/Caribbean territories.
  const us = named("United States of America");
  const usNeighbours: Feature[] =
    us?.geometry.type === "MultiPolygon"
      ? (us.geometry as MultiPolygon).coordinates
          .filter((c) => {
            const [lng, lat] = geoCentroid({ type: "Polygon", coordinates: c });
            return lat > 24 && lat < 72 && lng > -170 && lng < -60;
          })
          .map((coordinates, i) => ({ type: "Feature", id: `US-${i}`, properties: {}, geometry: { type: "Polygon", coordinates } }))
      : [];
  return {
    region: "CA",
    // Wider than tall once the Arctic islands are included.
    halfW: 480,
    halfD: 380,
    // Lambert conformal conic on 96°W with Statistics Canada's standard parallels (49°N, 77°N).
    projection: () => geoConicConformal().parallels([49, 77]).rotate([96, 0]),
    land: collection(pieces(named("Canada"), "CA", 12)),
    context: collection(usNeighbours),
    bands: ["#c9f2df", "#d3ecfd", "#e2d9ff"],
    ariaLabel: "Map of Canada with college locations",
  };
}

function auGeo(): RegionGeo {
  const au = countryFeatures().find((f) => f.properties?.name === "Australia");
  return {
    region: "AU",
    halfW: 480,
    halfD: 380,
    // Lambert conformal conic on 134°E with Geoscience Australia's standard parallels (18°S, 36°S).
    projection: () => geoConicConformal().parallels([-36, -18]).rotate([-134, 0]),
    // The mainland and Tasmania are pieces; every smaller island shares one.
    land: collection(pieces(au, "AU", 2)),
    context: collection([]),
    bands: ["#c9f2df", "#d3ecfd", "#e2d9ff"],
    ariaLabel: "Map of Australia with college locations",
  };
}

// Topology decoding is not free, so each region is built on first use only.
const builders: Record<RegionCode, () => RegionGeo> = { US: usGeo, GB: gbGeo, CA: caGeo, AU: auGeo };
const cache = new Map<RegionCode, RegionGeo>();
export function regionGeo(region: RegionCode = "US"): RegionGeo {
  let g = cache.get(region);
  if (!g) {
    g = builders[region]();
    cache.set(region, g);
  }
  return g;
}

// Fitting streams every point of the land through the projection (about 30 ms for the US), so it is done once per region and
// shared by the flat map and the 3D map. Neither changes the projection, only reads it.
const fitted = new WeakMap<RegionGeo, GeoProjection>();

/** The region's projection fitted onto its world box (±halfW × ±halfD, centred on the origin). Cached: do not modify it. */
export function fitWorld(g: RegionGeo): GeoProjection {
  let p = fitted.get(g);
  if (!p) {
    p = g.projection().fitExtent(
      [
        [-g.halfW, -g.halfD],
        [g.halfW, g.halfD],
      ],
      g.land,
    );
    fitted.set(g, p);
  }
  return p;
}

/**
 * regionGeo(), without the long task: the US states are converted from the topology four at a time, with the main thread given back
 * between slices. Other regions come from regionGeo() as before (they are only built when someone switches to them).
 */
export async function regionGeoAsync(region: RegionCode = "US"): Promise<RegionGeo> {
  const done = cache.get(region);
  if (done) return done;
  if (region !== "US") return regionGeo(region);
  const topology = statesTopology as unknown as Topology;
  const states = topology.objects.states as GeometryCollection;
  const features: Feature[] = [];
  let sliceStart = performance.now();
  for (let i = 0; i < states.geometries.length; i += 4) {
    const part = feature(topology, { ...states, geometries: states.geometries.slice(i, i + 4) } as GeometryCollection) as FeatureCollection;
    features.push(...part.features);
    if (performance.now() - sliceStart > 6) {
      await breathe();
      sliceStart = performance.now();
    }
  }
  const g = cache.get(region) ?? usGeo(collection(features)); // a plain regionGeo() may have got there first while this was yielding
  cache.set(region, g);
  return g;
}

/**
 * fitWorld() in slices: the same fit (d3's fitExtent, whose arithmetic this repeats), with the land's bounds gathered a few
 * features at a time and the main thread given back between them. The result is cached and shared with fitWorld().
 */
export async function fitWorldAsync(g: RegionGeo): Promise<GeoProjection> {
  const done = fitted.get(g);
  if (done) return done;
  const p = g.projection();
  const clip = p.clipExtent?.();
  p.scale(150).translate([0, 0]);
  if (clip != null) p.clipExtent(null);
  const path = geoPath(p);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let sliceStart = performance.now();
  for (const f of g.land.features) {
    const [[ax, ay], [bx, by]] = path.bounds(f);
    x0 = Math.min(x0, ax);
    y0 = Math.min(y0, ay);
    x1 = Math.max(x1, bx);
    y1 = Math.max(y1, by);
    if (performance.now() - sliceStart > 6) {
      await breathe();
      sliceStart = performance.now();
    }
  }
  const w = 2 * g.halfW;
  const h = 2 * g.halfD;
  const k = Math.min(w / (x1 - x0), h / (y1 - y0));
  p.scale(150 * k).translate([-g.halfW + (w - k * (x1 + x0)) / 2, -g.halfD + (h - k * (y1 + y0)) / 2]);
  if (clip != null) p.clipExtent(clip);
  const again = fitted.get(g); // a plain fitWorld() may have got there first while this was yielding
  if (again) return again;
  fitted.set(g, p);
  return p;
}

/** Which side the detail card goes on so it doesn't cover the selected college's pin. */
export function cardSideFor(region: RegionCode, lng: number): "left" | "right" {
  // Left when the pin is east of the map's centre line, so the card sits on the empty side.
  const centre = { US: -97, GB: -2, CA: -96, AU: 134 }[region];
  return lng > centre ? "left" : "right";
}
