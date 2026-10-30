"use client";

import { useEffect, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { buttonClass } from "@/lib/ui";
import { FlatMap } from "./FlatMap";

// The explorer's map panel, loaded in two steps so the page is usable first:
//  1. The flat SVG map (FlatMap) is there at once: the same dots, clickable, with the selected college named. It carries no
//     three.js.
//  2. As soon as the browser is idle after the page has hydrated, the 3D map (USMap3D, ~600 kB of three.js) is fetched and built.
//     It is built in short slices that never block input (see the mount effect in USMap3D) and draws nothing until its shaders
//     are compiled, so there is nothing to wait for or work around here: no fixed delay. When its first frame is on the canvas
//     the flat map fades out over it.
//
// If the 3D chunk cannot be loaded (offline, a deploy replaced it) the flat map stays, with a note and a button that asks for the
// chunk again; only this panel changes, and the list, filters and card keep working. next/dynamic is not used because its loader
// (React.lazy) keeps a rejected import forever, so "try again" could never succeed.
// The same goes when the 3D scene is lost after it was built (the graphics context was reset, or the build threw, before or after
// its first frame): the flat map comes back with its own note, and "try again" mounts a fresh scene.
// Only one of the two maps is live at any moment: the other is `inert` (out of the tab order and the accessibility tree), so the
// selected college is never offered twice and the 3D map's label cannot be focused while the flat map covers it.
// `children` (the college card over the map on wide screens) render here, beside the map, so they show at once.

type MapProps = ComponentProps<typeof import("./USMap3D").USMap3D>;
type Props = Omit<MapProps, "children" | "onFirstFrame" | "onLost"> & { children?: ReactNode };

// Only a successful load is remembered (so coming back to the page shows the 3D map at once); a failed one is never stored.
let loaded: ComponentType<MapProps> | null = null;

export function ExplorerMap({ children, ...map }: Props) {
  const t = useT();
  const [Impl, setImpl] = useState<ComponentType<MapProps> | null>(() => loaded);
  const [failed, setFailed] = useState(false);
  // The 3D scene was built (or being built) and then lost: its panel shows the flat map until "try again".
  const [lost, setLost] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Whether to start fetching the 3D map yet; a visit that already has it starts at once.
  const [wanted, setWanted] = useState(() => loaded !== null);
  // The flat map overlay: shown until the 3D map has drawn, then faded out and removed.
  const [overlay, setOverlay] = useState(() => loaded === null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (wanted) return;
    // When the browser is idle after hydration (and within 300 ms whatever it is doing).
    if ("requestIdleCallback" in window) {
      const idle = window.requestIdleCallback(() => setWanted(true), { timeout: 300 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = setTimeout(() => setWanted(true), 50);
    return () => clearTimeout(timer);
  }, [wanted]);

  useEffect(() => {
    if (!wanted || Impl) return;
    let live = true;
    import("./USMap3D").then(
      (m) => {
        loaded = m.USMap3D;
        if (live) setImpl(() => m.USMap3D);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [wanted, Impl, attempt]);

  // The overlay is removed when its fade ends (and, in case no transition runs, shortly after).
  useEffect(() => {
    if (!fading) return;
    const id = setTimeout(() => setOverlay(false), 450);
    return () => clearTimeout(id);
  }, [fading]);

  // The scene is gone: the flat map is the live one again (full opacity, clickable) whether or not the first frame had faded it out.
  const onLost = () => {
    setLost(true);
    setFading(false);
    setOverlay(true);
  };

  const retry = () => {
    setFailed(false);
    setLost(false);
    setFading(false);
    setOverlay(true); // the flat map stays live until the fresh scene has drawn its first frame
    setWanted(true);
    setAttempt((n) => n + 1);
  };

  const flat = <FlatMap region={map.region ?? "US"} pins={map.pins} selected={map.selected} onSelect={map.onSelect} />;
  return (
    <div className="relative h-full w-full">
      {Impl && !lost ? (
        // The scene is built once for a region, so a switch remounts it (see USMap3D's `region`), and so does a retry.
        // While the flat map is still on top of it, it is not live.
        <div className="h-full w-full" inert={overlay && !fading}>
          <Impl key={`${map.region}:${attempt}`} {...map} onFirstFrame={() => setFading(true)} onLost={onLost} />
        </div>
      ) : overlay ? (
        <div aria-hidden="true" className="map-sky relative h-full w-full overflow-hidden" />
      ) : failed ? (
        flat
      ) : (
        <div aria-hidden="true" className="map-sky relative h-full w-full overflow-hidden" />
      )}
      {overlay && (
        <div
          className="absolute inset-0 z-[1] transition-opacity duration-300"
          style={fading ? { opacity: 0, pointerEvents: "none" } : undefined}
          // Fading out: the 3D map is the live one now.
          inert={fading}
          onTransitionEnd={() => fading && setOverlay(false)}
        >
          {flat}
        </div>
      )}
      {((failed && !Impl) || lost) && (
        <div role="status" className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-2 text-sm shadow-sm ring-1 ring-zinc-200">
          <span>{lost ? t("common.map3dLost") : t("common.map3dFailed")}</span>
          <button type="button" onClick={retry} className={buttonClass("quiet", "sm")}>
            {t("common.map3dRetry")}
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
