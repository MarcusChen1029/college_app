"use client";

// /pricing: what each plan includes, the same rows for Free and the pass so the difference reads across a row.
// The values come from lib/plans.ts (PLANS); the visitor's current plan is marked in its column head.

import { AccessMark } from "@/components/ai-access/AccessLists";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { PLANS, type PlanKey } from "@/lib/plans";
import { PANEL } from "@/lib/ui";

type Cell = { text: string; short?: string } | { mark: boolean };
type Row = { label: MessageKey; sub?: MessageKey; free: Cell; senior: Cell };

/** A tick, a cross, or a short value. Ticks and crosses carry their meaning for screen readers. */
function Value({ cell, strong }: { cell: Cell; strong: boolean }) {
  const t = useT();
  if ("text" in cell) {
    const cls = strong ? "font-semibold text-ink" : "text-ink";
    // A long value gives way to its short form on a phone, where the column is about 80px wide.
    if (cell.short) {
      return (
        <>
          <span className={`sm:hidden ${cls}`}>{cell.short}</span>
          <span className={`hidden sm:inline ${cls}`}>{cell.text}</span>
        </>
      );
    }
    return <span className={cls}>{cell.text}</span>;
  }
  return (
    <>
      <AccessMark yes={cell.mark} />
      <span className="sr-only">{cell.mark ? t("misc.pricing.included") : t("misc.pricing.notIncluded")}</span>
    </>
  );
}

export function PlanCompare({ current }: { current: PlanKey | null }) {
  const t = useT();
  const [free, senior] = PLANS;
  const limit = (n: number | null): Cell => ({ text: n == null ? t("misc.pricing.cellUnlimited") : t("misc.pricing.cellUpTo", { n }) });
  const rows: Row[] = [
    { label: "misc.pricing.rowList", free: limit(free.limit), senior: limit(senior.limit) },
    { label: "misc.pricing.featChecklist", free: { mark: true }, senior: { mark: true } },
    { label: "misc.pricing.featReminders", free: { mark: true }, senior: { mark: true } },
    {
      label: "misc.pricing.rowAi",
      sub: "misc.pricing.rowAiSub",
      free: { text: t(free.fullAiContext ? "misc.pricing.cellAiFull" : "misc.pricing.cellAiBasic") },
      senior: { text: t(senior.fullAiContext ? "misc.pricing.cellAiFull" : "misc.pricing.cellAiBasic"), short: senior.fullAiContext ? t("misc.pricing.cellAiFullShort") : undefined },
    },
    { label: "misc.pricing.rowConnect", sub: "misc.pricing.rowConnectSub", free: { mark: free.connectAi }, senior: { mark: senior.connectAi } },
    { label: "misc.pricing.rowFiller", sub: "misc.pricing.rowFillerSub", free: { mark: free.filler }, senior: { mark: senior.filler } },
  ];
  const yours = (
    <span className="mt-2 inline-flex h-6 flex-none items-center whitespace-nowrap rounded-full bg-blue-100 px-2.5 text-[13px] font-semibold text-ink">
      <span className="sm:hidden">{t("misc.pricing.yoursShort")}</span>
      <span className="hidden sm:inline">{t("misc.pricing.currentPlan")}</span>
    </span>
  );

  return (
    <section aria-labelledby="plan-compare" className={`${PANEL} px-5 py-6 sm:p-8`}>
      <h2 id="plan-compare" className="font-display text-xl font-bold tracking-tight text-ink">
        {t("misc.pricing.compareTitle")}
      </h2>
      <table className="mt-5 w-full table-fixed text-left text-[15px] leading-snug">
        <colgroup>
          <col />
          <col className="w-[25%] sm:w-[24%]" />
          <col className="w-[25%] sm:w-[30%]" />
        </colgroup>
        <thead>
          <tr className="align-bottom">
            <th scope="col" className="pb-4 pr-3 text-[13px] font-medium text-zinc-600">
              {t("misc.pricing.feature")}
            </th>
            <th scope="col" className="pb-4 pr-3">
              <span className="block font-display text-lg font-bold leading-tight text-ink">{t("payments.planName.free")}</span>
              <span className="block text-sm font-normal text-zinc-600">{t("misc.pricing.noPayment")}</span>
              {current === "free" && yours}
            </th>
            <th scope="col" className="pb-4">
              <span className="block font-display text-lg font-bold leading-tight text-ink">
                <span className="sm:hidden">{t("misc.pricing.passShort")}</span>
                <span className="hidden sm:inline">{t("payments.planName.senior")}</span>
              </span>
              <span className="block text-sm font-normal tabular-nums text-zinc-600">{t("payments.price", { price: senior.priceTwd })}</span>
              {current === "senior" && yours}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 border-t border-zinc-300">
          {rows.map((r) => (
            <tr key={r.label} className="align-top">
              <th scope="row" className="py-3 pr-3 font-normal">
                <span className="block font-semibold text-ink">{t(r.label)}</span>
                {r.sub && <span className="mt-0.5 block text-sm text-zinc-600">{t(r.sub)}</span>}
              </th>
              <td className="py-3 pr-3">
                <Value cell={r.free} strong={false} />
              </td>
              <td className="py-3">
                <Value cell={r.senior} strong />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
