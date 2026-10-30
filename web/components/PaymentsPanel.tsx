"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PaymentContact } from "@/components/PaymentContact";
import { StatusPill } from "@/components/StatusPill";
import type { Locale, MessageKey, TFunction } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { listOrders } from "@/lib/payments-api";
import { orderIsOpen, orderRowStatus, payMethod, type OrderRowStatus, type PayMethod } from "@/lib/payments-parent";
import { fmtPassDate, fmtTaipei, paymentErrorKey, type OrderView } from "@/lib/payments-view";
import { activeWindow, taipeiToday, upcomingWindow } from "@/lib/plans";
import type { Tone } from "@/lib/status";
import { useStudent } from "@/lib/student-store";
import { buttonClass, toneClass } from "@/lib/ui";

// Full literal keys, so the unused-key test sees them.
const METHOD_KEY: Record<PayMethod, MessageKey> = {
  card: "payments.panel.method.card",
  atm: "payments.panel.method.atm",
  cvs: "payments.panel.method.cvs",
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
    <section id="payments" aria-labelledby="payments-heading" className="scroll-mt-4 rounded-2xl border border-zinc-200 p-6">
      <h2 id="payments-heading" className="mb-3 text-xl font-bold">
        {t("payments.panel.title")}
      </h2>

      <dl className="divide-y divide-zinc-100 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 py-2">
          <dt className="w-40 shrink-0 text-zinc-500">{t("payments.panel.currentPlan")}</dt>
          <dd className="min-w-0 font-medium">
            {active
              ? t("payments.activePass", { pass: passName(active.entry_year), until: fmtPassDate(active.until, locale) })
              : t("payments.planName.free")}
          </dd>
        </div>
        {next && (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 py-2">
            <dt className="w-40 shrink-0 text-zinc-500">{t("payments.panel.nextPass")}</dt>
            <dd className="min-w-0 font-medium">
              {t("payments.upcomingPass", { pass: passName(next.entry_year), from: fmtPassDate(next.from, locale), until: fmtPassDate(next.until, locale) })}
            </dd>
          </div>
        )}
      </dl>
      <Link href="/pricing" className={`mt-3 ${buttonClass(active ? "secondary" : "primary", "sm")}`}>
        {active ? t("payments.panel.buyAnother") : t("payments.getPass")}
      </Link>

      <h3 className="mt-6 mb-2 text-sm font-semibold">{t("payments.panel.history")}</h3>
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
        <div className="h-20 animate-pulse rounded-lg bg-zinc-100" />
      ) : history.rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("payments.panel.empty")}</p>
      ) : (
        <OrdersTable rows={history.rows} nowMs={history.nowMs} />
      )}

      <div className="mt-4 space-y-1 text-xs text-zinc-500">
        <p>{t("payments.refundLine")}</p>
        <PaymentContact />
      </div>
    </section>
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
      {c.viaParent && <p className="mt-1 text-xs text-zinc-500">{t("payments.panel.viaParent")}</p>}
      {c.open && (
        <p className="mt-1 text-xs">
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
      <ul className="divide-y divide-zinc-100 sm:hidden" aria-label={t("payments.panel.history")}>
        {cells.map((c) => (
          <li key={c.id} className="space-y-1 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{c.pass}</span>
              <span className="font-medium tabular-nums">{c.amount}</span>
            </div>
            <p className="text-zinc-500">
              {c.date} · {c.method ?? "—"}
            </p>
            {c.valid && <p className="text-zinc-500">{c.valid}</p>}
            <div>
              <StatusCell c={c} />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block" role="region" tabIndex={0} aria-label={t("payments.panel.history")}>
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">{t("payments.panel.col.date")}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t("payments.panel.col.amount")}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t("payments.panel.col.method")}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t("payments.panel.col.pass")}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t("payments.panel.col.valid")}</th>
              <th scope="col" className="py-2 font-medium">{t("payments.panel.col.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {cells.map((c) => (
              <tr key={c.id} className="align-top">
                <td className="py-2 pr-3 whitespace-nowrap">{c.date}</td>
                <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{c.amount}</td>
                <td className="py-2 pr-3">{c.method ?? "—"}</td>
                <td className="py-2 pr-3">{c.pass}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{c.valid ?? "—"}</td>
                <td className="py-2">
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
