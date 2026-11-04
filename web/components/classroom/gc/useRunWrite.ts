"use client";

import { useCallback, useState } from "react";
import type { Run } from "@/components/TeacherClassCard";
import { errorText } from "@/components/TeacherText";
import { useT } from "@/lib/i18n/client";

/**
 * The teacher class screens' way of doing a write (archive, new code, code off...): `run(fn, then)` sets `busy`, clears
 * the last `error`, awaits `fn`, reloads the page's data (and waits for it), and finally calls `then` (for example to put focus back on a
 * card that took the place of a removed one). A failure becomes `error`, in the reader's language, and nothing reloads.
 */
export function useRunWrite(reload: () => void | Promise<void>): { busy: boolean; error: string | null; run: Run } {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run: Run = useCallback(
    (fn, then) => {
      void (async () => {
        setBusy(true);
        setError(null);
        try {
          await fn();
          await reload();
        } catch (e) {
          setError(errorText(t, e instanceof Error ? e.message : "Something went wrong. Please try again."));
        } finally {
          setBusy(false);
        }
        then?.();
      })();
    },
    [reload, t],
  );

  return { busy, error, run };
}
