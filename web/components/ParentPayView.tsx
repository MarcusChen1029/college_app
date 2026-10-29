"use client";

// /share/pay/<token>: a parent pays for the student's admission-year pass with no account. The token in the URL finds the
// link; the page shows what is being bought, takes the consent line, then hands the parent to ECPay. ECPay sends the
// parent back to this same address, where the page asks every 3 s (up to 60 s) whether the payment has landed.

import { useEffect, useState } from "react";
import { PaymentContact } from "@/components/PaymentContact";
import type { MessageKey } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { fetchPayLink, startPayLinkCheckout } from "@/lib/payments-api";
import {
  checkoutFailure,
  PAY_POLL_MS,
  payLinkPhase,
  payPollDone,
  payStartedFresh,
  payStartedKey,
  type PayLinkScreen,
} from "@/lib/payments-parent";
import { fmtPassDate, paymentErrorKey, type PayLinkView } from "@/lib/payments-view";
import { taipeiToday } from "@/lib/plans";
import { buttonClass, toneClass } from "@/lib/ui";

type Load = { kind: "loading" } | { kind: "missing" } | { kind: "failed"; key: MessageKey } | { kind: "view"; view: PayLinkView };

// "This tab sent the parent to ECPay from this link", kept in sessionStorage (it survives the trip to ECPay and back in
// the same tab, and goes away with the tab). Storage can be blocked, so every access is guarded.
function readStarted(token: string): string | null {
  try {
    return window.sessionStorage.getItem(payStartedKey(token));
  } catch {
    return null;
  }
}

function writeStarted(token: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(payStartedKey(token));
    else window.sessionStorage.setItem(payStartedKey(token), value);
  } catch {
    // no storage: the page just won't know it is the way back from ECPay
  }
}

/** Shown for a malformed or unknown link. Deliberately says nothing about why. */
export function PayLinkInactive() {
  const t = useT();
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="font-display text-3xl font-bold">{t("share.inactiveTitle")}</h1>
      <p className="mt-3 text-zinc-500">{t("share.inactiveBody")}</p>
    </div>
  );
}

export function ParentPayView({ token }: { token: string }) {
  const t = useT();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  // This visit is the way back from ECPay, and whether the 60 s of asking has run out.
  const [returned, setReturned] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  // A screen forced by a failed checkout (the link changed after it was loaded).
  const [forced, setForced] = useState<PayLinkScreen | null>(null);

  const view = load.kind === "view" ? load.view : null;
  const screen: PayLinkScreen | null = view === null ? null : (forced ?? payLinkPhase(view));
  const polling = returned && !gaveUp && screen === "ready";

  useEffect(() => {
    let live = true;
    fetchPayLink(token).then(
      (v) => {
        if (!live) return;
        if (v === null) {
          setLoad({ kind: "missing" });
          return;
        }
        if (v.paid) writeStarted(token, null);
        setReturned(!v.paid && payStartedFresh(readStarted(token), Date.now()));
        setLoad({ kind: "view", view: v });
      },
      (e) => {
        if (live) setLoad({ kind: "failed", key: paymentErrorKey(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [token, attempt]);

  // Back from ECPay: ask whether the payment has landed, every 3 s, for up to 60 s.
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const tick = async () => {
      try {
        const v = await fetchPayLink(token);
        if (cancelled) return;
        if (v !== null) {
          if (v.paid) writeStarted(token, null);
          setLoad({ kind: "view", view: v });
          if (v.paid) return;
        }
      } catch {
        // a failed read: keep what we have and ask again
      }
      if (cancelled) return;
      if (payPollDone(Date.now() - started)) {
        setGaveUp(true);
        return;
      }
      timer = setTimeout(tick, PAY_POLL_MS);
    };
    timer = setTimeout(tick, PAY_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [polling, token]);

  if (load.kind === "loading") return <div aria-label={t("share.loading")} className="h-64 animate-pulse rounded-2xl bg-zinc-100" />;
  if (load.kind === "missing" || screen === "missing") return <PayLinkInactive />;
  if (load.kind === "failed") {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
        <p role="alert" className={`rounded-md border p-3 text-sm ${toneClass("urgent")}`}>
          {t(load.key)}
        </p>
        <button
          type="button"
          className={buttonClass("secondary")}
          onClick={() => {
            setLoad({ kind: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          {t("payments.retry")}
        </button>
      </div>
    );
  }
  if (view === null || screen === null) return null;
  return <PayPage token={token} view={view} screen={screen} returned={returned} gaveUp={gaveUp} onScreen={setForced} />;
}

function PayPage({
  token,
  view,
  screen,
  returned,
  gaveUp,
  onScreen,
}: {
  token: string;
  view: PayLinkView;
  screen: PayLinkScreen;
  returned: boolean;
  gaveUp: boolean;
  onScreen: (screen: PayLinkScreen) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  // The browser's Back button from ECPay restores this page as it was; it must not stay stuck on "Opening ECPay…".
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const who = view.studentName ?? t("share.yourStudent");
  const pass = t("payments.passFor", { year: view.entryYear });
  const until = fmtPassDate(view.until, locale);

  const pay = async () => {
    if (!consent || busy) return;
    setBusy(true);
    setError(null);
    // Remembered before the browser leaves for ECPay, so the page knows it is the way back. Put back if nothing was sent.
    const previous = readStarted(token);
    writeStarted(token, String(Date.now()));
    try {
      await startPayLinkCheckout(token);
      // The browser is on its way to ECPay; the button stays busy until it leaves (or the page is shown again, see above).
    } catch (e) {
      writeStarted(token, previous);
      setBusy(false);
      const failure = checkoutFailure(e);
      if ("screen" in failure) onScreen(failure.screen);
      else setError(failure.error);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 py-4">
      <header>
        <p className="text-sm font-semibold text-zinc-500">{t("payments.parent.kicker")}</p>
        <h1 className="font-display text-3xl font-bold">{t("payments.parent.ask", { who, pass })}</h1>
      </header>

      {(screen === "ready" || screen === "closed") && (
        <section className="rounded-2xl border border-zinc-200 p-5">
          <p className="text-sm font-semibold text-zinc-500">{pass}</p>
          <p className="mt-1 text-3xl font-bold">{t("payments.price", { price: view.amountTwd })}</p>
          <p className="text-sm text-zinc-500">{t("payments.priceNote")}</p>
          <p className="mt-3 text-sm">
            {view.from > taipeiToday()
              ? t("payments.startsOn", { from: fmtPassDate(view.from, locale), until })
              : t("payments.startsNow", { until })}
          </p>
        </section>
      )}

      {screen === "paid" && (
        <div role="status" className={`space-y-1 rounded-2xl border p-5 ${toneClass("done")}`}>
          <p className="text-lg font-semibold">{t("payments.parent.paidTitle")}</p>
          <p className="text-sm">{t("payments.parent.paidBody", { pass, until })}</p>
        </div>
      )}

      {screen === "expired" && (
        <div role="status" className={`space-y-1 rounded-2xl border p-5 ${toneClass("soon")}`}>
          <p className="text-lg font-semibold">{t("payments.parent.expiredTitle")}</p>
          <p className="text-sm">{t("payments.parent.expiredBody")}</p>
        </div>
      )}

      {screen === "unavailable" && (
        <div role="status" className={`rounded-2xl border p-5 text-sm ${toneClass("soon")}`}>
          <p>{t("payments.parent.unavailable")}</p>
        </div>
      )}

      {screen === "closed" && (
        <div role="status" className={`space-y-1 rounded-2xl border p-5 ${toneClass("neutral")}`}>
          <p className="text-lg font-semibold">{t("payments.opensSoon")}</p>
          <p className="text-sm">{t("payments.error.closed")}</p>
        </div>
      )}

      {screen === "ready" && (
        <>
          {returned && (
            <p role="status" className={`rounded-md border p-3 text-sm ${toneClass("progress")}`}>
              {gaveUp ? t("payments.parent.waiting") : t("payments.order.confirming")}
            </p>
          )}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void pay();
            }}
          >
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{t("payments.consent")}</span>
            </label>
            <button type="submit" className={`${buttonClass("primary")} w-full sm:w-auto`} disabled={!consent || busy}>
              {busy ? t("payments.paying") : t("payments.pay", { price: view.amountTwd })}
            </button>
            {error && (
              <p role="alert" className={`rounded-md border p-2 text-sm ${toneClass("urgent")}`}>
                {t(error)}
              </p>
            )}
            <p className="text-xs text-zinc-500">{t("payments.parent.noAccount")}</p>
          </form>
        </>
      )}

      <div className="space-y-1 text-xs text-zinc-500">
        <p>
          {t("payments.methods")} {t("payments.refundLine")}
        </p>
        <PaymentContact />
      </div>
    </div>
  );
}
