"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { useT } from "@/lib/i18n/client";
import { STORAGE_KEY as QUIZ_KEY } from "@/lib/interest-quiz";
import { LEGACY_KEY, MOVE_KEY } from "@/lib/student-local";
import { useStudent } from "@/lib/student-store";
import { browserSupabase } from "@/lib/supabase-browser";
import { buttonClass } from "@/lib/ui";

const CONFIRM = "DELETE"; // must match DELETE_CONFIRMATION in lib/account-server.ts
// What this browser keeps for the student: the signed-out copy (student-store.ts), its legacy passwords, the agreement to
// move them into the vault (slots only) and the quiz answers.
const LOCAL_KEYS = ["college-tracker:v1", LEGACY_KEY, MOVE_KEY, QUIZ_KEY];

/** Settings > Delete account: the student or teacher removes the account and all its data (POST /api/account/delete). */
export function DeleteAccount() {
  const t = useT();
  const student = useStudent();
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const remove = async () => {
    setBusy(true);
    setFailed(false);
    const { data } = await browserSupabase().auth.getSession();
    const token = data.session?.access_token;
    const res = token
      ? await fetch("/api/account/delete", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: CONFIRM }),
        }).catch(() => null)
      : null;
    if (!res?.ok) {
      setBusy(false);
      setFailed(true);
      return;
    }
    try {
      // Old-build passwords waiting here (LEGACY_KEY) go too, so the next sign-in in this browser can't take them.
      for (const k of LOCAL_KEYS) window.localStorage.removeItem(k);
    } catch {
      // storage blocked: nothing saved there either
    }
    await student.signOut().catch(() => {});
    router.replace("/");
  };

  return (
    <SettingsRow headingId="delete-heading" title={t("settings.delete.title")} description={<p>{t("settings.delete.body")}</p>}>
      <label className="block text-sm">
        <span className="font-semibold text-ink">{t("settings.delete.prompt")}</span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="mt-1.5 block h-10 w-56 max-w-full rounded-xl border border-zinc-300 bg-white px-3.5 text-base text-ink focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </label>
      <button className={`mt-4 ${buttonClass("danger", "sm")}`} disabled={typed.trim() !== CONFIRM || busy} onClick={remove}>
        {busy ? t("settings.delete.busy") : t("settings.delete.button")}
      </button>
      {failed && (
        <p role="alert" className="mt-3 text-sm text-urgent">
          {t("settings.delete.failed")}
        </p>
      )}
    </SettingsRow>
  );
}
