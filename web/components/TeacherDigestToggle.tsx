"use client";

import { useEffect, useState } from "react";
import { getMyDigest, setMyDigest } from "@/lib/digest-api";
import { useStudent } from "@/lib/student-store";

/** Settings switch for the opt-in weekly email summary. Renders nothing unless signed in as a teacher. */
export function TeacherDigestToggle() {
  const student = useStudent();
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
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={enabled === true} disabled={enabled === null || busy} onChange={(e) => void toggle(e.target.checked)} />
        <span>
          Email me a weekly summary of students who need attention
          <span className="block text-xs text-zinc-500">
            Once a week, if any of your linked students has a task from you that is overdue or due in the next 7 days, or a college application
            deadline in the next 7 days they haven&apos;t submitted. It lists each student&apos;s name with those tasks and deadlines, nothing else.
            Nothing is sent in a week with nothing to report. Off unless you turn it on, and you can turn it off here at any time.
          </span>
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
