// Per-region geography for the college maps (3D and SVG): which land to draw, how to project it, and the
// world-space extent the camera, clouds and colours are sized from. Free of three.js so it can be unit tested.
import { geoAlbersUsa, geoConicConformal, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import statesTopology from "us-atlas/states-10m.json" with { type: "json" };
import countriesTopology from "world-atlas/countries-50m.json" with { type: "json" };
import type { RegionCode } from "./regions";

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

function usGeo(): RegionGeo {
  const topology = statesTopology as unknown as Topology;
  return {
    region: "US",
    // The lower 48 (plus the Alaska/Hawaii insets) span about 960 × 600, centred on the origin.
    halfW: 480,
    halfD: 300,
    projection: () => geoAlbersUsa(),
    land: feature(topology, topology.objects.states as GeometryCollection) as FeatureCollection,
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

// Topology decoding is not free, so each region is built on first use only.
const cache = new Map<RegionCode, RegionGeo>();
export function regionGeo(region: RegionCode = "US"): RegionGeo {
  let g = cache.get(region);
  if (!g) {
    g = region === "GB" ? gbGeo() : usGeo();
    cache.set(region, g);
  }
  return g;
}

/** The region's projection fitted onto its world box (±halfW × ±halfD, centred on the origin). */
export function fitWorld(g: RegionGeo) {
  return g.projection().fitExtent(
    [
      [-g.halfW, -g.halfD],
      [g.halfW, g.halfD],
    ],
    g.land,
  );
}

/** Which side the detail card goes on so it doesn't cover the selected college's pin. */
export function cardSideFor(region: RegionCode, lng: number): "left" | "right" {
  if (region === "GB") return lng > -2 ? "left" : "right";
  return lng > -97 ? "left" : "right";
}
