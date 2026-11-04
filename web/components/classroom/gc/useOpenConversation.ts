"use client";

// The conversation named by `?c=<id>` on a screen, and a way to open or close one. The address follows without a
// navigation (history.replaceState; Next keeps useSearchParams in step), so a reload or a shared link comes back to the
// open conversation and the Back button is not used up. The screen must sit under a <Suspense> boundary.

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** `path` is the screen's own address without a query (`/counselor`, `/counselor/teacher/<id>`). */
export function useOpenConversation(path: string): readonly [string | null, (id: string | null) => void] {
  const id = useSearchParams().get("c");
  const open = useCallback(
    (next: string | null) => {
      window.history.replaceState(null, "", next ? `${path}?c=${encodeURIComponent(next)}` : path);
    },
    [path],
  );
  return [id, open] as const;
}
