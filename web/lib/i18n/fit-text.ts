// Words a fit result (lib/fit.ts) in the current language. In English it equals `result.reason` (i18n.test.ts checks).
import type { Fit, FitResult } from "../fit.ts";
import type { TFunction } from "./index.ts";

const FIT_KEYS = {
  super_reach: "status.fit.super_reach",
  reach: "status.fit.reach",
  target: "status.fit.target",
  safety: "status.fit.safety",
} as const;

export function fitLabel(t: TFunction, fit: Fit): string {
  return t(FIT_KEYS[fit]);
}

export function fitReasonText(t: TFunction, r: FitResult): string {
  const p = r.parts;
  const bits = [
    t(p.intl ? "status.fitWhy.intlRate" : "status.fitWhy.rate", { rate: p.rate }),
    p.score ? t(`status.fitWhy.${p.score.band}`, { test: p.score.test }) : "",
    p.note ? t(`status.fitWhy.${p.note}`) : "",
  ];
  return bits.filter(Boolean).join(t("status.fitWhy.sep"));
}
