"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";

const STEP = 20;

// How many rows of a long list to render. Starts small and grows as the reader scrolls;
// goes back to the first page whenever `resetKey` changes (new search, sort or filter).
// `need` is a row that must be rendered (a college picked on the map, deep in the list): the count grows to include it and
// stays grown when it is let go, so the list never shrinks under the reader.
export function useVisibleCount(resetKey: string, total: number, need = -1) {
  const [state, setState] = useState({ key: resetKey, n: STEP });
  let n = state.key === resetKey ? state.n : STEP;
  const want = need >= 0 ? Math.ceil((need + 1) / STEP) * STEP : 0;
  if (want > n) {
    // Adjusting state while rendering (react.dev "storing information from previous renders"): React re-renders at once.
    n = want;
    setState({ key: resetKey, n });
  }
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
    <div ref={ref} className="py-2 text-center">
      <button type="button" onClick={onVisible} className="text-sm font-semibold text-zinc-600 underline underline-offset-4 hover:text-ink">
        {t("colleges.showMore")}
      </button>
    </div>
  );
}
