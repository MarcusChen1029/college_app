"use client";

import Link from "next/link";
import { Fragment } from "react";
import type { SentKind } from "@/lib/checklist";
import type { Crunch, OpenCollege, OpenGroup } from "@/lib/crunch";
import type { TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { buttonClass } from "@/lib/ui";
import { DeadlineChip, StatusPill } from "./StatusPill";

type Props = {
  crunch: Crunch;
  /** Opens a college's checklist dialog. */
  onOpen: (slug: string) => void;
  /** Ticks an item as sent for these colleges (asks first). */
  onMarkSent: (kind: SentKind, slugs: string[]) => void;
  /** Essays each researched college asks of everyone (lib/supplements.ts essaysToWrite), by slug. */
  essayCounts?: Record<string, number>;
};

const LINK = "text-blue-700 underline-offset-4 hover:underline";

/** College names as buttons that open each checklist, comma-separated. */
function Names({ colleges, onOpen, detail }: { colleges: { slug: string; name: string }[]; onOpen: (slug: string) => void; detail?: (slug: string) => string | null }) {
  return (
    <>
      {colleges.map((c, i) => (
        <Fragment key={c.slug}>
          {i > 0 && ", "}
          <button type="button" className={`${LINK} font-medium`} onClick={() => onOpen(c.slug)}>
            {c.name}
          </button>
          {detail?.(c.slug) && <span className="text-zinc-500"> ({detail(c.slug)})</span>}
        </Fragment>
      ))}
    </>
  );
}

const ITEM_LABEL = {
  essays: "application.crunch.item.essays",
  recommendations: "application.crunch.item.recommendations",
  transcript: "application.crunch.item.transcript",
  test_scores: "application.crunch.item.test_scores",
  english_test: "application.crunch.item.english_test",
} as const;

// With research on file, "nothing started" reads as the number of essays the college asks for, matching the Essays page.
function essayDetail(t: TFunction, c: OpenCollege, toWrite: number | undefined): string {
  if (c.reason !== "no_essays_yet") return t("application.crunch.essaysFinal", { final: c.final ?? 0, total: c.total ?? 0 });
  return toWrite ? t("application.crunch.essaysToWrite", { n: toWrite }) : t("application.crunch.essaysNone");
}

function OpenItem({ group, clusterSize, onOpen, onMarkSent, essayCounts }: { group: OpenGroup; clusterSize: number } & Pick<Props, "onOpen" | "onMarkSent" | "essayCounts">) {
  const t = useT();
  const notSent = group.colleges.filter((c) => c.reason === "not_sent");
  const undecided = group.colleges.filter((c) => c.reason === "plan_undecided");
  const kind = group.key === "essays" ? null : (group.key as SentKind);
  const byslug = new Map(group.colleges.map((c) => [c.slug, c]));

  // One line per reason. A shared item missing everywhere reads "for all 9" instead of nine names.
  const lines: React.ReactNode[] = [];
  if (group.key === "essays") {
    lines.push(<Names key="e" colleges={group.colleges} onOpen={onOpen} detail={(s) => essayDetail(t, byslug.get(s)!, essayCounts?.[s])} />);
  } else {
    if (notSent.length) {
      lines.push(
        <span key="ns">
          {notSent.length === clusterSize && clusterSize > 1 ? (
            t("application.crunch.notSentAll", { n: notSent.length })
          ) : (
            <>
              {t("application.crunch.notSentFor", { n: notSent.length, total: clusterSize })} <Names colleges={notSent} onOpen={onOpen} />
            </>
          )}
        </span>,
      );
    }
    if (undecided.length) {
      lines.push(
        <span key="un">
          {t(group.key === "english_test" ? "application.crunch.englishUndecided" : "application.crunch.testUndecided")} <Names colleges={undecided} onOpen={onOpen} />
        </span>,
      );
    }
  }

  const where =
    group.key === "essays" ? (
      <Link href="/writing/essays" className={buttonClass("secondary", "sm")}>
        {t("application.crunch.openEssays")}
      </Link>
    ) : group.key === "recommendations" ? (
      <Link href="/application/recommenders" className={buttonClass("secondary", "sm")}>
        {t("application.crunch.openRecommenders")}
      </Link>
    ) : null;

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 text-sm">
        <div className="font-semibold">{t(ITEM_LABEL[group.key])}</div>
        <div className="space-y-0.5 text-zinc-700 [overflow-wrap:anywhere]">
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
      {(where || (kind && notSent.length > 0)) && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {where}
          {kind && notSent.length > 0 && (
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => onMarkSent(kind, notSent.map((c) => c.slug))}>
              {t("application.crunch.markSent", { n: notSent.length })}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Top of My list: the next week of application deadlines and exactly what is still open for them. Further out than
 * the "soon" window it shrinks to one line; with nothing upcoming it renders nothing.
 */
export function CrunchCard({ crunch, onOpen, onMarkSent, essayCounts }: Props) {
  const t = useT();
  if (crunch.kind === "none") return null;
  if (crunch.kind === "later") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
        <span>{t("application.crunch.nextLater")}</span>
        <DeadlineChip date={crunch.date} days={crunch.days} done={false} />
        <span>{crunch.count === 1 ? t("application.crunch.oneCollege") : t("application.crunch.nColleges", { n: crunch.count })}</span>
      </p>
    );
  }

  const n = crunch.apps.length;
  const readyAll = crunch.ready.length === n;
  return (
    <section id="crunch" aria-labelledby="crunch-title" className="space-y-3 rounded-lg border border-zinc-200 p-4 sm:p-5">
      <h2 id="crunch-title" className="font-display text-lg font-bold">
        {n === 1 ? t("application.crunch.titleOne") : t("application.crunch.title", { n })}
      </h2>
      <ul className="space-y-1.5">
        {crunch.dates.map((d) => (
          <li key={d.date} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <DeadlineChip date={d.date} days={d.days} done={false} />
            <span className="[overflow-wrap:anywhere]">
              <Names colleges={d.apps} onOpen={onOpen} />
            </span>
          </li>
        ))}
      </ul>

      {crunch.open.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{t("application.crunch.stillOpen")}</h3>
          <ul className="divide-y divide-zinc-100">
            {crunch.open.map((g) => (
              <OpenItem key={g.key} group={g} clusterSize={n} onOpen={onOpen} onMarkSent={onMarkSent} essayCounts={essayCounts} />
            ))}
          </ul>
        </div>
      )}

      {crunch.ready.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-zinc-100 pt-3 text-sm">
          <StatusPill tone="done">{readyAll ? t("application.crunch.allReady") : t("application.crunch.ready", { n: crunch.ready.length })}</StatusPill>
          {!readyAll && (
            <span className="[overflow-wrap:anywhere]">
              <Names colleges={crunch.ready} onOpen={onOpen} />
            </span>
          )}
          <span className="text-zinc-500">· {t("application.crunch.readyHint")}</span>
        </p>
      )}
    </section>
  );
}
