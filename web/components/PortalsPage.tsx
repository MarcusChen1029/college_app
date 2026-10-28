"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { newId } from "@/lib/activities";
import { isSubmitted } from "@/lib/application";
import { safeLink } from "@/lib/checklist";
import { customSummary } from "@/lib/custom-college";
import { collegeSystems } from "@/lib/application-systems-data";
import {
  campusesOf,
  campusKey,
  collegeProgressKey,
  customProgressKey,
  EMPTY_LOGIN,
  hiddenLoginCount,
  neededSystems,
  openUrl,
  progressCounts,
  progressNote,
  progressState,
  regionOfCollege,
  savedCount,
  systemShown,
  systemsForRegion,
  withoutProgress,
  withProgress,
  type CustomPortal,
  type ListedCollege,
  type Login,
  type PortalData,
  type PortalRegion,
  type PortalSystem,
  type ProgressState,
} from "@/lib/portals";
import { activeRegions, regionLabel, type RegionCode } from "@/lib/regions";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { registerColleges, useStudent } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";
import { buttonClass, toneClass } from "@/lib/ui";

const noop = () => () => {};

/** Looks up a per-system translation (name or hint); falls back to the English text when the key is missing. */
const sysText = (t: TFunction, kind: "name" | "hint", key: string, fallback: string) => {
  const k = `portals.${kind}.${key}` as MessageKey;
  const v = t(k);
  return v === k ? fallback : v;
};
const regionName = (t: TFunction, code: string) => {
  const k = `portals.region.${code}` as MessageKey;
  const v = t(k);
  return v === k ? regionLabel(code) : v;
};
const input = "min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm";

/** What a row needs to show and change its Done / Not done mark. */
type RowProgress = { state: ProgressState; note: string; onDone: (done: boolean | null) => void; onNote: (note: string) => void };

const pill = "rounded-full border px-3 py-1 text-xs font-semibold";
const pillIdle = "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50";

/** The Done / Not done pair. A pressed button uses its tone; unmarked shows neither pressed; pressing it again clears the mark. */
function ProgressButtons({ label, progress }: { label: string; progress: RowProgress }) {
  const t = useT();
  return (
    <div role="group" aria-label={t("portals.progressFor", { label })} className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-pressed={progress.state === "done"}
        className={`${pill} ${progress.state === "done" ? toneClass("done") : pillIdle}`}
        onClick={() => progress.onDone(progress.state === "done" ? null : true)}
      >
        {t("portals.done")}
      </button>
      <button
        type="button"
        aria-pressed={progress.state === "notDone"}
        className={`${pill} ${progress.state === "notDone" ? toneClass("soon") : pillIdle}`}
        onClick={() => progress.onDone(progress.state === "notDone" ? null : false)}
      >
        {t("portals.notDone")}
      </button>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      className="shrink-0 rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
      aria-label={label}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? t("common.copied") : t("common.copy")}
    </button>
  );
}

/**
 * One portal as a collapsible box. The name opens the portal in a new tab; clicking anywhere
 * else on the box shows the saved login for checking or editing (saved on blur).
 */
function LoginRow({
  name,
  hint,
  official,
  login,
  onSave,
  onRemove,
  onRename,
  indent,
  progress,
  forNames,
}: {
  name: string;
  hint?: string;
  official?: string | null;
  login: Login;
  onSave: (l: Login) => void;
  onRemove?: () => void;
  onRename?: (name: string) => void;
  indent?: boolean;
  progress?: RowProgress;
  /** Colleges on the student's list that use this application system. */
  forNames?: string[];
}) {
  const t = useT();
  const [open, setOpen] = useState(!name && !!onRename);
  const [show, setShow] = useState(false);
  const save = (patch: Partial<Login>) => {
    const next = { ...login, ...patch };
    if (next.url !== login.url || next.username !== login.username || next.password !== login.password) onSave(next);
  };
  const link = safeLink(openUrl(login, official ?? null));
  const label = name || t("portals.untitled");
  return (
    <li className={indent ? "ml-6" : ""}>
      <div className={`rounded-xl border ${open ? "border-blue-300 bg-blue-50/40" : "border-zinc-200"}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-3">
          <div
            role="button"
            tabIndex={0}
            aria-expanded={open}
            aria-label={open ? t("portals.hideLogin", { label }) : t("portals.showLogin", { label })}
            className="flex min-w-0 flex-1 basis-56 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-50"
            onClick={() => setOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpen((v) => !v);
              }
            }}
          >
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-700 hover:underline"
                onClick={(e) => e.stopPropagation()}
                title={t("portals.open", { label })}
              >
                {label} ↗
              </a>
            ) : (
              <span className="font-semibold">{label}</span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{login.username || (link ? t("portals.noLogin") : t("portals.noLinkOrLogin"))}</span>
            <span aria-hidden className="text-zinc-400">
              {open ? "▾" : "▸"}
            </span>
          </div>
          {progress && (
            <div className="ml-3 sm:ml-0">
              <ProgressButtons label={label} progress={progress} />
            </div>
          )}
        </div>
        {forNames && forNames.length > 0 && <p className="px-3 pb-2 text-xs text-zinc-500">{t("portals.forColleges", { names: forNames.join(", ") })}</p>}
        {progress?.state === "notDone" && (
          <div className="px-3 pb-2.5">
            <input
              key={progress.note}
              className={`${input} w-full`}
              defaultValue={progress.note}
              placeholder={t("portals.notePlaceholder")}
              aria-label={t("portals.noteLabel", { label })}
              onBlur={(e) => e.target.value.trim() !== progress.note && progress.onNote(e.target.value.trim())}
            />
          </div>
        )}
        {open && (
          <div className="space-y-2 border-t border-zinc-100 px-3 pb-3 pt-2">
            {hint && <p className="text-xs text-zinc-500">{hint}</p>}
            {onRename && (
              <input
                className={`${input} w-full font-semibold`}
                defaultValue={name}
                placeholder={t("portals.namePlaceholder")}
                aria-label={t("portals.nameLabel")}
                autoFocus={!name}
                onBlur={(e) => e.target.value.trim() !== name && onRename(e.target.value.trim())}
              />
            )}
            <div className="grid gap-2 sm:grid-cols-[2fr_1.5fr_1.5fr]">
              <input
                type="url"
                className={input}
                defaultValue={login.url}
                placeholder={official ?? t("portals.linkPlaceholder")}
                aria-label={t("portals.linkFor", { label })}
                onBlur={(e) => save({ url: e.target.value.trim() })}
              />
              <div className="flex items-center gap-1">
                <input
                  className={`${input} flex-1`}
                  defaultValue={login.username}
                  placeholder={t("portals.usernamePlaceholder")}
                  autoComplete="off"
                  aria-label={t("portals.usernameFor", { label })}
                  onBlur={(e) => save({ username: e.target.value.trim() })}
                />
                <CopyButton value={login.username} label={t("portals.copyUsername", { label })} />
              </div>
              <div className="flex items-center gap-1">
                <input
                  type={show ? "text" : "password"}
                  className={`${input} flex-1`}
                  defaultValue={login.password}
                  placeholder={t("portals.passwordPlaceholder")}
                  autoComplete="new-password"
                  aria-label={t("portals.passwordFor", { label })}
                  onBlur={(e) => save({ password: e.target.value })}
                />
                <button type="button" className="shrink-0 rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-100" onClick={() => setShow((v) => !v)}>
                  {show ? t("portals.hide") : t("portals.show")}
                </button>
                <CopyButton value={login.password} label={t("portals.copyPassword", { label })} />
              </div>
            </div>
            {onRemove && (
              <button type="button" className={buttonClass("danger", "sm")} onClick={onRemove}>
                {t("common.remove")}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border-2 border-zinc-200 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        <span className="ml-auto">{aside}</span>
      </div>
      {children}
    </section>
  );
}

/** A labelled block inside a country's section. */
function Group({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
        <span className="ml-auto">{aside}</span>
      </div>
      {children}
    </div>
  );
}

export function PortalsPage({ colleges }: { colleges: CollegeSummary[] }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => registerColleges(colleges), [colleges, student.list.length]);
  if (!mounted || !student.ready) return <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

  const data: PortalData = student.profile.portals ?? {};
  const commit = (next: PortalData) => student.updateProfile({ portals: next });
  // The Done / Not done mark of one row (its key: see PortalData.progress).
  const mark = (key: string): RowProgress => ({
    state: progressState(data, key),
    note: progressNote(data, key),
    onDone: (done) => commit(done === null ? withoutProgress(data, [key]) : withProgress(data, key, { done })),
    onNote: (note) => commit(withProgress(data, key, { note })),
  });
  const setSystem = (key: string, login: Login | null) => {
    const systems = { ...data.systems };
    if (login) systems[key] = login;
    else delete systems[key];
    commit(login ? { ...data, systems } : withoutProgress({ ...data, systems }, [key]));
  };
  const setCampus = (key: string, login: Login | null) => {
    const campuses = { ...data.campuses };
    if (login) campuses[key] = login;
    else delete campuses[key];
    commit(login ? { ...data, campuses } : withoutProgress({ ...data, campuses }, [key]));
  };
  // Removes an application system the list does not need, with its campuses and marks.
  const removeSystem = (key: string) => {
    const systems = { ...data.systems };
    delete systems[key];
    const campuses = { ...data.campuses };
    const campusKeys = Object.keys(campuses).filter((k) => k.startsWith(`${key}:`));
    for (const k of campusKeys) delete campuses[k];
    commit(withoutProgress({ ...data, systems, campuses }, [key, ...campusKeys]));
  };
  const custom = data.custom ?? [];
  const setCustom = (next: CustomPortal[]) => commit({ ...data, custom: next });
  const removeCustom = (id: string) => commit(withoutProgress({ ...data, custom: custom.filter((x) => x.id !== id) }, [customProgressKey(id)]));

  // The countries the student is applying to (all of them while none is chosen), in profile order.
  const regions = activeRegions(student.profile.targetRegions);
  const visible: readonly string[] = regions;

  const listed = student.list.flatMap((e) => {
    const college = e.custom ? customSummary(e.rowId ?? e.slug, e.custom) : colleges.find((c) => c.slug === e.slug);
    return college ? [{ entry: e, college }] : [];
  });
  // A college's portal joins this page once its application is submitted.
  const submitted = listed.filter(({ entry }) => isSubmitted(entry.status));
  // Application systems appear when a college on the list (any status) uses them.
  const listedColleges: ListedCollege[] = listed.map(({ entry, college }) => ({ slug: college.slug, name: college.short_name ?? college.name, custom: !!entry.custom }));
  const needed = neededSystems(data, listedColleges, collegeSystems);
  // Needed by the list alone (not because something is saved for it): these rows cannot be removed.
  const required = neededSystems({}, listedColleges, collegeSystems);

  const sysName = (s: PortalSystem) => sysText(t, "name", s.key, s.name);
  const submittedIn = (region: RegionCode) => submitted.filter(({ college }) => regionOfCollege(college) === region);
  const appsShown = (region: RegionCode) => systemsForRegion(region).filter((s) => s.group === "application" && systemShown(data, needed, s.key));
  const optionalAdded = (region: PortalRegion) => systemsForRegion(region).filter((s) => s.group === "optional" && data.systems?.[s.key]);
  const customIn = (region: PortalRegion) => custom.filter((p) => (p.region ?? "ANY") === region);

  const hiddenCount =
    hiddenLoginCount(data, regions) + submitted.filter(({ entry, college }) => entry.portal.username.trim() && !visible.includes(regionOfCollege(college))).length;

  // Every row on the page, for the status strip.
  const rows: { key: string; label: string }[] = [];
  for (const region of regions) {
    for (const { college } of submittedIn(region)) rows.push({ key: collegeProgressKey(college.slug), label: college.short_name ?? college.name });
    for (const s of appsShown(region)) {
      rows.push({ key: s.key, label: sysName(s) });
      for (const c of campusesOf(data, s)) rows.push({ key: campusKey(s.key, c), label: c });
    }
    for (const s of optionalAdded(region)) rows.push({ key: s.key, label: sysName(s) });
    for (const p of customIn(region)) rows.push({ key: customProgressKey(p.id), label: p.name || t("portals.untitled") });
  }
  for (const s of optionalAdded("ANY")) rows.push({ key: s.key, label: sysName(s) });
  for (const p of customIn("ANY")) rows.push({ key: customProgressKey(p.id), label: p.name || t("portals.untitled") });
  const counts = progressCounts(data, rows.map((r) => r.key));

  const systemRows = (s: PortalSystem) => {
    const added = campusesOf(data, s);
    const remaining = (s.campuses ?? []).filter((c) => !added.includes(c));
    const isNeeded = s.key in required;
    return [
      <LoginRow
        key={s.key}
        name={sysName(s)}
        hint={sysText(t, "hint", s.key, s.hint)}
        official={s.url}
        login={data.systems?.[s.key] ?? EMPTY_LOGIN}
        onSave={(l) => setSystem(s.key, l)}
        onRemove={isNeeded ? undefined : () => window.confirm(t("portals.removeConfirm", { name: sysName(s) })) && removeSystem(s.key)}
        progress={mark(s.key)}
        forNames={needed[s.key]}
      />,
      ...added.map((c) => (
        <LoginRow
          key={campusKey(s.key, c)}
          indent
          name={c}
          login={data.campuses![campusKey(s.key, c)]}
          onSave={(l) => setCampus(campusKey(s.key, c), l)}
          onRemove={() => setCampus(campusKey(s.key, c), null)}
          progress={mark(campusKey(s.key, c))}
        />
      )),
      remaining.length > 0 && (
        <li key={`${s.key}-add`} className="ml-6">
          <select
            className={`${input} text-xs`}
            value=""
            aria-label={t("portals.addCampusLabel", { name: sysName(s) })}
            onChange={(e) => e.target.value && setCampus(campusKey(s.key, e.target.value), EMPTY_LOGIN)}
          >
            <option value="">{t("portals.addCampus")}</option>
            {remaining.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </li>
      ),
    ];
  };

  // The optional systems (testing, aid, visas) and custom portals of one country, or of "ANY".
  const optionalBlock = (region: PortalRegion) => {
    const added = optionalAdded(region);
    const left = systemsForRegion(region).filter((s) => s.group === "optional" && !data.systems?.[s.key]);
    // Application systems the list does not need can still be added by hand.
    const appsLeft = region === "ANY" ? [] : systemsForRegion(region).filter((s) => s.group === "application" && !systemShown(data, needed, s.key));
    const mine = customIn(region);
    const menu = (
      <select
        className={buttonClass("primary", "sm")}
        value=""
        aria-label={region === "ANY" ? t("portals.addPortalLabel") : t("portals.addPortalLabelFor", { region: regionName(t, region) })}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "custom") setCustom([...custom, { ...EMPTY_LOGIN, id: newId(), name: "", ...(region === "ANY" ? {} : { region }) }]);
          else if (v) setSystem(v, EMPTY_LOGIN);
        }}
      >
        <option value="">{t("portals.addPortal")}</option>
        {[...appsLeft, ...left].map((s) => (
          <option key={s.key} value={s.key}>
            {sysName(s)}
          </option>
        ))}
        <option value="custom">{t("portals.somethingElse")}</option>
      </select>
    );
    const body =
      added.length === 0 && mine.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {region === "ANY" ? t("portals.anyHelp") : t("portals.countryHelp")}
        </p>
      ) : (
        <ul className="space-y-2">
          {added.map((s) => (
            <LoginRow
              key={s.key}
              name={sysName(s)}
              hint={sysText(t, "hint", s.key, s.hint)}
              official={s.url}
              login={data.systems![s.key]}
              onSave={(l) => setSystem(s.key, l)}
              onRemove={() => window.confirm(t("portals.removeConfirm", { name: sysName(s) })) && setSystem(s.key, null)}
              progress={mark(s.key)}
            />
          ))}
          {mine.map((p) => (
            <LoginRow
              key={p.id}
              name={p.name}
              login={p}
              onRename={(name) => setCustom(custom.map((x) => (x.id === p.id ? { ...x, name } : x)))}
              onSave={(l) => setCustom(custom.map((x) => (x.id === p.id ? { ...x, ...l } : x)))}
              onRemove={() => window.confirm(t("portals.removeCustomConfirm", { name: p.name || t("portals.thisPortal") })) && removeCustom(p.id)}
              progress={mark(customProgressKey(p.id))}
            />
          ))}
        </ul>
      );
    return { menu, body };
  };

  const countrySection = (region: RegionCode) => {
    const inCountry = submittedIn(region);
    const applications = appsShown(region);
    const { menu, body } = optionalBlock(region);
    return (
      <Section key={region} title={regionName(t, region)}>
        <div className="space-y-5">
          <Group title={t("portals.groupSubmitted")}>
            {inCountry.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {t("portals.submittedEmptyPre")}
                <Link href="/application/list" className="text-blue-600 underline">
                  {t("portals.myList")}
                </Link>
                {t("portals.submittedEmptyPost")}
              </p>
            ) : (
              <ul className="space-y-2">
                {inCountry.map(({ entry, college }) => (
                  <LoginRow
                    key={college.slug}
                    name={college.short_name ?? college.name}
                    hint={t("portals.submittedHint")}
                    login={entry.portal}
                    onSave={(portal) => student.update(college.slug, { portal })}
                    progress={mark(collegeProgressKey(college.slug))}
                  />
                ))}
              </ul>
            )}
          </Group>

          <Group title={t("portals.groupApplication")}>
            {applications.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("portals.noSystems", { region: regionName(t, region) })}</p>
            ) : (
              <ul className="space-y-2">{applications.flatMap(systemRows)}</ul>
            )}
          </Group>

          <Group title={t("portals.groupOther")} aside={menu}>
            {body}
          </Group>
        </div>
      </Section>
    );
  };

  const any = optionalBlock("ANY");

  return (
    <div className="space-y-6">
      <p className={`rounded-lg border px-3 py-2 text-xs ${toneClass("soon")}`}>
        {student.auth ? t("portals.noticeAccount") : t("portals.noticeBrowser")}
        {" · "}
        {(() => {
          const n = savedCount(data) + submitted.filter(({ entry }) => entry.portal.username.trim()).length;
          return n === 1 ? t("portals.loginsSavedOne", { n }) : t("portals.loginsSavedMany", { n });
        })()}
      </p>

      {rows.length > 0 && (
        <section aria-label={t("portals.statusLabel")} className="rounded-2xl border border-zinc-200 px-4 py-3">
          <p className="text-sm font-semibold">{t("portals.progressCount", counts)}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {rows.map((r) => {
              const state = progressState(data, r.key);
              const done = state === "done";
              const note = progressNote(data, r.key);
              return (
                <li key={r.key} title={note || undefined} className={`rounded-full border px-2.5 py-0.5 text-xs ${toneClass(done ? "done" : state === "notDone" ? "soon" : "neutral")}`}>
                  {t("portals.chip", { label: r.label, state: done ? t("portals.done") : t("portals.notDone") })}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {hiddenCount > 0 && (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
          {hiddenCount === 1 ? t("portals.hiddenOnePre", { n: hiddenCount }) : t("portals.hiddenManyPre", { n: hiddenCount })}
          <Link href="/profile" className="text-blue-600 underline">
            {t("portals.yourProfile")}
          </Link>
          {t("portals.hiddenPost")}
        </p>
      )}

      {regions.map(countrySection)}

      <Section title={t("portals.anyCountry")} aside={any.menu}>
        {any.body}
      </Section>
    </div>
  );
}
