"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { compareOffers, type AidRow } from "@/lib/aid";
import { customSummary } from "@/lib/custom-college";
import { fmtUsd } from "@/lib/format";
import { registerColleges, useStudent } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";

const noop = () => () => {};

/** Aid offers the student typed in, set beside each college's published cost of attendance. Private to the student. */
export function AidCompare({ colleges }: { colleges: CollegeSummary[] }) {
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
        <h2 id="aid-compare-title" className="font-semibold">
          Compare aid offers
        </h2>
        <p className="text-sm text-zinc-500">
          Enter the yearly aid from each award letter in a college&apos;s checklist on{" "}
          <Link href="/application/list" className="text-blue-600 underline">
            My list
          </Link>
          . Only you can see these amounts.
        </p>
      </div>
      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">No aid offers entered yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="p-2">College</th>
                  <th className="p-2 text-right">Published cost / yr</th>
                  <th className="p-2 text-right">Your offer / yr</th>
                  <th className="p-2 text-right">Estimated you pay / yr</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.slug} className="border-t border-zinc-100">
                    <td className="p-2 font-medium">{r.name}</td>
                    <td className="p-2 text-right tabular-nums text-zinc-600">{r.coa != null ? fmtUsd(r.coa) : "Not published"}</td>
                    <td className="p-2 text-right tabular-nums">{fmtUsd(r.offer)}</td>
                    <td className="p-2 text-right tabular-nums font-medium">
                      {r.outOfPocket != null ? fmtUsd(r.outOfPocket) : <span className="font-normal text-zinc-500">Can&apos;t estimate</span>}
                      {r.coversAll && <span className="block text-[11px] font-normal text-zinc-500">offer is above the published cost</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">
            Estimate only: published total cost of attendance minus your offer. It leaves out loans, work-study, travel and anything the college
            adds or changes after the data was collected. Check each award letter and the college&apos;s own net price calculator.
          </p>
        </>
      )}
    </section>
  );
}
