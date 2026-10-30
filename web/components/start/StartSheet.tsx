"use client";

// The list printing itself beside the wizard: how the student's answers sort the US colleges, and a starter list of
// one college per band with its next deadline. The home page's scalloped sheet (FitSheet), now about the visitor.
import type { ReactNode } from "react";
import { FitBadge } from "@/components/badges";
import type { Fit } from "@/lib/fit";
import { fmtInt } from "@/lib/format";
import type { Locale } from "@/lib/i18n/core";
import { useLocale, useT } from "@/lib/i18n/client";
import { fitLabel } from "@/lib/i18n/fit-text";
import { fitDotClass } from "@/lib/ui";
import { FITS, type Pick, type Preview, type Slot } from "./start-preview";

// The fit colours go on marks (the share bar and the swatch dots); every count stays in ink. A starter college wears the
// app's own FitBadge, the chip My list shows.

/** The band's swatch: the same colour as its segment of the share bar. */
function Dot({ fit }: { fit: Fit }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${fitDotClass(fit)}`} />;
}

const DATE_LOCALE: Record<Locale, string> = { en: "en-US", "zh-TW": "zh-TW" };
export function fmtDay(iso: string, locale: Locale) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(DATE_LOCALE[locale], { month: "short", day: "numeric", timeZone: "UTC" });
}

export type SheetProps = {
  preview: Preview;
  picks: Pick[];
  /** Number of US colleges sorted (0 when the student's regions leave the US out). */
  pool: number;
  international: boolean;
  /** "SAT 1380" or "SAT 1380 / ACT 31"; empty when no score counts. */
  score: string;
  /** Slugs finishing will add (shown ticked); kept picks the plan has no room for (shown unticked, with the reason). */
  adding: string[];
  noRoom: string[];
  /** What the note under the picks says. */
  note: AddNote | null;
  onToggle: (slug: string) => void;
  onAnother: (slot: Slot) => void;
  isListed: (slug: string) => boolean;
  room: number;
  limit: number | null;
};

/** some = picks will be added; unticked = the student unticked them all; full = the plan's list has no room;
 *  listed = every pick is already on the list. */
export type AddNote = "some" | "unticked" | "full" | "listed";

export function StartSheet({ preview, picks, pool, international, score, adding, noRoom, note, onToggle, onAnother, isListed, room, limit }: SheetProps) {
  const t = useT();
  const locale = useLocale();
  const planText = (plan: string) => (plan === "ROLLING" ? t("application.planLabel.ROLLING") : plan);

  // Every college sorted is counted: the four bands plus the ones with no published admit rate, which get no label.
  const unrated = pool - preview.labelled;

  return (
    // At its natural height; the wizard keeps it in view (sticky) beside a long step.
    <section id="start-sheet" aria-labelledby="start-sheet-title" className="paper-scallop scroll-mt-24 bg-white px-5 pb-10 pt-12 sm:px-10">
      <div>
        <h2 id="start-sheet-title" className="font-display text-[28px] font-bold leading-tight tracking-[-0.02em]">
          {pool === 0 ? t("profile.start.sheetTitleNone") : t("profile.start.sheetTitle", { n: fmtInt(pool) })}
        </h2>

        {pool === 0 ? (
          <p className="mt-4 text-lg leading-relaxed">{t("profile.start.notUS")}</p>
        ) : (
          <>
            <p aria-live="polite" className="mt-2 text-base leading-snug text-zinc-600">
              {t(international ? "profile.start.basisIntl" : "profile.start.basisAll")}
              {/* Chinese sentences run on without a space. */}
              {locale === "zh-TW" ? "" : " "}
              {score ? t("profile.start.basisScore", { score }) : t("profile.start.basisNoScore")}
            </p>

            {/* The share of the sorted colleges in each band (a 100% bar, 2px seams), unlabelled ones in grey at the end. */}
            <div aria-hidden className="mt-6 flex h-3 gap-0.5">
              {FITS.filter((f) => preview.counts[f] > 0).map((f) => (
                <span key={f} className={`h-full transition-[flex-grow] duration-500 ease-out ${fitDotClass(f)}`} style={{ flexGrow: preview.counts[f], flexBasis: 0 }} />
              ))}
              {unrated > 0 && <span className="h-full bg-zinc-300" style={{ flexGrow: unrated, flexBasis: 0 }} />}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-y-4 sm:grid-cols-4">
              {FITS.map((f) => (
                <div key={f} className="flex flex-col-reverse">
                  <dt className="mt-1 flex items-center gap-2 text-sm font-semibold">
                    <Dot fit={f} />
                    {fitLabel(t, f)}
                  </dt>
                  <dd className="font-display text-[40px] font-extrabold leading-none tabular-nums tracking-tight">
                    <span key={preview.counts[f]} className="roll">
                      {fmtInt(preview.counts[f])}
                    </span>
                  </dd>
                </div>
              ))}
              {unrated > 0 && (
                <div className="col-span-full flex flex-row-reverse items-center justify-end gap-2 text-sm">
                  <dt>{t("profile.start.noRate")}</dt>
                  <dd className="flex items-center gap-2 font-semibold tabular-nums">
                    <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full bg-zinc-300" />
                    {fmtInt(unrated)}
                  </dd>
                </div>
              )}
            </dl>

          <h3 className="mt-8 font-display text-[22px] font-bold tracking-[-0.02em]">{t("profile.start.picksTitle")}</h3>
          <p className="mt-1 text-[15px] leading-snug text-zinc-600">{t("profile.start.picksHint")}</p>
          {/* Two lines a college: its name and next deadline, then its band and admit rate with "Another". */}
          <ul className="mt-2">
            {picks.map((p) => {
              const listed = isListed(p.college.slug);
              const full = noRoom.includes(p.college.slug);
              const id = `start-keep-${p.college.slug}`;
              // One decimal, as everywhere else on the site (a 9.6% must not read as 10% beside "Super reach").
              const rate = p.rate.toFixed(1);
              return (
                <li key={p.slot} className="flex gap-3 border-t border-zinc-100 py-3 first:border-t-0">
                  <div className="w-6 shrink-0 pt-1">
                    {!listed && (
                      <input
                        id={id}
                        type="checkbox"
                        className="size-5 cursor-pointer accent-ink disabled:cursor-not-allowed"
                        checked={adding.includes(p.college.slug)}
                        disabled={full}
                        aria-describedby={full ? `${id}-room` : undefined}
                        onChange={() => onToggle(p.college.slug)}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={listed ? undefined : id} className={`block ${listed ? "" : "cursor-pointer"}`}>
                      <span key={p.college.slug} className="roll block text-lg font-semibold leading-snug">
                        {p.college.name}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-snug text-zinc-600">
                        <span key={p.fit} className="roll">
                          <FitBadge fit={p.fit} result={p.result} />
                        </span>
                        {/* The rate wraps as one piece, never between the figure and its words. */}
                        <span className="whitespace-nowrap">
                          {t(international && p.college.intl_admit_rate != null ? "profile.start.rateIntl" : "profile.start.rateAll", { rate })}
                        </span>
                      </span>
                    </label>
                    {listed && <p className="mt-1 text-[15px] font-semibold">{t("profile.start.onList")}</p>}
                    {full && (
                      <p id={`${id}-room`} className="mt-1 text-[15px] font-semibold">
                        {t("profile.start.noRoom")}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {p.college.next ? (
                      <span className="block font-display text-lg font-bold leading-snug tabular-nums">
                        {fmtDay(p.college.next.date, locale)} <span className="font-sans text-sm font-semibold text-zinc-600">{planText(p.college.next.plan)}</span>
                      </span>
                    ) : (
                      <span className="block text-sm leading-7 text-zinc-600">{t("profile.start.noDate")}</span>
                    )}
                    {p.choices > 1 && (
                      <button
                        type="button"
                        onClick={() => onAnother(p.slot)}
                        aria-label={t("profile.start.anotherLabel", { fit: fitLabel(t, p.fit) })}
                        className="-mb-2 inline-flex min-h-9 items-center text-sm font-semibold text-blue-700 underline underline-offset-4 hover:text-ink"
                      >
                        {t("profile.start.another")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {note && (
            <p aria-live="polite" className="mt-4 bg-blue-50 px-4 py-3 text-base leading-snug">
              {note === "some"
                ? adding.length === 1
                  ? t("profile.start.addsOne")
                  : t("profile.start.addsMany", { n: adding.length })
                : note === "listed"
                  ? t("profile.start.addsListed")
                  : note === "full"
                    ? t("profile.start.addsFull", { limit: limit ?? 0 })
                    : t("profile.start.addsUnticked")}
              {note === "some" && noRoom.length > 0 && limit != null ? `${locale === "zh-TW" ? "" : " "}${room === 1 ? t("profile.start.roomOne", { limit }) : t("profile.start.room", { limit, n: room })}` : ""}
            </p>
          )}
        </>
      )}
      </div>
    </section>
  );
}

/** The tally for the pinned bar on phones and tablets (the sheet sits below the form there): every count with its band's
 *  dot and short name, wrapping onto a second line on a narrow phone, as a link down to the sheet. */
export function SheetLine({ preview, pool }: { preview: Preview; pool: number }) {
  const t = useT();
  if (pool === 0) return null;
  const unrated = pool - preview.labelled;
  const item = (key: string, dot: ReactNode, n: number, label: string) => (
    <span key={key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {dot}
      {label}
      <span key={n} className="roll font-bold tabular-nums">
        {fmtInt(n)}
      </span>
    </span>
  );
  return (
    <a href="#start-sheet" className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1 text-[13px] leading-snug sm:text-sm lg:hidden">
      <span className="font-semibold text-blue-700 underline underline-offset-4 max-sm:sr-only">{t("profile.start.tally", { n: fmtInt(pool) })}</span>
      {FITS.map((f) => item(f, <Dot fit={f} />, preview.counts[f], fitLabel(t, f)))}
      {unrated > 0 && item("unrated", <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full bg-zinc-300" />, unrated, t("profile.start.noRateShort"))}
      <span aria-hidden className="font-bold text-blue-700 sm:hidden">
        ↓
      </span>
    </a>
  );
}
