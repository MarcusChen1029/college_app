// College page: supplemental essay prompts (2026-27) and the international proof-of-funding note.
// Sources continue the page's own numbering: pass `offset` = how many sources the page already lists.
// Synchronous on purpose (the page passes its `t`), so everything renders in place with the rest of the page.
// The files' `notes` are research notes for maintainers and are not shown here.
import Link from "next/link";
import { Pill } from "@/components/badges";
import { StatusPill } from "@/components/StatusPill";
import { fmtDate } from "@/lib/format";
import type { TFunction } from "@/lib/i18n";
import { collegeSupplements } from "@/lib/supplements-data";
import { choiceGroups, CURRENT_CYCLE, isLastYear, promptKind, promptTextMissing, supplementStatus, type CollegeSupplements, type SupplementPrompt } from "@/lib/supplements";
import { categoryLabel, financeText, limitLabel, summaryText, whoLabel } from "./supplement-text";

function Ref({ n }: { n: number | undefined }) {
  if (!n) return null;
  return (
    <a href={`#src-${n}`} className="ml-0.5 align-super text-[10px] text-blue-600 hover:underline">
      [{n}]
    </a>
  );
}

/** Page-wide number of a supplements source, or undefined if the file doesn't list it. */
const refFor = (rec: CollegeSupplements, offset: number, n: number) => {
  const i = rec.sources.findIndex((s) => s.n === n);
  return i < 0 ? undefined : offset + i + 1;
};

/** The value for the "Essays" row in Application requirements. Unknown never reads as "none". */
export function EssaysRequirement({ slug, fallback, t }: { slug: string; fallback: string | null; t: TFunction }) {
  const rec = collegeSupplements(slug);
  const text = summaryText(t, rec);
  if (text)
    return (
      <>
        {text}
        {rec && rec.supplements !== "none" && (
          <a href="#supplemental-essays" className="ml-1 text-blue-600 hover:underline">
            ({t("supplements.summary.seeBelow")})
          </a>
        )}
        {isLastYear(rec) && <span className="ml-1 text-xs text-zinc-500">· {t("supplements.lastYear", { cycle: rec!.cycle })}</span>}
      </>
    );
  // A free-text note from the requirements data is better than nothing; a bare true/false is not.
  if (fallback && !/^(true|false)$/i.test(fallback.trim())) return <>{fallback}</>;
  return <span className="text-zinc-500">{t("supplements.summary.unknown")}</span>;
}

function PromptItem({ p, t, n, showWho, choose }: { p: SupplementPrompt; t: TFunction; n: number | undefined; showWho?: boolean; choose?: string }) {
  return (
    <li className="rounded-lg border border-zinc-200 p-3 text-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-medium">{categoryLabel(t, p)}</span>
        <Pill>{limitLabel(t, p)}</Pill>
        {choose && <Pill>{choose}</Pill>}
        {showWho && p.applies_to && <Pill tone="blue">{whoLabel(t, p.applies_to)}</Pill>}
        <Ref n={n} />
      </div>
      <p className="whitespace-pre-line text-zinc-700">{p.prompt}</p>
    </li>
  );
}

export function CollegeSupplementsSection({ slug, offset, t }: { slug: string; offset: number; t: TFunction }) {
  const rec = collegeSupplements(slug);
  const status = supplementStatus(rec);
  const cycle = rec?.cycle ?? CURRENT_CYCLE;
  const ref = (n: number) => (rec ? refFor(rec, offset, n) : undefined);
  const prompts = rec?.prompts ?? [];
  const required = prompts.filter((p) => promptKind(p) === "required");
  const groups = choiceGroups(prompts).filter((g) => g.kind === "choice");
  const conditional = prompts.filter((p) => promptKind(p) === "conditional");
  const optional = prompts.filter((p) => promptKind(p) === "optional");
  // A conditional or optional prompt that is part of a choose-N set says so on its own card.
  const chooseOf = (p: SupplementPrompt) =>
    p.choose ? t("supplements.chooseN", { pick: p.choose.pick, total: prompts.filter((x) => x.choose?.group === p.choose!.group).length }) : undefined;

  return (
    <section id="supplemental-essays" className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">{t("supplements.sectionTitle", { cycle: CURRENT_CYCLE })}</h2>
        {isLastYear(rec) && (
          <StatusPill tone="soon" title={t("supplements.lastYearHint")}>
            {t("supplements.lastYear", { cycle })}
          </StatusPill>
        )}
      </div>
      {isLastYear(rec) && <p className="mb-3 text-xs text-zinc-500">{t("supplements.lastYearHint")}</p>}

      {status === "not_researched" && <p className="text-sm text-zinc-600">{t("supplements.notResearched")}</p>}
      {status === "unknown" && (
        <p className="text-sm text-zinc-600">
          {t("supplements.unknownFact")}
          {rec!.sources[0] && <Ref n={ref(rec!.sources[0].n)} />}
        </p>
      )}
      {status === "none" && (
        <p className="text-sm">
          {t("supplements.noneFact")}
          {rec!.sources[0] && <Ref n={ref(rec!.sources[0].n)} />}
        </p>
      )}

      {promptTextMissing(rec) && (
        <p className="text-sm">
          {t("supplements.requiredNoTextFact")}
          {rec!.sources[0] && <Ref n={ref(rec!.sources[0].n)} />}
        </p>
      )}

      {rec?.shared_set === "uc-piq" ? (
        <div className="space-y-2 text-sm">
          <p>
            {t("supplements.ucFact")}
            {prompts[0] && <Ref n={ref(prompts[0].source)} />}
          </p>
          <details className="rounded-lg border border-zinc-200 p-3">
            <summary className="cursor-pointer font-medium">{t("supplements.ucShow")}</summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-zinc-700">
              {prompts.map((p) => (
                <li key={p.key}>{p.prompt}</li>
              ))}
            </ol>
          </details>
        </div>
      ) : (
        prompts.length > 0 && (
          <div className="space-y-4">
            {required.length > 0 && (
              <Group title={t("supplements.everyone")}>
                {required.map((p) => (
                  <PromptItem key={p.key} p={p} t={t} n={ref(p.source)} />
                ))}
              </Group>
            )}
            {groups.map((g) => (
              <Group key={g.group} title={t("supplements.chooseN", { pick: g.pick, total: g.prompts.length })}>
                {g.prompts.map((p) => (
                  <PromptItem key={p.key} p={p} t={t} n={ref(p.source)} />
                ))}
              </Group>
            ))}
            {conditional.length > 0 && (
              <Group title={t("supplements.someApplicants")}>
                {conditional.map((p) => (
                  <PromptItem key={p.key} p={p} t={t} n={ref(p.source)} showWho choose={chooseOf(p)} />
                ))}
              </Group>
            )}
            {optional.length > 0 && (
              <Group title={t("supplements.optionalHeading")}>
                {optional.map((p) => (
                  <PromptItem key={p.key} p={p} t={t} n={ref(p.source)} showWho choose={chooseOf(p)} />
                ))}
              </Group>
            )}
          </div>
        )
      )}

      {(status === "required" || status === "optional_only") && (
        <Link href="/writing/essays" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
          {t("supplements.planLink")}
        </Link>
      )}
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

/** One short block for the international box: what proves funding for the I-20 and when. Nothing if not published. */
export function IntlFinanceNote({ slug, offset, t }: { slug: string; offset: number; t: TFunction }) {
  const rec = collegeSupplements(slug);
  const f = rec?.intl_finance;
  if (!rec || !f) return null;
  return (
    <div className="mt-2 border-t border-zinc-200 pt-2">
      <div className="font-medium">{t("supplements.fin.title")}</div>
      <div className="text-xs text-zinc-600">
        {financeText(t, f)}
        <Ref n={refFor(rec, offset, f.source)} />
      </div>
      {f.notes && <div className="text-xs text-zinc-500">{f.notes}</div>}
    </div>
  );
}

/** The supplements sources as more items of the page's numbered Sources list. */
export function SupplementSourceItems({ slug, offset, t }: { slug: string; offset: number; t: TFunction }) {
  const rec = collegeSupplements(slug);
  if (!rec?.sources.length) return null;
  return (
    <>
      {rec.sources.map((s, i) => (
        <li key={`supp-${s.n}`} id={`src-${offset + i + 1}`} className="flex gap-2">
          <span className="w-6 text-zinc-400">[{offset + i + 1}]</span>
          <a className="text-blue-600 hover:underline" href={s.url} target="_blank" rel="noreferrer">
            {s.title}
          </a>
          <span className="text-xs text-zinc-500">{t("college.accessed", { date: fmtDate(s.accessed) })}</span>
        </li>
      ))}
    </>
  );
}
