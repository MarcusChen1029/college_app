"use client";

import { useEffect, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { buttonClass } from "@/lib/ui";
import { FlatMap } from "./FlatMap";

// The explorer's map panel. three.js is ~620 kB, so the 3D map (USMap3D) loads after the list has hydrated, and this panel is
// what holds its place until it does:
//  - loading: an empty box of the map's own classes, so nothing moves when the map swaps in;
//  - loaded: the 3D map;
//  - the chunk failed (offline, a deploy replaced it): the flat SVG map, which carries no three.js, with a note and a button
//    that asks for the chunk again. Only this panel changes: the list, filters and card keep working.
// next/dynamic is not used because its loader (React.lazy) keeps a rejected import forever, so "try again" could never succeed.
// `children` (the college card over the map on wide screens) render here, beside the map, so they show at once.

type MapProps = ComponentProps<typeof import("./USMap3D").USMap3D>;
type Props = Omit<MapProps, "children"> & { children?: ReactNode };

// Only a successful load is remembered (so coming back to the page shows the map at once); a failed one is never stored.
let loaded: ComponentType<MapProps> | null = null;

export function ExplorerMap({ children, ...map }: Props) {
  const t = useT();
  const [Impl, setImpl] = useState<ComponentType<MapProps> | null>(() => loaded);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (Impl) return;
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
  }, [Impl, attempt]);

  const retry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };

  return (
    <div className="relative h-full w-full">
      {Impl ? (
        // The scene is built once for a region, so a switch remounts it (see USMap3D's `region`).
        <Impl key={map.region} {...map} />
      ) : failed ? (
        <FlatMap region={map.region ?? "US"} pins={map.pins} selected={map.selected} onSelect={map.onSelect} />
      ) : (
        <div aria-hidden="true" className="map-sky relative h-full w-full overflow-hidden" />
      )}
      {failed && !Impl && (
        <div role="status" className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-2 text-sm shadow-sm ring-1 ring-zinc-200">
          <span>{t("common.map3dFailed")}</span>
          <button type="button" onClick={retry} className={buttonClass("quiet", "sm")}>
            {t("common.map3dRetry")}
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
