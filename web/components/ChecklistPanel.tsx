"use client";

import Link from "next/link";
import { requiresStars } from "@/lib/application-systems-data";
import {
  AFTER_APPLY,
  ENGLISH_PLANS,
  intlSteps,
  isDone,
  TEST_PLANS,
  type Checklist,
  type EnglishPlan,
  type TestPlan,
} from "@/lib/checklist";
import { parseOffer } from "@/lib/aid";
import { ENGLISH_POLICY, fmtUsd, TEST_POLICY } from "@/lib/format";
import { RESULT_OPTIONS } from "@/lib/application";
import type { MessageKey } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import type { ListEntry } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";

const PLAN_KEYS = ["ED", "ED2", "EA", "REA", "RD", "ROLLING"];

/** Application-plan names come from the database in English; in other languages known plan keys get a translated name. */
export function usePlanLabel() {
  const t = useT();
  const locale = useLocale();
  return (key: string | null | undefined, fallback: string) =>
    locale !== "en" && key && PLAN_KEYS.includes(key) ? t(`application.planLabel.${key}` as MessageKey) : fallback;
}

/** Decision names (lib/application.ts RESULT_LABEL stays English for its tests; this is the translated edge). */
export function useResultLabel() {
  const t = useT();
  return (r: (typeof RESULT_OPTIONS)[number]) => t(`application.result.${r}`);
}

// No bg/border colour here: a tone class is added instead (Tailwind orders by stylesheet, so competing utilities would win).
export const SELECT_BASE = "rounded border px-1 py-0.5 text-xs";
export const SELECT = `${SELECT_BASE} border-zinc-300 bg-white`;
const INPUT = "rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs";

type Props = {
  entry: ListEntry;
  college: CollegeSummary;
  international: boolean;
  /** When this college wants proof of finances (from the supplements data, once loaded); nothing date-like is shown without it. */
  financeWhen?: string | null;
  onChange: (patch: Partial<Pick<ListEntry, "checklist" | "notes" | "aidOfferUsd">>) => void;
  onRemove: () => void;
};

export function ChecklistPanel({ entry, college, international, financeWhen = null, onChange, onRemove }: Props) {
  const t = useT();
  const c = entry.checklist;
  const set = (patch: Partial<Checklist>) => onChange({ checklist: { ...c, ...patch } });
  const essays = c.essay_list ?? [];
  const finals = essays.filter((e) => e.status === "final").length;
  const steps = intlSteps(c, entry.status, { international, financeWhen });
  // AFTER_APPLY holds only STARS today, so the college's STARS requirement decides whether the section shows.
  const afterApply = requiresStars(college.slug) ? AFTER_APPLY : [];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Section title={t("application.cl.essays")} done={isDone("essays", c)} className="md:col-span-2">
        <p className="text-xs text-zinc-600">
          {c.no_essays
            ? t("application.cl.noEssays")
            : essays.length > 0
              ? t("application.cl.essaysFinal", { final: finals, total: essays.length })
              : t("application.cl.noEssaysYet")}{" "}
          <Link href="/writing/essays" className="text-blue-700 underline">
            {t("application.cl.manageEssays")}
          </Link>
        </p>
      </Section>

      <Section title={t("application.cl.recommendations")} done={isDone("recommendations", c)}>
        <Check checked={!!c.recommendations} onChange={(v) => set({ recommendations: v })}>
          {t("application.cl.allRecs")}
        </Check>
      </Section>

      <Section title={t("application.cl.transcript")} done={isDone("transcript", c)}>
        <Check checked={!!c.transcript} onChange={(v) => set({ transcript: v })}>
          {t("application.cl.transcriptSent")}
        </Check>
      </Section>

      <Section
        title={t("application.cl.testScores")}
        done={isDone("test_scores", c)}
        hint={college.test_policy ? (policyText(t, "testPolicy", college.test_policy) ?? TEST_POLICY[college.test_policy] ?? college.test_policy) : null}
      >
        <PlanPicker
          value={c.test_plan ?? null}
          options={TEST_PLANS}
          label={t("application.cl.testPlanFor", { name: college.name })}
          onChange={(v) => set({ test_plan: v as TestPlan | null })}
        />
        {c.test_plan !== "optional" && (
          <Check checked={!!c.test_scores} onChange={(v) => set({ test_scores: v })}>
            {t("application.cl.scoresSent")}
          </Check>
        )}
        {c.test_plan === "optional" && college.test_policy === "required" && <Warn>{t("application.cl.requiresScores", { name: college.short_name ?? college.name })}</Warn>}
      </Section>

      <Section
        title={t("application.cl.englishTest")}
        done={isDone("english_test", c)}
        hint={
          college.english_policy
            ? `${policyText(t, "englishPolicy", college.english_policy) ?? ENGLISH_POLICY[college.english_policy] ?? college.english_policy}${international ? "" : t("application.cl.intlOnlyHint")}`
            : null
        }
      >
        <PlanPicker
          value={c.english_plan ?? null}
          options={ENGLISH_PLANS}
          label={t("application.cl.englishTestFor", { name: college.name })}
          onChange={(v) => set({ english_plan: v as EnglishPlan | null })}
        />
        {c.english_plan !== "not_required" && (
          <Check checked={!!c.english_test} onChange={(v) => set({ english_test: v })}>
            {t("application.cl.scoreSent")}
          </Check>
        )}
        {c.english_plan === "not_required" && international && college.english_policy === "required_all_international" && (
          <Warn>{t("application.cl.englishRequiredAll")}</Warn>
        )}
      </Section>

      {steps.length > 0 && (
        <Section title={t("application.intl.title")} done={steps.every((s) => s.done)} hint={t("application.intl.notReady")} className="md:col-span-2">
          {steps.map((s) => (
            <Check key={s.key} checked={s.done} onChange={(v) => set({ [s.key]: v })}>
              {t(`application.intl.${s.key}`)}
              {s.when && <span className="text-zinc-500"> · {s.when}</span>}
            </Check>
          ))}
          <p className="text-[11px] text-zinc-500">{t("application.intl.financesHint")}</p>
        </Section>
      )}

      {afterApply.length > 0 && (
        <Section title={t("application.after.title")} done={afterApply.every(([k]) => !!c[k])} hint={t("application.after.notReady")} className="md:col-span-2">
          {afterApply.map(([k]) => (
            <Check key={k} checked={!!c[k]} onChange={(v) => set({ [k]: v })}>
              {t(`application.after.${k}`)}
            </Check>
          ))}
        </Section>
      )}

      <Section
        title={t("application.cl.aidOffer")}
        done={entry.aidOfferUsd != null}
        hint={college.total_coa_usd != null ? t("application.cl.publishedCost", { amount: fmtUsd(college.total_coa_usd) }) : t("application.cl.noPublishedCost")}
        className="md:col-span-2"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
          <label htmlFor={`aid-${entry.slug}`}>{t("application.cl.yearlyAid")}</label>
          <input
            id={`aid-${entry.slug}`}
            inputMode="numeric"
            className={`${INPUT} w-28`}
            // Keyed on the saved value so a change from elsewhere (or a clear) shows up.
            key={entry.aidOfferUsd ?? "none"}
            defaultValue={entry.aidOfferUsd ?? ""}
            placeholder={t("application.cl.aidPlaceholder")}
            onBlur={(e) => {
              const next = parseOffer(e.target.value);
              if (next !== (entry.aidOfferUsd ?? null)) onChange({ aidOfferUsd: next });
              else e.target.value = entry.aidOfferUsd != null ? String(entry.aidOfferUsd) : "";
            }}
          />
          <span className="text-zinc-500">
            {t("application.cl.onlyYou")}{" "}
            <Link href="/application/results" className="text-blue-700 underline">
              {t("application.cl.compareOffers")}
            </Link>
          </span>
        </div>
      </Section>

      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-medium text-zinc-500" htmlFor={`notes-${entry.slug}`}>
          {t("common.notes")}
        </label>
        <textarea
          id={`notes-${entry.slug}`}
          rows={2}
          maxLength={10000}
          className={`${INPUT} w-full`}
          defaultValue={entry.notes}
          placeholder={t("application.cl.notesPlaceholder")}
          onBlur={(e) => e.target.value !== entry.notes && onChange({ notes: e.target.value })}
        />
        <div className="mt-1 text-right">
          <button className="text-xs text-zinc-500 hover:text-urgent" onClick={onRemove}>
            {t("application.cl.removeFromList")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  done,
  hint,
  className = "",
  children,
}: {
  title: string;
  done: boolean;
  hint?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <section className={`rounded-md border border-zinc-200 bg-white p-2.5 ${className}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
            done ? "bg-done text-white" : "border border-zinc-300"
          }`}
          aria-label={done ? t("application.cl.done") : t("application.cl.notDone")}
        >
          {done ? "✓" : ""}
        </span>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {hint && <span className="ml-auto text-[11px] text-zinc-400">{hint}</span>}
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-urgent">{children}</p>;
}

function Check({
  checked,
  onChange,
  className = "",
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex items-center gap-1.5 text-xs text-zinc-600 ${className}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function PlanPicker({
  value,
  options,
  label,
  onChange,
}: {
  value: string | null;
  options: readonly (readonly [string, string])[];
  label: string;
  onChange: (v: string | null) => void;
}) {
  const t = useT();
  const planName = (k: string, l: string) =>
    k === "optional" ? t("application.cl.testOptionalPlan") : k === "not_required" ? t("application.cl.notRequiredWaived") : l;
  return (
    <select className={SELECT} value={value ?? ""} aria-label={label} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{t("application.undecided")}</option>
      {options.map(([k, l]) => (
        <option key={k} value={k}>
          {planName(k, l)}
        </option>
      ))}
    </select>
  );
}

/** Translated policy text for a known key; undefined for unknown keys so the caller falls back to the English table. */
function policyText(t: ReturnType<typeof useT>, group: "testPolicy" | "englishPolicy", key: string): string | undefined {
  const known =
    group === "testPolicy"
      ? ["required", "recommended", "optional", "flexible", "blind"]
      : ["required_nonnative", "required_all_international", "recommended", "not_required"];
  return known.includes(key) ? t(`application.${group}.${key}` as MessageKey) : undefined;
}
