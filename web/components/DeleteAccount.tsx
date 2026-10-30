"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { STORAGE_KEY as QUIZ_KEY } from "@/lib/interest-quiz";
import { deleteAccountDevicePasswords } from "@/lib/portal-vault-client";
import { LEGACY_KEY, MOVE_KEY } from "@/lib/student-local";
import { useStudent } from "@/lib/student-store";
import { browserSupabase } from "@/lib/supabase-browser";
import { buttonClass } from "@/lib/ui";

const CONFIRM = "DELETE"; // must match DELETE_CONFIRMATION in lib/account-server.ts
// What this browser keeps for the student: the signed-out copy (student-store.ts), its legacy passwords, the agreement to
// move them into the vault (slots only) and the quiz answers. Device-mode passwords (IndexedDB, per account) are deleted
// separately, for this account only (deleteAccountDevicePasswords).
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
    const userId = data.session?.user.id;
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
    // This account's passwords kept on this device (device mode, or left over) go too; other accounts' stay. When this
    // browser's storage refuses, the student is told how to remove them (before the page moves on).
    if (userId && (await deleteAccountDevicePasswords(userId)) === "unavailable") window.alert(t("settings.delete.deviceLeft"));
    await student.signOut().catch(() => {});
    router.replace("/");
  };

  return (
    <section aria-labelledby="delete-heading" className="space-y-3 rounded-2xl border border-zinc-200 p-6">
      <h2 id="delete-heading" className="text-xl font-bold">{t("settings.delete.title")}</h2>
      <p className="text-sm text-zinc-600">{t("settings.delete.body")}</p>
      <label className="block text-sm">
        <span className="text-zinc-600">{t("settings.delete.prompt")}</span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="mt-1 block w-48 rounded-md border border-zinc-300 px-2 py-1"
        />
      </label>
      <button className={buttonClass("danger")} disabled={typed.trim() !== CONFIRM || busy} onClick={remove}>
        {busy ? t("settings.delete.busy") : t("settings.delete.button")}
      </button>
      {failed && (
        <p role="alert" className="text-sm text-urgent">
          {t("settings.delete.failed")}
        </p>
      )}
    </section>
  );
}
