import type { ReactNode } from "react";
import { THEME_STYLE, type ClassTheme } from "@/lib/class-theme";

/**
 * The coloured banner of a class: the top of a class card (`size="card"`) and the head of a class page (`size="page"`).
 * Colours are the theme's literal hex values (lib/class-theme.ts) set inline, with soft circles from `.class-banner`
 * (globals.css). Long names wrap, never clip.
 *
 * - `subtitle`: the line under the name (school year; on a page "school year · teacher · school").
 * - `byline` (card only): the teacher's name, one line below the subtitle.
 * - `avatar` (card only): the teacher's initial, a round badge that overlaps the banner's bottom edge. The card's body
 *   leaves room for it (ClassCard).
 * - `actions` (page only): buttons above the name, at the right (Customize, a menu). They sit in the flow, so a long name
 *   on a phone can never run under them.
 */
export function ClassBanner({
  theme,
  title,
  subtitle,
  byline,
  size,
  avatar,
  actions,
}: {
  theme: ClassTheme;
  title: string;
  subtitle?: string;
  byline?: string;
  size: "card" | "page";
  avatar?: string;
  actions?: ReactNode;
}) {
  const s = THEME_STYLE[theme];
  const page = size === "page";
  const Heading = page ? "h1" : "h2"; // a card sits directly under its page's h1
  return (
    <div
      className={`class-banner relative flex flex-col justify-end ${
        page ? "min-h-32 rounded-xl px-5 pb-5 pt-4 sm:min-h-40 sm:px-7 sm:pb-6" : "rounded-t-[11px] px-4 pb-9 pt-4"
      }`}
      data-dark={theme === "ink" ? "" : undefined}
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {page && actions && <div className="mb-4 flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      <Heading className={`font-display font-bold leading-tight tracking-tight [overflow-wrap:anywhere] ${page ? "text-[1.625rem] sm:text-3xl" : "text-xl"}`}>{title}</Heading>
      {subtitle && <p className={`mt-1 [overflow-wrap:anywhere] ${page ? "text-sm sm:text-[15px]" : "text-[13px]"}`}>{subtitle}</p>}
      {!page && byline && <p className="mt-1.5 text-[13px] font-semibold [overflow-wrap:anywhere]">{byline}</p>}
      {!page && avatar && (
        <span
          aria-hidden="true"
          className="absolute -bottom-[26px] right-3.5 grid size-14 place-items-center rounded-full border-[3px] border-white text-[22px] font-bold"
          style={{ backgroundColor: s.avatarBg, color: s.avatarFg }}
        >
          {avatar}
        </span>
      )}
    </div>
  );
}
