"use client";

import { useState, useSyncExternalStore } from "react";
import {
  CA_ACTIVITY_TYPES,
  CA_LIMITS,
  GRADES,
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
import { SignInButton } from "@/components/SignInDialog";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const noop = () => () => {};
const input = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm";

// Stored values stay English (Common App activity types, enum ids); these maps only supply the visible label.
const CA_TYPE_KEYS: Record<(typeof CA_ACTIVITY_TYPES)[number], MessageKey> = {
  Academic: "writing.caType.academic",
  Art: "writing.caType.art",
  "Athletics: Club": "writing.caType.athleticsClub",
  "Athletics: JV/Varsity": "writing.caType.athleticsVarsity",
  "Career Oriented": "writing.caType.careerOriented",
  "Community Service (Volunteer)": "writing.caType.communityService",
  "Computer/Technology": "writing.caType.computerTech",
  Cultural: "writing.caType.cultural",
  Dance: "writing.caType.dance",
  "Debate/Speech": "writing.caType.debateSpeech",
  Environmental: "writing.caType.environmental",
  "Family Responsibilities": "writing.caType.familyResponsibilities",
  "Foreign Exchange": "writing.caType.foreignExchange",
  "Foreign Language": "writing.caType.foreignLanguage",
  Internship: "writing.caType.internship",
  "Journalism/Publication": "writing.caType.journalism",
  "Junior R.O.T.C.": "writing.caType.rotc",
  LGBT: "writing.caType.lgbt",
  "Music: Instrumental": "writing.caType.musicInstrumental",
  "Music: Vocal": "writing.caType.musicVocal",
  Religious: "writing.caType.religious",
  Research: "writing.caType.research",
  Robotics: "writing.caType.robotics",
  "School Spirit": "writing.caType.schoolSpirit",
  "Science/Math": "writing.caType.scienceMath",
  "Social Justice": "writing.caType.socialJustice",
  "Student Govt./Politics": "writing.caType.studentGovt",
  "Theater/Drama": "writing.caType.theater",
  "Work (Paid)": "writing.caType.workPaid",
  "Other Club/Activity": "writing.caType.otherClub",
};
const typeLabel = (t: TFunction, type: string) => {
  const key = (CA_TYPE_KEYS as Record<string, MessageKey | undefined>)[type];
  return key ? t(key) : type;
};
const CA_TIMING_KEYS: Record<CaTiming, MessageKey> = { school: "writing.timing.school", break: "writing.timing.break" };
const HONOR_KEYS: Record<HonorLevel, MessageKey> = {
  school: "writing.honorLevel.school",
  state_regional: "writing.honorLevel.state_regional",
  national: "writing.honorLevel.national",
  international: "writing.honorLevel.international",
};
const AWARD_KEYS: Record<UcAwardLevel, MessageKey> = {
  school: "writing.awardLevel.school",
  city: "writing.awardLevel.city",
  state: "writing.awardLevel.state",
  regional: "writing.awardLevel.regional",
  national: "writing.awardLevel.national",
  international: "writing.awardLevel.international",
};
const UC_FORM_KEYS: Record<UcCategory, { label: MessageKey; name: MessageKey; organization?: MessageKey; extra?: MessageKey; description: MessageKey }> = {
  award: { label: "writing.uc.award.label", name: "writing.uc.award.name", extra: "writing.uc.award.extra", description: "writing.uc.award.description" },
  edprep: { label: "writing.uc.edprep.label", name: "writing.uc.edprep.name", description: "writing.uc.edprep.description" },
  extracurricular: { label: "writing.uc.extracurricular.label", name: "writing.uc.extracurricular.name", description: "writing.uc.extracurricular.description" },
  coursework: { label: "writing.uc.coursework.label", name: "writing.uc.coursework.name", description: "writing.uc.coursework.description" },
  volunteer: { label: "writing.uc.volunteer.label", name: "writing.uc.volunteer.name", extra: "writing.uc.volunteer.extra", description: "writing.uc.volunteer.description" },
  work: {
    label: "writing.uc.work.label",
    name: "writing.uc.work.name",
    organization: "writing.uc.work.organization",
    extra: "writing.uc.work.extra",
    description: "writing.uc.work.description",
  },
};
const labels = <K extends string>(keys: Record<K, MessageKey>, t: TFunction) =>
  Object.fromEntries((Object.keys(keys) as K[]).map((k) => [k, t(keys[k])])) as Record<K, string>;

// ── small fields ──

/** Text box with a live character count; saves on blur. */
function TextField({ label, value, max, rows, onSave }: { label: string; value: string; max: number; rows?: number; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const props = { className: input, maxLength: max, value: v, onBlur: () => v !== value && onSave(v) };
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-xs text-zinc-500">
        {label}
        <span className={`tabular-nums ${v.length >= max ? "font-semibold text-soon" : ""}`}>
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

const gradeOptions = (t: TFunction) => Object.fromEntries(GRADES.map((g) => [g, g === "PG" ? t("writing.grade.PG") : g])) as Record<Grade, string>;

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
  const t = useT();
  const btn = "grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100";
  return (
    <li className="rounded-2xl border border-zinc-200">
      <div className="flex items-center gap-2 p-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{index + 1}</span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="block truncate font-semibold">{title || <span className="font-normal text-zinc-400">{t("writing.untitled")}</span>}</span>
          {subtitle && <span className="block truncate text-xs text-zinc-500">{subtitle}</span>}
        </button>
        <button type="button" className={btn} onClick={() => onMove(-1)} aria-label={t("writing.moveUp")}>
          ↑
        </button>
        <button type="button" className={btn} onClick={() => onMove(1)} aria-label={t("writing.moveDown")}>
          ↓
        </button>
        <button type="button" className={buttonClass("danger", "sm")} onClick={onRemove}>
          {t("common.remove")}
        </button>
      </div>
      {open && <div className="grid gap-3 border-t border-zinc-100 p-3 sm:grid-cols-2">{children}</div>}
    </li>
  );
}

const wide = "sm:col-span-2";

function CaActivityFields({ a, set }: { a: CaActivity; set: (p: Partial<CaActivity>) => void }) {
  const t = useT();
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">{t("writing.activityType")}</span>
        <select className={input} value={a.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">{t("writing.choose")}</option>
          {CA_ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {typeLabel(t, type)}
            </option>
          ))}
        </select>
      </label>
      <TextField label={t("writing.position")} value={a.position} max={CA_LIMITS.position} onSave={(position) => set({ position })} />
      <div className={wide}>
        <TextField label={t("writing.organizationName")} value={a.organization} max={CA_LIMITS.organization} onSave={(organization) => set({ organization })} />
      </div>
      <div className={wide}>
        <TextField label={t("writing.caDescription")} value={a.description} max={CA_LIMITS.description} rows={2} onSave={(description) => set({ description })} />
      </div>
      <Checks label={t("writing.gradeLevels")} options={gradeOptions(t)} value={a.grades} onChange={(grades) => set({ grades })} />
      <Checks<CaTiming> label={t("writing.timing")} options={labels(CA_TIMING_KEYS, t)} value={a.timing} onChange={(timing) => set({ timing })} />
      <div className="flex gap-3">
        <NumberField label={t("writing.hoursWeek")} value={a.hoursPerWeek} max={168} onSave={(hoursPerWeek) => set({ hoursPerWeek })} />
        <NumberField label={t("writing.weeksYear")} value={a.weeksPerYear} max={52} onSave={(weeksPerYear) => set({ weeksPerYear })} />
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">{t("writing.continueCollege")}</span>
        <select
          className={`${input} w-auto`}
          value={a.continueInCollege == null ? "" : a.continueInCollege ? "yes" : "no"}
          onChange={(e) => set({ continueInCollege: e.target.value === "" ? null : e.target.value === "yes" })}
        >
          <option value="">—</option>
          <option value="yes">{t("common.yes")}</option>
          <option value="no">{t("common.no")}</option>
        </select>
      </label>
    </>
  );
}

function CaHonorFields({ h, set }: { h: CaHonor; set: (p: Partial<CaHonor>) => void }) {
  const t = useT();
  return (
    <>
      <div className={wide}>
        <TextField label={t("writing.honorTitle")} value={h.title} max={CA_LIMITS.honorTitle} onSave={(title) => set({ title })} />
      </div>
      <Checks label={t("writing.gradeLevels")} options={gradeOptions(t)} value={h.grades} onChange={(grades) => set({ grades })} />
      <Checks<HonorLevel> label={t("writing.honorLevels")} options={labels(HONOR_KEYS, t)} value={h.levels} onChange={(levels) => set({ levels })} />
    </>
  );
}

function UcFields({ e, set }: { e: UcEntry; set: (p: Partial<UcEntry>) => void }) {
  const t = useT();
  const form = UC_CATEGORIES[e.category];
  const fk = UC_FORM_KEYS[e.category];
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">{t("writing.category")}</span>
        <select className={input} value={e.category} onChange={(ev) => set({ category: ev.target.value as UcCategory })}>
          {UC_CATEGORY_KEYS.map((k) => (
            <option key={k} value={k}>
              {t(UC_FORM_KEYS[k].label)}
            </option>
          ))}
        </select>
      </label>
      <TextField key={`name-${e.category}`} label={t(fk.name)} value={e.name} max={UC_LIMITS.name} onSave={(name) => set({ name })} />
      {fk.organization && <TextField label={t(fk.organization)} value={e.organization} max={UC_LIMITS.name} onSave={(organization) => set({ organization })} />}
      {e.category === "award" && (
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">{t("writing.levelOfRecognition")}</span>
            <select className={`${input} w-auto`} value={e.awardLevel ?? ""} onChange={(ev) => set({ awardLevel: (ev.target.value || null) as UcAwardLevel | null })}>
              <option value="">—</option>
              {(Object.keys(UC_AWARD_LEVELS) as UcAwardLevel[]).map((k) => (
                <option key={k} value={k}>
                  {t(AWARD_KEYS[k])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">{t("writing.awardType")}</span>
            <select
              className={`${input} w-auto`}
              value={e.awardType ?? ""}
              onChange={(ev) => set({ awardType: (ev.target.value || null) as UcEntry["awardType"] })}
            >
              <option value="">—</option>
              <option value="academic">{t("writing.awardAcademic")}</option>
              <option value="non_academic">{t("writing.awardNonAcademic")}</option>
            </select>
          </label>
        </div>
      )}
      {fk.extra && (
        <div className={wide}>
          <TextField key={`extra-${e.category}`} label={t(fk.extra)} value={e.extra} max={UC_LIMITS.extra} rows={2} onSave={(extra) => set({ extra })} />
        </div>
      )}
      <div className={wide}>
        <TextField key={`desc-${e.category}`} label={t(fk.description)} value={e.description} max={UC_LIMITS.description} rows={4} onSave={(description) => set({ description })} />
      </div>
      <Checks label={t("writing.gradeLevels")} options={gradeOptions(t)} value={e.grades} onChange={(grades) => set({ grades })} />
      {form.hours && (
        <div className="flex gap-3">
          <NumberField label={t("writing.hoursWeek")} value={e.hoursPerWeek} max={168} onSave={(hoursPerWeek) => set({ hoursPerWeek })} />
          <NumberField label={t("writing.weeksYear")} value={e.weeksPerYear} max={52} onSave={(weeksPerYear) => set({ weeksPerYear })} />
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
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const full = items.length >= limit;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">{heading}</h2>
        <span className={`text-sm tabular-nums ${full ? "font-semibold text-soon" : "text-zinc-500"}`}>
          {items.length} / {limit}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {extraAction}
          <button
            type="button"
            disabled={full}
            className={buttonClass("primary", "sm")}
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
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">{t("writing.nothingYet")}</p>
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
                if (window.confirm(t("writing.confirmRemove", { name: title(item) || t("writing.untitled") }))) onChange(items.filter((x) => x.id !== item.id));
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

const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

export function ActivitiesEditor() {
  const t = useT();
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

  const grades = (g: Grade[]) => (g.length ? t("writing.gradesList", { list: g.join(", ") }) : "");
  const hours = (h: number | null, w: number | null) => (h != null || w != null ? t("writing.hoursSummary", { h: h ?? "?", w: w ?? "?" }) : "");

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
        {tabBtn("common", t("writing.tabCommonApp"))}
        {tabBtn("uc", t("writing.tabUc"))}
        <span className="ml-auto text-xs text-zinc-500">
          {student.auth ? t("writing.synced") : t("writing.savedLocal")}
          {!student.auth && <SignInButton className="text-blue-600 underline">{t("account.signIn")}</SignInButton>}
        </span>
      </div>

      {tab === "common" ? (
        <>
          <EntryList<CaActivity>
            heading={t("writing.headingActivities")}
            items={data.commonApp.activities}
            limit={CA_LIMITS.activities}
            addLabel={t("writing.addActivity")}
            make={newCaActivity}
            onChange={(activities) => save({ ...data, commonApp: { ...data.commonApp, activities } })}
            title={(a) => a.organization || a.position}
            subtitle={(a) => join(typeLabel(t, a.type), a.position && a.organization ? a.position : "", grades(a.grades), hours(a.hoursPerWeek, a.weeksPerYear))}
            render={(a, set) => <CaActivityFields a={a} set={set} />}
          />
          <EntryList<CaHonor>
            heading={t("writing.headingHonors")}
            items={data.commonApp.honors}
            limit={CA_LIMITS.honors}
            addLabel={t("writing.addHonor")}
            make={newCaHonor}
            onChange={(honors) => save({ ...data, commonApp: { ...data.commonApp, honors } })}
            title={(h) => h.title}
            subtitle={(h) => join(h.levels.map((l) => t(HONOR_KEYS[l])).join(", "), grades(h.grades))}
            render={(h, set) => <CaHonorFields h={h} set={set} />}
          />
          <p className="text-xs text-zinc-500">
            {t("writing.caLimitsNote", {
              position: CA_LIMITS.position,
              organization: CA_LIMITS.organization,
              description: CA_LIMITS.description,
              honorTitle: CA_LIMITS.honorTitle,
            })}
          </p>
        </>
      ) : (
        <>
          <EntryList<UcEntry>
            heading={t("writing.headingUc")}
            items={data.uc}
            limit={UC_LIMITS.entries}
            addLabel={t("writing.addEntry")}
            make={() => newUcEntry("extracurricular")}
            onChange={(uc) => save({ ...data, uc })}
            title={(e) => e.name}
            subtitle={(e) => join(t(UC_FORM_KEYS[e.category].label), grades(e.grades), UC_CATEGORIES[e.category].hours ? hours(e.hoursPerWeek, e.weeksPerYear) : "")}
            render={(e, set) => <UcFields e={e} set={set} />}
            extraAction={
              drafts.length > 0 && (
                <button
                  type="button"
                  disabled={room <= 0}
                  className={buttonClass("secondary", "sm")}
                  onClick={() => save({ ...data, uc: [...data.uc, ...drafts.slice(0, room)] })}
                  title={t("writing.copyFromCommonAppTitle")}
                >
                  {t("writing.copyFromCommonApp", { n: Math.min(drafts.length, Math.max(room, 0)) })}
                </button>
              )
            }
          />
          <p className="text-xs text-zinc-500">
            {t("writing.ucLimitsNote", { entries: UC_LIMITS.entries, description: UC_LIMITS.description, extra: UC_LIMITS.extra })}
          </p>
        </>
      )}
    </div>
  );
}
