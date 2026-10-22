"use client";

import { geoContains, geoPath } from "d3-geo";
import { interpolateZoom } from "d3-interpolate";
import { useEffect, useMemo, useRef, useState } from "react";
import { regionGeo } from "@/lib/region-geo";
import type { RegionCode } from "@/lib/regions";
import type { TierCode } from "@/lib/types";

const ZOOM = 3.2;
const PAD = 18;

export const TIER_FILL: Record<TierCode, string> = {
  S: "#7c3aed",
  A: "#0b86c6",
  B: "#0d9488",
  C: "#f59e0b",
  D: "#64748b",
};

export type MapPin = { slug: string; name: string; lat: number | null; lng: number | null; tier: TierCode | null };

type Cam = { cx: number; cy: number; w: number; ax: number; ay: number };

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// A teardrop whose tip sits at (0,0), so the pin "stands" on the college's location.
const PIN = "M0 0C-3-9-11-13-11-22a11 11 0 1 1 22 0C11-13 3-9 0 0Z";

const CLOUDS = [
  { top: "12%", w: 220, dur: 90, delay: -20 },
  { top: "58%", w: 300, dur: 120, delay: -70 },
  { top: "80%", w: 180, dur: 100, delay: -40 },
];

export function USMap({
  pins,
  selected,
  onSelect,
  cardSide,
  region = "US",
  children,
}: {
  pins: MapPin[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
  /** Which side of the map the detail card sits on; the camera keeps the pin clear of it. */
  cardSide: "left" | "right";
  /** Which country to draw (default the US). */
  region?: RegionCode;
  children?: React.ReactNode;
}) {
  const g = regionGeo(region);
  const box = useRef<HTMLDivElement>(null);
  const group = useRef<SVGGElement>(null);
  const cam = useRef<Cam | null>(null);
  const lastKey = useRef<string>("");
  const [size, setSize] = useState({ w: 960, h: 600 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (w > 0 && h > 0) setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const geo = useMemo(() => {
    const projection = g.projection().fitExtent(
      [
        [PAD, PAD],
        [w - PAD, h - PAD],
      ],
      g.land,
    );
    const path = geoPath(projection);
    return {
      projection,
      paths: g.land.features.map((f) => ({ id: String(f.id), d: path(f) ?? "" })),
      // Neighbouring land (Ireland beside the UK) is drawn faintly for context only.
      context: g.context.features.map((f) => ({ id: String(f.id), d: path(f) ?? "" })),
    };
  }, [g, w, h]);

  const placed = useMemo(
    () =>
      pins.flatMap((p, i) => {
        if (p.lat == null || p.lng == null) return [];
        const xy = geo.projection([p.lng, p.lat]);
        return xy ? [{ ...p, x: xy[0], y: xy[1], i }] : [];
      }),
    [pins, geo],
  );

  const focus = placed.find((p) => p.slug === selected) ?? null;
  const focusState = useMemo(() => {
    if (!focus || focus.lng == null || focus.lat == null) return null;
    const pt: [number, number] = [focus.lng, focus.lat];
    return g.land.features.find((f) => geoContains(f, pt))?.id?.toString() ?? null;
  }, [g, focus]);

  // Camera: fly between views on the van Wijk smooth-zoom path (zoom out, glide, zoom in).
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    // Below the lg breakpoint the detail card is a bottom sheet, so the pin rides in the upper part of the map.
    const sheet = !window.matchMedia("(min-width: 1024px)").matches;
    const target: Cam = focus
      ? { cx: focus.x, cy: focus.y, w: w / ZOOM, ax: sheet ? 0.5 : cardSide === "right" ? 0.3 : 0.7, ay: sheet ? 0.24 : 0.5 }
      : { cx: w / 2, cy: h / 2, w, ax: 0.5, ay: 0.5 };
    const apply = (c: Cam) => {
      const k = w / c.w;
      g.style.transform = `translate(${c.ax * w - k * c.cx}px, ${c.ay * h - k * c.cy}px) scale(${k})`;
      g.style.setProperty("--k", String(k));
    };
    const key = `${w}x${h}`;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = cam.current;
    if (!from || reduced || key !== lastKey.current) {
      lastKey.current = key;
      cam.current = target;
      apply(target);
      return;
    }
    const zoom = interpolateZoom([from.cx, from.cy, from.w], [target.cx, target.cy, target.w]);
    const dur = Math.min(1700, Math.max(750, zoom.duration));
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = easeInOut(t);
      const [cx, cy, cw] = zoom(e);
      const next = { cx, cy, w: cw, ax: from.ax + (target.ax - from.ax) * e, ay: from.ay + (target.ay - from.ay) * e };
      cam.current = next;
      apply(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [focus, cardSide, w, h]);

  // Selected pin is drawn last so it sits on top of its neighbours.
  const ordered = [...placed].sort((a, b) => Number(a.slug === selected) - Number(b.slug === selected));

  return (
    <div
      ref={box}
      className="relative h-full min-h-[420px] w-full overflow-hidden rounded-3xl border-2 border-blue-100 bg-gradient-to-br from-blue-100 via-blue-50 to-white"
      style={{ backgroundImage: "radial-gradient(#b7e3fb 1.2px, transparent 1.2px)", backgroundSize: "24px 24px" }}
    >
      {CLOUDS.map((c, i) => (
        <span
          key={i}
          aria-hidden
          className="cloud pointer-events-none absolute left-0 rounded-full bg-white/70 blur-xl"
          style={{ top: c.top, width: c.w, height: c.w / 3, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
        />
      ))}

      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="group" aria-label={g.ariaLabel} className="absolute inset-0 block h-full w-full">
        <rect width={w} height={h} fill="transparent" onClick={() => onSelect(null)} />
        <g ref={group} style={{ transformOrigin: "0 0" }}>
          {geo.context.map((s) => (
            <path
              key={s.id}
              d={s.d}
              fill="#f1f6fa"
              stroke="#d5e6f0"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              onClick={() => onSelect(null)}
            />
          ))}
          {geo.paths.map((s) => (
            <path
              key={s.id}
              d={s.d}
              fill={s.id === focusState ? "#cdeafc" : "#ffffff"}
              stroke="#8ccdf0"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              style={{ transition: "fill 500ms ease" }}
              onClick={() => onSelect(null)}
            />
          ))}
          {ordered.map((p) => {
            const isSel = p.slug === selected;
            const fill = TIER_FILL[p.tier ?? "D"];
            const labelW = p.name.length * 7.4 + 18;
            return (
              <g
                key={p.slug}
                className="pin-hit"
                role="button"
                tabIndex={0}
                aria-label={p.name}
                aria-pressed={isSel}
                style={{ transform: `translate(${p.x}px, ${p.y}px) scale(calc(1 / var(--k, 1)))`, cursor: "pointer", outline: "none" }}
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
                  <>
                    <circle className="pin-ripple" r={16} fill="none" stroke={fill} strokeWidth={2.5} />
                    <circle className="pin-ripple" r={16} fill="none" stroke={fill} strokeWidth={2.5} style={{ animationDelay: "-1.1s" }} />
                  </>
                )}
                <ellipse rx={7} ry={2.6} fill="#12304a" opacity={0.2} />
                <g className="pin-drop" style={{ animationDelay: `${p.i * 80}ms` }}>
                  <g className={isSel ? "pin-bounce" : undefined}>
                    <g className="pin-inner" style={{ transform: isSel ? "scale(1.35)" : undefined }}>
                      <path d={PIN} fill={fill} stroke="#ffffff" strokeWidth={2} strokeLinejoin="round" />
                      <text y={-18} textAnchor="middle" fontSize={12} fontWeight={800} fill="#ffffff" pointerEvents="none">
                        {p.tier ?? ""}
                      </text>
                    </g>
                  </g>
                </g>
                <g className={isSel ? undefined : "pin-label"} style={{ pointerEvents: "none", opacity: isSel ? 1 : undefined }} transform={`translate(0 ${isSel ? -52 : -42})`}>
                  <rect x={-labelW / 2} y={-14} width={labelW} height={22} rx={11} fill="#12304a" />
                  <text y={1} textAnchor="middle" fontSize={12} fontWeight={600} fill="#ffffff">
                    {p.name}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
      {children}
    </div>
  );
}
