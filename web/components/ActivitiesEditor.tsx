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
import { useT } from "@/lib/i18n/client";
import { caRole, ucName } from "@/lib/resume";
import { useStudent } from "@/lib/student-store";
import { buttonClass, toneClass } from "@/lib/ui";
import { EmptyNote } from "./EmptyState";

const noop = () => () => {};

// ── entry card ──

function Pill({ tone, children }: { tone: "soon" | "urgent"; children: React.ReactNode }) {
  return <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${toneClass(tone)}`}>{children}</span>;
}

function Card({
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
  const missing = issues.some((i) => i.kind === "missing");
  const invalid = issues.some((i) => i.kind === "invalid");
  return (
    <li className="rounded-2xl border border-zinc-200">
      <div className="flex items-center gap-2 p-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{index + 1}</span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="block truncate font-semibold">{title || <span className="font-normal text-zinc-400">{t("writing.untitled")}</span>}</span>
          {subtitle && <span className="block truncate text-xs text-zinc-500">{subtitle}</span>}
          {(missing || invalid) && (
            <span className="mt-1 flex flex-wrap gap-1">
              {missing && <Pill tone="soon">{t("writing.needsAnswer")}</Pill>}
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
      {open && <div className="grid gap-3 border-t border-zinc-100 p-3 sm:grid-cols-2">{children}</div>}
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
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const full = items.length >= limit;
  const add = () => {
    const item = make();
    onChange([...items, item]);
    setOpen(item.id);
  };
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
            onClick={add}
          >
            {addLabel}
          </button>
        </span>
      </div>
      {items.length === 0 ? (
        <EmptyNote
          action={
            <button type="button" disabled={full} className={buttonClass("secondary", "sm")} onClick={add}>
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
  const needAnswer = [...data.commonApp.activities.map(caActivityIssues), ...data.commonApp.honors.map(caHonorIssues)].filter((is) => is.some((i) => i.kind === "missing")).length;

  const ucNeedAnswer = data.uc.map(ucEntryIssues).filter((is) => is.some((i) => i.kind === "missing")).length;

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
          {!student.auth && <SignInButton className="text-blue-700 underline">{t("account.signIn")}</SignInButton>}
        </span>
      </div>

      {tab === "common" ? (
        <>
          {needAnswer > 0 && <p className={`rounded-lg border px-3 py-2 text-sm ${toneClass("soon")}`}>{t("writing.needsCount", { n: needAnswer })}</p>}
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
          {ucNeedAnswer > 0 && <p className={`rounded-lg border px-3 py-2 text-sm ${toneClass("soon")}`}>{t("writing.needsCount", { n: ucNeedAnswer })}</p>}
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
          <p className="text-xs text-zinc-500">
            {t("writing.ucLimitsNote", { entries: UC_LIMITS.entries, description: UC_LIMITS.description, extra: UC_LIMITS.extra })}
          </p>
        </>
      )}
    </div>
  );
}
