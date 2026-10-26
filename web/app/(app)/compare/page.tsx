import Link from "next/link";
import { Suspense } from "react";
import { Pill, TierBadge } from "@/components/badges";
import { CompareFit } from "@/components/CompareFit";
import { getDeadlines, getLookups, getSummaries } from "@/lib/data";
import { ENGLISH_POLICY, fmtDate, fmtInt, fmtPct, fmtUsd, INTL_AID, TEST_POLICY } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import type { CollegeSummary } from "@/lib/types";

export const metadata = { title: "Compare" };

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    <div className="space-y-4">
      <Suspense fallback={<div className="h-8" />}>
        <Title />
      </Suspense>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-zinc-100" />}>
        <Compare searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Title() {
  const t = await getT();
  return <h1 className="text-2xl font-semibold">{t("college.compareTitle")}</h1>;
}

async function Compare({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const t = await getT();
  const wanted = String(sp.c ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const [all, lookups, deadlines] = await Promise.all([getSummaries(), getLookups(), getDeadlines()]);
  const picked = wanted.map((slug) => all.find((c) => c.slug === slug)).filter(Boolean) as CollegeSummary[];

  if (picked.length === 0) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-zinc-500">{t("college.pickUpToFour")}</p>
        <div className="flex flex-wrap gap-2">
          {all.map((c) => (
            <Link key={c.slug} href={`/compare?c=${c.slug}`} className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50">
              {c.short_name ?? c.name}
            </Link>
          ))}
        </div>
        <p className="text-zinc-500">
          {t("college.orTick")}{" "}
          <Link className="text-blue-600 underline" href="/colleges">
            {t("college.collegesLink")}
          </Link>{" "}
          {t("college.pageAndPress")}
        </p>
      </div>
    );
  }

  const appDeadlines = (id: string) =>
    deadlines.filter((d) => d.institution_id === id && d.kind === "application").sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));

  type RowDef = [string, (c: CollegeSummary) => React.ReactNode];
  const rows: RowDef[] = [
    [t("college.rowTierGeneral"), (c) => <TierBadge tier={c.general_tier} />],
    ...lookups.categories
      .filter((k) => k.key !== "general")
      .map((k): RowDef => [t("college.rowTierOf", { label: k.label }), (c) => <TierBadge tier={c.tiers?.[k.key]} size="sm" />]),
    [t("college.rowLocation"), (c) => `${c.city}, ${c.state_region}`],
    [t("college.rowType"), (c) => (c.control === "public" ? t("college.public") : t("college.private"))],
    [t("college.undergrads"), (c) => fmtInt(c.undergrad_enrollment)],
    [t("college.rowPctIntl"), (c) => fmtPct(c.pct_international_ug)],
    [t("college.admitRate"), (c) => fmtPct(c.admit_rate)],
    [t("college.edAdmitRate"), (c) => fmtPct(c.ed_admit_rate)],
    [t("college.intlAdmitRate"), (c) => fmtPct(c.intl_admit_rate)],
    [t("college.rowSat"), (c) => (c.sat_p25 != null ? `${Number(c.sat_p25)} / ${Number(c.sat_p50)} / ${Number(c.sat_p75)}` : "—")],
    [t("college.rowAct"), (c) => (c.act_p25 != null ? `${Number(c.act_p25)} / ${Number(c.act_p50)} / ${Number(c.act_p75)}` : "—")],
    [t("college.rowAvgGpa"), (c) => (c.gpa_avg != null ? Number(c.gpa_avg).toFixed(2) : "—")],
    [t("college.rowTesting"), (c) => (c.test_policy ? <Pill>{TEST_POLICY[c.test_policy]}</Pill> : "—")],
    [t("college.rowEnglish"), (c) => (c.english_policy ? ENGLISH_POLICY[c.english_policy] : "—")],
    [
      t("college.rowDeadlines"),
      (c) => (
        <ul className="space-y-0.5">
          {appDeadlines(c.id).map((d) => (
            <li key={d.id}>
              <span className="font-medium">{d.plan_key}</span> {fmtDate(d.due_date)}
              {d.label && <span className="text-xs text-zinc-500"> · {d.label}</span>}
            </li>
          ))}
        </ul>
      ),
    ],
    [t("college.rowTuitionBase"), (c) => fmtUsd(c.tuition_usd)],
    [t("college.tuitionOut"), (c) => fmtUsd(c.tuition_out_of_state_usd)],
    [t("college.totalCoa"), (c) => fmtUsd(c.total_coa_usd)],
    [t("college.rowAidIntl"), (c) => (c.intl_aid_policy ? INTL_AID[c.intl_aid_policy] : t("college.notVerified"))],
    [t("college.rowFit"), (c) => <CompareFit college={c} />],
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50">
          <tr>
            <th className="w-48 p-2" />
            {picked.map((c) => (
              <th key={c.slug} className="p-2 text-left">
                <Link href={`/colleges/${c.slug}`} className="hover:underline">
                  {c.name}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, render]) => (
            <tr key={label} className="border-t border-zinc-100 align-top">
              <th className="p-2 text-left text-xs font-medium text-zinc-500">{label}</th>
              {picked.map((c) => (
                <td key={c.slug} className="p-2 tabular-nums">
                  {render(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
