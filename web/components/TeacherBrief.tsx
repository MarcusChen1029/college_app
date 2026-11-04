"use client";

import { useMemo, useState } from "react";
import { downloadText } from "@/lib/download";
import { HTML_LANG, makeT, type Locale, type MessageKey } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { buildResume, DEFAULT_OPTIONS, EMPTY_HEADER } from "@/lib/resume";
import { useStudent } from "@/lib/student-store";
import { BRIEF_HIGHLIGHT_KEY, briefColleges, briefText, buildTeacherBrief } from "@/lib/teacher-brief";
import type { Deadline } from "@/lib/types";
import { buttonClass, PANEL, SECTION_TITLE } from "@/lib/ui";

export type BriefCollegeRow = { slug: string; id: string; name: string };
export type BriefDeadlineRow = Pick<Deadline, "id" | "institution_id" | "kind" | "plan_key" | "label" | "due_date" | "program_id" | "intake">;

const FIELD = "mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm";
const BRIEF_LOCALES: { locale: Locale; label: MessageKey }[] = [
  { locale: "en", label: "recommenders.brief.langEn" },
  { locale: "zh-TW", label: "recommenders.brief.langZh" },
];
const HIGHLIGHT_MAX = 1000;

// The highlight text is a draft that stays in this browser only; it is never saved to the account.
function readHighlight(): string {
  try {
    return window.localStorage.getItem(BRIEF_HIGHLIGHT_KEY) ?? "";
  } catch {
    return "";
  }
}
function saveHighlight(v: string) {
  try {
    window.localStorage.setItem(BRIEF_HIGHLIGHT_KEY, v);
  } catch {
    // Storage can be blocked; the text still works for this visit.
  }
}

/**
 * "Make a brief": a one-page summary the student downloads or prints and hands to a teacher or counselor.
 * Built here from the student's own data; nothing is sent anywhere and nothing new is saved to the account.
 * When printing, everything but the brief is hidden.
 */
export function TeacherBrief({ colleges, deadlines }: { colleges: readonly BriefCollegeRow[]; deadlines: readonly BriefDeadlineRow[] }) {
  const t = useT();
  const siteLocale = useLocale();
  const student = useStudent();
  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>(siteLocale);
  const [typedName, setTypedName] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(readHighlight);
  const bt = useMemo(() => makeT(locale), [locale]);

  const profile = student.profile;
  const header = { ...EMPTY_HEADER, ...profile.resume?.header };
  const name = typedName ?? header.fullName;
  const options = { ...DEFAULT_OPTIONS, ...profile.resume?.options };

  const sections = open
    ? buildTeacherBrief(
        {
          studentName: name,
          fields: (profile.studyFields ?? []).map((k) => bt(`match.field.${k}` as MessageKey)),
          resume: buildResume(profile, header, options),
          colleges: briefColleges(student.list, colleges, deadlines, { international: !!profile.international, today: new Date().toLocaleDateString("en-CA") }),
          highlight,
        },
        bt,
      )
    : [];
  const title = bt("recommenders.brief.title");
  const thin = sections.length <= 1; // only "About me": nothing from the activities or the list yet

  return (
    <section aria-labelledby="rec-brief" className={`${PANEL} space-y-4 p-5 sm:p-6 print:bg-transparent print:p-0`}>
      <div className="space-y-4 print:hidden">
        <h2 id="rec-brief" className={SECTION_TITLE}>
          {t("recommenders.brief.cardTitle")}
        </h2>
        <p className="max-w-3xl text-base text-ink">{t("recommenders.brief.cardBody")}</p>
        {!open ? (
          <button type="button" className={buttonClass("primary", "sm")} onClick={() => setOpen(true)}>
            {t("recommenders.brief.make")}
          </button>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium">{t("recommenders.brief.language")}</legend>
              <div className="mt-1 flex flex-wrap gap-4">
                {BRIEF_LOCALES.map((l) => (
                  <label key={l.locale} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" name="brief-language" className="size-4 accent-ink" checked={locale === l.locale} onChange={() => setLocale(l.locale)} />
                    {t(l.label)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="text-sm font-medium">
              {t("recommenders.brief.nameLabel")}
              <input className={FIELD} value={name} maxLength={80} onChange={(e) => setTypedName(e.target.value)} />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              {t("recommenders.brief.highlightLabel")}
              <textarea
                className={FIELD}
                rows={3}
                value={highlight}
                maxLength={HIGHLIGHT_MAX}
                onChange={(e) => {
                  setHighlight(e.target.value);
                  saveHighlight(e.target.value);
                }}
              />
              <span className="mt-1 block text-[13px] font-normal text-zinc-600">{t("recommenders.brief.highlightHint")}</span>
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="button" className={buttonClass("primary", "sm")} onClick={() => downloadText(`teacher-brief-${locale}.txt`, briefText(sections, title), "text/plain")}>
                {t("recommenders.brief.download")}
              </button>
              <button type="button" className={buttonClass("secondary", "sm")} onClick={() => window.print()}>
                {t("recommenders.brief.print")}
              </button>
              <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen(false)}>
                {t("recommenders.brief.close")}
              </button>
            </div>
            {thin && <p className="text-sm text-zinc-600 sm:col-span-2">{t("recommenders.brief.empty")}</p>}
          </div>
        )}
      </div>

      {open && (
        // The page title lives in the shared layout; while the brief is open, hide it when printing (this page only).
        <style>{"@media print { [data-app-screen] > h1 { display: none; } }"}</style>
      )}
      {open && (
        <article data-brief lang={HTML_LANG[locale]} className="space-y-4 rounded-2xl bg-white p-5 text-ink print:rounded-none print:p-0">
          <h3 className="font-display text-xl font-bold">{title}</h3>
          {sections.map((s) => (
            <div key={s.heading} className="space-y-1">
              <h4 className="text-base font-bold">{s.heading}</h4>
              {s.lines.map((line, i) => (
                <p key={i} className="whitespace-pre-wrap text-[15px] leading-snug">
                  {line}
                </p>
              ))}
            </div>
          ))}
        </article>
      )}
    </section>
  );
}
