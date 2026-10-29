"use client";

import { useState } from "react";
import type { ApplyTag } from "@/lib/apply-tags";
import { SCHOOL_DOMAINS } from "@/lib/school-domains";
import type { Fit, FitResult } from "@/lib/fit";
import { useT } from "@/lib/i18n/client";
import { fitLabel, fitReasonText } from "@/lib/i18n/fit-text";
import { pillTone } from "@/lib/status";
import { fitClass, FIT_LEVEL, tierClass, toneClass } from "@/lib/ui";
import type { TierCode } from "@/lib/types";

export function TierBadge({ tier, size = "md" }: { tier: TierCode | null | undefined; size?: "sm" | "md" }) {
  const t = useT();
  if (!tier) return <span className="text-zinc-400">—</span>;
  const plus = tier.length > 1;
  const dims = size === "sm" ? `h-6 text-[13px] ${plus ? "min-w-6 px-1" : "w-6"}` : `h-7 text-sm ${plus ? "min-w-7 px-1.5" : "w-7"}`;
  return (
    <span className={`inline-flex items-center justify-center rounded-md font-display font-bold ${dims} ${tierClass(tier)}`} title={t("status.tier", { tier })}>
      {tier}
    </span>
  );
}

// Every chip reads at 13px (app screens keep words at 13px or more). Both sizes are now the same; the prop stays so the
// callers that pass size="md" (the Explore page) need not change.
const CHIP_TEXT = { sm: "text-[13px] py-0.5", md: "text-[13px] py-0.5" } as const;

/** A flat chip in the band's fill with its word in the band's ink, and four dots (filled in the chip's own ink) that fill
 *  harder-to-easier, so the band reads without colour too. `result` (from computeFit) gives the hover text in the visitor's language. */
export function FitBadge({ fit, result, size = "sm" }: { fit: Fit; result?: FitResult; size?: "sm" | "md" }) {
  const t = useT();
  return (
    <span
      className={`inline-flex flex-none items-center gap-1.5 rounded-full border px-2.5 ${CHIP_TEXT[size]} font-semibold whitespace-nowrap ${fitClass(fit)}`}
      title={result ? fitReasonText(t, result) : undefined}
    >
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`h-1.5 w-1.5 rounded-full border border-current ${n <= FIT_LEVEL[fit] ? "bg-current" : ""}`} />
        ))}
      </span>
      {fitLabel(t, fit)}
    </span>
  );
}

export function Pill({ children, tone = "zinc", size = "sm" }: { children: React.ReactNode; tone?: "zinc" | "blue" | "green" | "red"; size?: "sm" | "md" }) {
  return <span className={`inline-block flex-none whitespace-nowrap rounded border px-1.5 ${CHIP_TEXT[size]} font-medium ${toneClass(pillTone(tone))}`}>{children}</span>;
}

/** "No supplements" / "No app fee" (lib/apply-tags.ts). Renders nothing without tags. */
export function ApplyTags({ tags, className = "", size = "sm" }: { tags: readonly ApplyTag[] | undefined; className?: string; size?: "sm" | "md" }) {
  const t = useT();
  if (!tags?.length) return null;
  return (
    <span className={`flex flex-wrap gap-1 ${className}`}>
      {tags.map((tag) => (
        <span key={tag} title={t(`colleges.tag.${tag}.title`)} className="whitespace-nowrap">
          <Pill tone="green" size={size}>{t(`colleges.tag.${tag}`)}</Pill>
        </span>
      ))}
    </span>
  );
}

// Words that never start a school's initials ("University of Houston-Downtown" → UH, not UO).
const MINOR = new Set(["of", "the", "at", "and", "in", "for", "a"]);
/**
 * "Kansas State" → KS, "LSE" → LSE, "UH Downtown" → UH, "Cambridge" → C: up to 3 letters from the name people use. A
 * four-letter acronym won't fit the square at 13px, so it keeps its first two ("NYIT" → NY, "UTEP" → UT), never a cut "NYI".
 */
export function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\s-]/gu, " ").split(/[\s-]+/).filter(Boolean);
  if (!words.length) return "";
  if (/^\p{Lu}{2,4}$/u.test(words[0])) return words[0].length === 4 ? words[0].slice(0, 2) : words[0];
  return words
    .filter((w) => !MINOR.has(w.toLowerCase()))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/**
 * The school's logo (its site icon), shown left of the tier. Without one it hides itself, or, given the school's `name`, shows
 * its initials on a pale square so a list keeps a mark in every row.
 */
export function SchoolLogo({ slug, size = "md", name }: { slug: string; size?: "sm" | "md"; name?: string }) {
  const [failed, setFailed] = useState(false);
  const domain = SCHOOL_DOMAINS[slug];
  const dim = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  // An icon that failed before hydration fired its error event while React was not yet listening: catch it at mount.
  // (A site with no icon gets Google's grey globe, which loads like any image; at 16px it can't be told from a real small
  // icon such as NYU's, and Google sends no CORS header to compare pixels, so the globe stays.)
  const check = (img: HTMLImageElement) => {
    if (img.naturalWidth === 0) setFailed(true);
  };
  if (!domain || failed) {
    const ini = name ? initialsOf(name) : "";
    if (!ini) return null;
    return (
      <span
        aria-hidden="true"
        className={`${dim} grid shrink-0 place-items-center rounded bg-zinc-100 font-display font-bold leading-none text-zinc-700 ${size === "sm" ? "text-[10px]" : ini.length > 2 ? "text-[13px] tracking-tighter" : "text-[13px]"}`}
      >
        {ini}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
      alt=""
      loading="lazy"
      ref={(img) => {
        if (img?.complete) check(img);
      }}
      onError={() => setFailed(true)}
      className={`${dim} shrink-0 rounded object-contain`}
    />
  );
}
