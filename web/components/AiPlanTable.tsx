"use client";

// Which AI plans can add a custom connector and make changes (lib/ai-plans.ts, from the vendors' own help pages), with the
// check date and a source link per row. Shown to every visitor, signed in or not, so it reads no account data.

import { useId } from "react";
import { CHECKED_ON, PLAN_ROWS, type PlanRow, type Support } from "@/lib/ai-plans";
import { useT } from "@/lib/i18n/client";
import type { Tone } from "@/lib/status";
import { PANEL, TABLE_HEAD, toneClass } from "@/lib/ui";
import { StatusIcon } from "./StatusPill";

// Written out so the i18n scan sees every key.
const LABEL = {
  yes: "misc.connect.support.yes",
  readOnly: "misc.connect.support.readOnly",
  no: "misc.connect.support.no",
  notConfirmed: "misc.connect.support.notConfirmed",
} as const satisfies Record<Support, string>;

// A tone and an icon per answer, never colour alone: the word is always there. "Not confirmed" is a dashed outline, so it can't
// pass for a "No".
const TONE: Record<Support, Tone> = { yes: "done", readOnly: "progress", no: "neutral", notConfirmed: "neutral" };

const VENDORS: PlanRow["vendor"][] = ["ChatGPT", "Claude", "Gemini"];

function SupportPill({ value }: { value: Support }) {
  const t = useT();
  return (
    <span
      className={`inline-flex items-start gap-1 rounded-full border px-2 py-0.5 text-[13px] font-semibold leading-tight ${toneClass(TONE[value])} ${value === "notConfirmed" ? "border-dashed" : ""}`}
    >
      <span className="mt-px">
        <StatusIcon tone={TONE[value]} />
      </span>
      {t(LABEL[value])}
    </span>
  );
}

function VendorTable({ vendor, rows }: { vendor: PlanRow["vendor"]; rows: PlanRow[] }) {
  const t = useT();
  const headingId = useId();
  return (
    <div>
      <h3 id={headingId} className="font-display text-lg font-bold text-ink">
        {vendor}
      </h3>
      {/* The table is narrow enough for a phone; if a long word ever pushes it wider, it scrolls inside this box, never the page. */}
      <div className="mt-1 overflow-x-auto">
        <table aria-labelledby={headingId} className="w-full border-collapse text-left">
          <thead>
            <tr className={TABLE_HEAD}>
              <th scope="col" className="py-2 pr-2 font-medium">
                {t("misc.connect.plansColPlan")}
              </th>
              <th scope="col" className="w-24 px-1 py-2 font-medium sm:w-36">
                {t("misc.connect.plansColConnect")}
              </th>
              <th scope="col" className="w-24 px-1 py-2 font-medium sm:w-36">
                {t("misc.connect.plansColChanges")}
              </th>
            </tr>
          </thead>
          {/* One body per plan: its answers on the first line, the note and the source link under them. */}
          {rows.map((r) => (
            <tbody key={r.plan} className="border-t border-zinc-200">
              <tr>
                <th scope="row" className="pb-1 pr-2 pt-3 text-left align-top text-base font-semibold text-ink">
                  {r.plan}
                </th>
                <td className="px-1 pb-1 pt-3 align-top">
                  <SupportPill value={r.connect} />
                </td>
                <td className="px-1 pb-1 pt-3 align-top">
                  <SupportPill value={r.changes} />
                </td>
              </tr>
              <tr>
                <td colSpan={3} className="pb-3 pr-2 text-sm leading-snug text-zinc-700">
                  {r.note && <span>{r.note} </span>}
                  <a
                    href={r.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("misc.connect.plansSourceFor", { vendor: r.vendor, plan: r.plan })}
                    className="font-semibold text-blue-700 underline-offset-4 hover:underline"
                  >
                    {t("misc.connect.plansSource")}
                  </a>
                </td>
              </tr>
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}

export function AiPlanTable() {
  const t = useT();
  return (
    <section aria-labelledby="connect-plans" className={`${PANEL} space-y-5 p-4 sm:p-6`}>
      <div className="space-y-2">
        <h2 id="connect-plans" className="font-display text-xl font-bold tracking-tight text-ink">
          {t("misc.connect.plansTitle")}
        </h2>
        <p className="max-w-3xl text-base leading-relaxed text-ink">{t("misc.connect.plansIntro")}</p>
        <p className="text-sm font-semibold text-ink">{t("misc.connect.plansChecked", { date: CHECKED_ON })}</p>
      </div>
      <div className="space-y-6">
        {VENDORS.map((v) => (
          <VendorTable key={v} vendor={v} rows={PLAN_ROWS.filter((r) => r.vendor === v)} />
        ))}
      </div>
      <p className="text-sm text-zinc-600">{t("misc.connect.plansLegend")}</p>
    </section>
  );
}
