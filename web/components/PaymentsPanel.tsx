"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PaymentContact } from "@/components/PaymentContact";
import { SETTINGS_PANEL, SettingsRow } from "@/components/settings/SettingsRow";
import { StatusPill } from "@/components/StatusPill";
import type { Locale, MessageKey, TFunction } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { listOrders } from "@/lib/payments-api";
import { orderIsOpen, orderRowStatus, payMethod, type OrderRowStatus, type PayMethod } from "@/lib/payments-parent";
import { fmtPassDate, fmtTaipei, paymentErrorKey, type OrderView } from "@/lib/payments-view";
import { activeWindow, FREE_LIMIT, taipeiToday, upcomingWindow } from "@/lib/plans";
import type { Tone } from "@/lib/status";
import { useStudent } from "@/lib/student-store";
import { buttonClass, toneClass } from "@/lib/ui";

// Full literal keys, so the unused-key test sees them.
const METHOD_KEY: Record<PayMethod, MessageKey> = {
  card: "payments.panel.method.card",
  atm: "payments.panel.method.atm",
  cvs: "payments.panel.method.cvs",
  code: "payments.panel.method.code",
  other: "payments.panel.method.other",
};

const STATUS: Record<OrderRowStatus, { key: MessageKey; tone: Tone }> = {
  paid: { key: "payments.panel.status.paid", tone: "done" },
  awaiting_payment: { key: "payments.panel.status.awaiting", tone: "soon" },
  pending: { key: "payments.panel.status.pending", tone: "progress" },
  expired: { key: "payments.panel.status.expired", tone: "neutral" },
  refunded: { key: "payments.panel.status.refunded", tone: "neutral" },
  stale: { key: "payments.panel.status.stale", tone: "neutral" },
};

type History = { rows: OrderView[]; nowMs: number };

/**
 * Student settings: the pass the account has now, a pass bought ahead for a later year, and every payment made
 * (including those a parent paid through a link), with the refund line and the contact address when there is one.
 */
export function PaymentsPanel() {
  const t = useT();
  const locale = useLocale();
  const student = useStudent();
  const userId = student.auth?.userId ?? null;
  const [history, setHistory] = useState<History | null>(null);
  const [loadError, setLoadError] = useState<MessageKey | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (userId === null) return;
    let live = true;
    listOrders().then(
      (rows) => {
        if (live) setHistory({ rows, nowMs: Date.now() });
      },
      (e) => {
        if (live) setLoadError(paymentErrorKey(e));
      },
    );
    return () => {
      live = false;
    };
  }, [userId, attempt]);

  const today = taipeiToday();
  const active = activeWindow(student.planWindows, today);
  const next = upcomingWindow(student.planWindows, today);
  const passName = (year: number) => t("payments.passFor", { year });

  return (
    <SettingsRow
      id="payments"
      headingId="payments-heading"
      title={t("payments.panel.title")}
      description={<p>{t("payments.panel.desc")}</p>}
      /* The plan in force drawn as the pass itself (the pricing page's ticket), beside the history: the face says what
         it is and until when, the stub how to get one, or one for another year. */
      aside={
        <div>
          <dl className={`ticket-body px-5 pb-6 pt-5 ${active ? "bg-ink text-white" : "bg-blue-100 text-ink"}`}>
            <dt className={`text-sm font-semibold ${active ? "text-blue-100" : "text-zinc-700"}`}>{t("payments.panel.currentPlan")}</dt>
            <dd className="mt-1 font-display text-xl font-bold leading-snug tracking-tight">
              {active
                ? t("payments.activePass", { pass: passName(active.entry_year), until: fmtPassDate(active.until, locale) })
                : t("payments.planName.free")}
            </dd>
            {!active && <dd className="mt-0.5 text-base text-ink">{t("misc.settings.freeSub", { n: FREE_LIMIT })}</dd>}
            {next && (
              <>
                <dt className={`mt-4 text-sm font-semibold ${active ? "text-blue-100" : "text-zinc-700"}`}>{t("payments.panel.nextPass")}</dt>
                <dd className="mt-0.5 text-base font-semibold">
                  {t("payments.upcomingPass", { pass: passName(next.entry_year), from: fmtPassDate(next.from, locale), until: fmtPassDate(next.until, locale) })}
                </dd>
              </>
            )}
          </dl>
          <div className="ticket-stub bg-blue-100 px-5 py-4">
            <Link href="/pricing" className={buttonClass(active ? "secondary" : "primary", "sm")}>
              {active ? t("payments.panel.buyAnother") : t("payments.getPass")}
            </Link>
          </div>
        </div>
      }
      panel={false}
    >
      <div className={SETTINGS_PANEL}>
      <h3 className="mb-3 font-display text-lg font-bold text-ink">{t("payments.panel.history")}</h3>
      {loadError ? (
        <div className="space-y-2">
          <p role="alert" className={`rounded-md border p-2 text-sm ${toneClass("urgent")}`}>
            {t(loadError)}
          </p>
          <button
            type="button"
            className={buttonClass("secondary", "sm")}
            onClick={() => {
              setLoadError(null);
              setAttempt((n) => n + 1);
            }}
          >
            {t("payments.retry")}
          </button>
        </div>
      ) : history === null ? (
        <div className="h-20 animate-pulse rounded-xl bg-zinc-100" />
      ) : history.rows.length === 0 ? (
        <p className="text-base text-zinc-700">{t("payments.panel.empty")}</p>
      ) : (
        <OrdersTable rows={history.rows} nowMs={history.nowMs} />
      )}

      <div className="mt-5 space-y-1 text-sm text-zinc-700">
        <p>{t("payments.refundLine")}</p>
        <PaymentContact />
      </div>
      </div>
    </SettingsRow>
  );
}

/** What one order says in the history, as the texts to print (shared by the phone list and the wider table). */
function orderCells(o: OrderView, nowMs: number, t: TFunction, locale: Locale) {
  const status = orderRowStatus(o, nowMs);
  const method = payMethod(o.paymentType);
  return {
    id: o.id,
    date: fmtTaipei(o.paidAt ?? o.createdAt, locale, false),
    amount: t("payments.price", { price: o.amountTwd }),
    method: method === null ? null : t(METHOD_KEY[method]),
    pass: t("payments.passFor", { year: o.entryYear }),
    valid: o.passFrom === null ? null : `${fmtPassDate(o.passFrom, locale)} – ${fmtPassDate(o.passUntil, locale)}`,
    tone: STATUS[status].tone,
    statusText: t(STATUS[status].key),
    viaParent: o.payer === "parent",
    open: orderIsOpen(status),
  };
}

type Cells = ReturnType<typeof orderCells>;

/** The status pill, plus "via parent link" and the link to the payment details when the order can still be paid. */
function StatusCell({ c }: { c: Cells }) {
  const t = useT();
  return (
    <>
      <StatusPill tone={c.tone}>{c.statusText}</StatusPill>
      {c.viaParent && <p className="mt-1 text-sm text-zinc-600">{t("payments.panel.viaParent")}</p>}
      {c.open && (
        <p className="mt-1 text-sm">
          <Link href={`/pricing?order=${encodeURIComponent(c.id)}`} className="font-semibold text-blue-700 underline underline-offset-4">
            {t("payments.panel.details")}
          </Link>
        </p>
      )}
    </>
  );
}

/** The orders: a stacked list on a phone, a table (date, amount, method, pass, validity, status) from the sm breakpoint up. */
export function OrdersTable({ rows, nowMs }: { rows: OrderView[]; nowMs: number }) {
  const t = useT();
  const locale = useLocale();
  const cells = rows.map((o) => orderCells(o, nowMs, t, locale));
  return (
    <>
      <ul className="divide-y divide-zinc-200 sm:hidden" aria-label={t("payments.panel.history")}>
        {cells.map((c) => (
          <li key={c.id} className="space-y-1 py-3 text-base first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-ink">{c.pass}</span>
              <span className="font-semibold tabular-nums text-ink">{c.amount}</span>
            </div>
            <p className="text-sm text-zinc-600">
              {c.date} · {c.method ?? "—"}
            </p>
            {c.valid && <p className="text-sm text-zinc-600">{c.valid}</p>}
            <div>
              <StatusCell c={c} />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block" role="region" tabIndex={0} aria-label={t("payments.panel.history")}>
        <table className="w-full min-w-[36rem] text-left text-[15px]">
          <thead className="text-[13px] text-zinc-600">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">{t("payments.panel.col.date")}</th>
              <th scope="col" className="py-2 pr-6 text-right font-medium">{t("payments.panel.col.amount")}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t("payments.panel.col.method")}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t("payments.panel.col.pass")}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t("payments.panel.col.valid")}</th>
              <th scope="col" className="py-2 font-medium">{t("payments.panel.col.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 border-t border-zinc-300">
            {cells.map((c) => (
              <tr key={c.id} className="align-top text-ink">
                <td className="py-3 pr-3 whitespace-nowrap">{c.date}</td>
                <td className="py-3 pr-6 text-right font-semibold whitespace-nowrap tabular-nums">{c.amount}</td>
                <td className="py-3 pr-3">{c.method ?? <span className="text-zinc-500">—</span>}</td>
                <td className="py-3 pr-3">{c.pass}</td>
                <td className="py-3 pr-3 whitespace-nowrap">{c.valid ?? <span className="text-zinc-500">—</span>}</td>
                <td className="py-3">
                  <StatusCell c={c} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
