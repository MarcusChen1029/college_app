"use client";

// Jump links (classroom phase 1, spec §6). A link such as `/application/list?focus=college:mit` lands on a page whose
// items carry `data-focus="<anchorKey>"` (lib/anchors.ts). This hook reads `focus`, lets the page open whatever hides
// the item (a folded card, another tab, a modal), then scrolls the item to the middle of the screen and flashes it.
// The page must sit under a <Suspense> boundary (useSearchParams).

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { anchorKey, parseFocus, type Anchor } from "@/lib/anchors";

const FLASH = "focus-flash";
const FLASH_MS = 2000;
/** Frames to wait for the item to appear and be laid out (a folded card opens, a tab switches, a list loads). */
const MAX_TRIES = 30;

/** Runs `fn` on the next frame. A hidden tab or pane never fires animation frames, so a timer stands in there. */
function nextFrame(fn: () => void): () => void {
  if (document.hidden) {
    const id = window.setTimeout(fn, 0);
    return () => window.clearTimeout(id);
  }
  const id = requestAnimationFrame(fn);
  return () => cancelAnimationFrame(id);
}

/** The item for a key, once it is laid out: an element inside a folded card or a closed tab has no boxes yet. */
function findTarget(key: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>("[data-focus]")) {
    if (el.getAttribute("data-focus") === key && el.getClientRects().length > 0) return el;
  }
  return null;
}

/** Scrolls the item to the middle (a tall one, such as a whole list, to its top) and runs the `focus-flash` highlight. */
function reveal(el: HTMLElement): void {
  el.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.8 ? "start" : "center" });
  el.classList.remove(FLASH);
  void el.offsetWidth; // restart the animation when the same item is flashed again
  el.classList.add(FLASH);
  // React rewrites `class` whenever the item's own className prop changes (a profile card that opens as part of the jump),
  // which would drop the highlight; put it back until the flash is over.
  const keep = new MutationObserver(() => {
    if (!el.classList.contains(FLASH)) el.classList.add(FLASH);
  });
  keep.observe(el, { attributes: true, attributeFilter: ["class"] });
  window.setTimeout(() => {
    keep.disconnect();
    el.classList.remove(FLASH);
  }, FLASH_MS);
}

/**
 * Scrolls to and flashes the item whose `data-focus` is `key` as soon as it is laid out, trying for `ms` milliseconds (the
 * item may be in a tab that is still switching or a list that is still loading). Unlike `?focus=` the key need not be an
 * anchor, so a private note's row (`note:<id>`) works too. Returns a function that stops the search.
 */
export function revealItem(key: string, ms = 4000): () => void {
  const until = Date.now() + ms;
  let cancel = () => {};
  const look = () => {
    const el = findTarget(key);
    if (el) {
      reveal(el);
    } else if (Date.now() < until) {
      cancel = nextFrame(look);
    }
  };
  cancel = nextFrame(look);
  return () => cancel();
}

/**
 * Scrolls a form field to the middle of the screen and focuses it, from the next frame on and as soon as it is laid out
 * (its tab may still be switching), trying for `ms` milliseconds. `get` reads the field each frame (a ref). Returns a
 * function that stops the search.
 */
export function focusField(get: () => HTMLElement | null, ms = 4000): () => void {
  const until = Date.now() + ms;
  let cancel = () => {};
  const look = () => {
    const el = get();
    if (el && el.getClientRects().length > 0) {
      el.scrollIntoView({ block: "center" });
      el.focus({ preventScroll: true });
    } else if (Date.now() < until) {
      cancel = nextFrame(look);
    }
  };
  cancel = nextFrame(look);
  return () => cancel();
}

/**
 * Brings the item named by `?focus=` into view. Once `ready` (the page's data has loaded), calls `open(anchor)` so the
 * page can expand or switch to what holds the item, then on the next frames finds `[data-focus="<anchorKey>"]`, scrolls
 * to it and flashes it. Does nothing when the value is not a valid anchor or the item is not on the page.
 * Runs once per `focus` value; a different value (another jump link) runs again.
 */
export function useFocusTarget({ ready, open }: { ready: boolean; open?: (a: Anchor) => void }): void {
  const focus = useSearchParams().get("focus");
  // The latest callback without re-running the effect each time the page re-renders.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!focus) {
      handled.current = null;
      return;
    }
    if (!ready || handled.current === focus) return;
    const anchor = parseFocus(focus);
    if (!anchor) return;
    const key = anchorKey(anchor);
    let cancel = () => {};
    let tries = 0;
    const look = () => {
      const el = findTarget(key);
      if (el) reveal(el);
      if (el || ++tries >= MAX_TRIES) {
        handled.current = focus;
        return;
      }
      cancel = nextFrame(look);
    };
    const opener = openRef.current;
    opener?.(anchor);
    // With an `open` callback the search starts one frame later, so the page's state change has been drawn (an item that
    // was already on screen, such as a profile card, may move or resize when its card opens).
    const afterSettling = () => {
      cancel = nextFrame(look);
    };
    cancel = nextFrame(opener ? afterSettling : look);
    // The cleanup only stops the search; a strict-mode remount runs the effect again because `handled` is set only when
    // the search ends.
    return () => cancel();
  }, [ready, focus]);
}
