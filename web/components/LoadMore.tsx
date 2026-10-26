"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";

const STEP = 20;

// How many rows of a long list to render. Starts small and grows as the reader scrolls;
// goes back to the first page whenever `resetKey` changes (new search, sort or filter).
export function useVisibleCount(resetKey: string, total: number) {
  const [state, setState] = useState({ key: resetKey, n: STEP });
  const n = state.key === resetKey ? state.n : STEP;
  const more = useCallback(() => setState((s) => ({ key: resetKey, n: (s.key === resetKey ? s.n : STEP) + STEP })), [resetKey]);
  return { count: Math.min(n, total), hasMore: n < total, more };
}

// Place after the last rendered row; calls `onVisible` when it scrolls into (or near) view.
// Keyed by the row count so it re-observes after each batch, even if it never left the viewport.
export function LoadMore({ onVisible, count }: { onVisible: () => void; count: number }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      onVisible();
      return;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onVisible(), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
  return (
    <div ref={ref} className="py-2 text-center text-xs text-zinc-400">
      <button type="button" onClick={onVisible} className="underline">
        {t("colleges.showMore")}
      </button>
    </div>
  );
}
