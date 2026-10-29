"use client";

import { useEffect, useState } from "react";
import {
  CodeInput,
  DIALOG_ERROR,
  GroupCheck,
  MessageLine,
  NewPassphraseFields,
  PassInput,
  RecoveryCodeView,
  StartOver,
  useNewPassphrase,
  useRunner,
  type Msg,
} from "@/components/VaultDialogs";
import { useT } from "@/lib/i18n/client";
import {
  changePassphrase,
  commitRecovery,
  loadSlots,
  lock,
  openVaultDialog,
  prepareRecovery,
  useVault,
  type PreparedRecovery,
} from "@/lib/portal-vault-client";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

type Part = "change" | "code" | "reset";

/**
 * Settings > Saved passwords: whether the vault is set up and open in this tab, and the ways to change it (passphrase,
 * recovery code, lock, start over). Each part is mounted only while it is open, so a typed secret or a prepared code
 * goes away when it closes.
 */
export function VaultSettings() {
  const t = useT();
  const vault = useVault();
  const student = useStudent();
  const email = student.auth?.email ?? null;
  const [open, setOpen] = useState<Part | null>(null);
  const [done, setDone] = useState<Msg | null>(null);
  useEffect(() => {
    void loadSlots();
  }, []);

  const hasVault = vault.lock === "locked" || vault.lock === "unlocked";
  const ready = vault.status === "ready" || hasVault;
  const toggle = (part: Part) => {
    setDone(null);
    setOpen((cur) => (cur === part ? null : part));
  };
  const finish = (msg: Msg) => {
    setOpen(null);
    setDone(msg);
  };

  let status: React.ReactNode;
  if (vault.status === "unavailable") status = <p className="text-sm text-zinc-700">{t("portals.passwordUnavailable")}</p>;
  else if (vault.lock === "unknown" && vault.status === "error")
    status = (
      <>
        <p className="text-sm text-zinc-700">{t("settings.vault.statusError")}</p>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => void loadSlots()}>
          {t("portals.vault.retry")}
        </button>
      </>
    );
  else if (vault.lock === "unknown") status = <p className="text-sm text-zinc-500">{t("settings.vault.checking")}</p>;
  else if (vault.lock === "none")
    status = (
      <>
        <p className="text-sm text-zinc-700">{t("settings.vault.statusNone")}</p>
        <button type="button" className={buttonClass("primary", "sm")} onClick={() => openVaultDialog("setup")}>
          {t("portals.vault.setUp")}
        </button>
      </>
    );
  else if (vault.lock === "locked")
    status = (
      <>
        <p className="text-sm text-zinc-700">{t("settings.vault.statusLocked")}</p>
        <button type="button" className={buttonClass("primary", "sm")} onClick={() => openVaultDialog("unlock")}>
          {t("portals.vault.unlock")}
        </button>
      </>
    );
  else
    status = (
      <>
        <p className="text-sm text-zinc-700">{t("settings.vault.statusUnlocked")}</p>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => lock()}>
          {t("settings.vault.lockNow")}
        </button>
      </>
    );

  const partButton = (part: Part, label: string) => (
    <button
      type="button"
      aria-expanded={open === part}
      className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-semibold hover:text-blue-700"
      onClick={() => toggle(part)}
    >
      {label}
      <span aria-hidden className="text-zinc-400">
        {open === part ? "▾" : "▸"}
      </span>
    </button>
  );

  return (
    <section id="passwords" aria-labelledby="passwords-heading" className="scroll-mt-4 rounded-2xl border border-zinc-200 p-6">
      <h2 id="passwords-heading" className="mb-1 text-xl font-bold">
        {t("settings.vault.title")}
      </h2>
      <p className="mb-3 text-sm text-zinc-500">{t("settings.vault.intro")}</p>
      <div className="flex flex-wrap items-center gap-3">{status}</div>
      {vault.legacy > 0 && (
        <p className="mt-2 text-sm text-zinc-700">
          {vault.legacy === 1 ? t("settings.vault.legacyOne", { n: vault.legacy }) : t("settings.vault.legacyMany", { n: vault.legacy })}
        </p>
      )}
      {done && (
        <div className="mt-3">
          <MessageLine msg={done} />
        </div>
      )}
      {/* Without a vault, only rows nobody can open (which block a new vault) need "start over"; old rows waiting to move don't. */}
      {ready && (hasVault || vault.other.size > 0) && (
        <div className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100">
          {hasVault && (
            <div>
              {partButton("change", t("settings.vault.change"))}
              {open === "change" && <ChangePassphrase email={email} onDone={() => finish({ key: "settings.vault.changeDone", ok: true })} />}
            </div>
          )}
          {hasVault && (
            <div>
              {partButton("code", t("settings.vault.newCode"))}
              {open === "code" && <NewRecoveryCode onDone={() => finish({ key: "settings.vault.codeDone", ok: true })} />}
            </div>
          )}
          <div>
            {partButton("reset", t("portals.vault.reset.title"))}
            {open === "reset" && (
              <div className="space-y-2 pb-4">
                <p className="text-sm font-medium text-zinc-700">{t("settings.vault.startOverNote")}</p>
                <StartOver onDone={() => finish({ key: "settings.vault.resetDone", ok: true })} />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// Proved by the current passphrase or the recovery code; the saved passwords stay as they are.
function ChangePassphrase({ email, onDone }: { email: string | null; onDone: () => void }) {
  const t = useT();
  const [useCode, setUseCode] = useState(false);
  const [current, setCurrent] = useState("");
  const [code, setCode] = useState("");
  const np = useNewPassphrase(email);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [uncertain, setUncertain] = useState(false); // an earlier try may have gone through
  const { busy, run } = useRunner();

  const submit = () =>
    run(async () => {
      const proof = useCode ? code.trim() : current;
      if (!proof) return;
      const bad = np.check();
      if (bad) return setMsg(bad);
      setMsg(null);
      const r = await changePassphrase(useCode ? { recovery: code } : { passphrase: current }, np.first);
      if (r === null) return onDone();
      // After an unconfirmed try, the old passphrase failing most likely means that try went through.
      if (r === "wrong" && uncertain && !useCode) return setMsg({ key: "settings.vault.changeMaybeDone" });
      if (r === "wrong") return setMsg({ key: useCode ? "portals.vault.unlock.wrongCode" : "portals.vault.unlock.wrong" });
      // The new passphrase may be live already (only the reply lost): keep everything typed and offer the same step again.
      if (r === "failed") {
        setUncertain(true);
        return setMsg({ key: "settings.vault.changeUnconfirmed" });
      }
      setMsg({ key: DIALOG_ERROR[r] });
    });

  const ready = (useCode ? !!code.trim() : !!current) && !!np.first && !!np.second;
  return (
    <form
      className="space-y-3 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-sm text-zinc-700">{t("settings.vault.changeIntro")}</p>
      {useCode ? (
        <CodeInput label={t("portals.vault.unlock.codeLabel")} value={code} onChange={setCode} />
      ) : (
        <PassInput label={t("settings.vault.current")} value={current} onChange={setCurrent} autoComplete="current-password" />
      )}
      <button
        type="button"
        className={buttonClass("quiet", "sm")}
        disabled={busy}
        onClick={() => {
          setUseCode((v) => !v);
          setMsg(null);
        }}
      >
        {useCode ? t("settings.vault.usePassphrase") : t("settings.vault.useCode")}
      </button>
      <NewPassphraseFields np={np} />
      <MessageLine msg={msg} />
      <button type="submit" className={buttonClass("primary", "sm")} disabled={busy || !ready}>
        {busy ? t("settings.vault.changing") : t("settings.vault.change")}
      </button>
    </form>
  );
}

// Passphrase -> a new code made in memory (prepareRecovery) -> shown -> one group typed back -> stored (commitRecovery).
// Until it is stored the old code is the only one that works. A "failed" store may have landed after all, so the code
// stays on screen and the same step can be tried again.
function NewRecoveryCode({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [passphrase, setPassphrase] = useState("");
  const [prepared, setPrepared] = useState<PreparedRecovery | null>(null);
  const [step, setStep] = useState<"passphrase" | "show" | "check">("passphrase");
  const [typed, setTyped] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const { busy, run } = useRunner();

  const begin = () =>
    run(async () => {
      if (!passphrase) return;
      setMsg(null);
      const r = await prepareRecovery(passphrase);
      if (r === "wrong") return setMsg({ key: "portals.vault.unlock.wrong" });
      if (r === "locked") return setMsg({ key: "portals.vault.err.locked" });
      if (typeof r === "string") return setMsg({ key: DIALOG_ERROR[r] });
      setPassphrase("");
      setPrepared(r);
      setTyped("");
      setStep("show");
    });

  const confirm = () =>
    run(async () => {
      if (!prepared) return;
      setMsg(null);
      const r = await commitRecovery(prepared, typed);
      if (r === null) return onDone();
      if (r === "group_mismatch") return setMsg({ key: "portals.vault.check.mismatch", vars: { n: prepared.confirmGroup } });
      if (r === "changed") {
        // The vault moved on meanwhile: this code was not stored and the old one still works. Make a new one.
        setPrepared(null);
        setTyped("");
        setStep("passphrase");
        return setMsg({ key: "settings.vault.codeChanged" });
      }
      if (r === "failed") {
        setUnconfirmed(true);
        return setMsg({ key: "settings.vault.codeUnconfirmed" });
      }
      setMsg({ key: DIALOG_ERROR[r] });
    });

  if (prepared && unconfirmed) {
    return (
      <div className="space-y-3 pb-4">
        <RecoveryCodeView code={prepared.recoveryCode} />
        <MessageLine msg={msg} />
        <button type="button" className={buttonClass("primary", "sm")} disabled={busy} onClick={() => void confirm()}>
          {busy ? t("common.saving") : t("portals.vault.retry")}
        </button>
      </div>
    );
  }
  if (prepared && step === "show") {
    return (
      <div className="space-y-3 pb-4">
        <RecoveryCodeView code={prepared.recoveryCode} />
        <button
          type="button"
          className={buttonClass("primary", "sm")}
          onClick={() => {
            setMsg(null);
            setStep("check");
          }}
        >
          {t("portals.vault.code.saved")}
        </button>
      </div>
    );
  }
  if (prepared && step === "check") {
    return (
      <div className="space-y-3 pb-4">
        <GroupCheck
          group={prepared.confirmGroup}
          value={typed}
          onChange={setTyped}
          busy={busy}
          submitLabel={t("settings.vault.saveCode")}
          busyLabel={t("common.saving")}
          onBack={() => {
            setMsg(null);
            setStep("show");
          }}
          onSubmit={() => void confirm()}
        />
        <MessageLine msg={msg} />
      </div>
    );
  }
  return (
    <form
      className="space-y-3 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        void begin();
      }}
    >
      <p className="text-sm text-zinc-700">{t("settings.vault.newCodeIntro")}</p>
      <PassInput label={t("portals.vault.pass.label")} value={passphrase} onChange={setPassphrase} autoComplete="current-password" />
      <MessageLine msg={msg} />
      <button type="submit" className={buttonClass("primary", "sm")} disabled={busy || !passphrase}>
        {busy ? t("settings.vault.checking") : t("settings.vault.makeCode")}
      </button>
    </form>
  );
}
