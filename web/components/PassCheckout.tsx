"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PayCodes, payDeadline } from "@/components/OrderStatus";
import { openSignIn } from "@/components/SignInDialog";
import type { MessageKey } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { createPayLink, fetchPaymentStatus, listOrders, startCheckout } from "@/lib/payments-api";
import { fmtPassDate, fmtTaipei, openPayOrders, PaymentError, paymentErrorKey, type OrderView } from "@/lib/payments-view";
import { currentEntryYear, offeredEntryYears, PASS_PRICE_TWD, passWindow, taipeiToday } from "@/lib/plans";
import { useStudent } from "@/lib/student-store";
import { buttonClass, toneClass } from "@/lib/ui";

const noop = () => () => {};

type Busy = "pay" | "link" | null;
type MadeLink = { year: number; url: string; expiresAt: string };
type Orders = { user: string; rows: OrderView[]; nowMs: number };

/**
 * The buying part of the pass card on /pricing: the passes the account already has, any ATM / convenience-store payment
 * that was started and can still be paid (its codes, amount and deadline), a choice of entry year (nothing preselected),
 * the consent line, then "Pay" (to ECPay) or "Ask a parent to pay" (makes a link). While payment isn't open for this
 * visitor the buttons are replaced by "Payment opens soon".
 */
export function PassCheckout() {
  const t = useT();
  const locale = useLocale();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const userId = student.auth?.userId ?? null;

  const [year, setYear] = useState<number | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [link, setLink] = useState<MadeLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<{ user: string | null; open: boolean } | null>(null);
  const [orders, setOrders] = useState<Orders | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);

  // Whether buying is open depends on who is asking (stage-mode testers), so it is asked again when the account changes.
  useEffect(() => {
    if (!student.ready) return;
    let cancelled = false;
    void fetchPaymentStatus().then((s) => {
      if (!cancelled) setStatus({ user: userId, open: s.open });
    });
    return () => {
      cancelled = true;
    };
  }, [student.ready, userId]);

  // The account's orders, for an ATM / store payment that is still open. Only a reminder: the card works without it,
  // so a failed read shows nothing.
  useEffect(() => {
    if (!student.ready || userId === null) return;
    let cancelled = false;
    listOrders().then(
      (rows) => {
        if (!cancelled) setOrders({ user: userId, rows, nowMs: Date.now() });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [student.ready, userId]);

  // Coming back to this page with the browser's Back button from ECPay must not leave the buttons stuck on "Opening ECPay…".
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(null);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!mounted) return <div className="mt-5 h-40 animate-pulse rounded-lg bg-zinc-100" />;

  const today = taipeiToday();
  const years = offeredEntryYears(today);
  const e0 = currentEntryYear(today);
  const ownedYears = new Set(student.planWindows.map((w) => w.entry_year));
  // The chosen year only counts while it is still offered and not yet owned (a purchase can land while the page is open).
  const selected = year !== null && years.includes(year) && !ownedYears.has(year) ? year : null;
  const open = student.ready && status !== null && status.user === userId ? status.open : null;
  const passes = student.planWindows.filter((w) => w.until >= today).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const madeLink = link !== null && link.year === selected ? link : null;
  // A year that got paid meanwhile drops out (ownedYears), so a still-open ATM code for it is not offered twice.
  const toPay = orders !== null && orders.user === userId ? openPayOrders(orders.rows, ownedYears, orders.nowMs) : [];

  const fail = (e: unknown) => {
    setError(paymentErrorKey(e));
    // The server says this year is already paid: the account's passes are out of date, so read them again.
    if (e instanceof PaymentError && e.code === "already_paid") void student.reloadPlan();
  };

  const pay = async () => {
    if (selected === null || !consent) return;
    if (!student.auth) {
      openSignIn();
      return;
    }
    setBusy("pay");
    setError(null);
    try {
      await startCheckout(selected);
      // The browser is on its way to ECPay; the buttons stay busy until it leaves (or the page is shown again, see above).
    } catch (e) {
      setBusy(null);
      fail(e);
    }
  };

  const askParent = async () => {
    if (selected === null) return;
    if (!student.auth) {
      openSignIn();
      return;
    }
    setBusy("link");
    setError(null);
    try {
      const made = await createPayLink(selected);
      setLink({ year: selected, ...made });
      setCopied(false);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (madeLink === null) return;
    try {
      await navigator.clipboard.writeText(madeLink.url);
      setCopied(true);
    } catch {
      // No clipboard access: select the address so Ctrl+C / long-press copies it.
      linkInput.current?.select();
    }
  };

  return (
    <div className="mt-5 space-y-4 border-t border-zinc-200 pt-5">
      {passes.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t("payments.yourPasses")}</h3>
          <ul className="space-y-2">
            {passes.map((w) => {
              const pass = t("payments.passFor", { year: w.entry_year });
              const active = w.from <= today;
              return (
                <li key={`${w.entry_year}-${w.from}`} className={`rounded-md border px-3 py-2 text-sm ${toneClass(active ? "done" : "progress")}`}>
                  {active
                    ? t("payments.activePass", { pass, until: fmtPassDate(w.until, locale) })
                    : t("payments.upcomingPass", { pass, from: fmtPassDate(w.from, locale), until: fmtPassDate(w.until, locale) })}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {toPay.map(({ order, how }) => {
        const deadline = payDeadline(order, how, locale);
        return (
          <div key={order.id} className={`space-y-2 rounded-md border p-3 text-sm ${toneClass("soon")}`}>
            <p className="text-xs font-semibold">{t("payments.openOrder.title", { pass: t("payments.passFor", { year: order.entryYear }) })}</p>
            <PayCodes order={order} how={how}>
              {deadline !== null && <p>{t("payments.openOrder.deadline", { deadline })}</p>}
              <p>{t("payments.openOrder.hint")}</p>
            </PayCodes>
          </div>
        );
      })}

      <fieldset className="space-y-2" disabled={open === false}>
        <legend className="text-sm font-semibold">{t("payments.chooseYear")}</legend>
        <p className="text-xs text-zinc-500">{years.includes(e0) ? t("payments.yearHint", { e0, e1: e0 + 1 }) : t("payments.yearHintNext", { e1: e0 + 1 })}</p>
        {years.map((y) => {
          const owned = ownedYears.has(y);
          const w = passWindow(y, today);
          return (
            <label
              key={y}
              className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                owned ? "cursor-not-allowed border-zinc-200 opacity-60" : selected === y ? "cursor-pointer border-ink bg-zinc-50" : "cursor-pointer border-zinc-200 hover:border-zinc-400"
              }`}
            >
              <input type="radio" name="entry-year" value={y} className="mt-1" checked={selected === y} disabled={owned} onChange={() => setYear(y)} />
              <span>
                <span className="block font-semibold">{t("payments.passFor", { year: y })}</span>
                <span className="block text-zinc-500">
                  {owned
                    ? t("payments.owned")
                    : w.from > today
                      ? t("payments.startsOn", { from: fmtPassDate(w.from, locale), until: fmtPassDate(w.until, locale) })
                      : t("payments.startsNow", { until: fmtPassDate(w.until, locale) })}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {open === false ? (
        <p className={`rounded-md border p-3 text-center text-sm font-semibold ${toneClass("neutral")}`}>{t("payments.opensSoon")}</p>
      ) : (
        <>
          <label className="flex items-start gap-2 text-xs text-zinc-600">
            <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t("payments.consent")}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass("primary")} disabled={selected === null || !consent || busy !== null || open !== true} onClick={pay}>
              {busy === "pay" ? t("payments.paying") : t("payments.pay", { price: PASS_PRICE_TWD })}
            </button>
            <button type="button" className={buttonClass("secondary")} disabled={selected === null || busy !== null || open !== true} onClick={askParent}>
              {busy === "link" ? t("payments.askParentBusy") : t("payments.askParent")}
            </button>
          </div>
          {student.ready && !student.auth && <p className="text-xs text-zinc-500">{t("payments.signInFirst")}</p>}
        </>
      )}

      {error && (
        <p role="alert" className={`rounded-md border p-2 text-sm ${toneClass("urgent")}`}>
          {t(error)}
        </p>
      )}

      {madeLink && (
        <div className={`space-y-2 rounded-md border p-3 text-sm ${toneClass("neutral")}`}>
          <p>{t("payments.linkReady", { until: fmtTaipei(madeLink.expiresAt, locale, true) })}</p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={linkInput}
              readOnly
              value={madeLink.url}
              aria-label={t("payments.linkLabel")}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-ink"
            />
            <button type="button" className={buttonClass("primary", "sm")} onClick={copy}>
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        {t("payments.methods")} {t("payments.refundLine")}
      </p>
    </div>
  );
}
