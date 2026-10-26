"use client";

import { useCallback, useEffect, useState } from "react";
import { btn, ClassCard, CodeBox } from "@/components/TeacherClassCard";
import { errorText } from "@/components/TeacherText";
import { useT } from "@/lib/i18n/client";
import { buttonClass } from "@/lib/ui";
import {
  createClass,
  listStudents,
  loadTeacherOverview,
  newCode,
  removeStudent,
  revokeCode,
  type LinkedStudent,
  type TeacherOverview,
} from "@/lib/links-api";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");
const input = "mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2";

type Data = { overview: TeacherOverview; students: LinkedStudent[] };

async function fetchAll(): Promise<Data> {
  const [overview, students] = await Promise.all([loadTeacherOverview(), listStudents()]);
  return { overview, students };
}

/** Teacher dashboard body: classes with join codes, and one-on-one students. Reloads after every action. */
export function TeacherClasses() {
  const t = useT();
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
  const run = (fn: () => Promise<unknown>) => void runAsync(fn);

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
  const className = (id: string) => overview.classes.find((c) => c.id === id)?.name;

  return (
    <div className="space-y-8">
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {errorText(t, error)}
        </p>
      )}

      <section className="space-y-4" aria-labelledby="classes-heading">
        <h2 id="classes-heading" className="font-display text-xl font-bold">
          {t("teacher.classes.title")}
        </h2>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 p-5">
          <label className="min-w-40 flex-1 text-sm font-medium">
            {t("teacher.classes.className")}
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder={t("teacher.classes.classPlaceholder")} />
          </label>
          <label className="w-40 text-sm font-medium">
            {t("teacher.classes.schoolYear")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
            <input value={year} onChange={(e) => setYear(e.target.value)} className={input} placeholder="2026-27" />
          </label>
          <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>
            {t("teacher.classes.create")}
          </button>
        </form>
        {active.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("teacher.classes.none")}</p>
        ) : (
          <ul className="space-y-4">
            {active.map((c) => (
              <ClassCard key={c.id} cls={c} members={members(c.id)} now={now} busy={busy} run={run} />
            ))}
          </ul>
        )}
        {archived.length > 0 && (
          <details className="rounded-2xl border border-zinc-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold">{t("teacher.classes.archived", { n: archived.length })}</summary>
            <ul className="mt-3 space-y-4">
              {archived.map((c) => (
                <ClassCard key={c.id} cls={c} members={members(c.id)} now={now} busy={busy} run={run} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="one-on-one-heading">
        <h2 id="one-on-one-heading" className="font-display text-xl font-bold">
          {t("teacher.classes.oneOnOneHeading")}
        </h2>
        <div className="space-y-2 rounded-2xl border border-zinc-200 p-5">
          <p className="text-sm text-zinc-500">{t("teacher.classes.oneOnOneHelp")}</p>
          <CodeBox
            code={overview.individualCode}
            expiresAt={overview.individualCodeExpiresAt}
            now={now}
            busy={busy}
            turnOnLabel={t("teacher.classes.createOneOnOne")}
            onNew={() => run(() => newCode("individual"))}
            onOff={() => run(() => revokeCode("individual"))}
          />
        </div>
        <h3 className="font-semibold">{t("teacher.classes.allLinked", { n: students.length })}</h3>
        {students.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("teacher.classes.noStudents")}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 px-5">
            {students.map((s) => (
              <li key={s.studentId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="space-y-1">
                  <p>
                    <span className="font-medium">{s.displayName}</span> <span className="text-zinc-500">{s.email}</span>
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                    {t("teacher.linked", { date: new Date(s.linkedAt).toLocaleDateString() })}
                    {s.classIds.map((id) => (
                      <span key={id} className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700">
                        {className(id) ?? t("teacher.col.classFallback")}
                      </span>
                    ))}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className={btn}
                  aria-label={t("teacher.classes.removeAria", { name: s.displayName })}
                  onClick={() => confirm(t("teacher.classes.removeConfirm", { name: s.displayName })) && run(() => removeStudent(s.studentId))}
                >
                  {t("teacher.classes.removeStudent")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
