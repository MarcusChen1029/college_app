"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/client";
import { formatCode } from "@/lib/join-codes";
import { buttonClass } from "@/lib/ui";

/**
 * A join code on the whole screen, for a projector (spec 5.3): the code in very large type and the invite link under it.
 * Esc, the Close button or a click on the backdrop closes it. `label` is the class name; without it the code is the
 * one-on-one code. `url` is built by the caller from the page's own address at the moment of the click. Mount it only
 * while it should be open (it opens itself on mount, like Modal).
 */
export function ShowCodeDialog({ code, url, label, onClose }: { code: string; url: string; label?: string; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);

  // No close() on cleanup: it would fire onClose when React re-runs effects in development, and unmounting removes the dialog anyway.
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="show-code-title"
      className="m-0 h-dvh max-h-none w-dvw max-w-none overflow-auto bg-white p-0 text-ink backdrop:bg-white"
      onClose={onClose}
    >
      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <button type="button" className={`${buttonClass("secondary", "md")} absolute right-4 top-4`} onClick={() => ref.current?.close()}>
          {t("common.close")}
        </button>
        <h2 id="show-code-title" className="max-w-4xl font-display text-2xl font-bold [overflow-wrap:anywhere] sm:text-4xl">
          {label ? t("classroom.invite.showClass", { name: label }) : t("classroom.invite.showTitle")}
        </h2>
        {/* The code on its own line, wide-tracked and sized to the screen; it never wraps in the middle of a character. */}
        <p className="font-display text-[clamp(2.25rem,12.5vw,14rem)] font-bold leading-none tracking-[0.1em] whitespace-nowrap tabular-nums">
          {formatCode(code)}
        </p>
        <p className="max-w-4xl text-xl text-zinc-700 [overflow-wrap:anywhere] sm:text-3xl">{url}</p>
        <p className="max-w-2xl text-base text-zinc-600 sm:text-lg">{t("classroom.invite.showHint")}</p>
      </div>
    </dialog>
  );
}
