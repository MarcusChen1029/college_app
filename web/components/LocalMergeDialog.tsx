"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { useT } from "@/lib/i18n/client";
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

  if (failed > 0) {
    return (
      <Modal title={<h2 className="font-display text-lg font-bold">{t("signIn.merge.failedTitle")}</h2>} onClose={() => setFailed(0)} className="w-[min(28rem,calc(100vw-2rem))]">
        <p className="text-sm text-zinc-700">{failed === 1 ? t("signIn.merge.failedOne", { n: failed }) : t("signIn.merge.failedMany", { n: failed })}</p>
      </Modal>
    );
  }
  if (!found) return null;

  const items = [
    found.colleges > 0 && (found.colleges === 1 ? t("signIn.merge.collegesOne", { n: found.colleges }) : t("signIn.merge.collegesMany", { n: found.colleges })),
    found.logins > 0 && (found.logins === 1 ? t("signIn.merge.loginsOne", { n: found.logins }) : t("signIn.merge.loginsMany", { n: found.logins })),
    found.passwords > 0 && (found.passwords === 1 ? t("signIn.merge.passwordsOne", { n: found.passwords }) : t("signIn.merge.passwordsMany", { n: found.passwords })),
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
