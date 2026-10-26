"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { buildResume, DEFAULT_OPTIONS, EMPTY_HEADER, resumeText, type ResumeHeader, type ResumeOptions, type ResumeSource } from "@/lib/resume";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const noop = () => () => {};
// The global h1–h3 rule sets the display font; resume headings follow the serif body instead.
const plainHeading = { fontFamily: "inherit", letterSpacing: "normal" };
const input = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm";

const HEADER_FIELDS: [keyof ResumeHeader, MessageKey, string][] = [
  ["fullName", "tools.rb.field.fullName", "Alex Lin"],
  ["email", "tools.rb.field.email", "alex@example.com"],
  ["phone", "tools.rb.field.phone", "+886 912 345 678"],
  ["location", "tools.rb.field.location", "Taipei, Taiwan"],
  ["school", "tools.rb.field.school", "Taipei American School"],
  ["gradYear", "tools.rb.field.gradYear", "2027"],
];

const SOURCES: Record<ResumeSource, MessageKey> = { both: "tools.rb.source.both", common: "tools.rb.source.common", uc: "tools.rb.source.uc" };

export function ResumeBuilder() {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [copied, setCopied] = useState(false);
  if (!mounted || !student.ready) return <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

  const settings = student.profile.resume ?? {};
  const header: ResumeHeader = { ...EMPTY_HEADER, ...settings.header };
  const options: ResumeOptions = { ...DEFAULT_OPTIONS, ...settings.options };
  const resume = buildResume(student.profile, header, options);
  const setHeader = (patch: Partial<ResumeHeader>) => student.updateProfile({ resume: { ...settings, header: { ...header, ...patch } } });
  const setOptions = (patch: Partial<ResumeOptions>) => student.updateProfile({ resume: { ...settings, options: { ...options, ...patch } } });
  const empty = resume.sections.length === 0;
  const contact = [header.email, header.phone, header.location].filter(Boolean);

  return (
    <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-6 print:hidden">
        <section className="space-y-3">
          <h2 className="font-bold">{t("tools.rb.header")}</h2>
          {HEADER_FIELDS.map(([key, labelKey, placeholder]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">{t(labelKey)}</span>
              <input
                className={input}
                placeholder={placeholder}
                defaultValue={header[key]}
                onBlur={(e) => e.target.value.trim() !== header[key] && setHeader({ [key]: e.target.value.trim() })}
              />
            </label>
          ))}
        </section>

        <section className="space-y-2 text-sm">
          <h2 className="font-bold">{t("tools.rb.content")}</h2>
          <fieldset className="space-y-1">
            <legend className="mb-1 text-xs text-zinc-500">{t("tools.rb.activitiesFrom")}</legend>
            {(Object.keys(SOURCES) as ResumeSource[]).map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input type="radio" name="source" checked={options.source === s} onChange={() => setOptions({ source: s })} />
                {t(SOURCES[s])}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 pt-1">
            <input type="checkbox" checked={options.showScores} onChange={(e) => setOptions({ showScores: e.target.checked })} />
            {t("tools.rb.showScores")}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={options.showHours} onChange={(e) => setOptions({ showHours: e.target.checked })} />
            {t("tools.rb.showHours")}
          </label>
          <p className="pt-1 text-xs text-zinc-500">
            {t("tools.rb.scoresFrom")}
            <Link href="/profile" className="text-blue-600 underline">
              {t("tools.rb.profile")}
            </Link>
            {t("tools.rb.entriesFrom")}
            <Link href="/writing/activities" className="text-blue-600 underline">
              {t("tools.rb.activities")}
            </Link>
            {t("tools.rb.sentenceEnd")}
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <button type="button" onClick={() => window.print()} className={buttonClass("primary", "sm")}>
            {t("tools.rb.print")}
          </button>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(resumeText(header, resume));
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className={buttonClass("secondary", "sm")}
          >
            {copied ? t("tools.rb.copied") : t("tools.rb.copyText")}
          </button>
          <p className="text-xs text-zinc-500">{t("tools.rb.printHint")}</p>
        </section>
      </aside>

      <article className="mx-auto w-full max-w-[8.5in] rounded-lg border border-zinc-200 bg-white p-10 font-serif text-[13px] leading-snug text-zinc-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="text-center">
          <h2 className="text-2xl font-bold" style={{ ...plainHeading, letterSpacing: "0.025em" }}>{header.fullName || <span className="text-zinc-300 print:hidden">{t("tools.rb.yourName")}</span>}</h2>
          {contact.length > 0 && <p className="mt-1 text-zinc-600">{contact.join("  ·  ")}</p>}
        </header>

        {(header.school || resume.education.lines.length > 0) && (
          <ResumeSection title="Education">
            <div className="flex justify-between gap-4">
              <span className="font-bold">{header.school}</span>
              {header.gradYear && <span className="shrink-0">Class of {header.gradYear}</span>}
            </div>
            {resume.education.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </ResumeSection>
        )}

        {resume.sections.map((s) => (
          <ResumeSection key={s.key} title={s.title}>
            <ul className="space-y-2">
              {s.items.map((item, i) => (
                <li key={i} className="break-inside-avoid">
                  <div className="flex justify-between gap-4">
                    <span>
                      <span className="font-bold">{item.title}</span>
                      {item.organization && <span>, {item.organization}</span>}
                    </span>
                    {item.meta && <span className="shrink-0 text-right text-zinc-600">{item.meta}</span>}
                  </div>
                  {item.description && <p className="mt-0.5 text-zinc-800">{item.description}</p>}
                </li>
              ))}
            </ul>
          </ResumeSection>
        ))}

        {empty && (
          <p className="mt-8 text-center font-sans text-sm text-zinc-500 print:hidden">
            {t("tools.rb.emptyA")}
            <Link href="/writing/activities" className="text-blue-600 underline">
              {t("tools.rb.activities")}
            </Link>
            {t("tools.rb.emptyB")}
          </p>
        )}
      </article>
    </div>
  );
}

function ResumeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 style={{ ...plainHeading, letterSpacing: "0.15em" }} className="mb-2 border-b border-zinc-800 pb-0.5 text-xs font-bold uppercase">{title}</h3>
      {children}
    </section>
  );
}
