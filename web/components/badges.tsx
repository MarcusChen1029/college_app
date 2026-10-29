"use client";

import { useState } from "react";
import type { ApplyTag } from "@/lib/apply-tags";
import { SCHOOL_DOMAINS } from "@/lib/school-domains";
import type { Fit, FitResult } from "@/lib/fit";
import { useT } from "@/lib/i18n/client";
import { fitLabel, fitReasonText } from "@/lib/i18n/fit-text";
import { pillTone } from "@/lib/status";
import { fitClass, fitDotClass, FIT_LEVEL, tierClass, toneClass } from "@/lib/ui";
import type { TierCode } from "@/lib/types";

export function TierBadge({ tier, size = "md" }: { tier: TierCode | null | undefined; size?: "sm" | "md" }) {
  const t = useT();
  if (!tier) return <span className="text-zinc-400">—</span>;
  const plus = tier.length > 1;
  const dims = size === "sm" ? `h-5 text-[11px] ${plus ? "min-w-5 px-1" : "w-5"}` : `h-7 text-sm ${plus ? "min-w-7 px-1.5" : "w-7"}`;
  return (
    <span className={`inline-flex items-center justify-center rounded-md font-display font-bold ${dims} ${tierClass(tier)}`} title={t("status.tier", { tier })}>
      {tier}
    </span>
  );
}

// Chips are 12px by default; size "md" (13px) is for screens that keep every word at 13px or more (the Explore page).
const CHIP_TEXT = { sm: "text-xs", md: "text-[13px]" } as const;

/** `result` (from computeFit) gives the hover text in the visitor's language. */
export function FitBadge({ fit, result, size = "sm" }: { fit: Fit; result?: FitResult; size?: "sm" | "md" }) {
  const t = useT();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${CHIP_TEXT[size]} font-semibold whitespace-nowrap ${fitClass(fit)}`}
      title={result ? fitReasonText(t, result) : undefined}
    >
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`h-1.5 w-1.5 rounded-full border border-current ${n <= FIT_LEVEL[fit] ? fitDotClass(fit) : ""}`} />
        ))}
      </span>
      {fitLabel(t, fit)}
    </span>
  );
}

export function Pill({ children, tone = "zinc", size = "sm" }: { children: React.ReactNode; tone?: "zinc" | "blue" | "green" | "red"; size?: "sm" | "md" }) {
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 ${CHIP_TEXT[size]} font-medium ${toneClass(pillTone(tone))}`}>{children}</span>;
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

/** The school's logo (its site icon), shown left of the tier. Hides itself when there is none. */
export function SchoolLogo({ slug, size = "md" }: { slug: string; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const domain = SCHOOL_DOMAINS[slug];
  const dim = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  if (!domain || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${dim} shrink-0 rounded object-contain`}
    />
  );
}
