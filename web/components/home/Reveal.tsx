"use client";

import { useEffect } from "react";

/**
 * Entrances for the home page: elements marked `data-reveal` rise in once as they scroll into view, staggered by
 * their `--i`. Content is only hidden after this runs (the `reveal-ready` class), so a page without script shows
 * everything; a timer shows anything the observer never reported.
 */
export function Reveal() {
  useEffect(() => {
    const root = document.documentElement;
    const items = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    if (items.length === 0 || !("IntersectionObserver" in window)) return;
    root.classList.add("reveal-ready");
    const show = (el: Element) => el.setAttribute("data-in", "");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          show(e.target);
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    items.forEach((el) => io.observe(el));
    const fallback = window.setTimeout(() => items.forEach(show), 4000);
    return () => {
      io.disconnect();
      window.clearTimeout(fallback);
      root.classList.remove("reveal-ready");
    };
  }, []);
  return null;
}
