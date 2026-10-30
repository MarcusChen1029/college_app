// College page: supplemental essay prompts (2026-27) and the international proof-of-funding note.
// Sources continue the page's own numbering: pass `offset` = how many sources the page already lists.
// Synchronous on purpose (the page passes its `t`), so everything renders in place with the rest of the page.
// The files' `notes` are research notes for maintainers and are not shown here.
import Link from "next/link";
import { Note } from "@/components/college/Note";
import { Ref } from "@/components/college/Ref";
import { SourceItem } from "@/components/college/SourceItem";
import { Tag } from "@/components/college/Tag";
import { fmtDate } from "@/lib/format";
import type { TFunction } from "@/lib/i18n";
import { collegeSupplements } from "@/lib/supplements-data";
import { choiceGroups, CURRENT_CYCLE, isLastYear, promptKind, promptTextMissing, supplementStatus, type CollegeSupplements, type SupplementPrompt } from "@/lib/supplements";
import { categoryLabel, financeText, limitLabel, summaryText, whoLabel } from "./supplement-text";

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
          <a href="#supplemental-essays" className="ml-1 font-semibold text-blue-700 hover:underline">
            ({t("supplements.summary.seeBelow")})
          </a>
        )}
        {isLastYear(rec) && <span className="ml-1 text-sm text-zinc-600">· {t("supplements.lastYear", { cycle: rec!.cycle })}</span>}
      </>
    );
  // A free-text note from the requirements data is better than nothing; a bare true/false is not.
  if (fallback && !/^(true|false)$/i.test(fallback.trim())) return <>{fallback}</>;
  return <span className="text-zinc-600">{t("supplements.summary.unknown")}</span>;
}

function PromptItem({ p, t, n, showWho, choose }: { p: SupplementPrompt; t: TFunction; n: number | undefined; showWho?: boolean; choose?: string }) {
  return (
    <li className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">{categoryLabel(t, p)}</span>
        <Tag>{limitLabel(t, p)}</Tag>
        {choose && <Tag>{choose}</Tag>}
        <Ref n={n} />
      </div>
      {showWho && p.applies_to && <p className="mt-1 text-sm font-semibold text-zinc-700">{whoLabel(t, p.applies_to)}</p>}
      <p className="mt-2 max-w-[68ch] text-base leading-relaxed whitespace-pre-line">{p.prompt}</p>
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
    <section id="supplemental-essays" aria-labelledby="essays-heading">
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="essays-heading" className="font-display text-2xl font-bold tracking-tight text-ink">
          {t("supplements.sectionTitle", { cycle: CURRENT_CYCLE })}
        </h2>
        {isLastYear(rec) && (
          <Tag tone="soon" title={t("supplements.lastYearHint")}>
            {t("supplements.lastYear", { cycle })}
          </Tag>
        )}
      </div>
      {isLastYear(rec) && <p className="mb-4 text-sm text-zinc-600">{t("supplements.lastYearHint")}</p>}

      {status === "not_researched" && <p className="text-base">{t("supplements.notResearched")}</p>}
      {status === "unknown" && (
        <p className="text-base">
          {t("supplements.unknownFact")}
          {rec!.sources[0] && <Ref n={ref(rec!.sources[0].n)} />}
        </p>
      )}
      {status === "none" && (
        <p className="text-base">
          {t("supplements.noneFact")}
          {rec!.sources[0] && <Ref n={ref(rec!.sources[0].n)} />}
        </p>
      )}

      {promptTextMissing(rec) && (
        <p className="text-base">
          {t("supplements.requiredNoTextFact")}
          {rec!.sources[0] && <Ref n={ref(rec!.sources[0].n)} />}
        </p>
      )}

      {rec?.shared_set === "uc-piq" ? (
        <div className="max-w-[68ch] space-y-3 text-base">
          <p>
            {t("supplements.ucFact")}
            {prompts[0] && <Ref n={ref(prompts[0].source)} />}
          </p>
          <details className="rounded-2xl bg-blue-50 px-5 py-4">
            <summary className="cursor-pointer font-semibold">{t("supplements.ucShow")}</summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 leading-relaxed">
              {prompts.map((p) => (
                <li key={p.key}>{p.prompt}</li>
              ))}
            </ol>
          </details>
        </div>
      ) : (
        prompts.length > 0 && (
          <div className="space-y-10">
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
        <Link href="/writing/essays" className="mt-7 inline-block text-base font-semibold text-blue-700 hover:underline">
          {t("supplements.planLink")}
        </Link>
      )}
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-4 text-lg font-semibold">{title}</h3>
      <ul className="grid items-start gap-x-16 gap-y-8 lg:grid-cols-2">{children}</ul>
    </div>
  );
}

/** One short block for the international box: what proves funding for the I-20 and when. Nothing if not published. */
export function IntlFinanceNote({ slug, offset, t }: { slug: string; offset: number; t: TFunction }) {
  const rec = collegeSupplements(slug);
  const f = rec?.intl_finance;
  if (!rec || !f) return null;
  return (
    <div className="mt-6 border-t border-zinc-200 pt-5">
      <h4 className="text-base font-semibold">{t("supplements.fin.title")}</h4>
      <p className="mt-1 text-base leading-relaxed">
        {financeText(t, f)}
        <Ref n={refFor(rec, offset, f.source)} />
      </p>
      {f.notes && <Note text={f.notes} label={t("college.details")} className="mt-2" />}
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
        <SourceItem key={`supp-${s.n}`} n={offset + i + 1} url={s.url} title={s.title} accessed={t("college.accessed", { date: fmtDate(s.accessed) })} />
      ))}
    </>
  );
}
