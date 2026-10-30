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
import { SettingsRow } from "@/components/settings/SettingsRow";
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
  if (vault.status === "unavailable") status = <p className="text-base text-ink">{t("portals.passwordUnavailable")}</p>;
  else if (vault.lock === "unknown" && vault.status === "error")
    status = (
      <>
        <p className="text-base text-ink">{t("settings.vault.statusError")}</p>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => void loadSlots()}>
          {t("portals.vault.retry")}
        </button>
      </>
    );
  else if (vault.lock === "unknown") status = <p className="text-base text-zinc-600">{t("settings.vault.checking")}</p>;
  else if (vault.lock === "none")
    status = (
      <>
        <p className="text-base text-ink">{t("settings.vault.statusNone")}</p>
        <button type="button" className={buttonClass("primary", "sm")} onClick={() => openVaultDialog("setup")}>
          {t("portals.vault.setUp")}
        </button>
      </>
    );
  else if (vault.lock === "locked")
    status = (
      <>
        <p className="text-base font-semibold text-ink">{t("settings.vault.statusLocked")}</p>
        <button type="button" className={buttonClass("primary", "sm")} onClick={() => openVaultDialog("unlock")}>
          {t("portals.vault.unlock")}
        </button>
      </>
    );
  else
    status = (
      <>
        <p className="max-w-md text-base text-ink">{t("settings.vault.statusUnlocked")}</p>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => lock()}>
          {t("settings.vault.lockNow")}
        </button>
      </>
    );

  const partButton = (part: Part, label: string) => (
    <button
      type="button"
      aria-expanded={open === part}
      className="flex w-full items-center justify-between gap-3 py-3.5 text-left text-base font-semibold text-ink hover:text-blue-700"
      onClick={() => toggle(part)}
    >
      {label}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`size-5 shrink-0 text-zinc-500 transition-transform ${open === part ? "rotate-90" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );

  return (
    <SettingsRow id="passwords" headingId="passwords-heading" title={t("settings.vault.title")} description={<p>{t("settings.vault.intro")}</p>}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">{status}</div>
      {vault.legacy > 0 && (
        <p className="mt-3 text-sm text-zinc-700">
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
        <div className="mt-5 divide-y divide-zinc-200 border-t border-zinc-200">
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
    </SettingsRow>
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
  // The current passphrase of a try whose result couldn't be confirmed (it may have gone through), until another is used.
  const [uncertainFor, setUncertainFor] = useState<string | null>(null);
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
      // After an unconfirmed try with this very passphrase, it failing now most likely means that try went through.
      if (r === "wrong" && !useCode && uncertainFor === current) return setMsg({ key: "settings.vault.changeMaybeDone" });
      if (r === "wrong") return setMsg({ key: useCode ? "portals.vault.unlock.wrongCode" : "portals.vault.unlock.wrong" });
      // The new passphrase may be live already (only the reply lost): keep everything typed and offer the same step again.
      if (r === "failed") {
        setUncertainFor(useCode ? null : current);
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

// Where the new-code flow is. One value, so a new prepared code always replaces the whole state and no flag of an earlier
// code can outlive it. "retry" = the store of `p` with the group `typed` could not be confirmed (it may have landed).
type CodeFlow =
  | { step: "passphrase" }
  | { step: "show"; p: PreparedRecovery }
  | { step: "check"; p: PreparedRecovery }
  | { step: "retry"; p: PreparedRecovery; typed: string };

// Passphrase -> a new code made in memory (prepareRecovery) -> shown -> one group typed back -> stored (commitRecovery).
// Until it is stored the old code is the only one that works. A "failed" store may have landed after all, so the code
// stays on screen and the same store is offered again, with the same group.
function NewRecoveryCode({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [passphrase, setPassphrase] = useState("");
  const [flow, setFlow] = useState<CodeFlow>({ step: "passphrase" });
  const [typed, setTyped] = useState(""); // the group being typed on the check step
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
      setTyped("");
      setFlow({ step: "show", p: r });
    });

  const store = (p: PreparedRecovery, group: string) =>
    run(async () => {
      setMsg(null);
      const r = await commitRecovery(p, group);
      if (r === null) return onDone();
      if (r === "group_mismatch") {
        // Back to the code itself, so the student can check it against where they saved it.
        setFlow({ step: "show", p });
        return setMsg({ key: "portals.vault.check.mismatch", vars: { n: p.confirmGroup } });
      }
      if (r === "changed") {
        // The vault moved on meanwhile: this code may not be the one that works. Make a new one from the passphrase.
        setTyped("");
        setFlow({ step: "passphrase" });
        return setMsg({ key: "settings.vault.codeChanged" });
      }
      if (r === "failed") {
        setFlow({ step: "retry", p, typed: group });
        return setMsg({ key: "settings.vault.codeUnconfirmed" });
      }
      setMsg({ key: DIALOG_ERROR[r] });
    });

  if (flow.step === "retry") {
    const { p, typed: group } = flow;
    return (
      <div className="space-y-3 pb-4">
        <RecoveryCodeView code={p.recoveryCode} />
        <MessageLine msg={msg} />
        <button type="button" className={buttonClass("primary", "sm")} disabled={busy} onClick={() => void store(p, group)}>
          {busy ? t("common.saving") : t("portals.vault.retry")}
        </button>
      </div>
    );
  }
  if (flow.step === "show") {
    const { p } = flow;
    return (
      <div className="space-y-3 pb-4">
        <RecoveryCodeView code={p.recoveryCode} />
        <MessageLine msg={msg} />
        <button
          type="button"
          className={buttonClass("primary", "sm")}
          onClick={() => {
            setMsg(null);
            setFlow({ step: "check", p });
          }}
        >
          {t("portals.vault.code.saved")}
        </button>
      </div>
    );
  }
  if (flow.step === "check") {
    const { p } = flow;
    return (
      <div className="space-y-3 pb-4">
        <GroupCheck
          group={p.confirmGroup}
          value={typed}
          onChange={setTyped}
          busy={busy}
          submitLabel={t("settings.vault.saveCode")}
          busyLabel={t("common.saving")}
          onBack={() => {
            setMsg(null);
            setFlow({ step: "show", p });
          }}
          onSubmit={() => void store(p, typed)}
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
