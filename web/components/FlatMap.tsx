"use client";

import { geoPath, type GeoProjection } from "d3-geo";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { fitWorldAsync, regionGeoAsync } from "@/lib/region-geo";
import type { RegionCode } from "@/lib/regions";
import { breathe } from "@/lib/yield-to-main";
import { dotPx, HIT_PX, INK, type MapDot } from "./map-dots";

// The land in world units (the box the 3D map is fitted to), as SVG path data. It is worked out once per region, in slices of
// a few milliseconds with the main thread given back between them, and drawn at any size by a transform: a resize costs nothing.
type FlatGeo = { projection: GeoProjection; halfW: number; halfD: number; land: { id: string; d: string }[]; context: { id: string; d: string }[] };
const flatCache = new Map<RegionCode, FlatGeo>();
const flatPending = new Map<RegionCode, Promise<FlatGeo>>();
const SLICE_MS = 5;

function loadFlatGeo(region: RegionCode): Promise<FlatGeo> {
  const done = flatCache.get(region);
  if (done) return Promise.resolve(done);
  let p = flatPending.get(region);
  if (!p) {
    p = (async () => {
      await breathe();
      const g = await regionGeoAsync(region);
      await breathe();
      const projection = await fitWorldAsync(g);
      await breathe();
      // One decimal of a world unit (a tenth of a pixel or less) halves the path data the browser has to lay out.
      const path = geoPath(projection).digits(1);
      let sliceStart = performance.now();
      const toPaths = async (features: typeof g.land.features) => {
        const out: { id: string; d: string }[] = [];
        for (const f of features) {
          out.push({ id: String(f.id), d: path(f) ?? "" });
          if (performance.now() - sliceStart > SLICE_MS) {
            await breathe();
            sliceStart = performance.now();
          }
        }
        return out;
      };
      const land = await toPaths(g.land.features);
      const context = await toPaths(g.context.features);
      const geo: FlatGeo = { projection, halfW: g.halfW, halfD: g.halfD, land, context };
      flatCache.set(region, geo);
      flatPending.delete(region);
      return geo;
    })();
    flatPending.set(region, p);
  }
  return p;
}

/** Without WebGL, or while the 3D map's chunk is not there: the same dots on a flat SVG map. A click on a dot selects its college
 *  and its name shows on hover; the list beside the map stays the keyboard route. */
export function FlatMap({ region, pins, selected, onSelect, children }: { region: RegionCode; pins: MapDot[]; selected: string | null; onSelect: (slug: string | null) => void; children?: React.ReactNode }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  // Unknown until the box has been measured.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [loaded, setLoaded] = useState<{ region: RegionCode; geo: FlatGeo } | null>(() => {
    const geo = flatCache.get(region);
    return geo ? { region, geo } : null;
  });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (w > 0 && h > 0) setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    let live = true;
    void loadFlatGeo(region).then((geo) => {
      if (live) setLoaded({ region, geo });
    });
    return () => {
      live = false;
    };
  }, [region]);

  const geo = loaded && loaded.region === region ? loaded.geo : null;
  // World units to pixels: the land fills the box with 24px around it, centred.
  const view = useMemo(() => {
    if (!geo || !size) return null;
    const s = Math.min((size.w - 48) / (2 * geo.halfW), (size.h - 48) / (2 * geo.halfD));
    return { s, cx: size.w / 2, cy: size.h / 2 };
  }, [geo, size]);
  const dots = useMemo(
    () =>
      !geo || !view
        ? []
        : pins
            .flatMap((p) => {
              if (p.lat == null || p.lng == null) return [];
              const xy = geo.projection([p.lng, p.lat]);
              return xy ? [{ ...p, x: view.cx + xy[0] * view.s, y: view.cy + xy[1] * view.s }] : [];
            })
            .sort((a, b) => Number(a.slug === selected) - Number(b.slug === selected) || dotPx(a.tier) - dotPx(b.tier)),
    [pins, geo, view, selected],
  );
  const sel = dots.find((p) => p.slug === selected);
  // Nearest wins, as on the WebGL map: one handler finds the dot whose centre is closest to the pointer (within HIT_PX), so a
  // small dot next to a large one is still the one you get.
  const nearest = (e: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let best: (typeof dots)[number] | null = null;
    let bestD = HIT_PX * HIT_PX;
    for (const p of dots) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  };
  return (
    <div ref={box} className="map-sky relative h-full w-full overflow-hidden">
      {geo && view && size && (
        <svg
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          role="group"
          aria-label={t(`colleges.mapLabel.${region}` as MessageKey)}
          className="absolute inset-0 block h-full w-full"
          onClick={(e) => onSelect(nearest(e)?.slug ?? null)}
          onPointerMove={(e) => (e.currentTarget.style.cursor = nearest(e) ? "pointer" : "default")}
        >
          <g transform={`translate(${view.cx} ${view.cy}) scale(${view.s})`}>
            {geo.context.map((s) => (
              <path key={s.id} d={s.d} fill="#eef3f7" stroke="#d5e6f0" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
            {geo.land.map((s) => (
              <path key={s.id} d={s.d} fill="#ffffff" stroke="#b7e3fb" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          {dots.map((p) => {
            const on = p.slug === selected;
            const r = dotPx(p.tier) / 2 - 1;
            return (
              <g key={p.slug} transform={`translate(${p.x} ${p.y})`}>
                <title>{p.note ? `${p.name} · ${p.note}` : p.name}</title>
                {p.tone.ring && !on ? (
                  <circle r={r - 1} fill="#ffffff" style={{ stroke: `var(${p.tone.token}, ${p.tone.hex})` }} strokeWidth={2.5} />
                ) : (
                  <circle r={on ? r + 3 : r} style={{ fill: `var(${p.tone.token}, ${p.tone.hex})` }} stroke={on ? INK : "#ffffff"} strokeWidth={2} />
                )}
              </g>
            );
          })}
        </svg>
      )}
      {sel && (
        <span
          className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-[13px] font-semibold text-white"
          style={{ transform: `translate(${sel.x}px, ${sel.y - 14}px) translate(-50%, -100%)` }}
        >
          {sel.name}
        </span>
      )}
      {children}
    </div>
  );
}
