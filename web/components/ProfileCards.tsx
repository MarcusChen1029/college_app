"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { cleanRegions, REGIONS, type RegionCode } from "@/lib/regions";
import { ENGLISH_TEST_KEYS, ENGLISH_TESTS, ACT_SCALE, SAT_SCALE, sectionSummary } from "@/lib/scores";
import { useStudent } from "@/lib/student-store";
import { GpaEditor, InternationalToggle } from "./ProfileForm";
import { ActEditor, EnglishEditor, SatEditor } from "./TestScoresForm";

type CardKey = "gpa" | "sat" | "act" | "english" | "regions";

/** Saves whatever field is mid-edit (they save on blur) before its card closes or hides. */
function commitFocus() {
  (document.activeElement as HTMLElement | null)?.blur();
}

function Card({
  id,
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
  label: string;
  tint: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  className?: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const panelId = `${id}-panel`;
  const buttonId = `${id}-button`;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !open) return;
    onClose();
    document.getElementById(buttonId)?.focus();
  };
  return (
    <div onKeyDown={onKeyDown} className={`overflow-hidden rounded-3xl border-2 border-ink ${tint} ${open ? "col-span-full" : ""} ${className}`}>
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-2 p-4 text-left focus-visible:-outline-offset-4"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-ink/70">{label}</span>
          {summary}
        </span>
        <span aria-hidden className={`mt-0.5 shrink-0 text-xs font-semibold text-ink/70 ${open ? "hidden" : ""}`}>
          Edit
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-4 border-t-2 border-ink/10 bg-white/70 p-4">
            {children}
            <button type="button" onClick={onClose} className="rounded-full border-2 border-ink bg-white px-4 py-1.5 text-sm font-semibold hover:bg-sun/60">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Value({ value, sub }: { value: string | number | null | undefined; sub?: string }) {
  if (value == null || value === "")
    return <span className="mt-1 block font-display text-lg font-bold text-ink/60">+ Add</span>;
  return (
    <>
      <span className="mt-1 block font-display text-3xl font-bold">{value}</span>
      {sub && <span className="mt-0.5 block truncate text-xs text-ink/70">{sub}</span>}
    </>
  );
}

export function RegionsEditor() {
  const { profile, updateProfile } = useStudent();
  const selected = cleanRegions(profile.targetRegions);
  const save = (next: RegionCode[]) => updateProfile({ targetRegions: cleanRegions(next) });
  const toggle = (code: RegionCode) => save(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  const makeDefault = (code: RegionCode) => save([code, ...selected.filter((c) => c !== code)]);
  const label = (code: RegionCode) => REGIONS.find((r) => r.code === code)!.label;

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
              {r.label}
            </label>
          );
        })}
      </div>
      {selected.length > 1 && (
        <ol className="space-y-1.5" aria-label="Region priority">
          {selected.map((code, i) => (
            <li key={code} className="flex items-center gap-2">
              <span className="font-medium">{label(code)}</span>
              {i === 0 ? (
                <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white">Default</span>
              ) : (
                <button type="button" onClick={() => makeDefault(code)} className="text-xs font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-900">
                  Make default
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-zinc-500">
        {selected.length === 0
          ? "None chosen, so Colleges and Portals show every region."
          : "Colleges and Portals only show these regions. Your first one opens by default on Colleges."}
      </p>
    </div>
  );
}

export function ProfileCards() {
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
  const props = (k: CardKey) => ({ id: `${base}-${k}`, open: open === k, onToggle: () => toggle(k), onClose: close });

  const englishKeys = ENGLISH_TEST_KEYS.filter((k) => profile.tests?.english?.[k]?.total != null);
  const englishKey = englishKeys[0];
  const english = englishKey ? profile.tests!.english![englishKey]! : null;
  const englishSub = englishKey
    ? [sectionSummary(ENGLISH_TESTS[englishKey], english?.sections), englishKeys.length > 1 ? `+${englishKeys.length - 1} more` : ""].filter(Boolean).join(" · ")
    : undefined;
  const regions = cleanRegions(profile.targetRegions);

  return (
    <section aria-label="Your numbers" className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Card {...props("gpa")} label="GPA (unweighted)" tint="bg-sun/60" summary={<Value value={profile.gpa} sub={profile.international ? "International" : undefined} />}>
        <GpaEditor />
        <InternationalToggle />
      </Card>
      <Card {...props("sat")} label="SAT" tint="bg-mint/50" summary={<Value value={profile.sat} sub={sectionSummary(SAT_SCALE, profile.tests?.sat)} />}>
        <SatEditor />
      </Card>
      <Card {...props("act")} label="ACT" tint="bg-lilac/40" summary={<Value value={profile.act} sub={sectionSummary(ACT_SCALE, profile.tests?.act)} />}>
        <ActEditor />
      </Card>
      <Card
        {...props("english")}
        label={englishKey ? ENGLISH_TESTS[englishKey].label : "English test"}
        tint="bg-blue-100"
        summary={<Value value={english?.total} sub={englishSub} />}
      >
        <EnglishEditor />
      </Card>
      <Card
        {...props("regions")}
        label="Regions applying to"
        tint="bg-coral/40"
        className={open === "regions" ? "" : "col-span-2 md:col-span-1"}
        summary={
          regions.length === 0 ? (
            <Value value={null} />
          ) : (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {regions.map((c, i) => (
                <span key={c} className="rounded-full border-2 border-ink bg-white px-2 py-0.5 text-xs font-semibold">
                  {REGIONS.find((r) => r.code === c)!.label}
                  {i === 0 && regions.length > 1 && <span className="sr-only"> (default)</span>}
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
