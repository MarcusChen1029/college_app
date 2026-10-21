"use client";

import { useState } from "react";
import {
  ENGLISH_PLANS,
  ESSAY_STATUSES,
  isDone,
  newEssay,
  safeLink,
  TEST_PLANS,
  type Checklist,
  type Essay,
  type EnglishPlan,
  type TestPlan,
} from "@/lib/checklist";
import { ENGLISH_POLICY, TEST_POLICY } from "@/lib/format";
import type { ListEntry, Portal } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";

export const SELECT = "rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900";
const INPUT = "rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900";

const ESSAY_TONE: Record<Essay["status"], string> = {
  not_started: "text-zinc-500",
  brainstorming: "text-blue-700 dark:text-blue-300",
  drafting: "text-amber-700 dark:text-amber-300",
  revising: "text-violet-700 dark:text-violet-300",
  final: "text-emerald-700 dark:text-emerald-300",
};

type Props = {
  entry: ListEntry;
  college: CollegeSummary;
  international: boolean;
  onChange: (patch: Partial<Pick<ListEntry, "checklist" | "notes" | "portal">>) => void;
  onRemove: () => void;
};

export function ChecklistPanel({ entry, college, international, onChange, onRemove }: Props) {
  const c = entry.checklist;
  const set = (patch: Partial<Checklist>) => onChange({ checklist: { ...c, ...patch } });
  const essays = c.essay_list ?? [];
  const setEssay = (id: string, patch: Partial<Essay>) => set({ essay_list: essays.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const finals = essays.filter((e) => e.status === "final").length;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Section title="Essays" done={isDone("essays", c)} className="md:col-span-2">
        {!c.no_essays && (
          <>
            {essays.length > 0 ? (
              <ul className="space-y-2">
                {essays.map((e, i) => {
                  const link = safeLink(e.url);
                  return (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <div className="flex min-w-60 flex-1 items-center gap-2">
                        <span className="w-5 text-right text-xs tabular-nums text-zinc-400">{i + 1}.</span>
                        <input
                          className={`${INPUT} min-w-0 flex-1`}
                          defaultValue={e.title}
                          placeholder="Prompt or name, e.g. Why us?"
                          aria-label={`Essay ${i + 1} name`}
                          onBlur={(ev) => ev.target.value !== e.title && setEssay(e.id, { title: ev.target.value })}
                        />
                        <select
                          className={`${SELECT} ${ESSAY_TONE[e.status]}`}
                          value={e.status}
                          aria-label={`Essay ${i + 1} status`}
                          onChange={(ev) => setEssay(e.id, { status: ev.target.value as Essay["status"] })}
                        >
                          {ESSAY_STATUSES.map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex min-w-60 flex-1 items-center gap-2 pl-7 sm:pl-0">
                        <input
                          type="url"
                          className={`${INPUT} min-w-0 flex-1`}
                          defaultValue={e.url}
                          placeholder="Paste Google Doc link"
                          aria-label={`Essay ${i + 1} Google Doc link`}
                          onBlur={(ev) => ev.target.value !== e.url && setEssay(e.id, { url: ev.target.value.trim() })}
                        />
                        {link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-blue-600 underline dark:text-blue-400">
                            Open ↗
                          </a>
                        ) : (
                          <span className="w-11 shrink-0" />
                        )}
                        <button
                          className="shrink-0 rounded px-1 text-zinc-400 hover:text-rose-600"
                          aria-label={`Remove essay ${i + 1}`}
                          onClick={() => set({ essay_list: essays.filter((x) => x.id !== e.id) })}
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-zinc-500">No essays added yet.</p>
            )}
            <div className="mt-2 flex items-center gap-3">
              <button
                className="rounded border border-dashed border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-white"
                onClick={() => set({ essay_list: [...essays, newEssay()] })}
              >
                + Add essay
              </button>
              {essays.length > 0 && (
                <span className="text-xs tabular-nums text-zinc-500">
                  {finals}/{essays.length} final
                </span>
              )}
            </div>
          </>
        )}
        <Check className="mt-2" checked={!!c.no_essays} onChange={(v) => set({ no_essays: v })}>
          This college requires no essays
        </Check>
      </Section>

      <PortalSection portal={entry.portal} name={college.name} onChange={(portal) => onChange({ portal })} />

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
          <button className="text-xs text-zinc-500 hover:text-rose-600" onClick={onRemove}>
            Remove from list
          </button>
        </div>
      </div>
    </div>
  );
}

function PortalSection({ portal, name, onChange }: { portal: Portal; name: string; onChange: (p: Portal) => void }) {
  const [show, setShow] = useState(false);
  const save = (patch: Partial<Portal>) => {
    const next = { ...portal, ...patch };
    if (next.url !== portal.url || next.username !== portal.username || next.password !== portal.password) onChange(next);
  };
  const link = safeLink(portal.url);
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-2.5 md:col-span-2 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Application portal</h3>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-60 flex-[2] items-center gap-2">
          <input
            type="url"
            className={`${INPUT} min-w-0 flex-1`}
            defaultValue={portal.url}
            placeholder="Portal link, e.g. https://apply.example.edu"
            aria-label={`Application portal link for ${name}`}
            onBlur={(e) => save({ url: e.target.value.trim() })}
          />
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-blue-600 underline dark:text-blue-400">
              Open ↗
            </a>
          )}
        </div>
        <input
          className={`${INPUT} min-w-36 flex-1`}
          defaultValue={portal.username}
          placeholder="Username / email"
          autoComplete="off"
          aria-label={`Portal username for ${name}`}
          onBlur={(e) => save({ username: e.target.value.trim() })}
        />
        <div className="flex min-w-36 flex-1 items-center gap-1">
          <input
            type={show ? "text" : "password"}
            className={`${INPUT} min-w-0 flex-1`}
            defaultValue={portal.password}
            placeholder="Password"
            autoComplete="new-password"
            aria-label={`Portal password for ${name}`}
            onBlur={(e) => save({ password: e.target.value })}
          />
          <button className="shrink-0 rounded px-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200" onClick={() => setShow((v) => !v)}>
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-400">
        Saved to your account (or this browser when signed out) without extra encryption. Use a password you don&apos;t use anywhere else.
      </p>
    </section>
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
            done ? "bg-emerald-600 text-white" : "border border-zinc-300 dark:border-zinc-600"
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
  return <p className="text-[11px] text-rose-600 dark:text-rose-400">{children}</p>;
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
