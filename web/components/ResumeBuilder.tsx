"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { buildResume, DEFAULT_OPTIONS, EMPTY_HEADER, resumeText, type Resume, type ResumeHeader, type ResumeOptions, type ResumeSource } from "@/lib/resume";
import { useT } from "@/lib/i18n/client";
import type { StudentProfile } from "@/lib/fit";
import type { MessageKey } from "@/lib/i18n";
import { useStudent } from "@/lib/student-store";
import { buttonClass, LABEL } from "@/lib/ui";
import { SAMPLE_HEADER, SAMPLE_RESUME } from "./tools/resume-sample";

// The builder is a desk: the form on the left, and on the right the student's résumé as the page it prints to, built
// live from their Activities and Profile. Until they have activities, the page shows a labelled sample (never printed
// or copied), so the right half shows what the tool makes instead of an empty sheet.

const noop = () => () => {};
// The global h1–h3 rule sets the display font; resume headings follow the serif body instead.
const plainHeading = { fontFamily: "inherit", letterSpacing: "normal" };
const INPUT = "mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-[15px] text-ink placeholder:italic placeholder:text-zinc-500 hover:border-zinc-400 focus:border-ink";
const CHOICE = "flex min-h-11 cursor-pointer items-center gap-3 text-[15px]";

// The form's placeholders are the sample's own values ("e.g. Riverside International School"), set in grey italics, so
// they read as examples and agree with the sample page beside them.
const HEADER_FIELDS: [keyof ResumeHeader, MessageKey][] = [
  ["fullName", "tools.rb.field.fullName"],
  ["email", "tools.rb.field.email"],
  ["phone", "tools.rb.field.phone"],
  ["location", "tools.rb.field.location"],
  ["school", "tools.rb.field.school"],
  ["gradYear", "tools.rb.field.gradYear"],
];

const SOURCES: Record<ResumeSource, MessageKey> = { both: "tools.rb.source.both", common: "tools.rb.source.common", uc: "tools.rb.source.uc" };

/** What the builder shows for a profile: the student's résumé, or (no real content at all: no activities and no GPA or
 *  test lines) the sample, with whatever header fields the student has typed in place of the sample's. An education-only
 *  résumé is real and prints. Shared with the Tools page's thumbnail. */
export function resumeView(profile: StudentProfile) {
  const settings = profile.resume ?? {};
  const header: ResumeHeader = { ...EMPTY_HEADER, ...settings.header };
  const options: ResumeOptions = { ...DEFAULT_OPTIONS, ...settings.options };
  const resume = buildResume(profile, header, options);
  const sample = resume.sections.length === 0 && resume.education.lines.length === 0;
  const shownHeader: ResumeHeader = sample ? { ...SAMPLE_HEADER, ...Object.fromEntries(Object.entries(header).filter(([, v]) => v)) } : header;
  const shown: Resume = sample ? { ...SAMPLE_RESUME, education: { ...SAMPLE_RESUME.education, school: shownHeader.school, gradYear: shownHeader.gradYear } } : resume;
  return { header, options, resume, sample, shownHeader, shown };
}

export function ResumeBuilder() {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [copied, setCopied] = useState(false);
  if (!mounted || !student.ready) return <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

  const settings = student.profile.resume ?? {};
  const { header, options, resume, sample, shownHeader, shown } = resumeView(student.profile);
  const setHeader = (patch: Partial<ResumeHeader>) => student.updateProfile({ resume: { ...settings, header: { ...header, ...patch } } });
  const setOptions = (patch: Partial<ResumeOptions>) => student.updateProfile({ resume: { ...settings, options: { ...options, ...patch } } });

  return (
    // In print the form is hidden and the grid becomes a plain block, so the page takes the sheet's full width.
    <div className="grid gap-8 lg:grid-cols-[21rem_1fr] lg:items-start print:block">
      <aside className="space-y-8 print:hidden">
        <section aria-labelledby="rb-header" className="space-y-4">
          <h2 id="rb-header" className={LABEL}>
            {t("tools.rb.header")}
          </h2>
          {HEADER_FIELDS.map(([key, labelKey]) => (
            <label key={key} className="block">
              <span className="text-[15px]">{t(labelKey)}</span>
              <input
                className={INPUT}
                placeholder={SAMPLE_HEADER[key] ? t("tools.rb.eg", { value: SAMPLE_HEADER[key] }) : undefined}
                defaultValue={header[key]}
                onBlur={(e) => e.target.value.trim() !== header[key] && setHeader({ [key]: e.target.value.trim() })}
              />
            </label>
          ))}
        </section>

        <section aria-labelledby="rb-content" className="space-y-2">
          <h2 id="rb-content" className={LABEL}>
            {t("tools.rb.content")}
          </h2>
          <fieldset>
            <legend className="text-[15px] text-zinc-600">{t("tools.rb.activitiesFrom")}</legend>
            {(Object.keys(SOURCES) as ResumeSource[]).map((s) => (
              <label key={s} className={CHOICE}>
                <input type="radio" name="source" className="size-4 accent-ink" checked={options.source === s} onChange={() => setOptions({ source: s })} />
                {t(SOURCES[s])}
              </label>
            ))}
          </fieldset>
          <label className={CHOICE}>
            <input type="checkbox" className="size-4 accent-ink" checked={options.showScores} onChange={(e) => setOptions({ showScores: e.target.checked })} />
            {t("tools.rb.showScores")}
          </label>
          <label className={CHOICE}>
            <input type="checkbox" className="size-4 accent-ink" checked={options.showHours} onChange={(e) => setOptions({ showHours: e.target.checked })} />
            {t("tools.rb.showHours")}
          </label>
          <p className="text-[15px] leading-snug text-zinc-600">
            {t("tools.rb.scoresFrom")}
            <Link href="/profile" className="font-semibold text-blue-700 underline underline-offset-4 hover:text-ink">
              {t("tools.rb.profile")}
            </Link>
            {t("tools.rb.entriesFrom")}
            <Link href="/writing/activities" className="font-semibold text-blue-700 underline underline-offset-4 hover:text-ink">
              {t("tools.rb.activities")}
            </Link>
            {t("tools.rb.sentenceEnd")}
          </p>
        </section>

        {/* Printing and copying are for the student's own résumé; while the sample shows, they wait. */}
        <section className="flex flex-col gap-2">
          <button type="button" disabled={sample} onClick={() => window.print()} className={buttonClass("primary")}>
            {t("tools.rb.print")}
          </button>
          <button
            type="button"
            disabled={sample}
            onClick={async () => {
              await navigator.clipboard.writeText(resumeText(header, resume));
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className={buttonClass("secondary")}
          >
            {copied ? t("tools.rb.copied") : t("tools.rb.copyText")}
          </button>
          <p className="text-[13px] leading-snug text-zinc-600">{t("tools.rb.printHint")}</p>
        </section>
      </aside>

      {/* On a phone the page comes first, so the student sees what the tool makes before the form. */}
      <div className="min-w-0 rounded-3xl bg-zinc-50 p-3 max-lg:order-first sm:p-8 print:rounded-none print:bg-transparent print:p-0">
        {sample && (
          <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] leading-snug print:hidden">
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-[13px] font-semibold text-white">{t("tools.rb.sample")}</span>
            <span>
              {t("tools.rb.emptyA")}
              <Link href="/writing/activities" className="font-semibold text-blue-700 underline underline-offset-4 hover:text-ink">
                {t("tools.rb.activities")}
              </Link>
              {t("tools.rb.emptyB")}
            </span>
          </p>
        )}
        <ResumePaper header={shownHeader} resume={shown} placeholder={t("tools.rb.yourName")} sample={sample} />
      </div>
    </div>
  );
}

/** The résumé as it prints: a letter-width sheet in a serif, centred name, ruled section titles. */
export function ResumePaper({ header, resume, placeholder, sample }: { header: ResumeHeader; resume: Resume; placeholder: string; sample: boolean }) {
  const contact = [header.email, header.phone, header.location].filter(Boolean);
  return (
    // data-ui marks the sheet as a product fragment for the design inspector, which then leaves its résumé typography (small
    // tracked capital section titles, the serif) out of its page-type checks. Nothing in the app reads it.
    <article
      data-ui
      aria-label={sample ? undefined : header.fullName || placeholder}
      className={`mx-auto w-full max-w-[8.5in] bg-white px-6 py-8 font-serif text-[13px] leading-snug text-zinc-900 sm:px-12 sm:py-12 print:max-w-none print:p-0 ${sample ? "print:hidden" : ""}`}
    >
      <header className="text-center">
        <h2 className="text-2xl font-bold" style={{ ...plainHeading, letterSpacing: "0.025em" }}>
          {header.fullName || <span className="italic text-zinc-500 print:hidden">{placeholder}</span>}
        </h2>
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
    </article>
  );
}

function ResumeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 style={{ ...plainHeading, letterSpacing: "0.15em" }} className="mb-2 border-b border-zinc-800 pb-0.5 text-xs font-bold uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}
