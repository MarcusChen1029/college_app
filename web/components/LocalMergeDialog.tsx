"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { useT } from "@/lib/i18n/client";
import { loadSlots, openVaultDialog, useVault } from "@/lib/portal-vault-client";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

// Asked after sign-in when this browser still holds data saved while signed out (mounted once in the root layout).
// Nothing is merged until the student picks "Add to this account"; "Don't add" deletes the browser's copy;
// "Not now" (or closing) keeps it here and asks again on the next page load.
export function LocalMergeDialogHost() {
  const t = useT();
  const student = useStudent();
  const [failed, setFailed] = useState(0); // passwords that couldn't be moved, reported after "Add"
  const found = student.localFound;
  // "This device only": passwords go into this device's store, not the vault.
  const device = student.profile.passwordStorage === "device";

  if (failed > 0) return <PasswordsWaiting n={failed} device={device} onClose={() => setFailed(0)} />;
  if (!found) return null;

  const passwords = (n: number) =>
    device
      ? t(n === 1 ? "signIn.merge.passwordsDeviceOne" : "signIn.merge.passwordsDeviceMany", { n })
      : t(n === 1 ? "signIn.merge.passwordsOne" : "signIn.merge.passwordsMany", { n });
  const items = [
    found.colleges > 0 && (found.colleges === 1 ? t("signIn.merge.collegesOne", { n: found.colleges }) : t("signIn.merge.collegesMany", { n: found.colleges })),
    found.logins > 0 && (found.logins === 1 ? t("signIn.merge.loginsOne", { n: found.logins }) : t("signIn.merge.loginsMany", { n: found.logins })),
    found.passwords > 0 && passwords(found.passwords),
    t("signIn.merge.other"),
  ].filter((x): x is string => !!x);

  return (
    <Modal
      title={<h2 className="font-display text-lg font-bold">{t("signIn.merge.title")}</h2>}
      onClose={() => student.keepLocalForLater()}
      className="w-[min(30rem,calc(100vw-2rem))]"
    >
      <div className="space-y-3 text-sm text-zinc-700">
        <p>{t("signIn.merge.intro")}</p>
        <ul className="list-disc space-y-1 pl-5">
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="text-xs text-zinc-500">{t("signIn.merge.help")}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className={buttonClass("primary", "sm")}
            onClick={async () => {
              const r = await student.addLocalData();
              if (r.passwordsFailed > 0) setFailed(r.passwordsFailed);
            }}
          >
            {t("signIn.merge.add")}
          </button>
          <button type="button" className={buttonClass("secondary", "sm")} onClick={() => window.confirm(t("signIn.merge.discardConfirm")) && student.discardLocalData()}>
            {t("signIn.merge.discard")}
          </button>
          <button type="button" className={buttonClass("quiet", "sm")} onClick={() => student.keepLocalForLater()}>
            {t("signIn.merge.later")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// After "Add": the passwords that are not in the account yet. They stay in this browser and move into the vault once it
// is unlocked (or set up), so this offers that step right away. In device mode there is no vault to open: the ones left
// are those this device already holds a different password for, or that this browser couldn't store.
function PasswordsWaiting({ n, device: deviceProfile, onClose }: { n: number; device: boolean; onClose: () => void }) {
  const t = useT();
  const vault = useVault();
  useEffect(() => {
    void loadSlots();
  }, []);
  const device = deviceProfile || vault.mode === "device";
  const next = device ? null : vault.lock === "none" ? "setup" : vault.lock === "locked" ? "unlock" : null;
  const text = device
    ? t(n === 1 ? "signIn.merge.failedDeviceOne" : "signIn.merge.failedDeviceMany", { n })
    : t(n === 1 ? "signIn.merge.failedOne" : "signIn.merge.failedMany", { n });
  return (
    <Modal title={<h2 className="font-display text-lg font-bold">{t("signIn.merge.failedTitle")}</h2>} onClose={onClose} className="w-[min(28rem,calc(100vw-2rem))]">
      <div className="space-y-3">
        <p className="text-sm text-zinc-700">{text}</p>
        {next && (
          <button
            type="button"
            className={buttonClass("primary", "sm")}
            onClick={() => {
              onClose();
              openVaultDialog(next);
            }}
          >
            {next === "setup" ? t("portals.vault.setUp") : t("portals.vault.unlockVault")}
          </button>
        )}
      </div>
    </Modal>
  );
}
