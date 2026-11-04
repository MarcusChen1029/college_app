"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { buttonClass } from "@/lib/ui";

/** The first load failed, so there is nothing to show yet: the reason (already in the reader's language) and a retry. */
export function LoadFailed({ error, onRetry }: { error: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="max-w-xl space-y-3">
      <p role="alert" className="text-sm text-urgent">
        {error}
      </p>
      <button type="button" className={buttonClass("secondary", "sm")} onClick={onRetry}>
        {t("classroom.retry")}
      </button>
    </div>
  );
}

/** A page whose class, task or teacher the student does not have (left, archived, a wrong link): what it is and the way back. */
export function NotAvailable({ title, body }: { title: string; body: string }) {
  const t = useT();
  return (
    <div className="max-w-xl space-y-3">
      <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
      <p className="text-base text-ink">{body}</p>
      <Link href="/counselor" className={buttonClass("secondary", "sm")}>
        {t("classroom.back.classes")}
      </Link>
    </div>
  );
}

/** The failure line above a loaded page: a write that failed, or a reload that did (with a retry for the reload). */
export function PageProblem({ actionError, loadError, onRetry }: { actionError: string | null; loadError: string | null; onRetry: () => void }) {
  const t = useT();
  if (!actionError && !loadError) return null;
  return (
    <p role="alert" className="text-sm text-urgent">
      {actionError ?? loadError}
      {!actionError && (
        <>
          {" "}
          <button type="button" className="font-semibold underline underline-offset-4" onClick={onRetry}>
            {t("classroom.retry")}
          </button>
        </>
      )}
    </p>
  );
}
