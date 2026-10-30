// What the 3D map (USMap3D.tsx) and the flat SVG map (FlatMap.tsx) share. No three.js here: the flat map must stay loadable
// when the 3D chunk is not.
import type { TierCode } from "@/lib/types";

/** A college's place on the map. */
export type MapPin = { slug: string; name: string; lat: number | null; lng: number | null; tier: TierCode | null };

/** A dot colour: a CSS colour token (lib/ui.ts TIER_DOT / FIT_DOT_COLOR) and the hex used until the stylesheet has it; `ring` draws it hollow. */
export type DotTone = { token: string; hex: string; ring?: boolean };
/**
 * A college on the map: its dot colour and the short note shown after its name on hover (its tier or fit, and its deadline when
 * the "when" lens is on). With the lens on, `lit` dots (deadline in the window) carry an ink ring and the rest are `dim`.
 */
export type MapDot = MapPin & { tone: DotTone; note: string | null; lit?: boolean; dim?: boolean };
/** What the page can do to the map from outside it: light up a college's dot (hovering its row in the list). */
export type MapHandle = { hover: (slug: string | null) => void };

export const INK = "#12304a";

// Dot diameter in CSS pixels by tier letter (a 2px white ring included): more selective colleges are a little larger, so the
// order reads in size as well as in colour. Picking uses a fixed radius around the centre, so every dot is a ~28px target.
const DOT_PX: Record<string, number> = { S: 15, A: 14, B: 13, C: 12, D: 12 };
export const dotPx = (tier: string | null) => (tier ? (DOT_PX[tier[0]] ?? 11) : 11);
export const HIT_PX = 14;
export const HIT_PX_TOUCH = 22;
