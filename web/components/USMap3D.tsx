"use client";

import { geoPath, type GeoContext, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { flight, overviewDistance, rigPosition, type Rig } from "@/lib/map-camera";
import { fitWorld, regionGeo, type RegionGeo } from "@/lib/region-geo";
import type { RegionCode } from "@/lib/regions";
import type { MapPin } from "./USMap";

// World units: the region's land is fitted into ±halfW × ±halfD (US: 960 × 600), centred on the origin, y up.
// Camera framing and pan limits scale from that box; see lib/region-geo.ts.
const SLAB = 9; // state thickness
const GAP = 0.985; // states shrink a touch about their centroid, so the map reads as puzzle pieces
const FOV = 32;
// The camera keeps one fixed tilt and heading (no rotating); people can only zoom and pan.
const OVERVIEW_POLAR = 0.74;
// With nothing left to animate, ambient motion (pin bob, ripples) keeps going this long after the last interaction, then the map stops redrawing.
const IDLE_MS = 3000;
// Fill cost grows with the pixels drawn (about 60 ms a frame at a 1200x860 canvas on 1.5x density, 35 ms at 1x), so
// while anything moves the map is drawn at no more than this many pixels, then sharpened to full density once it has
// been still for SHARPEN_MS.
const MOTION_PIXELS = 1_000_000;
const SHARPEN_MS = 600;
// The map settles in within about a second: states rise west to east while the camera glides in, then the dots appear.
const RISE_MS = 700;
const INTRO_MS = 1400;

// The land is drawn in the site's palette: white state tops (a hair of variation so neighbours read apart), sky-blue sides and
// edges, pale blue on the hovered and the selected state. The college dots carry the only strong colour on the map.
const WHITE = new THREE.Color("#ffffff");
const TOP_ALT = new THREE.Color("#eef6fc");
const TOP_HOVER = new THREE.Color("#eef8ff");
const TOP_SEL = new THREE.Color("#daf0ff");
const SIDE = "#87d1f6";
const EDGE = new THREE.Color("#b7e3fb");
const EDGE_SEL = new THREE.Color("#12304a");
// Neighbouring land shown only for context (Ireland next to the UK) is a quiet grey-blue.
const MUTED_TOP = new THREE.Color("#eef3f7");
const INK = "#12304a";
// The flat ground behind the map (.map-sky in globals.css); the fog melts distant land into it.
const GROUND = "#f4f9fd";

/** A dot colour: a CSS colour token (lib/ui.ts TIER_DOT / FIT_DOT_COLOR) and the hex used until the stylesheet has it; `ring` draws it hollow. */
export type DotTone = { token: string; hex: string; ring?: boolean };
/** A college on the map: its dot colour and the short note shown after its name on hover (its tier, or its fit). */
export type MapDot = MapPin & { tone: DotTone; note: string | null };
/** What the page can do to the map from outside it: light up a college's dot (hovering its row in the list). */
export type MapHandle = { hover: (slug: string | null) => void };

// Dot diameter in CSS pixels by tier letter (a 2px white ring included): more selective colleges are a little larger, so the
// order reads in size as well as in colour. Picking uses a fixed radius around the centre, so every dot is a ~28px target.
const DOT_PX: Record<string, number> = { S: 15, A: 14, B: 13, C: 12, D: 12 };
const dotPx = (tier: string | null) => (tier ? (DOT_PX[tier[0]] ?? 11) : 11);
const HIT_PX = 14;
const HIT_PX_TOUCH = 22;

type Ring = [number, number][];
type StateMesh = {
  id: string;
  mesh: THREE.Mesh;
  top: THREE.MeshStandardMaterial;
  baseTop: THREE.Color;
  edge: THREE.LineBasicMaterial;
  rings: Ring[]; // world x/z, already shrunk about the centroid
  box: [number, number, number, number];
  cx: number;
  cz: number;
  delay: number;
  lift: number;
  shade: number; // the tint last written to `top` and `edge`, so colours are only touched when it changes
};
type Pin3D = {
  slug: string;
  name: string;
  note: string | null;
  tier: string;
  hex: string;
  rgb: [number, number, number];
  ring: boolean;
  size: number;
  x: number;
  z: number;
  state: StateMesh | null;
  root: THREE.Group;
  body: THREE.Group;
  parts: [THREE.Mesh, THREE.Mesh];
  letter: THREE.Sprite;
  hit: THREE.Mesh;
  born: number;
  leaving: number | null;
  phase: number;
  hover: number;
  sel: number;
  pop: number | null;
};

// Shader colours are written straight to the canvas, so they stay in sRGB.
const srgbOf = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const isLight = (hex: string) => {
  const [r, g, b] = srgbOf(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62;
};
/** The token's colour as the stylesheet defines it (Tailwind's @theme), else the fallback hex. */
const toneHex = (tone: DotTone) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(tone.token).trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : tone.hex;
};
const easeOutBack = (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
const easeOutBounce = (t: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function inRing(x: number, z: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function stateAt(list: StateMesh[], x: number, z: number) {
  return list.find((s) => x >= s.box[0] && x <= s.box[2] && z >= s.box[1] && z <= s.box[3] && s.rings.some((r) => inRing(x, z, r))) ?? null;
}

function letterTexture(letter: string, color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.font = "800 86px ui-rounded, system-ui, sans-serif";
  // "S++" is wider than the head: shrink it to fit rather than let the plus signs run off the sprite.
  const fit = Math.min(86, Math.floor((86 * 108) / Math.max(1, g.measureText(letter).width)));
  g.font = `800 ${fit}px ui-rounded, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(letter, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(18,48,74,0.55)");
  grad.addColorStop(1, "rgba(18,48,74,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Extrudes each feature into a slab. `muted` pieces (context land) are greyed and never selectable. */
function buildStates(g: RegionGeo, projection: GeoProjection, land: FeatureCollection, muted = false) {
  const centroidOf = geoPath(projection);
  const pieces = land.features.map((f: Feature, i) => {
    const raw: Ring[] = [];
    let cur: Ring | null = null;
    const ctx: GeoContext = {
      moveTo: (x, y) => void raw.push((cur = [[x, y]])),
      lineTo: (x, y) => void cur?.push([x, y]),
      closePath: () => void (cur = null),
      arc: () => undefined,
      beginPath: () => undefined,
    };
    geoPath(projection, ctx)(f);
    const [cx, cz] = centroidOf.centroid(f);
    const area = (r: Ring) => Math.abs(THREE.ShapeUtils.area(r.map(([x, y]) => new THREE.Vector2(x, y))));
    const rings = raw.filter((r) => r.length > 3 && area(r) > 0.4);
    const shapes = rings.map((r) => new THREE.Shape(r.map(([x, y]) => new THREE.Vector2(x - cx, -(y - cz)))));
    const geom = new THREE.ExtrudeGeometry(shapes, { depth: SLAB, bevelEnabled: false, curveSegments: 1 });
    geom.rotateX(-Math.PI / 2);

    // A little light/dark variation so neighbours read as separate pieces.
    const baseTop = muted ? MUTED_TOP.clone() : WHITE.clone().lerp(TOP_ALT, ((i * 37) % 10) / 10);
    const top = new THREE.MeshStandardMaterial({ color: baseTop.clone(), roughness: 0.62 });
    const side = new THREE.MeshStandardMaterial({ color: muted ? "#c4dcea" : SIDE, roughness: 0.45 });
    const mesh = new THREE.Mesh(geom, [top, side]);
    mesh.position.set(cx, 0, cz);
    mesh.scale.set(GAP, 1, GAP);
    mesh.castShadow = mesh.receiveShadow = true;

    const pts: number[] = [];
    for (const r of rings)
      for (let k = 0; k < r.length; k++) {
        const [ax, ay] = r[k];
        const [bx, by] = r[(k + 1) % r.length];
        pts.push(ax - cx, SLAB + 0.06, ay - cz, bx - cx, SLAB + 0.06, by - cz);
      }
    const edgeGeom = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const edge = new THREE.LineBasicMaterial({ color: muted ? "#d5e6f0" : EDGE, transparent: true, opacity: 0.9 });
    mesh.add(new THREE.LineSegments(edgeGeom, edge));

    const world = rings.map((r) => r.map(([x, y]) => [cx + (x - cx) * GAP, cz + (y - cz) * GAP] as [number, number]));
    const xs = world.flat().map((p) => p[0]);
    const zs = world.flat().map((p) => p[1]);
    return {
      id: String(f.id),
      mesh,
      top,
      baseTop,
      edge,
      rings: world,
      box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)],
      cx,
      cz,
      // The map rises in a quick wave from west to east.
      delay: 60 + ((cx + g.halfW) / (2 * g.halfW)) * 420 + Math.abs(cz) * 0.15,
      lift: 0,
      shade: -1,
    } satisfies StateMesh;
  });
  // Pieces that project to nothing (e.g. territories outside Albers USA, specks of island) carry no mesh worth keeping.
  return pieces.filter((s) => {
    if (s.rings.length) return true;
    s.mesh.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    s.top.dispose();
    s.edge.dispose();
    (s.mesh.material as THREE.Material[])[1].dispose();
    return false;
  });
}

type Api = {
  setPins: (pins: MapDot[]) => void;
  select: (slug: string | null, side: "left" | "right") => void;
  resizeTo: (w: number, h: number) => void;
  hover: (slug: string | null) => void;
};

export function USMap3D(props: {
  pins: MapDot[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
  cardSide: "left" | "right";
  /** Which country to draw. Fixed for the component's life: give it key={region} so a switch remounts the scene. */
  region?: RegionCode;
  /** Gets a handle for lighting up a dot from outside the map (null when the map goes away or has no WebGL). */
  onReady?: (handle: MapHandle | null) => void;
  children?: React.ReactNode;
}) {
  const { pins, selected, onSelect, cardSide, region = "US", onReady, children } = props;
  const box = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const onSelectRef = useRef(onSelect);
  const onReadyRef = useRef(onReady);
  const latest = useRef({ pins, selected, cardSide });
  const regionRef = useRef(region);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onReadyRef.current = onReady;
    latest.current = { pins, selected, cardSide };
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const g = regionGeo(regionRef.current);
    const { halfW, halfD } = g;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = Math.max(1, el.clientWidth);
    let h = Math.max(1, el.clientHeight);
    const restRatio = Math.min(window.devicePixelRatio, 2);
    // The pixel density used while the map moves: the screen's, capped to 1 and to the pixel budget above.
    const motionRatio = () => Math.min(restRatio, 1, Math.sqrt(MOTION_PIXELS / (w * h)));
    renderer.setPixelRatio(motionRatio());
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // The shadow map is redrawn only when something that casts a shadow moves (see shadowDirty in the frame loop).
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    const canvas = renderer.domElement;
    canvas.className = "absolute inset-0 block h-full w-full";
    canvas.setAttribute("aria-hidden", "true");
    el.prepend(canvas);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(GROUND, 900, 3000);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.55;

    const camera = new THREE.PerspectiveCamera(FOV, w / h, 5, 8000);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 140;
    controls.maxDistance = 2400;
    controls.minPolarAngle = controls.maxPolarAngle = OVERVIEW_POLAR;
    controls.minAzimuthAngle = controls.maxAzimuthAngle = 0;
    controls.enableRotate = false;
    controls.screenSpacePanning = false;
    // No rotating, so a plain drag pans the map.
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };

    // Light: a neutral sun from the north-west (white tops stay white, not cream), sky-blue bounce from below.
    scene.add(new THREE.HemisphereLight("#ffffff", "#9fd3f2", 1.25));
    const sun = new THREE.DirectionalLight("#ffffff", 2.2);
    sun.position.set(-380, 700, -260);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 5;
    sun.shadow.intensity = 0.45;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.4;
    Object.assign(sun.shadow.camera, { left: -(halfW + 200), right: halfW + 200, top: halfD + 160, bottom: -(halfD + 160), near: 100, far: 1800 });
    scene.add(sun, sun.target);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * halfW + 240, 2 * halfD + 240), new THREE.ShadowMaterial({ opacity: 0.12 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const projection = fitWorld(g);
    const states = buildStates(g, projection, g.land);
    // Context land (Ireland beside the UK) rises with the map but is never hovered, lifted or tinted.
    const context = buildStates(g, projection, g.context, true);
    for (const s of [...states, ...context]) {
      if (!reduced) s.mesh.scale.y = 0.001;
      scene.add(s.mesh);
    }
    // The rise-in animation moves the states (and so their shadows) until the last one has landed.
    const riseMs = Math.max(0, ...states.map((s) => s.delay), ...context.map((s) => s.delay)) + RISE_MS;

    // Shared pin parts (only the selected college shows its pin; every college is a dot, below).
    const coneGeom = new THREE.ConeGeometry(3.4, 10, 24).rotateX(Math.PI).translate(0, 5, 0);
    const headGeom = new THREE.SphereGeometry(5.6, 32, 20).translate(0, 14, 0);
    const hitGeom = new THREE.SphereGeometry(11, 8, 6).translate(0, 12, 0);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    const blobGeom = new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2);
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
    const pinMats = new Map<string, THREE.MeshPhysicalMaterial>();
    const letterMats = new Map<string, THREE.SpriteMaterial>();
    // Pins are drawn in the transparent pass after the dots (renderOrder 3 > 1), so the selected pin stands in front of its neighbours' dots.
    const pinMat = (hex: string) => {
      let m = pinMats.get(hex);
      if (!m) {
        m = new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true });
        pinMats.set(hex, m);
      }
      return m;
    };
    const letterMat = (letter: string, hex: string) => {
      const ink = isLight(hex) ? INK : "#ffffff";
      const key = `${letter}|${ink}`;
      let m = letterMats.get(key);
      if (!m) {
        m = new THREE.SpriteMaterial({ map: letterTexture(letter, ink), depthWrite: false });
        letterMats.set(key, m);
      }
      return m;
    };

    // The selected college's place on the ground: two slow rings in ink.
    const ringGeom = new THREE.RingGeometry(0.93, 1, 96).rotateX(-Math.PI / 2);
    const ripples = [0, 1].map(() => {
      const m = new THREE.Mesh(ringGeom, new THREE.MeshBasicMaterial({ color: INK, transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      return m;
    });

    // Every college in view as one dot: a single THREE.Points draw (one call for all 416), coloured by tier or fit, a white ring
    // keeping clusters apart and a slightly darker rim so the paler tiers still read on white land; `ring` dots (tier D) are open
    // rings. Dots skip the depth test so the land they sit on never clips them; the selected college's dot steps aside once its
    // pin has landed.
    const dotMat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { uPx: { value: renderer.getPixelRatio() }, uAlpha: { value: reduced ? 1 : 0 }, uInk: { value: new THREE.Vector3(...srgbOf(INK)) } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aShow; attribute float aRing;
        uniform float uPx;
        varying vec3 vColor; varying float vSize; varying float vShow; varying float vRing;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vSize = aSize * uPx;
          gl_PointSize = vSize;
          vColor = aColor;
          vShow = aShow;
          vRing = aRing;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uPx; uniform float uAlpha; uniform vec3 uInk;
        varying vec3 vColor; varying float vSize; varying float vShow; varying float vRing;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float aa = 2.0 / vSize;
          float halo = 4.0 * uPx / vSize;
          float core = 1.0 - halo;
          float outer = 1.0 - smoothstep(1.0 - aa, 1.0, d);
          float fill = 1.0 - smoothstep(core - aa, core, d);
          float rim = smoothstep(core - halo * 0.6 - aa, core - halo * 0.6, d) * (1.0 - vRing);
          float hole = vRing * (1.0 - smoothstep(core - halo * 1.1 - aa, core - halo * 1.1, d));
          vec3 c = mix(vec3(1.0), mix(vColor, mix(vColor, uInk, 0.4), rim), fill);
          c = mix(c, vec3(1.0), hole);
          float a = outer * uAlpha * vShow;
          if (a < 0.01) discard;
          gl_FragColor = vec4(c, a);
        }`,
    });
    const dotLayer = new THREE.Points(new THREE.BufferGeometry(), dotMat);
    dotLayer.frustumCulled = false;
    dotLayer.renderOrder = 1;
    scene.add(dotLayer);
    let dots: Pin3D[] = [];

    // Pins.
    const pinMap = new Map<string, Pin3D>();
    const pinBase = (p: Pin3D) => (p.state ? p.state.mesh.position.y + SLAB * p.state.mesh.scale.y : SLAB);
    const dotY = (p: Pin3D) => pinBase(p) + 0.5;
    const introEnd = performance.now() + (reduced ? 0 : 900);
    const paint = (p: Pin3D, hex: string) => {
      p.hex = hex;
      p.rgb = srgbOf(hex);
      p.parts.forEach((m) => (m.material = pinMat(hex)));
      p.letter.material = letterMat(p.tier, hex);
    };
    // The dot buffer follows the pins: smallest first, so the larger, more selective colleges are drawn on top.
    const buildDots = () => {
      dots = [...pinMap.values()].filter((p) => p.leaving == null).sort((a, b) => a.size - b.size);
      const n = dots.length;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const size = new Float32Array(n);
      const show = new Float32Array(n).fill(1);
      const ring = new Float32Array(n);
      dots.forEach((p, i) => {
        pos.set([p.x, dotY(p), p.z], i * 3);
        col.set(p.rgb, i * 3);
        size[i] = p.size;
        ring[i] = p.ring ? 1 : 0;
      });
      const geom = new THREE.BufferGeometry()
        .setAttribute("position", new THREE.BufferAttribute(pos, 3))
        .setAttribute("aColor", new THREE.BufferAttribute(col, 3))
        .setAttribute("aSize", new THREE.BufferAttribute(size, 1))
        .setAttribute("aShow", new THREE.BufferAttribute(show, 1))
        .setAttribute("aRing", new THREE.BufferAttribute(ring, 1));
      dotLayer.geometry.dispose();
      dotLayer.geometry = geom;
    };
    const setPins = (list: MapDot[]) => {
      const now = performance.now();
      const keep = new Set<string>();
      const tones = new Map<string, string>();
      const hexOf = (tone: DotTone) => {
        let hex = tones.get(tone.token);
        if (!hex) tones.set(tone.token, (hex = toneHex(tone)));
        return hex;
      };
      list.forEach((p) => {
        if (p.lat == null || p.lng == null) return;
        const xy = projection([p.lng, p.lat]);
        if (!xy) return;
        keep.add(p.slug);
        const hex = hexOf(p.tone);
        const existing = pinMap.get(p.slug);
        if (existing) {
          existing.leaving = null;
          existing.name = p.name;
          existing.note = p.note;
          existing.ring = !!p.tone.ring;
          if (existing.hex !== hex) paint(existing, hex);
          return;
        }
        const tier = p.tier ?? "";
        const state = stateAt(states, xy[0], xy[1]);
        const x = state ? state.cx + (xy[0] - state.cx) * GAP : xy[0];
        const z = state ? state.cz + (xy[1] - state.cz) * GAP : xy[1];
        const root = new THREE.Group();
        const body = new THREE.Group();
        const cone = new THREE.Mesh(coneGeom, pinMat(hex));
        const head = new THREE.Mesh(headGeom, pinMat(hex));
        cone.castShadow = head.castShadow = true;
        cone.renderOrder = head.renderOrder = 3;
        const letter = new THREE.Sprite(letterMat(tier, hex));
        letter.scale.set(7.2, 7.2, 1);
        letter.renderOrder = 4;
        const hit = new THREE.Mesh(hitGeom, hitMat);
        hit.userData.slug = p.slug;
        const blob = new THREE.Mesh(blobGeom, blobMat);
        blob.position.y = 0.12;
        body.add(cone, head, letter);
        root.add(blob, body, hit);
        root.position.set(x, SLAB, z);
        root.scale.setScalar(0.001);
        root.visible = false;
        scene.add(root);
        const pin: Pin3D = {
          slug: p.slug,
          name: p.name,
          note: p.note,
          tier,
          hex,
          rgb: srgbOf(hex),
          ring: !!p.tone.ring,
          size: dotPx(p.tier),
          x,
          z,
          state,
          root,
          body,
          parts: [cone, head],
          letter,
          hit,
          born: Math.max(now, introEnd),
          leaving: null,
          phase: Math.random() * 6.28,
          hover: 0,
          sel: 0,
          pop: null,
        };
        pinMap.set(p.slug, pin);
      });
      for (const p of pinMap.values()) if (!keep.has(p.slug) && p.leaving == null) p.leaving = now;
      buildDots();
      // The focused college was filtered out: head back to the whole map.
      if (selSlug && !keep.has(selSlug)) flyTo(targetRig());
      wake();
    };

    // Camera rig.
    const aspect = () => w / h;
    // A portrait map (a phone) is fitted by its width and has height to spare: sit the land a little low, clear of the key at the top.
    const overview = (): Rig => ({ tx: 0, ty: 0, tz: 18, dist: overviewDistance(aspect(), FOV, OVERVIEW_POLAR, halfW + 20, halfD + 20), polar: OVERVIEW_POLAR, az: 0, ax: 0.5, ay: aspect() < 1.1 ? 0.6 : 0.5 });
    let rig: Rig = overview();
    let fly: { at: (t: number) => Rig; t0: number; dur: number } | null = null;
    const applyRig = (r: Rig) => {
      const [x, y, z] = rigPosition(r);
      camera.position.set(x, y, z);
      controls.target.set(r.tx, r.ty, r.tz);
      camera.lookAt(controls.target);
      camera.setViewOffset(w, h, (0.5 - r.ax) * w, (0.5 - r.ay) * h, w, h);
    };
    const currentRig = (): Rig => {
      const off = camera.position.clone().sub(controls.target);
      const dist = off.length();
      return { tx: controls.target.x, ty: controls.target.y, tz: controls.target.z, dist, polar: Math.acos(Math.min(1, off.y / dist)), az: Math.atan2(off.x, off.z), ax: rig.ax, ay: rig.ay };
    };
    let selSlug: string | null = null;
    let selSide: "left" | "right" = "right";
    let extHover: string | null = null;
    const targetRig = (): Rig => {
      const p = selSlug ? pinMap.get(selSlug) : null;
      if (!p || p.leaving != null) return overview();
      const sheet = !window.matchMedia("(min-width: 1024px)").matches;
      const dist = 380 * Math.max(1, 1.25 / aspect());
      return {
        tx: p.x,
        ty: SLAB + 10,
        tz: p.z,
        dist,
        polar: OVERVIEW_POLAR,
        az: 0,
        // Below lg the card is a sheet over the lower two-thirds, so the pin rides in the strip above it.
        ax: sheet ? 0.5 : selSide === "right" ? 0.31 : 0.69,
        ay: sheet ? 0.22 : 0.56,
      };
    };
    const flyTo = (to: Rig, dur?: number) => {
      if (reduced) {
        fly = null;
        rig = to;
        applyRig(rig);
        controls.update();
        return 0;
      }
      const from = currentRig();
      const f = flight(from, to);
      fly = { at: f.at, t0: performance.now(), dur: dur ?? f.duration };
      controls.enabled = false;
      return fly.dur;
    };

    // Intro: start a little further out and glide in to the overview while the states rise.
    if (reduced) applyRig(rig);
    else {
      applyRig({ ...rig, dist: rig.dist * 1.45 });
      flyTo(overview(), INTRO_MS);
    }

    const select = (slug: string | null, side: "left" | "right") => {
      if (slug === selSlug && side === selSide) return;
      const changed = slug !== selSlug;
      selSlug = slug;
      selSide = side;
      const next = slug ? pinMap.get(slug) : undefined;
      const dur = flyTo(targetRig());
      wake();
      if (!changed || !next || reduced) return;
      // The chosen college's dot becomes its pin: the pin drops in as the camera arrives and squashes on impact.
      next.born = performance.now() + dur * 0.45;
      next.pop = next.born + 330;
    };
    const hover = (slug: string | null) => {
      if (slug === extHover) return;
      extHover = slug;
      wake();
    };

    // Pointer: hover via the nearest dot on screen (or the selected pin's body), click (press without drag) selects.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SLAB);
    const hitPoint = new THREE.Vector3();
    const pv = new THREE.Vector3();
    const hitList: THREE.Object3D[] = [];
    const pointer = { x: 0, y: 0, w: 1, h: 1, touch: false };
    let pointerIn = false;
    let pointerDirty = false;
    let hoverPin: Pin3D | null = null;
    let hoverState: StateMesh | null = null;
    let down: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      Object.assign(pointer, { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height, touch: e.pointerType === "touch" });
      ndc.set((pointer.x / r.width) * 2 - 1, -(pointer.y / r.height) * 2 + 1);
      pointerIn = true;
      pointerDirty = true;
      wake();
    };
    const onLeave = () => {
      pointerIn = false;
      pointerDirty = true;
      wake();
    };
    // Screen-space picking: the dot whose centre is nearest the pointer, within a fixed radius (a ~28px target, larger for a finger).
    const pickDot = () => {
      let best: Pin3D | null = null;
      let bestD = (pointer.touch ? HIT_PX_TOUCH : HIT_PX) ** 2;
      for (const p of dots) {
        pv.set(p.x, dotY(p), p.z).project(camera);
        if (pv.z > 1) continue;
        const dx = ((pv.x + 1) / 2) * pointer.w - pointer.x;
        const dy = ((1 - pv.y) / 2) * pointer.h - pointer.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return best;
    };
    const pick = () => {
      ray.setFromCamera(ndc, camera);
      hitList.length = 0;
      for (const p of pinMap.values()) if (p.leaving == null && p.root.visible) hitList.push(p.hit);
      const hits = ray.intersectObjects(hitList, false);
      const pin = hits.length ? (pinMap.get(hits[0].object.userData.slug as string) ?? null) : pickDot();
      const st = ray.ray.intersectPlane(plane, hitPoint) ? stateAt(states, hitPoint.x, hitPoint.z) : null;
      return { pin, st };
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      wake();
      if (fly) {
        // Let the person grab the camera mid-flight.
        fly = null;
        controls.enabled = true;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6) return;
      onMove(e);
      const { pin } = pick();
      onSelectRef.current(pin ? pin.slug : null);
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);

    const resizeTo = (nw: number, nh: number) => {
      if (nw < 1 || nh < 1 || (nw === w && nh === h)) return;
      w = nw;
      h = nh;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fly = null;
      controls.enabled = true;
      rig = targetRig();
      applyRig(rig);
      wake();
    };
    const ro = new ResizeObserver(([entry]) => resizeTo(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height)));
    ro.observe(el);

    // Frame loop. It runs only while something moves (camera, hover, intro, pins) or for IDLE_MS after the last interaction,
    // and never while the map is off-screen; otherwise the last frame stays up and the GPU rests.
    const start = performance.now();
    let last = start;
    const v = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    let frame = 0;
    let pinsWereShown = false;
    let tipFor: Pin3D | null = null;
    // Ambient motion runs on its own clock, which stops while the loop sleeps so nothing jumps on wake.
    let time = 0;
    let running = false;
    let onScreen = true;
    let lastActive = performance.now();
    const tick = () => {
      const now = performance.now();
      let shadowDirty = !reduced && now - start < riseMs;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      const k = 1 - Math.exp(-dt * 10);
      // Anything still settling keeps the loop awake.
      let busy = !!fly || pointerDirty || now - start < riseMs + 500;

      if (fly) {
        const t = (now - fly.t0) / fly.dur;
        rig = fly.at(t);
        applyRig(rig);
        if (t >= 1) {
          fly = null;
          controls.enabled = true;
          controls.update();
        }
      } else {
        if (controls.update()) busy = true;
        // Keep panning on the map.
        controls.target.x = Math.max(-halfW - 80, Math.min(halfW + 80, controls.target.x));
        controls.target.z = Math.max(-halfD - 80, Math.min(halfD + 80, controls.target.z));
      }
      const camDist = camera.position.distanceTo(controls.target);
      const fog = scene.fog as THREE.Fog;
      fog.near = camDist * 1.15;
      fog.far = camDist * 3.6;

      if (pointerDirty && !fly) {
        pointerDirty = false;
        const { pin, st } = pointerIn ? pick() : { pin: null, st: null };
        hoverPin = pin;
        hoverState = st;
        canvas.style.cursor = pin ? "pointer" : "grab";
      }

      const selPin = selSlug ? (pinMap.get(selSlug) ?? null) : null;
      const selState = selPin?.state ?? null;
      const listPin = extHover ? (pinMap.get(extHover) ?? null) : null;

      // States: rise in, lift on hover, lift higher and tint when they hold the selected college.
      if (!reduced) for (const s of context) s.mesh.scale.y = Math.max(0.001, easeOutBack(clamp01((now - start - s.delay) / RISE_MS)));
      for (const s of states) {
        if (!reduced) {
          const t = clamp01((now - start - s.delay) / RISE_MS);
          s.mesh.scale.y = Math.max(0.001, easeOutBack(t));
        }
        const goal = s === selState ? 7 : s === hoverState ? 2.5 : 0;
        const before = s.lift;
        s.lift += (goal - s.lift) * k;
        if (Math.abs(goal - s.lift) < 0.01) s.lift = goal;
        if (s.lift !== before) {
          s.mesh.position.y = s.lift;
          shadowDirty = true;
          busy = true;
        }
        const tint = s === selState ? 2 : s === hoverState ? 1 : 0;
        if (tint !== s.shade) {
          s.shade = tint;
          s.top.color.copy(tint === 2 ? TOP_SEL : tint === 1 ? s.baseTop.clone().lerp(TOP_HOVER, 0.85) : s.baseTop);
          s.edge.color.copy(s === selState ? EDGE_SEL : EDGE);
        }
      }

      // Pins: hidden, except the selected college's.
      const pinScale = Math.min(2.1, Math.max(0.7, 1.65 * Math.sqrt(camDist / 950)));
      let pinsShown = false;
      for (const p of pinMap.values()) {
        const base = pinBase(p);
        p.root.position.y = base;
        const isSel = p === selPin;
        const hoverGoal = p === hoverPin || p === listPin ? 1 : 0;
        const selGoal = isSel ? 1 : 0;
        p.hover = reduced ? hoverGoal : p.hover + (hoverGoal - p.hover) * k * 1.6;
        p.sel += (selGoal - p.sel) * k;
        if (Math.abs(hoverGoal - p.hover) < 0.002) p.hover = hoverGoal;
        if (Math.abs(selGoal - p.sel) < 0.002) p.sel = selGoal;
        if (p.hover !== hoverGoal || p.sel !== selGoal || (isSel && now < p.born + 900) || p.leaving != null || p.pop != null) busy = true;
        // Unselected pins stay hidden; a deselected one shrinks away.
        const show = isSel ? 1 : reduced ? 0 : p.sel;
        p.root.visible = show > 0.02;
        if (!p.root.visible && p.leaving == null) continue;
        if (p.root.visible) pinsShown = true;
        let s = pinScale * (1 + 0.25 * p.hover + 0.25 * p.sel) * show;
        let drop = 0;
        if (!reduced) {
          const t = clamp01((now - p.born) / 900);
          drop = (1 - easeOutBounce(t)) * 170;
          s *= t <= 0 ? 0.001 : Math.min(1, t * 4);
        }
        if (p.leaving != null) {
          const t = clamp01((now - p.leaving) / 260);
          s *= 1 - t;
          if (t >= 1) {
            scene.remove(p.root);
            pinMap.delete(p.slug);
            continue;
          }
        }
        p.root.scale.setScalar(Math.max(0.001, s));
        const bob = reduced ? 0 : Math.sin(time * 2.2 + p.phase) * (0.6 + 1.8 * p.sel);
        p.body.position.y = drop + bob + p.sel * 3;
        let sx = 1;
        let sy = 1;
        if (p.pop != null && now > p.pop) {
          const tau = (now - p.pop) / 1000;
          const squash = 0.32 * Math.exp(-5 * tau) * Math.cos(15 * tau);
          sy = 1 - squash;
          sx = 1 + squash * 0.5;
          if (tau > 1.2) p.pop = null;
        }
        p.body.scale.set(sx, sy, sx);
        // Keep the tier letter on the camera side of the head.
        p.body.getWorldPosition(v);
        v.y += 14 * s * sy;
        toCam.copy(camera.position).sub(v).normalize().multiplyScalar(5.9);
        p.letter.position.set(toCam.x, 14 + toCam.y, toCam.z);

        const label = labels.current.get(p.slug);
        if (label) {
          v.set(p.x, base + p.body.position.y * s + 24 * s + 4, p.z).project(camera);
          const on = v.z < 1;
          label.style.transform = `translate3d(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px, 0) translate(-50%, -100%)`;
          label.dataset.hover = String(on && isSel);
        }
      }

      // Dots: follow their state as it rises or lifts, grow while hovered, and step aside for the selected pin once it has landed.
      const pos = dotLayer.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (pos) {
        const size = dotLayer.geometry.getAttribute("aSize") as THREE.BufferAttribute;
        const shown = dotLayer.geometry.getAttribute("aShow") as THREE.BufferAttribute;
        dots.forEach((p, i) => {
          const y = dotY(p);
          if (Math.abs(pos.getY(i) - y) > 1e-3) {
            pos.setY(i, y);
            pos.needsUpdate = true;
          }
          const sz = p.size * (1 + 0.45 * p.hover);
          if (Math.abs(size.getX(i) - sz) > 1e-3) {
            size.setX(i, sz);
            size.needsUpdate = true;
          }
          const sh = p === selPin && now >= p.born ? 0 : 1;
          if (shown.getX(i) !== sh) {
            shown.setX(i, sh);
            shown.needsUpdate = true;
          }
        });
      }
      const alpha = reduced ? 1 : clamp01((now - start - riseMs * 0.55) / 350);
      if (dotMat.uniforms.uAlpha.value !== alpha) {
        dotMat.uniforms.uAlpha.value = alpha;
        busy = true;
      }

      // The hover label: the dot under the pointer, else the one whose list row is hovered (never the selected one; it has its own).
      const tipPin = [hoverPin, listPin].find((p) => p && p !== selPin && p.leaving == null) ?? null;
      const tipEl = tip.current;
      if (tipEl) {
        if (tipPin !== tipFor) {
          tipFor = tipPin;
          if (tipPin) {
            (tipEl.children[0] as HTMLElement).textContent = tipPin.name;
            (tipEl.children[1] as HTMLElement).textContent = tipPin.note ?? "";
          }
          tipEl.dataset.show = String(!!tipPin);
        }
        if (tipPin) {
          pv.set(tipPin.x, dotY(tipPin), tipPin.z).project(camera);
          const lift = (tipPin.size * (1 + 0.45 * tipPin.hover)) / 2 + 6;
          tipEl.style.transform = `translate3d(${((pv.x + 1) / 2) * w}px, ${((1 - pv.y) / 2) * h - lift}px, 0) translate(-50%, -100%)`;
        }
      }

      // A visible pin bobs and bounces, so its shadow is refreshed every other frame; one more pass clears it once the pin is gone.
      if ((pinsShown && (frame & 1) === 0) || (pinsWereShown && !pinsShown)) shadowDirty = true;
      pinsWereShown = pinsShown;
      frame++;

      // The rings follow the selected pin.
      if (selPin && selPin.leaving == null && !fly && now >= selPin.born) {
        const base = pinBase(selPin);
        ripples.forEach((r, i) => {
          const t = reduced ? 0.4 + i * 0.3 : (time / 2.6 + i / ripples.length) % 1;
          r.visible = true;
          r.position.set(selPin.x, base + 0.3, selPin.z);
          r.scale.setScalar((6 + t * 34) * pinScale);
          (r.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - t, 1.5) * 0.35;
        });
      } else for (const r of ripples) r.visible = false;

      if (shadowDirty) renderer.shadowMap.needsUpdate = true;
      const ratio = now - lastActive > SHARPEN_MS ? restRatio : motionRatio();
      if (renderer.getPixelRatio() !== ratio) {
        renderer.setPixelRatio(ratio);
        dotMat.uniforms.uPx.value = ratio;
      }
      renderer.render(scene, camera);

      if (busy) lastActive = now;
      else if (now - lastActive > IDLE_MS) sleep();
    };
    const sleep = () => {
      if (!running) return;
      running = false;
      renderer.setAnimationLoop(null);
    };
    // Called on any interaction or change; restarts the loop if it was asleep.
    function wake() {
      lastActive = performance.now();
      if (running || !onScreen) return;
      running = true;
      last = performance.now();
      renderer.setAnimationLoop(tick);
    }
    controls.addEventListener("change", wake);
    // Off-screen (scrolled away): stop drawing entirely; resume when it comes back.
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) wake();
      else sleep();
    });
    io.observe(el);
    wake();

    api.current = { setPins, select, resizeTo, hover };
    setPins(latest.current.pins);
    if (latest.current.selected) select(latest.current.selected, latest.current.cardSide);
    onReadyRef.current?.({ hover: (slug) => api.current?.hover(slug) });

    // The pin and the rings stay hidden until a college is picked, and the first selection used to freeze for a few hundred
    // milliseconds: shaders were built on first use, and the first draw of each object costs the graphics driver more again.
    // Show them just long enough to compile in parallel with the intro, then draw them once.
    let disposed = false;
    const unseen = [...ripples];
    const wasShown = unseen.map((o) => o.visible);
    unseen.forEach((o) => (o.visible = true));
    const compiled = renderer.compileAsync(scene, camera);
    unseen.forEach((o, i) => (o.visible = wasShown[i]));
    compiled
      .then(() => {
        if (disposed) return;
        const hidden: THREE.Object3D[] = [];
        scene.traverse((o) => {
          if (!o.visible) hidden.push(o);
        });
        hidden.forEach((o) => (o.visible = true));
        renderer.render(scene, camera);
        hidden.forEach((o) => (o.visible = false));
        // The canvas keeps whatever was drawn last while the loop sleeps, so put the real frame back.
        renderer.render(scene, camera);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      api.current = null;
      onReadyRef.current?.(null);
      renderer.setAnimationLoop(null);
      ro.disconnect();
      io.disconnect();
      controls.removeEventListener("change", wake);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          (mat as THREE.MeshBasicMaterial).map?.dispose();
          mat.dispose();
        }
      });
      // Shared pin parts may be out of the scene (every pin filtered away), so free them explicitly.
      for (const geom of [coneGeom, headGeom, hitGeom, blobGeom, ringGeom]) geom.dispose();
      for (const m of [hitMat, blobMat, dotMat, ...pinMats.values(), ...letterMats.values()]) {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
      sun.shadow.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      // A region switch remounts the map; hand the GL context back now instead of waiting for GC.
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    api.current?.setPins(pins);
  }, [pins]);
  useEffect(() => {
    api.current?.select(selected, cardSide);
  }, [selected, cardSide]);

  if (failed)
    return (
      <FlatMap region={region} pins={pins} selected={selected} onSelect={onSelect}>
        {children}
      </FlatMap>
    );

  const sel = pins.find((p) => p.slug === selected);
  return (
    <div ref={box} className="map-sky relative h-full min-h-[360px] w-full touch-none overflow-hidden rounded-2xl border border-zinc-200">
      <div className="pointer-events-none absolute inset-0">
        <div
          ref={tip}
          aria-hidden="true"
          data-show="false"
          className="map-tip absolute left-0 top-0 flex items-baseline gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-sm text-ink"
        >
          <span className="font-semibold" />
          <span className="text-zinc-600" />
        </div>
        {sel && (
          <button
            key={sel.slug}
            ref={(node) => {
              if (node) labels.current.set(sel.slug, node);
              else labels.current.delete(sel.slug);
            }}
            type="button"
            aria-label={sel.name}
            aria-pressed
            data-selected
            onClick={() => onSelect(sel.slug)}
            className="map-label absolute left-0 top-0 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-[13px] font-semibold text-white"
          >
            {sel.name}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** Without WebGL: the same dots on a flat SVG map. A click on a dot selects its college and its name shows on hover; the list
 *  beside the map stays the keyboard route. */
function FlatMap({ region, pins, selected, onSelect, children }: { region: RegionCode; pins: MapDot[]; selected: string | null; onSelect: (slug: string | null) => void; children?: React.ReactNode }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
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
    const g = regionGeo(region);
    const projection = g.projection().fitExtent(
      [
        [24, 24],
        [w - 24, h - 24],
      ],
      g.land,
    );
    const path = geoPath(projection);
    return {
      projection,
      land: g.land.features.map((f) => ({ id: String(f.id), d: path(f) ?? "" })),
      context: g.context.features.map((f) => ({ id: String(f.id), d: path(f) ?? "" })),
    };
  }, [region, w, h]);
  const dots = useMemo(
    () =>
      pins
        .flatMap((p) => {
          if (p.lat == null || p.lng == null) return [];
          const xy = geo.projection([p.lng, p.lat]);
          return xy ? [{ ...p, x: xy[0], y: xy[1] }] : [];
        })
        .sort((a, b) => Number(a.slug === selected) - Number(b.slug === selected) || dotPx(a.tier) - dotPx(b.tier)),
    [pins, geo, selected],
  );
  const sel = dots.find((p) => p.slug === selected);
  return (
    <div ref={box} className="map-sky relative h-full min-h-[360px] w-full overflow-hidden rounded-2xl border border-zinc-200">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="group" aria-label={t(`colleges.mapLabel.${region}` as MessageKey)} className="absolute inset-0 block h-full w-full">
        <rect width={w} height={h} fill="transparent" onClick={() => onSelect(null)} />
        {geo.context.map((s) => (
          <path key={s.id} d={s.d} fill="#eef3f7" stroke="#d5e6f0" strokeLinejoin="round" />
        ))}
        {geo.land.map((s) => (
          <path key={s.id} d={s.d} fill="#ffffff" stroke="#b7e3fb" strokeLinejoin="round" onClick={() => onSelect(null)} />
        ))}
        {dots.map((p) => {
          const on = p.slug === selected;
          const r = dotPx(p.tier) / 2 - 1;
          return (
            <g
              key={p.slug}
              transform={`translate(${p.x} ${p.y})`}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(p.slug);
              }}
            >
              <title>{p.note ? `${p.name} · ${p.note}` : p.name}</title>
              <circle r={HIT_PX} fill="transparent" />
              {p.tone.ring && !on ? (
                <circle r={r - 1} fill="#ffffff" style={{ stroke: `var(${p.tone.token}, ${p.tone.hex})` }} strokeWidth={2.5} />
              ) : (
                <circle r={on ? r + 3 : r} style={{ fill: `var(${p.tone.token}, ${p.tone.hex})` }} stroke={on ? INK : "#ffffff"} strokeWidth={2} />
              )}
            </g>
          );
        })}
      </svg>
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
