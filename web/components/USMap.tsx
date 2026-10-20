"use client";

import { geoAlbersUsa, geoPath } from "d3-geo";
import type { FeatureCollection } from "geojson";
import { useMemo } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import statesTopology from "us-atlas/states-10m.json";
import type { TierCode } from "@/lib/types";

const W = 960;
const H = 600;
const ZOOM = 3;

const TIER_FILL: Record<TierCode, string> = {
  S: "#7c3aed",
  A: "#0b86c6",
  B: "#0d9488",
  C: "#f59e0b",
  D: "#64748b",
};

export type MapPin = { slug: string; name: string; lat: number | null; lng: number | null; tier: TierCode | null };

// Projection and state outlines are the same for every render, so build them once.
const topology = statesTopology as unknown as Topology;
const states = feature(topology, topology.objects.states as GeometryCollection) as FeatureCollection;
const projection = geoAlbersUsa().fitSize([W, H], states);
const statePaths = states.features.map((f) => ({ id: String(f.id), d: geoPath(projection)(f) ?? "" }));

export function USMap({ pins, selected, onSelect }: { pins: MapPin[]; selected: string | null; onSelect: (slug: string | null) => void }) {
  const placed = useMemo(
    () =>
      pins.flatMap((p) => {
        if (p.lat == null || p.lng == null) return [];
        const xy = projection([p.lng, p.lat]);
        return xy ? [{ ...p, x: xy[0], y: xy[1] }] : [];
      }),
    [pins],
  );

  const focus = placed.find((p) => p.slug === selected);
  const k = focus ? ZOOM : 1;
  const tx = focus ? W / 2 - ZOOM * focus.x : 0;
  const ty = focus ? H / 2 - ZOOM * focus.y : 0;

  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-blue-100 bg-blue-50">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Map of the United States with college locations" className="block h-auto w-full">
        <rect width={W} height={H} fill="transparent" onClick={() => onSelect(null)} />
        <g style={{ transform: `translate(${tx}px, ${ty}px) scale(${k})`, transformOrigin: "0 0", transition: "transform 700ms cubic-bezier(.2,.8,.2,1)" }}>
          {statePaths.map((s) => (
            <path key={s.id} d={s.d} fill="#ffffff" stroke="#b7e3fb" strokeWidth={1 / k} strokeLinejoin="round" onClick={() => onSelect(null)} />
          ))}
          {placed.map((p) => {
            const isSel = p.slug === selected;
            const r = (isSel ? 9 : 6) / k;
            return (
              <g
                key={p.slug}
                role="button"
                tabIndex={0}
                aria-label={p.name}
                aria-pressed={isSel}
                className="cursor-pointer outline-none [&:focus-visible>circle:last-of-type]:stroke-[#12304a]"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(p.slug);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(p.slug);
                  }
                }}
              >
                {isSel && (
                  <circle cx={p.x} cy={p.y} r={r * 2.4} fill={TIER_FILL[p.tier ?? "D"]} opacity={0.25}>
                    <animate attributeName="r" values={`${r * 1.6};${r * 3};${r * 1.6}`} dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={p.x} cy={p.y} r={r} fill={TIER_FILL[p.tier ?? "D"]} stroke="#ffffff" strokeWidth={2 / k} />
                {isSel && (
                  <text x={p.x} y={p.y - r * 2} textAnchor="middle" fontSize={15 / k} fontWeight={700} fill="#12304a" stroke="#ffffff" strokeWidth={4 / k} paintOrder="stroke">
                    {p.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {focus && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="absolute right-3 top-3 rounded-full bg-white px-3 py-1.5 text-xs font-semibold shadow hover:bg-blue-50"
        >
          Show whole map
        </button>
      )}
    </div>
  );
}
