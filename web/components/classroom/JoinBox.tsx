"use client";

import { useEffect, useRef, useState } from "react";
import type { TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { isPlausibleCode, normalizeCode, type CodeError, type CodePreview, type CodeResult } from "@/lib/join-codes";
import { previewCode, redeemCode } from "@/lib/links-api";
import { buttonClass } from "@/lib/ui";

/** lib/join-codes.ts codeErrorMessage, in the visitor's language. */
function codeError(t: TFunction, error: CodeError): string {
  if (error === "rate_limited") return t("classroom.join.rateLimited");
  if (error === "invalid") return t("classroom.join.invalid");
  return t("common.tryAgain");
}

const INVALID: CodeResult = { ok: false, error: "invalid" };

/** Asks the database about a code. A code that cannot be one is answered here, without a round trip. */
async function lookUp(code: string): Promise<CodeResult> {
  return isPlausibleCode(code) ? previewCode(code) : INVALID;
}

/**
 * "Join with a code" for a student: type a code, see who it belongs to and what they will see, then confirm.
 * `initialCode` fills the box; with `autoPreview` it is looked up on mount (an invite link). `onPreview` gets every
 * answer to a code check, `onCancel` runs when the student backs out of a preview, `onJoined` after a successful join.
 */
export function JoinBox({
  initialCode = "",
  autoPreview = false,
  onJoined,
  onPreview,
  onCancel,
}: {
  initialCode?: string;
  autoPreview?: boolean;
  onJoined: () => void;
  onPreview?: (result: CodeResult) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const [code, setCode] = useState(initialCode);
  // The code that was previewed travels with the preview, so "Confirm" can only redeem what the student was shown.
  const [preview, setPreview] = useState<{ code: string; data: CodePreview } | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(autoPreview && initialCode.trim() !== "");

  /** Shows the answer to a code check and tells the parent. */
  function finishPreview(raw: string, res: CodeResult) {
    setBusy(false);
    if (res.ok) setPreview({ code: normalizeCode(raw), data: res.preview });
    else setJoinError(codeError(t, res.error));
    onPreview?.(res);
  }

  // An invite link opens with its code already in the box: look it up once (a second run of the effect, in development, must not ask again).
  const asked = useRef(false);
  const latest = useRef(finishPreview);
  useEffect(() => {
    latest.current = finishPreview;
  });
  useEffect(() => {
    if (!autoPreview || initialCode.trim() === "" || asked.current) return;
    asked.current = true;
    void lookUp(initialCode).then((res) => latest.current(initialCode, res));
  }, [autoPreview, initialCode]);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(null);
    setPreview(null);
    setBusy(true);
    finishPreview(code, await lookUp(code));
  }

  async function join() {
    if (!preview) return;
    setBusy(true);
    const res = await redeemCode(preview.code);
    setPreview(null);
    setBusy(false);
    if (res.ok) {
      setCode("");
      onJoined();
    } else {
      setJoinError(codeError(t, res.error));
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void check(e)} className="flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 text-sm font-semibold text-ink">
          {t("classroom.join.codeLabel")}
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="mt-1.5 block h-10 w-full rounded-xl border border-zinc-300 bg-white px-3.5 text-base font-semibold uppercase tracking-widest text-ink placeholder:font-normal placeholder:text-zinc-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="XXXX-XXXX"
          />
        </label>
        <button type="submit" disabled={busy || code.trim() === ""} className={buttonClass("primary", "sm")}>
          {t("classroom.join.check")}
        </button>
      </form>
      {joinError && (
        <p role="alert" className="text-sm text-urgent">
          {joinError}
        </p>
      )}

      {preview && (
        <div className="space-y-3 rounded-2xl bg-blue-50 p-5">
          <p className="font-semibold">
            {preview.data.teacherName}
            {preview.data.school ? ` (${preview.data.school})` : ""}{" "}
            <span className="font-normal">
              {preview.data.className ? t("classroom.join.inClass", { name: preview.data.className }) : t("classroom.join.oneOnOne")}
            </span>
          </p>
          {preview.data.alreadyLinked && (
            <p className="text-sm">
              {t("classroom.join.already", { name: preview.data.teacherName })}
              {preview.data.className ? t("classroom.join.alreadyClass") : t("classroom.join.alreadyEnd")}
            </p>
          )}
          <p className="text-sm text-zinc-700">{t("classroom.join.whatTheySee")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={buttonClass("primary", "sm")} onClick={() => void join()}>
              {t("classroom.join.confirm")}
            </button>
            <button
              type="button"
              disabled={busy}
              className={buttonClass("secondary", "sm")}
              onClick={() => {
                setPreview(null);
                onCancel?.();
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
