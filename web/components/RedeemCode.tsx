"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { SignInButton } from "@/components/SignInDialog";
import type { MessageKey } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { redeemCode } from "@/lib/payments-api";
import { fmtPassDate, PaymentError, redeemErrorKey } from "@/lib/payments-view";
import { currentEntryYear, offeredEntryYears, passWindow, taipeiToday } from "@/lib/plans";
import { useStudent } from "@/lib/student-store";
import { buttonClass, FIELD_CLASS, LABEL, PAGE_INTRO, PAGE_TITLE, PANEL, toneClass } from "@/lib/ui";

const noop = () => () => {};

type Redeemed = { entryYear: number; from: string; until: string };

/**
 * /redeem (account menu > Redeem code): a code, the entry year its pass is for (nothing preselected, as on /pricing; years
 * the account already has a pass for are greyed out) and Redeem. The server (payments function POST /redeem, migration
 * 0050) checks the code and writes the pass; this screen then re-reads the account's plan so it applies right away.
 */
export function RedeemCode() {
  const t = useT();
  const locale = useLocale();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [code, setCode] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [done, setDone] = useState<Redeemed | null>(null);

  const header = (
    <div className="space-y-3">
      <h1 className={PAGE_TITLE}>{t("payments.redeem.title")}</h1>
      <p className={PAGE_INTRO}>{t("payments.redeem.intro")}</p>
    </div>
  );

  if (!mounted || !student.ready || !student.sessionChecked) {
    return (
      <div className="max-w-2xl space-y-8">
        {header}
        <div className={`h-72 animate-pulse ${PANEL}`} />
      </div>
    );
  }

  if (!student.auth) {
    return (
      <div className="max-w-2xl space-y-8">
        {header}
        <div className={`space-y-4 px-6 py-6 sm:px-8 ${PANEL}`}>
          <p className="text-base text-ink">{t("payments.redeem.signIn")}</p>
          <SignInButton className={buttonClass("primary")}>{t("account.signIn")}</SignInButton>
        </div>
      </div>
    );
  }

  const today = taipeiToday();
  const years = offeredEntryYears(today);
  const e0 = currentEntryYear(today);
  const ownedYears = new Set(student.planWindows.map((w) => w.entry_year));
  const selected = year !== null && years.includes(year) && !ownedYears.has(year) ? year : null;
  const typed = code.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (selected === null || typed === "" || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const pass = await redeemCode(typed, selected);
      setDone(pass);
      setCode("");
      setYear(null);
      await student.reloadPlan();
    } catch (err) {
      setError(redeemErrorKey(err));
      // The account's passes may be out of date: the year already has one, the code was used (say a reply that got lost),
      // or the call failed after the server wrote the pass. Read them again.
      if (!(err instanceof PaymentError) || ["already_paid", "code_used", "network", "server"].includes(err.code)) void student.reloadPlan();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      {header}

      {done && (
        <div role="status" className={`space-y-3 rounded-xl border px-4 py-4 text-base ${toneClass("done")}`}>
          <p className="font-semibold">
            {done.from > today
              ? t("payments.redeem.doneLater", {
                  pass: t("payments.passFor", { year: done.entryYear }),
                  from: fmtPassDate(done.from, locale),
                  until: fmtPassDate(done.until, locale),
                })
              : t("payments.redeem.done", { pass: t("payments.passFor", { year: done.entryYear }), until: fmtPassDate(done.until, locale) })}
          </p>
          <Link href="/application/list" className={buttonClass("secondary", "sm")}>
            {t("payments.redeem.toList")}
          </Link>
        </div>
      )}

      <form onSubmit={submit} className={`space-y-6 px-6 py-6 sm:px-8 ${PANEL}`}>
        <div className="space-y-2">
          <label htmlFor="redeem-code" className={LABEL}>
            {t("payments.redeem.codeLabel")}
          </label>
          <input
            id="redeem-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={64}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={`${FIELD_CLASS} block w-full max-w-sm font-mono text-base`}
          />
          <p className="text-sm text-zinc-600">{t("payments.redeem.once")}</p>
        </div>

        <fieldset className="space-y-2">
          <legend className={LABEL}>{t("payments.chooseYear")}</legend>
          <p className="pb-1 text-sm text-ink">{years.includes(e0) ? t("payments.yearHint", { e0, e1: e0 + 1 }) : t("payments.yearHintNext", { e1: e0 + 1 })}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {years.map((y) => {
              const owned = ownedYears.has(y);
              const w = passWindow(y, today);
              return (
                <label
                  key={y}
                  className={`flex flex-col gap-1 rounded-xl border-2 px-3 py-2.5 transition-colors ${
                    owned ? "cursor-not-allowed border-transparent bg-white/50 text-zinc-600" : selected === y ? "cursor-pointer border-ink bg-white" : "cursor-pointer border-zinc-200 bg-white hover:border-zinc-400"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="redeem-year" value={y} className="size-4 shrink-0 accent-ink" checked={selected === y} disabled={owned} onChange={() => setYear(y)} />
                    <span className={`text-[15px] font-semibold leading-tight ${owned ? "" : "text-ink"}`}>{t("payments.passFor", { year: y })}</span>
                  </span>
                  <span className="text-[13px] leading-snug text-zinc-600">
                    {owned
                      ? t("payments.owned")
                      : w.from > today
                        ? t("payments.startsOn", { from: fmtPassDate(w.from, locale), until: fmtPassDate(w.until, locale) })
                        : t("payments.redeem.startsNow", { until: fmtPassDate(w.until, locale) })}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <button type="submit" className={buttonClass("primary")} disabled={selected === null || typed === "" || busy}>
          {busy ? t("payments.redeem.busy") : t("payments.redeem.submit")}
        </button>

        {error && (
          <p role="alert" className={`rounded-xl border px-4 py-3 text-base ${toneClass("urgent")}`}>
            {t(error)}
          </p>
        )}
      </form>
    </div>
  );
}
