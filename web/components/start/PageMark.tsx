"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The root of a page that restyles the site frame through `html:has([data-…])` rules (the Start/Help block in
 * globals.css). The attributes are in the server HTML, so the first paint is already right. Next 16 keeps a visited
 * page mounted but hidden (React Activity) after the visitor leaves it, so a rendered attribute alone would keep
 * matching on the next page; the effect's cleanup, which runs when the page is hidden, takes the attributes off, and
 * the effect puts them back when the page is shown again (Back).
 */
export function PageMark({ marks, className, children }: { marks: readonly string[]; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = marks.join(" ");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const names = key.split(" ");
    for (const m of names) el.setAttribute(m, "");
    return () => {
      for (const m of names) el.removeAttribute(m);
    };
  }, [key]);
  const attrs = Object.fromEntries(marks.map((m) => [m, ""]));
  return (
    <div ref={ref} {...attrs} className={className}>
      {children}
    </div>
  );
}
