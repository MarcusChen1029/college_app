"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { ACT_SCALE, ENGLISH_TEST_KEYS, ENGLISH_TESTS, parseScore, SAT_SCALE, satTotal, type EnglishTestKey, type ScoreScale, type SectionScores } from "@/lib/scores";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { planMonthText } from "@/lib/i18n/test-plan-text";
import { useStudent } from "@/lib/student-store";
import { choiceWith, planMonthOptions, TEST_CHOICES, testChoice, unusedScores, withPlanned, withTestChoice, type AdmissionTest, type TestChoice } from "@/lib/test-plan";
import { buttonClass } from "@/lib/ui";

const noop = () => () => {};
/** This month as YYYY-MM; "" while rendering on the server, so the month list never differs between server and client. */
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const field = "w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm";

/** Section name for a score box, translated by its key (falls back to the English label). */
export function sectionLabel(t: TFunction, key: string, fallback: string): string {
  const k = `profile.sec.${key}` as MessageKey;
  const out = t(k);
  return out === k ? fallback : out;
}

/** English-test name; the test names stay English except the 2026 band scale note. */
export function testLabel(t: TFunction, key: string, fallback: string): string {
  return key === "toefl_band" ? t("profile.testToeflBand") : fallback;
}

/** Uncontrolled score box: saves on blur, and puts the old value back if the new one is out of range. */
function ScoreInput({ label, value, scale, onSave }: { label: string; value: number | null | undefined; scale: { min: number; max: number; step: number }; onSave: (n: number | null) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        key={value ?? "empty"}
        className={field}
        inputMode="decimal"
        placeholder={`${scale.min}–${scale.max}`}
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const raw = e.target.value;
          const n = parseScore(raw, scale);
          if (n == null && raw.trim() !== "") {
            e.target.value = value?.toString() ?? "";
            return;
          }
          if (n !== (value ?? null)) onSave(n);
        }}
      />
    </label>
  );
}

function Sections({ scale, values, onSave }: { scale: ScoreScale; values: SectionScores | undefined; onSave: (key: string, n: number | null) => void }) {
  const t = useT();
  return (
    <>
      {scale.sections.map((s) => (
        <ScoreInput key={s.key} label={sectionLabel(t, s.key, s.label)} value={values?.[s.key]} scale={s} onSave={(n) => onSave(s.key, n)} />
      ))}
    </>
  );
}

export function SatEditor() {
  const t = useT();
  const { profile, setProfile } = useStudent();
  const tests = profile.tests ?? {};
  const setSat = (key: string, n: number | null) => {
    const sat = { ...tests.sat, [key]: n };
    setProfile({ ...profile, sat: satTotal(sat) ?? profile.sat, tests: { ...tests, sat } });
  };
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <ScoreInput label={t("profile.total")} value={profile.sat} scale={SAT_SCALE} onSave={(n) => setProfile({ ...profile, sat: n })} />
        <Sections scale={SAT_SCALE} values={tests.sat} onSave={setSat} />
      </div>
      <p className="text-xs text-zinc-500">{t("profile.satHint")}</p>
    </div>
  );
}

export function ActEditor() {
  const t = useT();
  const { profile, setProfile } = useStudent();
  const tests = profile.tests ?? {};
  const setAct = (key: string, n: number | null) => setProfile({ ...profile, tests: { ...tests, act: { ...tests.act, [key]: n } } });
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <ScoreInput label={t("profile.composite")} value={profile.act} scale={ACT_SCALE} onSave={(n) => setProfile({ ...profile, act: n })} />
        <Sections scale={ACT_SCALE} values={tests.act} onSave={setAct} />
      </div>
      <p className="text-xs text-zinc-500">{t("profile.actHint")}</p>
    </div>
  );
}

/** A round option button backed by a real radio (arrow keys, screen readers); same look as the region pills. */
function Pill({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-full border-2 border-ink px-3 py-1.5 font-medium has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-blue-400 ${checked ? "bg-sun" : "bg-white hover:bg-sun/40"}`}
    >
      <input type="radio" name={name} className="accent-ink" checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

/** "Planning to take": which test, and when (optional). Nothing is scored until the student has a result. */
function PlannedEditor() {
  const t = useT();
  const locale = useLocale();
  const { profile, setProfile } = useStudent();
  const name = useId();
  const tests = profile.tests ?? {};
  const planned = tests.plan?.planned ?? { test: "sat" as AdmissionTest, month: null };
  const nowYM = useSyncExternalStore(noop, thisMonth, () => "");
  const save = (patch: { test?: AdmissionTest; month?: string | null }) => setProfile({ ...profile, tests: { ...tests, plan: withPlanned(tests.plan, patch) } });
  const past = !!planned.month && !!nowYM && planned.month < nowYM;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <fieldset className="space-y-1">
          <legend className="mb-1 text-xs text-zinc-500">{t("profile.test.plannedWhich")}</legend>
          <div className="flex gap-2">
            {(["sat", "act"] as const).map((x) => (
              <Pill key={x} name={name} checked={planned.test === x} onChange={() => save({ test: x })}>
                {x.toUpperCase()}
              </Pill>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">{t("profile.test.plannedMonth")}</span>
          <select className={`${field} w-auto`} value={planned.month ?? ""} onChange={(e) => save({ month: e.target.value || null })}>
            <option value="">{t("profile.test.plannedNoMonth")}</option>
            {planMonthOptions(nowYM, planned.month).map((m) => (
              <option key={m} value={m}>
                {planMonthText(locale, m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-zinc-500">{past ? t("profile.test.plannedPast", { test: planned.test.toUpperCase() }) : t("profile.test.plannedHint")}</p>
    </div>
  );
}

/**
 * "Which test are you using?": SAT, ACT, both, planning to take one, or not taking one. Only the chosen test's
 * boxes show. Switching never deletes a score; it only decides which one counts (lib/test-plan.ts).
 */
export function TestChoiceEditor() {
  const t = useT();
  const { profile, setProfile } = useStudent();
  const name = useId();
  const tests = profile.tests ?? {};
  const choice = testChoice(profile);
  const choose = (c: TestChoice) => setProfile({ ...profile, tests: { ...tests, plan: withTestChoice(tests.plan, c) } });
  const unused = unusedScores(profile);
  return (
    <div className="space-y-4 text-sm">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs text-zinc-500">{t("profile.test.question")}</legend>
        <div className="flex flex-wrap gap-2">
          {TEST_CHOICES.map((c) => (
            <Pill key={c} name={name} checked={choice === c} onChange={() => choose(c)}>
              {t(`profile.test.choice.${c}`)}
            </Pill>
          ))}
        </div>
      </fieldset>

      {choice === null && <p className="text-xs text-zinc-500">{t("profile.test.pick")}</p>}
      {(choice === "sat" || choice === "both") && (
        <div className="space-y-1.5">
          {choice === "both" && <p className="font-semibold">SAT</p>}
          <SatEditor />
        </div>
      )}
      {(choice === "act" || choice === "both") && (
        <div className="space-y-1.5">
          {choice === "both" && <p className="font-semibold">ACT</p>}
          <ActEditor />
        </div>
      )}
      {choice === "planned" && <PlannedEditor />}
      {choice === "none" && <p className="text-xs text-zinc-500">{t("profile.test.noneHint")}</p>}

      {unused.map((test) => (
        <p key={test} className="text-xs text-zinc-500">
          {t("profile.test.keptUnused", { test: test.toUpperCase(), score: (test === "sat" ? profile.sat : profile.act) ?? "" })}{" "}
          <button type="button" onClick={() => choose(choiceWith(profile, test))} className="font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-900">
            {t("profile.test.useAgain")}
          </button>
        </p>
      ))}
    </div>
  );
}

export function EnglishEditor() {
  const t = useT();
  const { profile, setProfile } = useStudent();
  const tests = profile.tests ?? {};
  const english = tests.english ?? {};
  const added = ENGLISH_TEST_KEYS.filter((k) => english[k]);
  const available = ENGLISH_TEST_KEYS.filter((k) => !english[k]);
  const [pick, setPick] = useState<EnglishTestKey | "">("");

  const setEnglish = (key: EnglishTestKey, patch: Partial<{ total: number | null; sections: SectionScores; date: string | null }> | null) => {
    const next = { ...english };
    if (patch) next[key] = { total: null, sections: {}, ...english[key], ...patch };
    else delete next[key];
    setProfile({ ...profile, tests: { ...tests, english: next } });
  };

  return (
    <div className="space-y-3 text-sm">
      {added.length === 0 && <p className="text-xs text-zinc-500">{t("profile.englishNone")}</p>}
      {added.map((key) => {
        const scale = ENGLISH_TESTS[key];
        const score = english[key]!;
        return (
          <div key={key} className="rounded-2xl border border-zinc-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-medium">{testLabel(t, key, scale.label)}</span>
              <button type="button" className={buttonClass("danger", "sm")} onClick={() => setEnglish(key, null)}>
                {t("common.remove")}
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <ScoreInput label={t("profile.overall")} value={score.total} scale={scale} onSave={(n) => setEnglish(key, { total: n })} />
              <Sections scale={scale} values={score.sections} onSave={(k, n) => setEnglish(key, { sections: { ...score.sections, [k]: n } })} />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">{t("profile.testDate")}</span>
                <input
                  type="date"
                  className={`${field} w-36`}
                  defaultValue={score.date ?? ""}
                  onBlur={(e) => setEnglish(key, { date: e.target.value || null })}
                />
              </label>
            </div>
          </div>
        );
      })}
      {available.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${field} w-auto`} value={pick} onChange={(e) => setPick(e.target.value as EnglishTestKey | "")}>
            <option value="">{t("profile.chooseTest")}</option>
            {available.map((k) => (
              <option key={k} value={k}>
                {testLabel(t, k, ENGLISH_TESTS[k].label)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pick}
            className={buttonClass("primary", "sm")}
            onClick={() => {
              if (pick) setEnglish(pick, {});
              setPick("");
            }}
          >
            {t("profile.addEnglish")}
          </button>
        </div>
      )}
    </div>
  );
}

/** All test editors stacked, for places that want the full form in one go. */
export function TestScoresForm() {
  const t = useT();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return null;
  return (
    <div className="space-y-6 text-sm">
      <fieldset className="space-y-2">
        <legend className="font-semibold">{t("profile.test.title")}</legend>
        <TestChoiceEditor />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-semibold">{t("profile.englishTests")}</legend>
        <EnglishEditor />
      </fieldset>
    </div>
  );
}
