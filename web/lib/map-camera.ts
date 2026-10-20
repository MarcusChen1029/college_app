// Camera math for the 3D map, kept free of three.js so it can be unit tested.

/** Where the camera looks (t*), how far away it sits, its tilt (polar, 0 = straight down) and spin (az),
 *  plus where on screen the target lands (ax/ay as fractions of width/height). */
export type Rig = { tx: number; ty: number; tz: number; dist: number; polar: number; az: number; ax: number; ay: number };

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Signed angle from a to b, taking the short way round. */
export function angleDelta(a: number, b: number) {
  const d = (((b - a) % TAU) + TAU) % TAU;
  return d > Math.PI ? d - TAU : d;
}

/** Distance at which a map of half-size (halfW × halfD) fills the view with a little margin. */
export function overviewDistance(aspect: number, vfovDeg: number, polar: number, halfW = 500, halfD = 320) {
  const tanV = Math.tan(((vfovDeg / 2) * Math.PI) / 180);
  const tanH = tanV * aspect;
  // Tilting the camera foreshortens the map's north–south depth by roughly cos(polar).
  return Math.max(halfW / tanH, (halfD * Math.cos(polar)) / tanV) * 1.04;
}

/** A flight between two rigs: rises when the targets are far apart (zoom out, glide, zoom in). */
export function flight(from: Rig, to: Rig) {
  const travel = Math.hypot(to.tx - from.tx, to.tz - from.tz);
  const peak = Math.max(from.dist, to.dist, Math.min(travel * 1.15, 1300));
  const lift = peak - Math.max(from.dist, to.dist);
  const dAz = angleDelta(from.az, to.az);
  const duration = Math.min(2100, Math.max(1000, 900 + travel * 1.4 + Math.abs(dAz) * 300));
  const at = (t: number): Rig => {
    const e = easeInOutCubic(Math.min(1, Math.max(0, t)));
    const arch = Math.sin(Math.PI * e);
    return {
      tx: lerp(from.tx, to.tx, e),
      ty: lerp(from.ty, to.ty, e),
      tz: lerp(from.tz, to.tz, e),
      dist: lerp(from.dist, to.dist, e) + lift * arch,
      // Look a little more straight down while high up, like a plane banking over the map.
      polar: lerp(from.polar, to.polar, e) - (lift > 0 ? 0.18 * arch : 0),
      az: from.az + dAz * e,
      ax: lerp(from.ax, to.ax, e),
      ay: lerp(from.ay, to.ay, e),
    };
  };
  return { duration, at };
}

/** Camera position for a rig (y is up). */
export function rigPosition(r: Rig): [number, number, number] {
  const s = Math.sin(r.polar) * r.dist;
  return [r.tx + s * Math.sin(r.az), r.ty + Math.cos(r.polar) * r.dist, r.tz + s * Math.cos(r.az)];
}
