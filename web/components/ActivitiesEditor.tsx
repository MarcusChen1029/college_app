"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  CA_ACTIVITY_TYPES,
  CA_LIMITS,
  CA_TIMING,
  GRADES,
  HONOR_LEVELS,
  move,
  newCaActivity,
  newCaHonor,
  newUcEntry,
  UC_AWARD_LEVELS,
  UC_CATEGORIES,
  UC_CATEGORY_KEYS,
  UC_LIMITS,
  ucDraftsFromCommonApp,
  type ActivityData,
  type CaActivity,
  type CaHonor,
  type CaTiming,
  type Grade,
  type HonorLevel,
  type UcAwardLevel,
  type UcCategory,
  type UcEntry,
} from "@/lib/activities";
import { useStudent } from "@/lib/student-store";

const noop = () => () => {};
const input = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm";

// ── small fields ──

/** Text box with a live character count; saves on blur. */
function TextField({ label, value, max, rows, onSave }: { label: string; value: string; max: number; rows?: number; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const props = { className: input, maxLength: max, value: v, onBlur: () => v !== value && onSave(v) };
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-xs text-zinc-500">
        {label}
        <span className={`tabular-nums ${v.length >= max ? "font-semibold text-amber-700" : ""}`}>
          {v.length}/{max}
        </span>
      </span>
      {rows ? (
        <textarea {...props} rows={rows} onChange={(e) => setV(e.target.value)} />
      ) : (
        <input {...props} onChange={(e) => setV(e.target.value)} />
      )}
    </label>
  );
}

function NumberField({ label, value, max, onSave }: { label: string; value: number | null; max: number; onSave: (n: number | null) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        key={value ?? "empty"}
        className={`${input} w-24`}
        inputMode="numeric"
        placeholder={`0–${max}`}
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const n = raw === "" ? null : Number(raw);
          if (n != null && !(Number.isInteger(n) && n >= 0 && n <= max)) {
            e.target.value = value?.toString() ?? "";
            return;
          }
          if (n !== value) onSave(n);
        }}
      />
    </label>
  );
}

function Checks<K extends string>({ label, options, value, onChange }: { label: string; options: Record<K, string>; value: K[]; onChange: (v: K[]) => void }) {
  const keys = Object.keys(options) as K[];
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs text-zinc-500">{label}</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {keys.map((k) => (
          <label key={k} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={value.includes(k)}
              onChange={(e) => onChange(e.target.checked ? keys.filter((x) => x === k || value.includes(x)) : value.filter((x) => x !== k))}
            />
            {options[k]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const GRADE_OPTIONS = Object.fromEntries(GRADES.map((g) => [g, g === "PG" ? "Post-grad" : g])) as Record<Grade, string>;

// ── entry card ──

function Card({
  index,
  title,
  subtitle,
  open,
  onToggle,
  onMove,
  onRemove,
  children,
}: {
  index: number;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const btn = "grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100";
  return (
    <li className="rounded-2xl border border-zinc-200">
      <div className="flex items-center gap-2 p-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{index + 1}</span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="block truncate font-semibold">{title || <span className="font-normal text-zinc-400">Untitled</span>}</span>
          {subtitle && <span className="block truncate text-xs text-zinc-500">{subtitle}</span>}
        </button>
        <button type="button" className={btn} onClick={() => onMove(-1)} aria-label="Move up">
          ↑
        </button>
        <button type="button" className={btn} onClick={() => onMove(1)} aria-label="Move down">
          ↓
        </button>
        <button type="button" className="px-2 text-xs text-zinc-500 hover:text-rose-600" onClick={onRemove}>
          Remove
        </button>
      </div>
      {open && <div className="grid gap-3 border-t border-zinc-100 p-3 sm:grid-cols-2">{children}</div>}
    </li>
  );
}

const wide = "sm:col-span-2";

function CaActivityFields({ a, set }: { a: CaActivity; set: (p: Partial<CaActivity>) => void }) {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Activity type</span>
        <select className={input} value={a.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">Choose…</option>
          {CA_ACTIVITY_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <TextField label="Position / leadership" value={a.position} max={CA_LIMITS.position} onSave={(position) => set({ position })} />
      <div className={wide}>
        <TextField label="Organization name" value={a.organization} max={CA_LIMITS.organization} onSave={(organization) => set({ organization })} />
      </div>
      <div className={wide}>
        <TextField label="Description (accomplishments, recognition)" value={a.description} max={CA_LIMITS.description} rows={2} onSave={(description) => set({ description })} />
      </div>
      <Checks label="Grade levels" options={GRADE_OPTIONS} value={a.grades} onChange={(grades) => set({ grades })} />
      <Checks<CaTiming> label="Timing" options={CA_TIMING} value={a.timing} onChange={(timing) => set({ timing })} />
      <div className="flex gap-3">
        <NumberField label="Hours / week" value={a.hoursPerWeek} max={168} onSave={(hoursPerWeek) => set({ hoursPerWeek })} />
        <NumberField label="Weeks / year" value={a.weeksPerYear} max={52} onSave={(weeksPerYear) => set({ weeksPerYear })} />
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Continue in college?</span>
        <select
          className={`${input} w-auto`}
          value={a.continueInCollege == null ? "" : a.continueInCollege ? "yes" : "no"}
          onChange={(e) => set({ continueInCollege: e.target.value === "" ? null : e.target.value === "yes" })}
        >
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
    </>
  );
}

function CaHonorFields({ h, set }: { h: CaHonor; set: (p: Partial<CaHonor>) => void }) {
  return (
    <>
      <div className={wide}>
        <TextField label="Honor title" value={h.title} max={CA_LIMITS.honorTitle} onSave={(title) => set({ title })} />
      </div>
      <Checks label="Grade levels" options={GRADE_OPTIONS} value={h.grades} onChange={(grades) => set({ grades })} />
      <Checks<HonorLevel> label="Level(s) of recognition" options={HONOR_LEVELS} value={h.levels} onChange={(levels) => set({ levels })} />
    </>
  );
}

function UcFields({ e, set }: { e: UcEntry; set: (p: Partial<UcEntry>) => void }) {
  const form = UC_CATEGORIES[e.category];
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Category</span>
        <select className={input} value={e.category} onChange={(ev) => set({ category: ev.target.value as UcCategory })}>
          {UC_CATEGORY_KEYS.map((k) => (
            <option key={k} value={k}>
              {UC_CATEGORIES[k].label}
            </option>
          ))}
        </select>
      </label>
      <TextField key={`name-${e.category}`} label={form.name} value={e.name} max={UC_LIMITS.name} onSave={(name) => set({ name })} />
      {form.organization && <TextField label={form.organization} value={e.organization} max={UC_LIMITS.name} onSave={(organization) => set({ organization })} />}
      {e.category === "award" && (
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Level of recognition</span>
            <select className={`${input} w-auto`} value={e.awardLevel ?? ""} onChange={(ev) => set({ awardLevel: (ev.target.value || null) as UcAwardLevel | null })}>
              <option value="">—</option>
              {(Object.keys(UC_AWARD_LEVELS) as UcAwardLevel[]).map((k) => (
                <option key={k} value={k}>
                  {UC_AWARD_LEVELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Type</span>
            <select
              className={`${input} w-auto`}
              value={e.awardType ?? ""}
              onChange={(ev) => set({ awardType: (ev.target.value || null) as UcEntry["awardType"] })}
            >
              <option value="">—</option>
              <option value="academic">Academic</option>
              <option value="non_academic">Non-academic</option>
            </select>
          </label>
        </div>
      )}
      {form.extra && (
        <div className={wide}>
          <TextField key={`extra-${e.category}`} label={form.extra} value={e.extra} max={UC_LIMITS.extra} rows={2} onSave={(extra) => set({ extra })} />
        </div>
      )}
      <div className={wide}>
        <TextField key={`desc-${e.category}`} label={form.description} value={e.description} max={UC_LIMITS.description} rows={4} onSave={(description) => set({ description })} />
      </div>
      <Checks label="Grade levels" options={GRADE_OPTIONS} value={e.grades} onChange={(grades) => set({ grades })} />
      {form.hours && (
        <div className="flex gap-3">
          <NumberField label="Hours / week" value={e.hoursPerWeek} max={168} onSave={(hoursPerWeek) => set({ hoursPerWeek })} />
          <NumberField label="Weeks / year" value={e.weeksPerYear} max={52} onSave={(weeksPerYear) => set({ weeksPerYear })} />
        </div>
      )}
    </>
  );
}

// ── lists ──

type Item = { id: string };

/** Ordered list of cards with add/move/remove; `render` draws one item's fields. */
function EntryList<T extends Item>({
  heading,
  items,
  limit,
  addLabel,
  onChange,
  make,
  title,
  subtitle,
  render,
  extraAction,
}: {
  heading: string;
  items: T[];
  limit: number;
  addLabel: string;
  onChange: (items: T[]) => void;
  make: () => T;
  title: (item: T) => string;
  subtitle: (item: T) => string;
  render: (item: T, set: (p: Partial<T>) => void) => React.ReactNode;
  extraAction?: React.ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const full = items.length >= limit;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">{heading}</h2>
        <span className={`text-sm tabular-nums ${full ? "font-semibold text-amber-700" : "text-zinc-500"}`}>
          {items.length} / {limit}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {extraAction}
          <button
            type="button"
            disabled={full}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            onClick={() => {
              const item = make();
              onChange([...items, item]);
              setOpen(item.id);
            }}
          >
            {addLabel}
          </button>
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">Nothing here yet.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((item, i) => (
            <Card
              key={item.id}
              index={i}
              title={title(item)}
              subtitle={subtitle(item)}
              open={open === item.id}
              onToggle={() => setOpen(open === item.id ? null : item.id)}
              onMove={(dir) => onChange(move(items, i, dir))}
              onRemove={() => {
                if (window.confirm(`Remove "${title(item) || "Untitled"}"?`)) onChange(items.filter((x) => x.id !== item.id));
              }}
            >
              {render(item, (p) => onChange(items.map((x) => (x.id === item.id ? { ...x, ...p } : x))))}
            </Card>
          ))}
        </ol>
      )}
    </section>
  );
}

const grades = (g: Grade[]) => (g.length ? `Grades ${g.join(", ")}` : "");
const hours = (h: number | null, w: number | null) => (h != null || w != null ? `${h ?? "?"} hr/wk · ${w ?? "?"} wk/yr` : "");
const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

export function ActivitiesEditor() {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [tab, setTab] = useState<"common" | "uc">("common");
  if (!mounted || !student.ready) return <div className="h-64 animate-pulse rounded-3xl bg-zinc-100" />;

  const raw = student.profile.activities ?? {};
  const data: ActivityData = {
    commonApp: { activities: raw.commonApp?.activities ?? [], honors: raw.commonApp?.honors ?? [] },
    uc: raw.uc ?? [],
  };
  const save = (next: ActivityData) => student.updateProfile({ activities: next });
  const drafts = ucDraftsFromCommonApp(data);
  const room = UC_LIMITS.entries - data.uc.length;

  const tabBtn = (key: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === key ? "bg-ink text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {tabBtn("common", "Common App")}
        {tabBtn("uc", "UC application")}
        <span className="ml-auto text-xs text-zinc-500">
          {student.auth ? "Synced to your account." : "Saved in this browser only. "}
          {!student.auth && (
            <Link href="/profile#account" className="text-blue-600 underline">
              Sign in
            </Link>
          )}
        </span>
      </div>

      {tab === "common" ? (
        <>
          <EntryList<CaActivity>
            heading="Activities"
            items={data.commonApp.activities}
            limit={CA_LIMITS.activities}
            addLabel="+ Add activity"
            make={newCaActivity}
            onChange={(activities) => save({ ...data, commonApp: { ...data.commonApp, activities } })}
            title={(a) => a.organization || a.position}
            subtitle={(a) => join(a.type, a.position && a.organization ? a.position : "", grades(a.grades), hours(a.hoursPerWeek, a.weeksPerYear))}
            render={(a, set) => <CaActivityFields a={a} set={set} />}
          />
          <EntryList<CaHonor>
            heading="Honors"
            items={data.commonApp.honors}
            limit={CA_LIMITS.honors}
            addLabel="+ Add honor"
            make={newCaHonor}
            onChange={(honors) => save({ ...data, commonApp: { ...data.commonApp, honors } })}
            title={(h) => h.title}
            subtitle={(h) => join(h.levels.map((l) => HONOR_LEVELS[l]).join(", "), grades(h.grades))}
            render={(h, set) => <CaHonorFields h={h} set={set} />}
          />
          <p className="text-xs text-zinc-500">
            List activities in order of importance. Common App limits: position {CA_LIMITS.position}, organization {CA_LIMITS.organization}, description{" "}
            {CA_LIMITS.description} and honor title {CA_LIMITS.honorTitle} characters. Check the live form before submitting.
          </p>
        </>
      ) : (
        <>
          <EntryList<UcEntry>
            heading="Activities & awards"
            items={data.uc}
            limit={UC_LIMITS.entries}
            addLabel="+ Add entry"
            make={() => newUcEntry("extracurricular")}
            onChange={(uc) => save({ ...data, uc })}
            title={(e) => e.name}
            subtitle={(e) => join(UC_CATEGORIES[e.category].label, grades(e.grades), UC_CATEGORIES[e.category].hours ? hours(e.hoursPerWeek, e.weeksPerYear) : "")}
            render={(e, set) => <UcFields e={e} set={set} />}
            extraAction={
              drafts.length > 0 && (
                <button
                  type="button"
                  disabled={room <= 0}
                  className="rounded-md border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40"
                  onClick={() => save({ ...data, uc: [...data.uc, ...drafts.slice(0, room)] })}
                  title="Creates UC drafts from your Common App activities and honors. The UC boxes are longer, so expand the text afterwards."
                >
                  Copy {Math.min(drafts.length, Math.max(room, 0))} from Common App
                </button>
              )
            }
          />
          <p className="text-xs text-zinc-500">
            Up to {UC_LIMITS.entries} entries across six categories. Descriptions take up to {UC_LIMITS.description} characters; awards, volunteering and
            work add a {UC_LIMITS.extra}-character box. Check the live form before submitting.
          </p>
        </>
      )}
    </div>
  );
}
