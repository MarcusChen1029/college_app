"use client";

import { useState, useSyncExternalStore } from "react";
import {
  CA_ATHLETIC_TYPES,
  CA_LIMITS,
  caActivityIssues,
  caHonorIssues,
  move,
  newCaActivity,
  newCaHonor,
  newUcEntry,
  UC_CATEGORIES,
  UC_LIMITS,
  ucDraftsFromCommonApp,
  ucEntryIssues,
  upgradeActivities,
  type ActivityData,
  type CaActivity,
  type CaHonor,
  type Grade,
  type Issue,
  type UcEntry,
} from "@/lib/activities";
import { CaActivityFields } from "@/components/activities/CaActivityFields";
import { CaHonorFields, HONOR_KEYS } from "@/components/activities/CaHonorFields";
import { AWARD_KEYS, UcFields, UC_FORM_KEYS } from "@/components/activities/UcFields";
import { SignInButton } from "@/components/SignInDialog";
import { caTypeLabel as typeLabel } from "@/lib/i18n/ca-types";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { caRole, ucName } from "@/lib/resume";
import { useStudent } from "@/lib/student-store";
import { buttonClass, SEGMENT_TRACK, segmentClass, toneClass } from "@/lib/ui";
import { input, QuietMissing } from "./activities/fields";
import { EmptyNote } from "./EmptyState";

const noop = () => () => {};

// ── entry card ──

// Neutral for "n to answer" (unfinished is not a warning); urgent for an answer that has to be fixed.
function Pill({ tone = "neutral", children }: { tone?: "neutral" | "urgent"; children: React.ReactNode }) {
  return <span className={`rounded border px-1.5 py-0.5 text-[13px] font-medium ${toneClass(tone)}`}>{children}</span>;
}

function Card({
  entryId,
  index,
  title,
  subtitle,
  issues,
  open,
  onToggle,
  onMove,
  onRemove,
  children,
}: {
  /** The entry's id, on the card as data-entry-id. */
  entryId: string;
  index: number;
  title: string;
  subtitle?: string;
  issues: Issue[];
  open: boolean;
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  const btn = "grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100";
  const toAnswer = issues.filter((i) => i.kind === "missing").length;
  const invalid = issues.some((i) => i.kind === "invalid");
  // A card being filled in for the first time stays quiet: no per-question markers, no count. Once the student leaves it
  // (focus moves out, or it is closed), its header says how many questions are left, once. A card that loads closed has
  // been left already.
  const [left, setLeft] = useState(!open);
  return (
    <li
      data-entry-id={entryId}
      className="rounded-2xl border border-zinc-200"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setLeft(true);
      }}
    >
      <div className="flex items-center gap-2 p-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{index + 1}</span>
        <button
          type="button"
          onClick={() => {
            if (open) setLeft(true);
            onToggle();
          }}
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
        >
          <span className="block truncate font-semibold">{title || <span className="font-normal text-zinc-400">{t("writing.untitled")}</span>}</span>
          {subtitle && <span className="block truncate text-xs text-zinc-500">{subtitle}</span>}
          {((left && toAnswer > 0) || invalid) && (
            <span className="mt-1 flex flex-wrap gap-1">
              {left && toAnswer > 0 && <Pill>{t("writing.toAnswer", { n: toAnswer })}</Pill>}
              {invalid && <Pill tone="urgent">{t("writing.needsFix")}</Pill>}
            </span>
          )}
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
      {open && (
        <QuietMissing.Provider value={!left}>
          <div className="grid gap-3 border-t border-zinc-100 p-3 sm:grid-cols-2">{children}</div>
        </QuietMissing.Provider>
      )}
    </li>
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
  issues,
  render,
  extraAction,
  ghost,
}: {
  heading: string;
  items: T[];
  limit: number;
  addLabel: string;
  onChange: (items: T[]) => void;
  make: () => T;
  title: (item: T) => string;
  subtitle: (item: T) => string;
  /** The item's unanswered / invalid questions, shown as badges on its header. */
  issues?: (item: T) => Issue[];
  render: (item: T, set: (p: Partial<T>) => void) => React.ReactNode;
  extraAction?: React.ReactNode;
  /** While the list is empty: a first item drawn in place (fields with live counters) instead of the empty note.
   *  `create` adds an item with what was typed, opens it and returns it. */
  ghost?: (create: (patch: Partial<T>) => T) => React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const full = items.length >= limit;
  const add = (patch: Partial<T> = {}): T => {
    const item = { ...make(), ...patch };
    onChange([...items, item]);
    setOpen(item.id);
    return item;
  };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">{heading}</h2>
        <span className={`text-sm tabular-nums ${full ? "font-semibold text-soon" : "text-zinc-600"}`}>
          {items.length} / {limit}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {extraAction}
          {/* While the section is empty its one Add button sits in the empty note below. */}
          {items.length > 0 && (
            <button type="button" disabled={full} className={buttonClass("primary", "sm")} onClick={() => add()}>
              {addLabel}
            </button>
          )}
        </span>
      </div>
      {items.length === 0 && ghost ? (
        ghost(add)
      ) : items.length === 0 ? (
        <EmptyNote
          action={
            <button type="button" disabled={full} className={buttonClass("primary", "sm")} onClick={() => add()}>
              {addLabel}
            </button>
          }
        >
          {t("writing.nothingYet")}
        </EmptyNote>
      ) : (
        <ol className="space-y-2">
          {items.map((item, i) => (
            <Card
              key={item.id}
              entryId={item.id}
              index={i}
              title={title(item)}
              subtitle={subtitle(item)}
              issues={issues ? issues(item) : []}
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

/** The empty Common App list drawn as its first activity: the three text boxes with live counters at the form's own
 *  limits (lib/activities.ts CA_LIMITS). Moving between the boxes keeps the draft; the activity is created when focus
 *  leaves the whole row (or from Add), and focus then lands on the same box in the new card. A typed role answers the
 *  leadership question with yes, since the form only asks for a role after a yes; the card shows it as its title. */
type GhostField = "position" | "organization" | "description";
const GHOST_FIELDS: { key: GhostField; label: MessageKey; max: number; rows?: number }[] = [
  { key: "position", label: "writing.position", max: CA_LIMITS.position },
  { key: "organization", label: "writing.organizationName", max: CA_LIMITS.organization },
  { key: "description", label: "writing.caDescription", max: CA_LIMITS.description, rows: 3 },
];

/** Focuses a named field inside an entry's card once React has drawn it (a few frames at most). */
function focusField(entryId: string, names: readonly string[]) {
  let tries = 0;
  const step = () => {
    const card = document.querySelector(`[data-entry-id="${entryId}"]`);
    const el = names.map((n) => card?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${n}"]`)).find(Boolean);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    } else if (++tries < 10) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function GhostActivity({ create, addLabel }: { create: (patch: Partial<CaActivity>) => CaActivity; addLabel: string }) {
  const t = useT();
  const [draft, setDraft] = useState<Record<GhostField, string>>({ position: "", organization: "", description: "" });
  const [last, setLast] = useState<GhostField>("position");
  const typed = Object.values(draft).some((v) => v.trim());
  const commit = (field: GhostField) => {
    const patch: Partial<CaActivity> = {};
    if (draft.position.trim()) Object.assign(patch, { position: draft.position, leadership: true });
    if (draft.organization.trim()) patch.organization = draft.organization;
    if (draft.description.trim()) patch.description = draft.description;
    const item = create(patch);
    // The same box when the new card has it, else the first box it does have.
    focusField(item.id, [field, "organization", "description", "position"]);
  };
  return (
    <div
      className="rounded-2xl bg-blue-50 p-5"
      onBlur={(e) => {
        if (typed && !e.currentTarget.contains(e.relatedTarget as Node | null)) commit(last);
      }}
    >
      <p className="text-[15px] text-ink">{t("writing.ghostIntro")}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {GHOST_FIELDS.map((f) => {
          const size = draft[f.key].length;
          const props = {
            className: input,
            name: f.key,
            maxLength: f.max,
            value: draft[f.key],
            onFocus: () => setLast(f.key),
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft({ ...draft, [f.key]: e.target.value }),
          };
          return (
            <label key={f.key} className={`flex flex-col gap-1 ${f.rows ? "md:col-span-2" : ""}`}>
              <span className="flex justify-between gap-2 text-xs text-zinc-600">
                <span>{t(f.label)}</span>
                <span className={`tabular-nums ${size >= f.max ? "font-semibold text-soon" : ""}`}>
                  {size}/{f.max}
                </span>
              </span>
              {f.rows ? <textarea {...props} rows={f.rows} /> : <input {...props} />}
            </label>
          );
        })}
      </div>
      <button type="button" className={`${buttonClass("primary", "sm")} mt-4`} onClick={() => commit(last)}>
        {addLabel}
      </button>
    </div>
  );
}

export function ActivitiesEditor() {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [tab, setTab] = useState<"common" | "uc">("common");
  if (!mounted || !student.ready) return <div className="h-64 animate-pulse rounded-3xl bg-zinc-100" />;

  const data: ActivityData = upgradeActivities(student.profile.activities);
  const save = (next: ActivityData) => student.updateProfile({ activities: next });
  const drafts = ucDraftsFromCommonApp(data);
  const room = UC_LIMITS.entries - data.uc.length;


  const grades = (g: Grade[]) => (g.length ? t("writing.gradesList", { list: g.join(", ") }) : "");
  const hours = (h: number | null, w: number | null) => (h != null || w != null ? t("writing.hoursSummary", { h: h ?? "?", w: w ?? "?" }) : "");

  // Which application's list to edit: a pale segmented control, so it never reads as a second row of page tabs.
  const tabBtn = (key: typeof tab, label: string) => (
    <button type="button" aria-pressed={tab === key} onClick={() => setTab(key)} className={segmentClass(tab === key)}>
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className={SEGMENT_TRACK}>
          {tabBtn("common", t("writing.tabCommonApp"))}
          {tabBtn("uc", t("writing.tabUc"))}
        </div>
        <span className="ml-auto text-[13px] text-zinc-600">
          {student.auth ? t("writing.synced") : t("writing.savedLocal")}
          {!student.auth && <SignInButton className="text-blue-700 underline">{t("account.signIn")}</SignInButton>}
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
            // Only what the form shows: the role when the leadership answer is yes, the sport for the athletics types.
            title={(a) => a.organization || caRole(a)}
            subtitle={(a) =>
              join(typeLabel(t, a.type), CA_ATHLETIC_TYPES.includes(a.type) ? a.sport : "", caRole(a) && a.organization ? caRole(a) : "", grades(a.grades), hours(a.hoursPerWeek, a.weeksPerYear))
            }
            issues={caActivityIssues}
            render={(a, set) => <CaActivityFields a={a} set={set} />}
            ghost={(create) => <GhostActivity create={create} addLabel={t("writing.addActivity")} />}
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
            issues={caHonorIssues}
            render={(h, set) => <CaHonorFields h={h} set={set} />}
          />
          <p className="text-[13px] text-zinc-600">{t("writing.caLimitsNote")}</p>
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
            // Only what the form shows for this category: the program (not a stale name), the job title for work, levels for an award.
            title={ucName}
            subtitle={(e) =>
              join(
                t(UC_FORM_KEYS[e.category].label),
                e.category === "work" ? e.jobTitle : "",
                e.category === "award" ? e.awardLevels.map((l) => t(AWARD_KEYS[l])).join(", ") : "",
                grades(e.grades),
                UC_CATEGORIES[e.category].hours ? hours(e.hoursPerWeek, e.weeksPerYear) : "",
              )
            }
            issues={ucEntryIssues}
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
          <p className="text-[13px] text-zinc-600">
            {t("writing.ucLimitsNote", { entries: UC_LIMITS.entries, description: UC_LIMITS.description, extra: UC_LIMITS.extra })}
          </p>
        </>
      )}
    </div>
  );
}
