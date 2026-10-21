"use client";

import { useState, useSyncExternalStore } from "react";
import { ACT_SCALE, ENGLISH_TEST_KEYS, ENGLISH_TESTS, parseScore, SAT_SCALE, satTotal, type EnglishTestKey, type ScoreScale, type SectionScores } from "@/lib/scores";
import { useStudent } from "@/lib/student-store";

const noop = () => () => {};
const field = "w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm";

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
  return (
    <>
      {scale.sections.map((s) => (
        <ScoreInput key={s.key} label={s.label} value={values?.[s.key]} scale={s} onSave={(n) => onSave(s.key, n)} />
      ))}
    </>
  );
}

export function TestScoresForm() {
  const { profile, setProfile } = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const tests = profile.tests ?? {};
  const english = tests.english ?? {};
  const added = ENGLISH_TEST_KEYS.filter((k) => english[k]);
  const available = ENGLISH_TEST_KEYS.filter((k) => !english[k]);
  const [pick, setPick] = useState<EnglishTestKey | "">("");

  if (!mounted) return null;

  const setSat = (key: string, n: number | null) => {
    const sat = { ...tests.sat, [key]: n };
    setProfile({ ...profile, sat: satTotal(sat) ?? profile.sat, tests: { ...tests, sat } });
  };
  const setAct = (key: string, n: number | null) => setProfile({ ...profile, tests: { ...tests, act: { ...tests.act, [key]: n } } });
  const setEnglish = (key: EnglishTestKey, patch: Partial<{ total: number | null; sections: SectionScores; date: string | null }> | null) => {
    const next = { ...english };
    if (patch) next[key] = { total: null, sections: {}, ...english[key], ...patch };
    else delete next[key];
    setProfile({ ...profile, tests: { ...tests, english: next } });
  };

  return (
    <div className="space-y-6 text-sm">
      <fieldset className="space-y-2">
        <legend className="font-semibold">SAT</legend>
        <div className="flex flex-wrap items-end gap-3">
          <ScoreInput label="Total" value={profile.sat} scale={SAT_SCALE} onSave={(n) => setProfile({ ...profile, sat: n })} />
          <Sections scale={SAT_SCALE} values={tests.sat} onSave={setSat} />
        </div>
        <p className="text-xs text-zinc-500">Entering both sections fills in the total.</p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-semibold">ACT</legend>
        <div className="flex flex-wrap items-end gap-3">
          <ScoreInput label="Composite" value={profile.act} scale={ACT_SCALE} onSave={(n) => setProfile({ ...profile, act: n })} />
          <Sections scale={ACT_SCALE} values={tests.act} onSave={setAct} />
        </div>
        <p className="text-xs text-zinc-500">Science and Writing are optional on the current ACT; leave them blank if you didn&apos;t take them.</p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold">English tests</legend>
        {added.length === 0 && <p className="text-xs text-zinc-500">None yet. International applicants usually need one; add each test you took.</p>}
        {added.map((key) => {
          const scale = ENGLISH_TESTS[key];
          const score = english[key]!;
          return (
            <div key={key} className="rounded-2xl border border-zinc-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium">{scale.label}</span>
                <button type="button" className="text-xs text-rose-600 hover:underline" onClick={() => setEnglish(key, null)}>
                  Remove
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <ScoreInput label="Overall" value={score.total} scale={scale} onSave={(n) => setEnglish(key, { total: n })} />
                <Sections scale={scale} values={score.sections} onSave={(k, n) => setEnglish(key, { sections: { ...score.sections, [k]: n } })} />
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500">Test date</span>
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
              <option value="">Choose a test…</option>
              {available.map((k) => (
                <option key={k} value={k}>
                  {ENGLISH_TESTS[k].label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!pick}
              className="rounded-md bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              onClick={() => {
                if (pick) setEnglish(pick, {});
                setPick("");
              }}
            >
              + Add English test
            </button>
          </div>
        )}
      </fieldset>
    </div>
  );
}
