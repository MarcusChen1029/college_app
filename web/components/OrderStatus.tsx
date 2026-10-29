"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { SignInButton } from "@/components/SignInDialog";
import type { Locale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { fetchOrder } from "@/lib/payments-api";
import {
  fmtPassDate,
  fmtTaipei,
  isUuid,
  keepPolling,
  orderPhase,
  payInstructions,
  pollDelay,
  waitingPhase,
  type OrderPhase,
  type OrderView,
  type PayInstructions,
} from "@/lib/payments-view";
import { taipeiToday } from "@/lib/plans";
import { useStudent } from "@/lib/student-store";
import type { Tone } from "@/lib/status";
import { buttonClass, toneClass } from "@/lib/ui";

type Seen = {
  id: string;
  /** undefined: not read yet (or every read so far failed); null: the account has no such order. */
  order: OrderView | null | undefined;
  waitedMs: number;
  nowMs: number;
};

const TONE: Record<OrderPhase | "missing", Tone> = {
  confirming: "progress",
  slow: "soon",
  unheard: "neutral",
  awaiting: "soon",
  paid: "done",
  expired: "soon",
  refunded: "neutral",
  missing: "neutral",
};

/**
 * /pricing?order=<id>: where ECPay sends the buyer back. Reads the order every 2 s for the first minute (every 10 s after
 * that) and shows what it is waiting for: confirmation, the ATM account or store code to pay with, or the active pass.
 * Stops once the order is paid, refunded or expired (an ATM / store deadline passing included), and after 10 minutes
 * for an order nothing was heard about (keepPolling). Lives under a Suspense boundary (it reads the query string).
 */
export function OrderStatus() {
  const t = useT();
  const locale = useLocale();
  const student = useStudent();
  const raw = useSearchParams().get("order");
  const orderId = isUuid(raw) ? raw : null;
  const userId = student.auth?.userId ?? null;
  const [seen, setSeen] = useState<Seen | null>(null);
  // Called from the polling effect without making it start over when the student object changes.
  const refreshPlan = useEffectEvent(() => {
    void student.reloadPlan();
  });

  useEffect(() => {
    if (orderId === null || !student.ready || userId === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const tick = async () => {
      let order: OrderView | null | undefined;
      try {
        order = await fetchOrder(orderId);
      } catch {
        order = undefined; // a failed read: keep what we had and try again
      }
      if (cancelled) return;
      const nowMs = Date.now();
      const waitedMs = nowMs - started;
      setSeen((prev) => ({ id: orderId, order: order === undefined ? (prev?.id === orderId ? prev.order : undefined) : order, waitedMs, nowMs }));
      if (order === null) return; // no such order for this account: nothing to wait for
      if (order?.status === "paid") refreshPlan(); // the pass was written on the server; read it into the store
      // A failed read counts as "not heard yet", so the cap stops a page whose every read fails as well.
      const phase = order === undefined ? waitingPhase(waitedMs, NaN) : orderPhase(order, waitedMs, nowMs);
      if (!keepPolling(phase)) return;
      timer = setTimeout(tick, pollDelay(waitedMs));
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderId, student.ready, userId]);

  if (orderId === null) return null;
  if (student.ready && userId === null) {
    return (
      <section className={`flex flex-wrap items-center gap-3 rounded-2xl border p-5 text-sm ${toneClass("neutral")}`} role="status">
        <p>{t("payments.order.signIn")}</p>
        <SignInButton className={buttonClass("primary", "sm")}>{t("account.signIn")}</SignInButton>
      </section>
    );
  }

  const current = seen !== null && seen.id === orderId ? seen : null;
  const order = current?.order ?? null;
  let phase: OrderPhase | "missing";
  if (current !== null && current.order === null) phase = "missing";
  else if (order !== null && current !== null) phase = orderPhase(order, current.waitedMs, current.nowMs);
  else phase = waitingPhase(current?.waitedMs ?? 0, NaN);

  return (
    <section className={`rounded-2xl border p-5 text-sm ${toneClass(TONE[phase])}`} role="status" aria-live="polite">
      <Body phase={phase} order={order} locale={locale} />
    </section>
  );
}

function Body({ phase, order, locale }: { phase: OrderPhase | "missing"; order: OrderView | null; locale: Locale }) {
  const t = useT();

  if (phase === "paid" && order !== null) {
    const until = fmtPassDate(order.passUntil, locale);
    const later = order.passFrom !== null && order.passFrom > taipeiToday();
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold">
          {later && order.passFrom !== null
            ? t("payments.order.paidLater", { pass: t("payments.passFor", { year: order.entryYear }), from: fmtPassDate(order.passFrom, locale), until })
            : t("payments.order.paid", { until })}
        </p>
        <Link href="/application/list" className={buttonClass("secondary", "sm")}>
          {t("misc.pricing.goToList")}
        </Link>
      </div>
    );
  }

  if (phase === "awaiting" && order !== null) {
    const how = payInstructions(order);
    if (how !== null) {
      const deadline = payDeadline(order, how, locale);
      return <PayCodes order={order} how={how}>{deadline !== null && <p>{t("payments.order.deadline", { deadline })}</p>}</PayCodes>;
    }
  }

  const text: Record<OrderPhase | "missing", string> = {
    confirming: t("payments.order.confirming"),
    slow: t("payments.order.slow"),
    unheard: t("payments.order.unheard"),
    awaiting: t("payments.order.confirming"),
    paid: t("payments.order.confirming"),
    expired: t("payments.order.expired"),
    refunded: t("payments.order.refunded"),
    missing: t("payments.order.missing"),
  };
  return <p className={phase === "confirming" ? "font-semibold" : undefined}>{text[phase]}</p>;
}

/** An ATM account is due by the end of a day, so only its date is shown; a store code is due by a time of day. */
export function payDeadline(order: Pick<OrderView, "expiresAt">, how: PayInstructions, locale: Locale): string | null {
  return order.expiresAt === null ? null : fmtTaipei(order.expiresAt, locale, how.kind === "cvs");
}

/**
 * What to pay with for an open ATM / convenience-store order: the bank code and account, or the store code, and the
 * amount. Shared by /pricing?order= and the pass card; `children` (the deadline line) go underneath.
 */
export function PayCodes({ order, how, children }: { order: Pick<OrderView, "amountTwd">; how: PayInstructions; children?: ReactNode }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <p className="font-semibold">{how.kind === "atm" ? t("payments.order.atmTitle") : t("payments.order.cvsTitle")}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {how.kind === "atm" ? (
          <>
            <dt>{t("payments.order.bankCode")}</dt>
            <dd className="font-mono tabular-nums select-all">{how.bankCode}</dd>
            <dt>{t("payments.order.account")}</dt>
            <dd className="font-mono tabular-nums select-all">{how.account}</dd>
          </>
        ) : (
          <>
            <dt>{t("payments.order.cvsCode")}</dt>
            <dd className="font-mono tabular-nums select-all">{how.paymentNo}</dd>
          </>
        )}
        <dt>{t("payments.order.amount")}</dt>
        <dd className="tabular-nums">{t("payments.price", { price: order.amountTwd })}</dd>
      </dl>
      {children}
    </div>
  );
}
