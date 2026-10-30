"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { compareOffers, type AidRow } from "@/lib/aid";
import { customSummary } from "@/lib/custom-college";
import { fmtUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { registerColleges, useStudent } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";
import { SECTION_TITLE } from "@/lib/ui";
import { EmptyNote } from "./EmptyState";

const noop = () => () => {};

/** Aid offers the student typed in, set beside each college's published cost of attendance. Private to the student. */
export function AidCompare({ colleges }: { colleges: CollegeSummary[] }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => registerColleges(colleges), [colleges, student.list.length]);
  if (!mounted || !student.ready) return null;

  const rows: AidRow[] = student.list.flatMap((e) => {
    if (e.aidOfferUsd == null) return [];
    const c = e.custom ? customSummary(e.rowId ?? e.slug, e.custom) : colleges.find((x) => x.slug === e.slug);
    return c ? [{ slug: e.slug, name: c.short_name ?? c.name, offer: e.aidOfferUsd, coa: c.total_coa_usd ?? null }] : [];
  });
  const sorted = compareOffers(rows);

  return (
    <section className="space-y-3" aria-labelledby="aid-compare-title">
      <div>
        <h2 id="aid-compare-title" className={SECTION_TITLE}>
          {t("application.aid.title")}
        </h2>
        <p className="mt-1 max-w-3xl text-[15px] text-zinc-700">
          {t("application.aid.introPre")}
          <Link href="/application/list" className="text-blue-700 underline">
            {t("nav.myList")}
          </Link>
          {t("application.aid.introPost")}
        </p>
      </div>
      {sorted.length === 0 ? (
        <EmptyNote>{t("application.aid.empty")}</EmptyNote>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-[13px] font-medium text-zinc-600">
                <tr>
                  <th className="p-2">{t("application.col.college")}</th>
                  <th className="p-2 text-right">{t("application.aid.colPublished")}</th>
                  <th className="p-2 text-right">{t("application.aid.colOffer")}</th>
                  <th className="p-2 text-right">{t("application.aid.colPay")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.slug} className="border-t border-zinc-100">
                    <td className="p-2 font-medium">{r.name}</td>
                    <td className="p-2 text-right tabular-nums text-zinc-600">{r.coa != null ? fmtUsd(r.coa) : t("application.aid.notPublished")}</td>
                    <td className="p-2 text-right tabular-nums">{fmtUsd(r.offer)}</td>
                    <td className="p-2 text-right tabular-nums font-medium">
                      {r.outOfPocket != null ? fmtUsd(r.outOfPocket) : <span className="font-normal text-zinc-500">{t("application.aid.cantEstimate")}</span>}
                      {r.coversAll && <span className="block text-[11px] font-normal text-zinc-500">{t("application.aid.coversAll")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">
            {t("application.aid.disclaimer")}
          </p>
        </>
      )}
    </section>
  );
}
