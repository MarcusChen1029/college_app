"use client";

import { useEffect, useRef, useState } from "react";

export type JumpItem = { id: string; label: string };

/**
 * Sticky "on this page" bar for long pages. Links jump to section ids; the section in view is marked as current.
 * globals.css pads the page's scroll top while this bar is present, so jumps and keyboard focus land below it.
 */
export function JumpNav({ items, label }: { items: JumpItem[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id);
  const [top, setTop] = useState(61);
  const listRef = useRef<HTMLUListElement>(null);

  // Sit right below the sticky site header, whose height differs between phone and desktop.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("body > header");
    if (!header) return;
    const measure = () => setTop(header.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const sections = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => el !== null);
    if (!sections.length) return;
    // A section is current once its top passes the bars, until a lower one does. Two sections side by side
    // (same top) count as one row, and the first of them stays current.
    const onScroll = () => {
      const line = 140;
      let current = sections[0].id;
      let currentTop = -Infinity;
      for (const s of sections) {
        const top = s.getBoundingClientRect().top;
        if (top <= line && top > currentTop + 4) {
          current = s.id;
          currentTop = top;
        }
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActive(atBottom ? sections[sections.length - 1].id : current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);

  // Keep the current chip visible when the bar scrolls sideways (phones). Scrolls the bar only, never the page.
  useEffect(() => {
    const list = listRef.current;
    const chip = list?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!list || !chip) return;
    const left = chip.offsetLeft - list.clientWidth / 2 + chip.clientWidth / 2;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ left, behavior: still ? "auto" : "smooth" });
  }, [active]);

  if (items.length < 2) return null;
  return (
    <nav aria-label={label} data-jump-nav style={{ top }} className="sticky z-10 -mx-4 border-b border-zinc-200 bg-white px-4 print:hidden">
      <ul ref={listRef} className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((i) => (
          <li key={i.id} data-id={i.id} className="shrink-0">
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "location" : undefined}
              className="block rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-ink aria-[current=location]:bg-ink aria-[current=location]:text-white"
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
