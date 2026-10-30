"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { PayCodes, payDeadline } from "@/components/OrderStatus";
import { openSignIn } from "@/components/SignInDialog";
import { StatusPill } from "@/components/StatusPill";
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

/** The pass as a ticket: its face (`head`, the passes owned) on the navy body, the buying form on the sky stub. */
function Ticket({ head, stub }: { head: ReactNode; stub: ReactNode }) {
  return (
    <div>
      <div className="ticket-body bg-ink px-6 pb-7 pt-6 text-white sm:px-8">{head}</div>
      <div className="ticket-stub bg-blue-100 px-6 pb-8 pt-6 sm:px-8">{stub}</div>
    </div>
  );
}

/**
 * The buying part of the pass card on /pricing: the passes the account already has, any ATM / convenience-store payment
 * that was started and can still be paid (its codes, amount and deadline), a choice of entry year (nothing preselected),
 * the consent line, then "Pay" (to ECPay) or "Ask a parent to pay" (makes a link). While payment isn't open for this
 * visitor the buttons are replaced by "Payment opens soon".
 */
export function PassCheckout({ head }: { head: ReactNode }) {
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

  if (!mounted) return <Ticket head={head} stub={<div className="h-56 animate-pulse rounded-xl bg-white/60" />} />;

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
    <Ticket
      head={head}
      stub={
        <div className="space-y-4">
          {toPay.map(({ order, how }) => {
            const deadline = payDeadline(order, how, locale);
            return (
              <div key={order.id} className="space-y-3 rounded-xl bg-white px-4 py-4 text-base text-ink">
                <StatusPill tone="soon">{t("payments.panel.status.awaiting")}</StatusPill>
                <p className="font-semibold">{t("payments.openOrder.title", { pass: t("payments.passFor", { year: order.entryYear }) })}</p>
                <PayCodes order={order} how={how}>
                  {deadline !== null && <p>{t("payments.openOrder.deadline", { deadline })}</p>}
                  <p>{t("payments.openOrder.hint")}</p>
                </PayCodes>
              </div>
            );
          })}

          <fieldset className="space-y-2" disabled={open === false}>
            <legend className="font-display text-lg font-bold text-ink">{t("payments.chooseYear")}</legend>
            <p className="pb-1 text-sm text-ink">{years.includes(e0) ? t("payments.yearHint", { e0, e1: e0 + 1 }) : t("payments.yearHintNext", { e1: e0 + 1 })}</p>
            {/* One row of three compact choices from sm up, so Pay stays on a 1440 x 900 screen; stacked on a phone. */}
            <div className="grid gap-2 sm:grid-cols-3">
            {years.map((y) => {
              const owned = ownedYears.has(y);
              const w = passWindow(y, today);
              return (
                <label
                  key={y}
                  className={`flex flex-col gap-1 rounded-xl border-2 px-3 py-2.5 transition-colors ${
                    owned ? "cursor-not-allowed border-transparent bg-white/50 text-zinc-600" : selected === y ? "cursor-pointer border-ink bg-white" : "cursor-pointer border-transparent bg-white hover:border-zinc-400"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="entry-year" value={y} className="size-4 shrink-0 accent-ink" checked={selected === y} disabled={owned} onChange={() => setYear(y)} />
                    <span className={`text-[15px] font-semibold leading-tight ${owned ? "" : "text-ink"}`}>{t("payments.passFor", { year: y })}</span>
                  </span>
                  <span className="text-[13px] leading-snug text-zinc-600">
                    {owned
                      ? t("payments.owned")
                      : w.from > today
                        ? t("payments.startsOn", { from: fmtPassDate(w.from, locale), until: fmtPassDate(w.until, locale) })
                        : t("payments.startsNow", { until: fmtPassDate(w.until, locale) })}
                  </span>
                </label>
              );
            })}
            </div>
          </fieldset>

          <p className="text-sm leading-normal text-ink">{t("payments.methods")}</p>

          {open === false ? (
            <p className={`rounded-xl border px-4 py-3 text-center text-base font-semibold ${toneClass("neutral")}`}>{t("payments.opensSoon")}</p>
          ) : (
            <>
              <label className="flex items-start gap-2.5 text-sm leading-normal text-ink">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-ink" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{t("payments.consent")}</span>
              </label>
              <div className="flex flex-wrap gap-3">
                <button type="button" className={buttonClass("primary")} disabled={selected === null || !consent || busy !== null || open !== true} onClick={pay}>
                  {busy === "pay" ? t("payments.paying") : t("payments.pay", { price: PASS_PRICE_TWD })}
                </button>
                <button type="button" className={buttonClass("secondary")} disabled={selected === null || busy !== null || open !== true} onClick={askParent}>
                  {busy === "link" ? t("payments.askParentBusy") : t("payments.askParent")}
                </button>
              </div>
              {student.ready && !student.auth && <p className="text-sm text-ink">{t("payments.signInFirst")}</p>}
            </>
          )}

          {error && (
            <p role="alert" className={`rounded-xl border px-4 py-3 text-base ${toneClass("urgent")}`}>
              {t(error)}
            </p>
          )}

          {madeLink && (
            <div className="space-y-3 rounded-xl bg-white px-4 py-4 text-base text-ink">
              <p>{t("payments.linkReady", { until: fmtTaipei(madeLink.expiresAt, locale, true) })}</p>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={linkInput}
                  readOnly
                  value={madeLink.url}
                  aria-label={t("payments.linkLabel")}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 font-mono text-sm text-ink"
                />
                <button type="button" className={buttonClass("primary", "sm")} onClick={copy}>
                  {copied ? t("common.copied") : t("common.copy")}
                </button>
              </div>
            </div>
          )}

          {passes.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-ink">{t("payments.yourPasses")}</h3>
              <ul className="mt-2 space-y-1.5">
                {passes.map((w) => {
                  const pass = t("payments.passFor", { year: w.entry_year });
                  const active = w.from <= today;
                  return (
                    <li key={`${w.entry_year}-${w.from}`} className={`text-base ${active ? "font-semibold text-ink" : "text-zinc-700"}`}>
                      {active
                        ? t("payments.activePass", { pass, until: fmtPassDate(w.until, locale) })
                        : t("payments.upcomingPass", { pass, from: fmtPassDate(w.from, locale), until: fmtPassDate(w.until, locale) })}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      }
    />
  );
}
