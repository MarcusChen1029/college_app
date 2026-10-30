"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { computeFit, type FitInput } from "@/lib/fit";
import { useT } from "@/lib/i18n/client";
import { FitBadge } from "@/components/badges";

export type FitSheetRow = FitInput & { slug: string; name: string; place: string };

const SAT_MIN = 1000;
const SAT_MAX = 1600;

/**
 * The home page's one live thing: pick a SAT score and where you apply from, and each college's admit rate and label
 * change the way they do in a real list. Real colleges and Common Data Set numbers; the student is the visitor.
 * Desktop: the intro, then the controls pinned beside the sheet. Below that: intro, controls, sheet, so the controls
 * sit right above the rates they change.
 */
export function FitSheet({ rows }: { rows: FitSheetRow[] }) {
  const t = useT();
  const id = useId();
  const [sat, setSat] = useState(1300);
  const [abroad, setAbroad] = useState(true);
  const student = { sat, international: abroad };

  return (
    <div className="grid gap-y-10 md:grid-cols-12 md:gap-x-8 md:gap-y-0">
      <div className="md:col-span-12 md:row-start-1 md:mb-12 lg:col-span-6 lg:mb-0">
        <h2 data-reveal className="font-display text-[clamp(2.5rem,4.4vw,4rem)] font-extrabold leading-[0.95] tracking-[-0.035em]">
          {t("home.fit.title")}
        </h2>
        <p data-reveal style={{ "--i": 1 } as React.CSSProperties} className="mt-6 max-w-md text-xl leading-relaxed">
          {t("home.fit.body")}
        </p>
      </div>

      <div className="md:col-span-5 md:col-start-1 md:row-start-2 lg:col-span-6">
        <div data-reveal style={{ "--i": 2 } as React.CSSProperties} className="max-w-md md:sticky md:top-28 lg:mt-12">
          <div className="flex items-baseline justify-between gap-4">
            <label htmlFor={`${id}-sat`} className="text-base font-semibold">
              {t("home.fit.sat")}
            </label>
            <output htmlFor={`${id}-sat`} className="font-display text-[clamp(2.5rem,4.4vw,4rem)] font-extrabold leading-none tabular-nums tracking-tight">
              {sat}
            </output>
          </div>
          <input
            id={`${id}-sat`}
            type="range"
            min={SAT_MIN}
            max={SAT_MAX}
            step={10}
            value={sat}
            onChange={(e) => setSat(Number(e.target.value))}
            className="home-range mt-2 w-full"
          />
          <fieldset className="mt-5 md:mt-8">
            <legend className="text-base font-semibold">{t("home.fit.from")}</legend>
            <div className="mt-3 grid grid-cols-2 rounded-full bg-white p-1">
              {[false, true].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={abroad === v}
                  onClick={() => setAbroad(v)}
                  className={`h-11 whitespace-nowrap rounded-full px-3 text-base font-semibold transition-[background-color,color,transform] duration-200 active:scale-[0.97] ${
                    abroad === v ? "bg-ink text-white" : "text-ink hover:bg-blue-50"
                  }`}
                >
                  {v ? t("home.fit.abroad") : t("home.fit.us")}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="md:col-span-7 md:col-start-6 md:row-start-2 lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1">
        <div data-reveal className="paper-scallop mx-auto max-w-[640px] bg-white px-5 pb-12 pt-14 sm:px-12">
          <h3 className="text-center font-display text-[28px] font-bold tracking-tight">{t("home.fit.sheetTitle")}</h3>
          <p className="mt-2 text-center text-base text-zinc-600" aria-live="polite">
            {abroad ? t("home.fit.rateIntl") : t("home.fit.rateAll")}
          </p>
          <ul className="mt-8">
            {rows.map((c) => {
              const rate = abroad && c.intl_admit_rate != null ? c.intl_admit_rate : c.admit_rate;
              const fit = computeFit(student, c);
              return (
                <li key={c.slug} className="py-4">
                  <div className="flex items-baseline gap-3">
                    <Link href={`/colleges/${c.slug}`} className="min-w-0 text-xl font-semibold leading-tight underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                    <span aria-hidden className="leader min-w-4 flex-1 max-lg:hidden" />
                    <span className="ml-auto flex shrink-0 items-baseline gap-3">
                      {/* The shared fit chip, meter and all, so the four bands read apart without colour too. */}
                      {fit && (
                        <span key={fit.fit} className="roll self-center">
                          <FitBadge fit={fit.fit} result={fit} />
                        </span>
                      )}
                      <span key={`${rate}`} className="roll w-[3.4ch] text-right font-display text-[28px] font-extrabold leading-none tabular-nums">
                        {rate == null ? "—" : `${Math.round(Number(rate))}%`}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 text-base text-zinc-600">{c.place}</p>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-center text-base text-zinc-600">{t("home.fit.note")}</p>
        </div>
      </div>
    </div>
  );
}
