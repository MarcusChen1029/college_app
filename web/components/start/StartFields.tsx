"use client";

// The stats step's fields, set large for a first visit (labels 15px, 56px boxes). They save exactly what the
// profile's editors save (components/ProfileForm.tsx, TestScoresForm.tsx) through the same helpers; section scores
// and test dates stay on the Profile page. A typed SAT or ACT is passed up while it is still being typed (`onDraft`),
// so the list beside the form changes before the box is left.
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { parseGpa } from "@/lib/gpa";
import { useLocale, useT } from "@/lib/i18n/client";
import { planMonthText } from "@/lib/i18n/test-plan-text";
import { ACT_SCALE, ENGLISH_TEST_KEYS, ENGLISH_TESTS, parseScore, SAT_SCALE, type EnglishTestKey } from "@/lib/scores";
import { useStudent } from "@/lib/student-store";
import { choiceWith, planMonthOptions, TEST_CHOICES, testChoice, unusedScores, withPlanned, withTestChoice, type AdmissionTest, type TestChoice } from "@/lib/test-plan";
import { testLabel } from "../TestScoresForm";

const noop = () => () => {};
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const LEGEND = "font-display text-[22px] font-bold tracking-[-0.02em]";
export const HINT = "mt-2 max-w-[60ch] text-[15px] leading-snug text-zinc-600";
const LABEL = "block text-[15px] font-semibold";
const BOX =
  "mt-2 h-14 w-full rounded-xl border-2 border-zinc-200 bg-white px-4 font-display text-2xl font-bold tabular-nums text-ink placeholder:font-sans placeholder:text-lg placeholder:font-normal placeholder:text-zinc-500 hover:border-zinc-300 focus:border-ink";
const SELECT = "h-12 rounded-full border-2 border-zinc-200 bg-white px-4 text-base font-semibold text-ink hover:border-zinc-300 focus:border-ink";
const LINK = "font-semibold text-blue-700 underline underline-offset-4 hover:text-ink";

/** A typed value: a number, null for an empty box, or undefined when what is typed can't be saved (yet). */
type Parse = (raw: string) => number | null | undefined;
const scoreParser = (scale: { min: number; max: number; step: number }): Parse => (raw) => (raw.trim() === "" ? null : (parseScore(raw, scale) ?? undefined));
const gpaParser = (max: number): Parse => (raw) => (raw.trim() === "" ? null : (parseGpa(raw, 0, max) ?? undefined));

/** Uncontrolled like the profile's boxes: saves on blur and puts the saved value back if what was typed is out of range. */
function NumberBox({ label, value, placeholder, parse, onSave, onDraft, className = "" }: {
  label: string;
  value: number | null | undefined;
  placeholder: string;
  parse: Parse;
  onSave: (n: number | null) => void;
  onDraft?: (n: number | null | undefined) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        key={value ?? "empty"}
        className={BOX}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        defaultValue={value ?? ""}
        onChange={(e) => onDraft?.(parse(e.target.value))}
        onBlur={(e) => {
          const n = parse(e.target.value);
          onDraft?.(undefined);
          if (n === undefined) {
            e.target.value = value?.toString() ?? "";
            return;
          }
          if (n !== (value ?? null)) onSave(n);
        }}
      />
    </div>
  );
}

/** A large option backed by a real radio (arrow keys, screen readers). */
function Choice({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label
      className={`inline-flex h-12 cursor-pointer items-center rounded-full px-5 text-base font-semibold transition-[background-color,color,transform] duration-200 active:scale-[0.97] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-400 ${
        checked ? "bg-ink text-white" : "bg-blue-50 text-ink hover:bg-blue-100"
      }`}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

export function GpaFields() {
  const t = useT();
  const { profile, setProfile } = useStudent();
  const weightedOnly = profile.gpaWeighted != null && profile.gpa == null;
  return (
    <fieldset>
      <legend className={LEGEND}>GPA</legend>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <NumberBox label={t("profile.gpaUnweightedLabel")} value={profile.gpa} placeholder="3.9" parse={gpaParser(4)} onSave={(n) => setProfile({ ...profile, gpa: n })} />
        <NumberBox label={t("profile.start.gpaWeighted")} value={profile.gpaWeighted} placeholder="4.5" parse={gpaParser(6)} onSave={(n) => setProfile({ ...profile, gpaWeighted: n })} />
      </div>
      <p className={HINT}>{weightedOnly ? t("profile.gpaWeightedOnly") : t("profile.gpaHint")}</p>
    </fieldset>
  );
}

/** "Which test are you using?" and the boxes for the chosen one. Switching never deletes a score (lib/test-plan.ts). */
export function TestFields({ onDraft }: { onDraft: (test: AdmissionTest, n: number | null | undefined) => void }) {
  const t = useT();
  const locale = useLocale();
  const { profile, setProfile } = useStudent();
  const name = useId();
  const plannedName = useId();
  const nowYM = useSyncExternalStore(noop, thisMonth, () => "");
  const tests = profile.tests ?? {};
  const choice = testChoice(profile);
  const choose = (c: TestChoice) => setProfile({ ...profile, tests: { ...tests, plan: withTestChoice(tests.plan, c) } });
  const planned = tests.plan?.planned ?? { test: "sat" as AdmissionTest, month: null };
  const savePlanned = (patch: { test?: AdmissionTest; month?: string | null }) => setProfile({ ...profile, tests: { ...tests, plan: withPlanned(tests.plan, patch) } });
  const past = !!planned.month && !!nowYM && planned.month < nowYM;
  const sat = choice === "sat" || choice === "both";
  const act = choice === "act" || choice === "both";

  return (
    <fieldset>
      <legend className={LEGEND}>{t("profile.test.title")}</legend>
      <div role="radiogroup" aria-label={t("profile.test.question")} className="mt-4 flex flex-wrap gap-2">
        {TEST_CHOICES.map((c) => (
          <Choice key={c} name={name} checked={choice === c} onChange={() => choose(c)}>
            {t(`profile.test.choice.${c}`)}
          </Choice>
        ))}
      </div>
      {choice === null && <p className={HINT}>{t("profile.test.pick")}</p>}
      {(sat || act) && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {sat && (
            <NumberBox
              label={t("profile.start.satTotal")}
              value={profile.sat}
              placeholder={`${SAT_SCALE.min}–${SAT_SCALE.max}`}
              parse={scoreParser(SAT_SCALE)}
              onSave={(n) => setProfile({ ...profile, sat: n })}
              onDraft={(n) => onDraft("sat", n)}
            />
          )}
          {act && (
            <NumberBox
              label={t("profile.start.actComposite")}
              value={profile.act}
              placeholder={`${ACT_SCALE.min}–${ACT_SCALE.max}`}
              parse={scoreParser(ACT_SCALE)}
              onSave={(n) => setProfile({ ...profile, act: n })}
              onDraft={(n) => onDraft("act", n)}
            />
          )}
        </div>
      )}
      {choice === "planned" && (
        <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-4">
          <div role="radiogroup" aria-label={t("profile.test.plannedWhich")}>
            <p className={LABEL} aria-hidden>
              {t("profile.test.plannedWhich")}
            </p>
            <div className="mt-2 flex gap-2">
              {(["sat", "act"] as const).map((x) => (
                <Choice key={x} name={plannedName} checked={planned.test === x} onChange={() => savePlanned({ test: x })}>
                  {x.toUpperCase()}
                </Choice>
              ))}
            </div>
          </div>
          <label className="block">
            <span className={LABEL}>{t("profile.test.plannedMonth")}</span>
            <select className={`${SELECT} mt-2`} value={planned.month ?? ""} onChange={(e) => savePlanned({ month: e.target.value || null })}>
              <option value="">{t("profile.test.plannedNoMonth")}</option>
              {planMonthOptions(nowYM, planned.month).map((m) => (
                <option key={m} value={m}>
                  {planMonthText(locale, m)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {choice === "planned" && <p className={HINT}>{past ? t("profile.test.plannedPast", { test: planned.test.toUpperCase() }) : t("profile.test.plannedHint")}</p>}
      {choice === "none" && <p className={HINT}>{t("profile.test.noneHint")}</p>}
      {unusedScores(profile).map((test) => (
        <p key={test} className={HINT}>
          {t("profile.test.keptUnused", { test: test.toUpperCase(), score: (test === "sat" ? profile.sat : profile.act) ?? "" })}{" "}
          <button type="button" onClick={() => choose(choiceWith(profile, test))} className={LINK}>
            {t("profile.test.useAgain")}
          </button>
        </p>
      ))}
    </fieldset>
  );
}

/** English tests with their overall score; sub-scores and dates are kept on the Profile page. */
export function EnglishFields() {
  const t = useT();
  const { profile, setProfile } = useStudent();
  const tests = profile.tests ?? {};
  const english = tests.english ?? {};
  const added = ENGLISH_TEST_KEYS.filter((k) => english[k]);
  const available = ENGLISH_TEST_KEYS.filter((k) => !english[k]);
  const [pick, setPick] = useState<EnglishTestKey | "">("");
  const pickId = useId();
  const setEnglish = (key: EnglishTestKey, total: number | null | false) => {
    const next = { ...english };
    if (total === false) delete next[key];
    else next[key] = { sections: {}, ...english[key], total };
    setProfile({ ...profile, tests: { ...tests, english: next } });
  };

  return (
    <fieldset>
      <legend className={LEGEND}>{t("profile.englishTest")}</legend>
      {added.length === 0 && <p className={HINT}>{t("profile.englishNone")}</p>}
      {added.length > 0 && (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {added.map((key) => {
            const scale = ENGLISH_TESTS[key];
            return (
              <li key={key} className="flex items-end gap-3">
                <NumberBox
                  className="min-w-0 flex-1"
                  label={testLabel(t, key, scale.label)}
                  value={english[key]!.total}
                  placeholder={`${scale.min}–${scale.max}`}
                  parse={scoreParser(scale)}
                  onSave={(n) => setEnglish(key, n)}
                />
                <button
                  type="button"
                  onClick={() => setEnglish(key, false)}
                  aria-label={t("profile.start.removeTest", { test: testLabel(t, key, scale.label) })}
                  className="h-14 shrink-0 px-2 text-base font-semibold text-zinc-600 underline underline-offset-4 hover:text-ink"
                >
                  {t("common.remove")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {available.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor={pickId} className="sr-only">
            {t("profile.chooseTest")}
          </label>
          <select id={pickId} className={`${SELECT} min-w-0 max-w-full`} value={pick} onChange={(e) => setPick(e.target.value as EnglishTestKey | "")}>
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
            onClick={() => {
              if (pick) setEnglish(pick, null);
              setPick("");
            }}
            className="inline-flex h-12 items-center rounded-full bg-blue-50 px-5 text-base font-semibold text-ink transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:text-zinc-500"
          >
            {t("profile.addEnglish")}
          </button>
        </div>
      )}
    </fieldset>
  );
}
