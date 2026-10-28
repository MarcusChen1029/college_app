"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { compareHref, MAX_COMPARE, type CompareOption } from "@/lib/compare";
import { computeFit } from "@/lib/fit";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";
import { FitBadge } from "./badges";

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Search box that adds a college to the comparison (a combobox; arrows + Enter work). */
export function CompareAdd({ options, picked }: { options: CompareOption[]; picked: string[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const matches = useMemo(() => {
    const needle = fold(q.trim());
    if (!needle) return [];
    const taken = new Set(picked);
    const hits: (CompareOption & { rank: number })[] = [];
    for (const o of options) {
      if (taken.has(o.slug)) continue;
      const label = fold(o.label);
      const name = fold(o.name);
      const rank = label.startsWith(needle) ? 0 : name.startsWith(needle) ? 1 : label.includes(needle) || name.includes(needle) ? 2 : fold(o.place).includes(needle) ? 3 : -1;
      if (rank >= 0) hits.push({ ...o, rank });
    }
    return hits.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label)).slice(0, 8);
  }, [q, options, picked]);

  if (picked.length >= MAX_COMPARE) return <p className="text-xs text-zinc-500">{t("college.compareFull")}</p>;

  const choose = (slug: string) => {
    setQ("");
    setOpen(false);
    start(() => router.push(compareHref([...picked, slug]), { scroll: false }));
  };
  const showList = open && q.trim() !== "";

  return (
    <div className="relative">
      <label className="sr-only" htmlFor={`${listId}-input`}>
        {t("college.compareAdd")}
      </label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && matches[active] ? `${listId}-${matches[active].slug}` : undefined}
        autoComplete="off"
        value={q}
        disabled={pending}
        placeholder={t("college.compareSearch")}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && matches[active]) {
            e.preventDefault();
            choose(matches[active].slug);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="h-10 w-full rounded-full border-2 border-zinc-200 bg-white px-4 text-sm font-medium text-ink placeholder:font-normal placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none disabled:opacity-60"
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-80 overflow-auto rounded-2xl border border-zinc-200 bg-white p-1 text-left shadow-lg shadow-blue-900/10">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-500">{t("college.compareNoMatch", { q: q.trim() })}</li>
          ) : (
            matches.map((o, i) => (
              <li
                key={o.slug}
                id={`${listId}-${o.slug}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click: it fires before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o.slug);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer rounded-xl px-3 py-2 ${i === active ? "bg-blue-50" : ""}`}
              >
                <span className="block text-sm font-semibold text-ink">{o.label}</span>
                <span className="block text-xs text-zinc-500">{o.place}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** The student's fit for one column; nothing until they have a score (the hint above the table asks for one). */
export function CompareFitBadge({ college }: { college: CollegeSummary }) {
  const { profile } = useStudent();
  if (profile.sat == null && profile.act == null) return null;
  const fit = computeFit(profile, college);
  return fit ? <FitBadge fit={fit.fit} result={fit} /> : null;
}

/** One line above the table, only while the student has no SAT/ACT saved. */
export function CompareFitHint() {
  const t = useT();
  const { profile, ready } = useStudent();
  if (!ready || profile.sat != null || profile.act != null) return null;
  return (
    <p className="text-sm text-zinc-600">
      {t("college.addScoresPre")}{" "}
      <Link href="/profile" className="font-semibold text-blue-700 underline underline-offset-4">
        {t("college.profile")}
      </Link>{" "}
      {t("college.addScoresPost")}
    </p>
  );
}

/** Quick picks from the student's own list (empty state). Renders nothing for an empty list. */
export function CompareFromList({ options }: { options: CompareOption[] }) {
  const t = useT();
  const { list } = useStudent();
  const bySlug = new Map(options.map((o) => [o.slug, o]));
  const mine = list.flatMap((e) => (e.custom ? [] : (bySlug.get(e.slug) ?? []))).slice(0, 12);
  if (mine.length === 0) return null;
  const all = mine.slice(0, MAX_COMPARE).map((o) => o.slug);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-ink">{t("college.compareFromList")}</h2>
        {mine.length > 1 && (
          <Link href={compareHref(all)} className="text-sm font-semibold text-blue-700 hover:underline underline-offset-4">
            {t("colleges.compareSideBySide")}
          </Link>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {mine.map((o) => (
          <Link
            key={o.slug}
            href={compareHref([o.slug])}
            className="rounded-full border-2 border-zinc-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-ink"
          >
            {o.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
