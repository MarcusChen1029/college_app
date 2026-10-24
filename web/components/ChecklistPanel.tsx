"use client";

import Link from "next/link";
import {
  ENGLISH_PLANS,
  isDone,
  TEST_PLANS,
  type Checklist,
  type EnglishPlan,
  type TestPlan,
} from "@/lib/checklist";
import { ENGLISH_POLICY, TEST_POLICY } from "@/lib/format";
import type { ListEntry } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";

// No bg/border colour here: a tone class is added instead (Tailwind orders by stylesheet, so competing utilities would win).
export const SELECT_BASE = "rounded border px-1 py-0.5 text-xs";
export const SELECT = `${SELECT_BASE} border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900`;
const INPUT = "rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900";

type Props = {
  entry: ListEntry;
  college: CollegeSummary;
  international: boolean;
  onChange: (patch: Partial<Pick<ListEntry, "checklist" | "notes">>) => void;
  onRemove: () => void;
};

export function ChecklistPanel({ entry, college, international, onChange, onRemove }: Props) {
  const c = entry.checklist;
  const set = (patch: Partial<Checklist>) => onChange({ checklist: { ...c, ...patch } });
  const essays = c.essay_list ?? [];
  const finals = essays.filter((e) => e.status === "final").length;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Section title="Essays" done={isDone("essays", c)} className="md:col-span-2">
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          {c.no_essays
            ? "No essays required."
            : essays.length > 0
              ? `${finals}/${essays.length} essays final.`
              : "No essays added yet."}{" "}
          <Link href="/application/essays" className="text-blue-600 underline dark:text-blue-400">
            Manage on the Essays page
          </Link>
        </p>
      </Section>

      <Section title="Recommendations" done={isDone("recommendations", c)}>
        <Check checked={!!c.recommendations} onChange={(v) => set({ recommendations: v })}>
          All recommendations submitted
        </Check>
      </Section>

      <Section title="Transcript" done={isDone("transcript", c)}>
        <Check checked={!!c.transcript} onChange={(v) => set({ transcript: v })}>
          Transcript sent
        </Check>
      </Section>

      <Section title="Test scores" done={isDone("test_scores", c)} hint={college.test_policy ? (TEST_POLICY[college.test_policy] ?? college.test_policy) : null}>
        <PlanPicker
          value={c.test_plan ?? null}
          options={TEST_PLANS}
          label={`Test plan for ${college.name}`}
          onChange={(v) => set({ test_plan: v as TestPlan | null })}
        />
        {c.test_plan !== "optional" && (
          <Check checked={!!c.test_scores} onChange={(v) => set({ test_scores: v })}>
            Scores sent
          </Check>
        )}
        {c.test_plan === "optional" && college.test_policy === "required" && <Warn>{college.short_name ?? college.name} requires test scores.</Warn>}
      </Section>

      <Section
        title="English test"
        done={isDone("english_test", c)}
        hint={
          college.english_policy
            ? `${ENGLISH_POLICY[college.english_policy] ?? college.english_policy}${international ? "" : " · usually only for international applicants"}`
            : null
        }
      >
        <PlanPicker
          value={c.english_plan ?? null}
          options={ENGLISH_PLANS}
          label={`English test for ${college.name}`}
          onChange={(v) => set({ english_plan: v as EnglishPlan | null })}
        />
        {c.english_plan !== "not_required" && (
          <Check checked={!!c.english_test} onChange={(v) => set({ english_test: v })}>
            Score sent
          </Check>
        )}
        {c.english_plan === "not_required" && international && college.english_policy === "required_all_international" && (
          <Warn>Required for all international applicants — check the waiver rules.</Warn>
        )}
      </Section>

      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-medium text-zinc-500" htmlFor={`notes-${entry.slug}`}>
          Notes
        </label>
        <textarea
          id={`notes-${entry.slug}`}
          rows={2}
          className={`${INPUT} w-full`}
          defaultValue={entry.notes}
          placeholder="Essay ideas, recommenders, portal login reminders…"
          onBlur={(e) => e.target.value !== entry.notes && onChange({ notes: e.target.value })}
        />
        <div className="mt-1 text-right">
          <button className="text-xs text-zinc-500 hover:text-urgent" onClick={onRemove}>
            Remove from list
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
  return (
    <section className={`rounded-md border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-950 ${className}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
            done ? "bg-done text-white" : "border border-zinc-300 dark:border-zinc-600"
          }`}
          aria-label={done ? "done" : "not done"}
        >
          {done ? "✓" : ""}
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">{title}</h3>
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
    <label className={`flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 ${className}`}>
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
  return (
    <select className={SELECT} value={value ?? ""} aria-label={label} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Undecided</option>
      {options.map(([k, l]) => (
        <option key={k} value={k}>
          {l}
        </option>
      ))}
    </select>
  );
}
