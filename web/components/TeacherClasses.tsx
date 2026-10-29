"use client";

import { useCallback, useEffect, useState } from "react";
import { btn, ClassCard, CodeBox, codeActions } from "@/components/TeacherClassCard";
import { ActionsMenu } from "@/components/teacher/ActionsMenu";
import { errorText } from "@/components/TeacherText";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatCode } from "@/lib/join-codes";
import { shortDate } from "@/lib/roster-view";
import { buttonClass } from "@/lib/ui";
import {
  createClass,
  listStudents,
  loadTeacherOverview,
  newCode,
  removeFromClass,
  removeStudent,
  revokeCode,
  type LinkedStudent,
  type TeacherClass,
  type TeacherOverview,
} from "@/lib/links-api";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");
const input = "mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2";

type Data = { overview: TeacherOverview; students: LinkedStudent[] };

async function fetchAll(): Promise<Data> {
  const [overview, students] = await Promise.all([loadTeacherOverview(), listStudents()]);
  return { overview, students };
}

/**
 * A label per class that tells same-named classes apart (the school year when that is unique among them, else the join
 * code, else its position), with an archived class saying so.
 */
function classLabels(classes: TeacherClass[], archivedSuffix: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of classes) {
    const twins = classes.filter((x) => x.name === c.name);
    let label = c.name;
    if (twins.length > 1) {
      const uniqueYear = c.schoolYear && twins.filter((x) => x.schoolYear === c.schoolYear).length === 1;
      label = `${c.name} · ${uniqueYear ? c.schoolYear : c.code ? formatCode(c.code) : `#${twins.indexOf(c) + 1}`}`;
    }
    out.set(c.id, c.archived ? `${label} ${archivedSuffix}` : label);
  }
  return out;
}

/**
 * After an action removed the row (or card) its menu sat in, focus the menu of the row that took its place (or the
 * last one), or the list's heading when nothing is left, instead of letting focus fall back to the page.
 */
function focusAfterRemoval(listId: string, index: number, fallbackId: string) {
  setTimeout(() => {
    const menus = document.querySelectorAll<HTMLButtonElement>(`#${listId} button[aria-haspopup="menu"]`);
    (menus[Math.min(index, menus.length - 1)] ?? document.getElementById(fallbackId))?.focus();
  }, 0);
}

/** Teacher dashboard body: classes with join codes, and one-on-one students. Reloads after every action. */
export function TeacherClasses() {
  const t = useT();
  const locale = useLocale();
  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [students, setStudents] = useState<LinkedStudent[]>([]);
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [year, setYear] = useState("");

  const apply = useCallback((d: Data) => {
    setOverview(d.overview);
    setStudents(d.students);
    setNow(Date.now());
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      apply(await fetchAll());
    } catch (e) {
      setOverview(null); // never keep showing codes that may have just been replaced or switched off
      setStudents([]);
      setError(errMsg(e));
    }
  }, [apply]);

  useEffect(() => {
    let live = true;
    fetchAll().then(
      (d) => live && apply(d),
      (e) => live && setError(errMsg(e)),
    );
    return () => {
      live = false;
    };
  }, [apply]);

  async function runAsync(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  // then: runs once the action and the reload are over (for example to put focus back after a row went away).
  const run = (fn: () => Promise<unknown>, then?: () => void) => void runAsync(fn).then(then);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError(t("teacher.classes.giveName"));
    run(async () => {
      await createClass(n, year.trim() || undefined);
      setName("");
      setYear("");
    });
  }

  if (!overview) {
    return error ? (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-urgent">
          {errorText(t, error)}
        </p>
        <button type="button" className={btn} onClick={() => void load()}>
          {t("teacher.tryAgain")}
        </button>
      </div>
    ) : (
      <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />
    );
  }

  const active = overview.classes.filter((c) => !c.archived);
  const archived = overview.classes.filter((c) => c.archived);
  const members = (id: string) => students.filter((s) => s.classIds.includes(id));
  const labels = classLabels(overview.classes, t("teacher.charts.archivedSuffix"));

  // Classes and the people in them on the left; making a class and the one-on-one code in a column beside them.
  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {errorText(t, error)}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-8">
      <section className="space-y-4" aria-labelledby="classes-heading">
        <h2 id="classes-heading" className="sr-only">
          {t("teacher.classes.title")}
        </h2>
        <p id="classes-summary" tabIndex={-1} className="text-sm font-medium text-zinc-600 focus:outline-none">
          {t(active.length === 1 ? "teacher.classes.count.one" : "teacher.classes.count.other", { n: active.length })} ·{" "}
          {t(students.length === 1 ? "teacher.classes.linkedCount.one" : "teacher.classes.linkedCount.other", { n: students.length })}
        </p>
        {active.length === 0 ? (
          <p className="rounded-2xl bg-blue-50 px-6 py-8 text-center text-[15px] text-ink">{t("teacher.classes.none")}</p>
        ) : (
          <ul id="class-cards" className="grid gap-4 sm:grid-cols-2">
            {active.map((c, i) => (
              <ClassCard key={c.id} cls={c} label={labels.get(c.id)} members={members(c.id)} now={now} busy={busy} run={run} onRemoved={() => focusAfterRemoval("class-cards", i, "classes-summary")} />
            ))}
          </ul>
        )}
        {archived.length > 0 && (
          <details className="rounded-2xl border border-zinc-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold">{t("teacher.classes.archived", { n: archived.length })}</summary>
            <ul className="mt-3 grid gap-4 sm:grid-cols-2">
              {archived.map((c) => (
                <ClassCard key={c.id} cls={c} label={labels.get(c.id)} members={members(c.id)} now={now} busy={busy} run={run} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="linked-heading">
        <h2 id="linked-heading" tabIndex={-1} className="font-display text-xl font-bold focus:outline-none">
          {t("teacher.classes.allLinked", { n: students.length })}
        </h2>
        {students.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("teacher.classes.noStudents")}</p>
        ) : (
          <ul id="linked-list" className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white px-5">
            {students.map((s, i) => (
              <li key={s.studentId} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 space-y-1">
                  <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{s.displayName}</span>
                    <span className="min-w-0 truncate text-zinc-500" title={s.email}>
                      {s.email}
                    </span>
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-500">
                    {t("teacher.linked", { date: shortDate(s.linkedAt, locale) })}
                    {s.classIds.map((id) => (
                      <span key={id} className="rounded-full bg-zinc-100 px-2 py-0.5 whitespace-nowrap text-zinc-700">
                        {labels.get(id) ?? t("teacher.col.classFallback")}
                      </span>
                    ))}
                  </p>
                </div>
                <ActionsMenu
                  label={t("teacher.menu.more", { name: s.displayName })}
                  disabled={busy}
                  actions={[
                    // One "Remove from <class>" per class the student is in (archived ones too), then removing the link altogether.
                    ...s.classIds.flatMap((id) => {
                      const cls = overview.classes.find((x) => x.id === id);
                      if (!cls) return [];
                      return [
                        {
                          id: `remove-from-${cls.id}`,
                          label: t("teacher.classes.removeFromNamed", { class: labels.get(cls.id) ?? cls.name }),
                          onSelect: () =>
                            confirm(t("teacher.classes.removeFromConfirm", { student: s.displayName, class: labels.get(cls.id) ?? cls.name })) && run(() => removeFromClass(cls.id, s.studentId)),
                        },
                      ];
                    }),
                    {
                      id: "remove-student",
                      label: t("teacher.classes.removeStudent"),
                      danger: true,
                      onSelect: () =>
                        confirm(t("teacher.classes.removeConfirm", { name: s.displayName })) &&
                        run(() => removeStudent(s.studentId), () => focusAfterRemoval("linked-list", i, "linked-heading")),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
        </div>

        {/* One sheet with two parts, so neither part pairs up with a card in the left column. */}
        <aside className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white lg:sticky lg:top-24">
          <section aria-labelledby="new-class-heading" className="space-y-3 p-5">
            <h2 id="new-class-heading" className="font-display text-lg font-bold">
              {t("teacher.classes.newHeading")}
            </h2>
            <form onSubmit={submit} className="space-y-3">
              <label className="block text-sm font-medium">
                {t("teacher.classes.className")}
                <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder={t("teacher.classes.classPlaceholder")} />
              </label>
              <label className="block text-sm font-medium">
                {t("teacher.classes.schoolYear")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
                <input value={year} onChange={(e) => setYear(e.target.value)} className={input} placeholder="2026-27" />
              </label>
              <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>
                {t("teacher.classes.create")}
              </button>
            </form>
          </section>

          <section aria-labelledby="one-on-one-heading" className="space-y-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <h2 id="one-on-one-heading" className="font-display text-lg font-bold">
                {t("teacher.classes.oneOnOneHeading")}
              </h2>
              <ActionsMenu
                label={t("teacher.menu.moreOwn")}
                disabled={busy}
                actions={codeActions(
                  t,
                  overview.individualCode,
                  () => run(() => newCode("individual")),
                  () => run(() => revokeCode("individual")),
                )}
              />
            </div>
            <p className="text-sm text-zinc-600">{t("teacher.classes.oneOnOneHelp")}</p>
            <CodeBox
              code={overview.individualCode}
              expiresAt={overview.individualCodeExpiresAt}
              now={now}
              busy={busy}
              turnOnLabel={t("teacher.classes.createOneOnOne")}
              onNew={() => run(() => newCode("individual"))}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
