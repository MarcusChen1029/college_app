"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { testCardView } from "@/lib/i18n/test-plan-text";
import { cleanRegions, REGIONS, type RegionCode } from "@/lib/regions";
import { ENGLISH_TEST_KEYS, ENGLISH_TESTS, sectionSummary } from "@/lib/scores";
import { useStudent } from "@/lib/student-store";
import { GpaEditor, InternationalToggle } from "./ProfileForm";
import { EnglishEditor, TestChoiceEditor, testLabel } from "./TestScoresForm";

/** Region name in the current language (the REGIONS table itself stays English). */
export function regionName(t: TFunction, code: RegionCode): string {
  return t(`profile.region.${code}` as MessageKey);
}

type CardKey = "gpa" | "test" | "english" | "regions";

/** Saves whatever field is mid-edit (they save on blur) before its card closes or hides. */
function commitFocus() {
  (document.activeElement as HTMLElement | null)?.blur();
}

function Card({
  id,
  cardKey,
  label,
  tint,
  open,
  onToggle,
  onClose,
  className = "",
  summary,
  children,
}: {
  id: string;
  /** The tile's name, on its button as data-profile-card, so the setup checklist can open it. */
  cardKey: string;
  label: string;
  tint: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  className?: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const panelId = `${id}-panel`;
  const buttonId = `${id}-button`;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !open) return;
    onClose();
    document.getElementById(buttonId)?.focus();
  };
  return (
    <div onKeyDown={onKeyDown} className={`overflow-hidden rounded-3xl ${tint} ${open ? "col-span-full" : ""} ${className}`}>
      <button
        type="button"
        id={buttonId}
        data-profile-card={cardKey}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-2 p-4 text-left focus-visible:-outline-offset-4"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink">{label}</span>
          {summary}
        </span>
        <span aria-hidden className={`mt-0.5 shrink-0 text-[13px] font-semibold text-ink underline underline-offset-4 ${open ? "hidden" : ""}`}>
          {t("common.edit")}
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        inert={!open}
        className={`grid transition-[grid-template-rows,visibility] duration-200 motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "invisible grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-4 border-t-2 border-ink/10 bg-white/70 p-4">
            {children}
            <button type="button" onClick={onClose} className="rounded-full border-2 border-ink bg-white px-4 py-1.5 text-sm font-semibold hover:bg-sun/60">
              {t("common.done")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Value({ value, sub }: { value: string | number | null | undefined; sub?: string }) {
  const t = useT();
  if (value == null || value === "")
    return (
      <>
        <span className="mt-1 block font-display text-lg font-bold text-ink">{t("profile.add")}</span>
        {sub && <span className="mt-0.5 block break-words text-[13px] text-ink">{sub}</span>}
      </>
    );
  return (
    <>
      <span className="mt-1 block font-display text-3xl font-bold tabular-nums">{value}</span>
      {sub && <span className="mt-0.5 block break-words text-[13px] text-ink">{sub}</span>}
    </>
  );
}

export function RegionsEditor() {
  const t = useT();
  const { profile, updateProfile } = useStudent();
  const selected = cleanRegions(profile.targetRegions);
  const save = (next: RegionCode[]) => updateProfile({ targetRegions: cleanRegions(next) });
  const toggle = (code: RegionCode) => save(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  const makeDefault = (code: RegionCode) => save([code, ...selected.filter((c) => c !== code)]);
  const label = (code: RegionCode) => regionName(t, code);

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        {REGIONS.map((r) => {
          const on = selected.includes(r.code);
          return (
            <label
              key={r.code}
              className={`flex cursor-pointer items-center gap-2 rounded-full border-2 border-ink px-3 py-1.5 font-medium has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-blue-400 ${on ? "bg-sun" : "bg-white hover:bg-sun/40"}`}
            >
              <input type="checkbox" className="accent-ink" checked={on} onChange={() => toggle(r.code)} />
              {regionName(t, r.code)}
            </label>
          );
        })}
      </div>
      {selected.length > 1 && (
        <ol className="space-y-1.5" aria-label={t("profile.regionPriority")}>
          {selected.map((code, i) => (
            <li key={code} className="flex items-center gap-2">
              <span className="font-medium">{label(code)}</span>
              {i === 0 ? (
                <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white">{t("profile.default")}</span>
              ) : (
                <button type="button" onClick={() => makeDefault(code)} className="text-xs font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-900">
                  {t("profile.makeDefault")}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-zinc-500">
        {selected.length === 0
          ? t("profile.regionsNone")
          : t("profile.regionsSome")}
      </p>
    </div>
  );
}

export function ProfileCards() {
  const t = useT();
  const locale = useLocale();
  const { profile } = useStudent();
  const base = useId();
  const [open, setOpen] = useState<CardKey | null>(null);
  const toggle = (k: CardKey) => {
    commitFocus();
    setOpen((cur) => (cur === k ? null : k));
  };
  const close = () => {
    commitFocus();
    setOpen(null);
  };
  const props = (k: CardKey) => ({ id: `${base}-${k}`, cardKey: k, open: open === k, onToggle: () => toggle(k), onClose: close });
  // A tile takes its colour once it holds something; until then it is a quiet grey step, so an empty tile never reads as
  // a warning.
  const tint = (has: boolean, colour: string) => (has ? colour : "bg-zinc-100");

  const englishKeys = ENGLISH_TEST_KEYS.filter((k) => profile.tests?.english?.[k]?.total != null);
  const englishKey = englishKeys[0];
  const english = englishKey ? profile.tests!.english![englishKey]! : null;
  const englishSub = englishKey
    ? [sectionSummary(ENGLISH_TESTS[englishKey], english?.sections), englishKeys.length > 1 ? t("profile.more", { n: englishKeys.length - 1 }) : ""].filter(Boolean).join(" · ")
    : undefined;
  const regions = cleanRegions(profile.targetRegions);
  const gpaSub = [profile.gpaWeighted != null && t("profile.gpaWeightedShort", { gpa: profile.gpaWeighted }), profile.international && t("profile.international")].filter(Boolean).join(" · ");
  const test = testCardView(t, locale, profile);

  return (
    <section aria-label={t("profile.numbers")} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card {...props("gpa")} label={t("profile.gpaUnweighted")} tint={tint(profile.gpa != null, "bg-sun/60")} summary={<Value value={profile.gpa} sub={gpaSub || undefined} />}>
        <GpaEditor />
        <InternationalToggle />
      </Card>
      <Card
        {...props("test")}
        label={test.label}
        tint={tint(test.value != null, "bg-mint/50")}
        summary={
          test.small && test.value != null ? (
            <>
              <span className="mt-1 block font-display text-lg font-bold">{test.value}</span>
              {test.sub && <span className="mt-0.5 block break-words text-[13px] text-ink">{test.sub}</span>}
            </>
          ) : (
            <Value value={test.value} sub={test.sub} />
          )
        }
      >
        <TestChoiceEditor />
      </Card>
      <Card
        {...props("english")}
        label={englishKey ? testLabel(t, englishKey, ENGLISH_TESTS[englishKey].label) : t("profile.englishTest")}
        tint={tint(english?.total != null, "bg-blue-100")}
        summary={<Value value={english?.total} sub={englishSub} />}
      >
        <EnglishEditor />
      </Card>
      <Card
        {...props("regions")}
        label={t("profile.regionsApplying")}
        tint={tint(regions.length > 0, "bg-blue-50")}
        summary={
          regions.length === 0 ? (
            <Value value={null} />
          ) : (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {regions.map((c, i) => (
                <span key={c} className="rounded-full bg-white px-2.5 py-0.5 text-[13px] font-semibold">
                  {regionName(t, c)}
                  {i === 0 && regions.length > 1 && <span className="sr-only">{t("profile.defaultSr")}</span>}
                </span>
              ))}
            </span>
          )
        }
      >
        <RegionsEditor />
      </Card>
    </section>
  );
}
