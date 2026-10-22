"use client";

import { geoPath, type GeoContext, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection } from "geojson";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { flight, overviewDistance, rigPosition, type Rig } from "@/lib/map-camera";
import { fitWorld, regionGeo, type RegionGeo } from "@/lib/region-geo";
import type { RegionCode } from "@/lib/regions";
import type { TierCode } from "@/lib/types";
import { TIER_FILL, USMap, type MapPin } from "./USMap";

// World units: the region's land is fitted into ±halfW × ±halfD (US: 960 × 600), centred on the origin, y up.
// Camera framing, pan limits and sparkles all scale from that box; see lib/region-geo.ts.
const SLAB = 9; // state thickness
const GAP = 0.985; // states shrink a touch about their centroid, so the map reads as puzzle pieces
const FOV = 32;
// The camera keeps one fixed tilt and heading (no rotating); people can only zoom and pan.
const OVERVIEW_POLAR = 0.74;
// With nothing left to animate, ambient motion (sparkles, pin bob, ripples) keeps going this long after the last interaction, then the map stops redrawing.
const IDLE_MS = 3000;
// Fill cost grows with the pixels drawn (about 60 ms a frame at a 1200x860 canvas on 1.5x density, 35 ms at 1x), so
// while anything moves the map is drawn at no more than this many pixels, then sharpened to full density once it has
// been still for SHARPEN_MS.
const MOTION_PIXELS = 1_000_000;
const SHARPEN_MS = 600;

// State tops shade west to east through the region's bands (US: mint, sky blue, lilac).
const WHITE = new THREE.Color("#ffffff");
// Neighbouring land shown only for context (Ireland next to the UK) is a quiet grey-blue.
const MUTED_TOP = new THREE.Color("#eef3f7");
const EDGE = new THREE.Color("#8ccdf0");
const EDGE_SEL = new THREE.Color("#12304a");
const CONFETTI = ["#ffd84d", "#ff7a66", "#6fd9b3", "#b9a8ff", "#4dbcef"];

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
  tier: string;
  x: number;
  z: number;
  state: StateMesh | null;
  root: THREE.Group;
  body: THREE.Group;
  letter: THREE.Sprite;
  hit: THREE.Mesh;
  born: number;
  leaving: number | null;
  phase: number;
  hover: number;
  sel: number;
  pop: number | null;
  confetti: boolean;
};

// Shader colours are written straight to the canvas, so they stay in sRGB.
const srgb = (hex: string) => new THREE.Vector3(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));
const fillOf = (tier: string) => TIER_FILL[tier as TierCode] ?? TIER_FILL.D;
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

function letterTexture(letter: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.font = "800 86px ui-rounded, system-ui, sans-serif";
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
  const [west, mid, east] = g.bands.map((c) => new THREE.Color(c));
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

    const u = Math.min(1, Math.max(0, (cx + g.halfW) / (2 * g.halfW)));
    const baseTop = muted ? MUTED_TOP.clone() : u < 0.5 ? west.clone().lerp(mid, u * 2) : mid.clone().lerp(east, u * 2 - 1);
    baseTop.lerp(WHITE, ((i * 37) % 10) / 22); // a little light/dark variation so neighbours read as separate pieces
    const top = new THREE.MeshStandardMaterial({ color: baseTop.clone(), roughness: 0.62 });
    const side = new THREE.MeshStandardMaterial({ color: muted ? "#c4dcea" : "#6cc0ec", roughness: 0.45 });
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
    const edge = new THREE.LineBasicMaterial({ color: muted ? "#d5e6f0" : "#8ccdf0", transparent: true, opacity: 0.9 });
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
      // The map rises in a wave from west to east.
      delay: 120 + ((cx + g.halfW) / (2 * g.halfW)) * 900 + Math.abs(cz) * 0.4,
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

type Api = { setPins: (pins: MapPin[]) => void; select: (slug: string | null, side: "left" | "right") => void; resizeTo: (w: number, h: number) => void };

export function USMap3D(props: {
  pins: MapPin[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
  cardSide: "left" | "right";
  /** Which country to draw. Fixed for the component's life: give it key={region} so a switch remounts the scene. */
  region?: RegionCode;
  children?: React.ReactNode;
}) {
  const { pins, selected, onSelect, cardSide, region = "US", children } = props;
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const onSelectRef = useRef(onSelect);
  const latest = useRef({ pins, selected, cardSide });
  const regionRef = useRef(region);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
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
    scene.fog = new THREE.Fog("#e4f4fe", 900, 3000);
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

    // Light: a warm sun from the north-west, sky-blue bounce from below.
    scene.add(new THREE.HemisphereLight("#ffffff", "#9fd3f2", 1.25));
    const sun = new THREE.DirectionalLight("#fff4e0", 2.3);
    sun.position.set(-380, 700, -260);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 5;
    sun.shadow.intensity = 0.5;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.4;
    Object.assign(sun.shadow.camera, { left: -(halfW + 200), right: halfW + 200, top: halfD + 160, bottom: -(halfD + 160), near: 100, far: 1800 });
    scene.add(sun, sun.target);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * halfW + 240, 2 * halfD + 240), new THREE.ShadowMaterial({ opacity: 0.16 }));
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
    const riseMs = Math.max(0, ...states.map((s) => s.delay), ...context.map((s) => s.delay)) + 1000;

    // Sparkles drifting up off the map.
    const SPARKS = 160;
    const sparkPos = new Float32Array(SPARKS * 3);
    const sparkPhase = new Float32Array(SPARKS);
    const sparkSize = new Float32Array(SPARKS);
    const sparkColor = new Float32Array(SPARKS * 3);
    const sparkPalette = ["#ffd84d", "#1fa4e4", "#ff7a66", "#9b87ff"].map(srgb);
    for (let i = 0; i < SPARKS; i++) {
      sparkPos.set([(Math.random() * 2 - 1) * (halfW + 40), 10 + Math.random() * 40, (Math.random() * 2 - 1) * (halfD + 30)], i * 3);
      sparkPhase[i] = Math.random();
      sparkSize[i] = 7 + Math.random() * 8;
      sparkColor.set(sparkPalette[i % sparkPalette.length].toArray(), i * 3);
    }
    const sparkGeom = new THREE.BufferGeometry()
      .setAttribute("position", new THREE.BufferAttribute(sparkPos, 3))
      .setAttribute("aPhase", new THREE.BufferAttribute(sparkPhase, 1))
      .setAttribute("aSize", new THREE.BufferAttribute(sparkSize, 1))
      .setAttribute("aColor", new THREE.BufferAttribute(sparkColor, 3));
    const sparkMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() }, uAlpha: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aPhase; attribute float aSize; attribute vec3 aColor;
        uniform float uTime; uniform float uPx;
        varying float vAlpha; varying vec3 vColor;
        void main() {
          float rise = mod(uTime * 5.0 + aPhase * 160.0, 160.0);
          vec3 p = position + vec3(sin(uTime * 0.6 + aPhase * 30.0) * 6.0, rise, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPx * (520.0 / -mv.z);
          float life = rise / 160.0;
          vAlpha = (0.4 + 0.6 * abs(sin(uTime * 1.9 + aPhase * 6.283))) * smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.7, 1.0, life));
          vColor = aColor;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha;
        varying float vAlpha; varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float star = max(0.0, 1.0 - abs(c.x * c.y) * 140.0 - length(c) * 2.0);
          float core = smoothstep(0.16, 0.0, length(c));
          float a = max(star, core) * vAlpha * uAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    const sparks = new THREE.Points(sparkGeom, sparkMat);
    sparks.frustumCulled = false;
    scene.add(sparks);

    // Shared pin parts.
    const coneGeom = new THREE.ConeGeometry(3.4, 10, 24).rotateX(Math.PI).translate(0, 5, 0);
    const headGeom = new THREE.SphereGeometry(5.6, 32, 20).translate(0, 14, 0);
    const hitGeom = new THREE.SphereGeometry(11, 8, 6).translate(0, 12, 0);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    const blobGeom = new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2);
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
    const pinMats = new Map<string, THREE.MeshPhysicalMaterial>();
    const letterMats = new Map<string, THREE.SpriteMaterial>();
    const pinMat = (tier: string) => {
      let m = pinMats.get(tier);
      if (!m) {
        m = new THREE.MeshPhysicalMaterial({ color: fillOf(tier), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
        pinMats.set(tier, m);
      }
      return m;
    };
    const letterMat = (letter: string) => {
      let m = letterMats.get(letter);
      if (!m) {
        m = new THREE.SpriteMaterial({ map: letterTexture(letter), depthWrite: false });
        letterMats.set(letter, m);
      }
      return m;
    };

    // Selection effects: a light beam, ground ripples and a confetti burst.
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: srgb("#7c3aed") }, uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime; uniform float uOpacity; varying vec2 vUv;
        void main() {
          float fade = pow(1.0 - vUv.y, 1.7);
          float bands = 0.7 + 0.3 * sin(vUv.y * 42.0 - uTime * 5.0);
          gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.25 * (1.0 - vUv.y)), fade * bands * 0.55 * uOpacity);
        }`,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 3.2, 240, 40, 1, true).translate(0, 120, 0), beamMat);
    beam.visible = false;
    beam.renderOrder = 2;
    scene.add(beam);

    const ringGeom = new THREE.RingGeometry(0.93, 1, 96).rotateX(-Math.PI / 2);
    const ripples = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(ringGeom, new THREE.MeshBasicMaterial({ color: "#7c3aed", transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      return m;
    });

    const BITS = 80;
    const confetti = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2.6, 1.4),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false, transparent: true }),
      BITS,
    );
    confetti.frustumCulled = false;
    confetti.visible = false;
    // The colour buffer is created now, not at the first burst: having one changes the shader, which would then
    // compile in the middle of the first selection.
    for (let i = 0; i < BITS; i++) confetti.setColorAt(i, WHITE);
    scene.add(confetti);
    const bits = Array.from({ length: BITS }, () => ({
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      spin: 0,
    }));
    let burstAt: number | null = null;
    const dummy = new THREE.Object3D();
    const burst = (at: THREE.Vector3, tier: string) => {
      const palette = [fillOf(tier), ...CONFETTI];
      bits.forEach((b, i) => {
        b.p.copy(at);
        const a = Math.random() * Math.PI * 2;
        const up = 0.55 + Math.random() * 0.45;
        const sp = 55 + Math.random() * 75;
        b.v.set(Math.cos(a) * (1 - up) * sp * 1.6, up * sp * 1.4, Math.sin(a) * (1 - up) * sp * 1.6);
        b.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        b.spin = 6 + Math.random() * 12;
        confetti.setColorAt(i, new THREE.Color(palette[i % palette.length]));
      });
      if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
      burstAt = performance.now();
      confetti.visible = true;
    };

    // Flight arc between the previous and the new college.
    type Arc = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; curve: THREE.QuadraticBezierCurve3; t0: number; dur: number };
    let arc: Arc | null = null;
    const arcHead = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), new THREE.MeshBasicMaterial({ color: "#ffd84d", toneMapped: false }));
    arcHead.visible = false;
    scene.add(arcHead);
    const dropArc = () => {
      if (!arc) return;
      scene.remove(arc.mesh);
      arc.mesh.geometry.dispose();
      arc.mat.dispose();
      arc = null;
      arcHead.visible = false;
    };
    const launchArc = (a: Pin3D, b: Pin3D, dur: number) => {
      dropArc();
      const pa = new THREE.Vector3(a.x, pinBase(a) + 14, a.z);
      const pb = new THREE.Vector3(b.x, pinBase(b) + 14, b.z);
      const mid = pa.clone().lerp(pb, 0.5);
      mid.y += 50 + pa.distanceTo(pb) * 0.5;
      const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uHead: { value: 0 }, uFade: { value: 1 }, uA: { value: srgb(fillOf(a.tier)) }, uB: { value: srgb(fillOf(b.tier)) } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uHead; uniform float uFade; uniform vec3 uA; uniform vec3 uB; varying vec2 vUv;
          void main() {
            float u = vUv.x;
            float comet = smoothstep(uHead - 0.4, uHead, u) * step(u, uHead);
            float trail = step(u, uHead) * step(0.5, fract(u * 70.0)) * 0.55;
            float a = max(comet, trail) * uFade;
            if (a < 0.01) discard;
            gl_FragColor = vec4(mix(mix(uA, uB, u), vec3(1.0, 0.85, 0.3), comet * 0.35), a);
          }`,
      });
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 1.3, 8), mat);
      mesh.renderOrder = 3;
      scene.add(mesh);
      arc = { mesh, mat, curve, t0: performance.now(), dur };
    };

    // Pins.
    const pinMap = new Map<string, Pin3D>();
    const pinBase = (p: Pin3D) => (p.state ? p.state.mesh.position.y + SLAB * p.state.mesh.scale.y : SLAB);
    const introEnd = performance.now() + (reduced ? 0 : 1050);
    const setPins = (list: MapPin[]) => {
      const now = performance.now();
      const keep = new Set<string>();
      let fresh = 0;
      list.forEach((p) => {
        if (p.lat == null || p.lng == null) return;
        const xy = projection([p.lng, p.lat]);
        if (!xy) return;
        keep.add(p.slug);
        const existing = pinMap.get(p.slug);
        if (existing) {
          existing.leaving = null;
          return;
        }
        const tier = p.tier ?? "D";
        const state = stateAt(states, xy[0], xy[1]);
        const x = state ? state.cx + (xy[0] - state.cx) * GAP : xy[0];
        const z = state ? state.cz + (xy[1] - state.cz) * GAP : xy[1];
        const root = new THREE.Group();
        const body = new THREE.Group();
        const mat = pinMat(tier);
        const cone = new THREE.Mesh(coneGeom, mat);
        const head = new THREE.Mesh(headGeom, mat);
        cone.castShadow = head.castShadow = true;
        const letter = new THREE.Sprite(letterMat(p.tier ?? ""));
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
        scene.add(root);
        const startAt = Math.max(now, introEnd) + (reduced ? 0 : fresh++ * 85);
        pinMap.set(p.slug, { slug: p.slug, tier, x, z, state, root, body, letter, hit, born: startAt, leaving: null, phase: Math.random() * 6.28, hover: 0, sel: 0, pop: null, confetti: false });
      });
      for (const p of pinMap.values()) if (!keep.has(p.slug) && p.leaving == null) p.leaving = now;
      // The focused college was filtered out: head back to the whole map.
      if (selSlug && !keep.has(selSlug)) flyTo(targetRig());
      wake();
    };

    // Camera rig.
    const aspect = () => w / h;
    const overview = (): Rig => ({ tx: 0, ty: 0, tz: 18, dist: overviewDistance(aspect(), FOV, OVERVIEW_POLAR, halfW + 20, halfD + 20), polar: OVERVIEW_POLAR, az: 0, ax: 0.5, ay: 0.5 });
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
        ax: sheet ? 0.5 : selSide === "right" ? 0.31 : 0.69,
        ay: sheet ? 0.32 : 0.56,
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

    // Intro: start further out and glide in to the overview while the states rise.
    if (reduced) applyRig(rig);
    else {
      applyRig({ ...rig, dist: rig.dist * 1.9 });
      flyTo(overview(), 2600);
    }

    const select = (slug: string | null, side: "left" | "right") => {
      if (slug === selSlug && side === selSide) return;
      const prev = selSlug ? pinMap.get(selSlug) : undefined;
      const changed = slug !== selSlug;
      selSlug = slug;
      selSide = side;
      const next = slug ? pinMap.get(slug) : undefined;
      const dur = flyTo(targetRig());
      wake();
      if (!changed || !next) return;
      beamMat.uniforms.uColor.value = srgb(fillOf(next.tier));
      for (const r of ripples) (r.material as THREE.MeshBasicMaterial).color.set(fillOf(next.tier));
      if (reduced) return;
      if (prev && prev !== next) launchArc(prev, next, Math.max(700, dur * 0.85));
      // Only the chosen college has a pin: it drops in as the camera arrives, squashing and throwing confetti on impact.
      next.born = performance.now() + dur * 0.45;
      next.pop = next.born + 330;
      next.confetti = true;
    };

    // Pointer: hover via raycast, click (press without drag) selects.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SLAB);
    const hitPoint = new THREE.Vector3();
    const hitList: THREE.Object3D[] = [];
    let pointerIn = false;
    let pointerDirty = false;
    let hoverPin: Pin3D | null = null;
    let hoverState: StateMesh | null = null;
    let down: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      pointerIn = true;
      pointerDirty = true;
      wake();
    };
    const onLeave = () => {
      pointerIn = false;
      pointerDirty = true;
      wake();
    };
    const pick = () => {
      ray.setFromCamera(ndc, camera);
      hitList.length = 0;
      for (const p of pinMap.values()) if (p.leaving == null && p.root.visible) hitList.push(p.hit);
      const hits = ray.intersectObjects(hitList, false);
      const pin = hits.length ? pinMap.get(hits[0].object.userData.slug as string) ?? null : null;
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

    // Frame loop. It runs only while something moves (camera, hover, intro, pins, effects) or for IDLE_MS after the
    // last interaction, and never while the map is off-screen; otherwise the last frame stays up and the GPU rests.
    const start = performance.now();
    let last = start;
    const v = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    let frame = 0;
    let pinsWereShown = false;
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
      let busy = !!fly || pointerDirty || now - start < riseMs + 1200 || !!arc || burstAt != null;

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

      const selPin = selSlug ? pinMap.get(selSlug) ?? null : null;
      const selState = selPin?.state ?? null;

      // States: rise in, lift on hover, lift higher and tint when they hold the selected college.
      if (!reduced) for (const s of context) s.mesh.scale.y = Math.max(0.001, easeOutBack(clamp01((now - start - s.delay) / 950)));
      for (const s of states) {
        if (!reduced) {
          const t = clamp01((now - start - s.delay) / 950);
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
        const tint = s === selState ? 0.75 : s === hoverState ? 0.4 : 0;
        if (tint !== s.shade) {
          s.shade = tint;
          s.top.color.lerpColors(s.baseTop, WHITE, tint);
          s.edge.color.copy(s === selState ? EDGE_SEL : EDGE);
        }
      }

      // Pins.
      const pinScale = Math.min(2.1, Math.max(0.7, 1.65 * Math.sqrt(camDist / 950)));
      let pinsShown = false;
      for (const p of pinMap.values()) {
        const base = pinBase(p);
        p.root.position.y = base;
        const isSel = p === selPin;
        const hoverGoal = p === hoverPin ? 1 : 0;
        const selGoal = isSel ? 1 : 0;
        p.hover += (hoverGoal - p.hover) * k;
        p.sel += (selGoal - p.sel) * k;
        if (Math.abs(hoverGoal - p.hover) < 0.002) p.hover = hoverGoal;
        if (Math.abs(selGoal - p.sel) < 0.002) p.sel = selGoal;
        if (p.hover !== hoverGoal || p.sel !== selGoal || now < p.born + 900 || p.leaving != null || p.pop != null) busy = true;
        // Unselected pins stay hidden; a deselected one shrinks away.
        const show = isSel ? 1 : reduced ? 0 : p.sel;
        p.root.visible = show > 0.02;
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
          if (p.confetti && isSel) burst(new THREE.Vector3(p.x, base + 18 * s, p.z), p.tier);
          p.confetti = false;
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
          label.dataset.hover = String(on && (p === hoverPin || isSel));
        }
      }

      // A visible pin bobs and bounces, so its shadow is refreshed every other frame; one more pass clears it once the pin is gone.
      if ((pinsShown && (frame & 1) === 0) || (pinsWereShown && !pinsShown)) shadowDirty = true;
      pinsWereShown = pinsShown;
      frame++;

      // Selection effects follow the selected pin.
      if (selPin && selPin.leaving == null && !fly) {
        const base = pinBase(selPin);
        beamMat.uniforms.uOpacity.value += (1 - beamMat.uniforms.uOpacity.value) * k * 0.6;
        if (beamMat.uniforms.uOpacity.value > 0.995) beamMat.uniforms.uOpacity.value = 1;
        else busy = true;
        beam.visible = true;
        beam.position.set(selPin.x, base, selPin.z);
        beam.scale.set(pinScale, 1, pinScale);
        ripples.forEach((r, i) => {
          const t = reduced ? 0.5 : ((time / 2.4 + i / ripples.length) % 1);
          r.visible = true;
          r.position.set(selPin.x, base + 0.3, selPin.z);
          r.scale.setScalar((6 + t * 40) * pinScale);
          (r.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - t, 1.5) * 0.85;
        });
      } else {
        beamMat.uniforms.uOpacity.value = Math.max(0, beamMat.uniforms.uOpacity.value - dt * 4);
        if (beamMat.uniforms.uOpacity.value <= 0) beam.visible = false;
        else busy = true;
        for (const r of ripples) r.visible = false;
      }
      beamMat.uniforms.uTime.value = time;

      if (arc) {
        const t = (now - arc.t0) / arc.dur;
        arc.mat.uniforms.uHead.value = Math.min(1.4, t * 1.4);
        arc.mat.uniforms.uFade.value = 1 - clamp01((t - 1.1) / 0.8);
        arcHead.visible = t < 1 / 1.4;
        if (arcHead.visible) arcHead.position.copy(arc.curve.getPoint(clamp01(t * 1.4)));
        if (t > 1.9) dropArc();
      }

      if (burstAt != null) {
        const age = (now - burstAt) / 1000;
        if (age > 1.8) {
          burstAt = null;
          confetti.visible = false;
        } else {
          bits.forEach((b, i) => {
            b.v.y -= 140 * dt;
            b.v.multiplyScalar(1 - dt * 1.4);
            b.p.addScaledVector(b.v, dt);
            dummy.position.copy(b.p);
            dummy.quaternion.setFromAxisAngle(b.axis, age * b.spin);
            dummy.scale.setScalar(pinScale * (1 - clamp01((age - 1.2) / 0.6)));
            dummy.updateMatrix();
            confetti.setMatrixAt(i, dummy.matrix);
          });
          confetti.instanceMatrix.needsUpdate = true;
        }
      }

      sparkMat.uniforms.uTime.value = reduced ? 0 : time;
      sparkMat.uniforms.uAlpha.value = Math.min(1, Math.max(0, (now - start - 1200) / 1200));

      if (shadowDirty) renderer.shadowMap.needsUpdate = true;
      const ratio = now - lastActive > SHARPEN_MS ? restRatio : motionRatio();
      if (renderer.getPixelRatio() !== ratio) {
        renderer.setPixelRatio(ratio);
        sparkMat.uniforms.uPx.value = ratio;
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

    api.current = { setPins, select, resizeTo };
    setPins(latest.current.pins);
    if (latest.current.selected) select(latest.current.selected, latest.current.cardSide);

    // Pins and the selection effects stay hidden until a college is picked, and the first selection used to freeze for
    // a few hundred milliseconds: shaders were built on first use, and the first draw of each object costs the graphics
    // driver more again. Show them just long enough to compile in parallel with the intro, then draw them once.
    let disposed = false;
    const unseen = [beam, confetti, arcHead, ...ripples];
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
      renderer.setAnimationLoop(null);
      ro.disconnect();
      io.disconnect();
      controls.removeEventListener("change", wake);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      controls.dispose();
      dropArc();
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
      for (const geom of [coneGeom, headGeom, hitGeom, blobGeom]) geom.dispose();
      for (const m of [hitMat, blobMat, ...pinMats.values(), ...letterMats.values()]) {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
      confetti.dispose();
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

  if (failed) return <USMap {...props} pins={pins.filter((p) => p.slug === selected)} />;

  return (
    <div
      ref={box}
      className="map-sky relative h-full min-h-[420px] w-full touch-none overflow-hidden rounded-3xl border-2 border-blue-100"
    >
      <div className="pointer-events-none absolute inset-0">
        {pins.filter((p) => p.slug === selected).map((p) => (
          <button
            key={p.slug}
            ref={(node) => {
              if (node) labels.current.set(p.slug, node);
              else labels.current.delete(p.slug);
            }}
            type="button"
            aria-label={p.name}
            aria-pressed={p.slug === selected}
            data-selected={p.slug === selected}
            onClick={() => onSelect(p.slug)}
            className="map-label absolute left-0 top-0 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white shadow-lg"
          >
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: fillOf(p.tier ?? "D") }} />
            {p.name}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

