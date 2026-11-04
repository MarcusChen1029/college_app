"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/Modal";
import { errorText } from "@/components/TeacherText";
import { NAME_LIMITS } from "@/lib/classroom";
import { useT } from "@/lib/i18n/client";
import { createClass } from "@/lib/links-api";
import { buttonClass, FIELD_CLASS } from "@/lib/ui";

/**
 * The "Create class" form as a dialog: a class name (required) and an optional school year, then Create. The server makes
 * the class and its join code. `onCreated` runs after it went through (the caller closes this and reloads); `onCancel`
 * runs on Cancel, the close button and Esc. Everything is disabled while the save runs. Mount it only while it should be open.
 */
export function NewClassDialog({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const t = useT();
  const uid = useId();
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const n = name.trim();
    if (!n) return setError(t("teacher.classes.giveName"));
    setBusy(true);
    setError(null);
    try {
      await createClass(n, year.trim() || undefined);
    } catch (err) {
      setError(errorText(t, err instanceof Error ? err.message : "Something went wrong. Please try again."));
      setBusy(false);
      return;
    }
    setBusy(false);
    onCreated();
  }

  return (
    <Modal title={<h2 className="text-lg font-semibold">{t("teacher.classes.newHeading")}</h2>} onClose={onCancel} locked={busy} className="w-[min(28rem,calc(100vw-2rem))]">
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <div className="space-y-1">
            <label htmlFor={`${uid}-name`} className="block text-sm font-medium">
              {t("teacher.classes.className")}
            </label>
            <input
              id={`${uid}-name`}
              value={name}
              maxLength={NAME_LIMITS.className}
              autoComplete="off"
              className={`${FIELD_CLASS} w-full`}
              placeholder={t("teacher.classes.classPlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${uid}-year`} className="block text-sm font-medium">
              {t("teacher.classes.schoolYear")} <span className="font-normal text-zinc-600">({t("common.optional")})</span>
            </label>
            <input id={`${uid}-year`} value={year} autoComplete="off" className={`${FIELD_CLASS} w-full`} placeholder="2026-27" onChange={(e) => setYear(e.target.value)} />
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-urgent">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} className={buttonClass("quiet", "sm")} onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>
            {busy ? t("common.saving") : t("teacher.classes.create")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
