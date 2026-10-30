"use client";

import { useEffect, useState } from "react";
import { getMyDigest, setMyDigest } from "@/lib/digest-api";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";

/** Settings switch for the opt-in weekly email summary. Renders nothing unless signed in as a teacher. */
export function TeacherDigestToggle() {
  const student = useStudent();
  const t = useT();
  const userId = student.auth?.userId ?? null;
  const teacher = student.role === "teacher";
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !teacher) return;
    let live = true;
    getMyDigest(userId)
      .then((on) => live && setEnabled(on))
      .catch((e: Error) => {
        if (!live) return;
        setEnabled(false);
        setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [userId, teacher]);

  if (!userId || !teacher) return null;

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setMyDigest(next);
      setEnabled(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3 text-base text-ink">
        <input type="checkbox" className="mt-1 size-4 shrink-0 accent-ink" checked={enabled === true} disabled={enabled === null || busy} onChange={(e) => void toggle(e.target.checked)} />
        <span>
          <span className="font-semibold">{t("settings.digestToggle")}</span>
          <span className="mt-0.5 block text-sm text-zinc-600">{t("settings.digestHint")}</span>
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}
        </p>
      )}
    </div>
  );
}
