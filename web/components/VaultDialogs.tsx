"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { downloadText } from "@/lib/download";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { canLock } from "@/lib/one-at-a-time";
import {
  closeVaultDialog,
  commit,
  copyText,
  loadSlots,
  lock,
  moveIntoVault,
  openVaultDialog,
  prepare,
  resetVault,
  unlock,
  useVault,
  type FlowError,
  type LockError,
  type Prepared,
} from "@/lib/portal-vault-client";
import { useStudent } from "@/lib/student-store";
import { buttonClass, toneClass } from "@/lib/ui";
import { formatRecoveryCode, PASSPHRASE_MIN, passphraseProblem, RECOVERY_GROUPS, recoveryGroup } from "@/lib/vault-format";

// The password vault's dialogs (setup in three steps, unlock by passphrase or recovery code), mounted once in the root
// layout and opened with openVaultDialog(). Also the pieces the Settings card reuses: passphrase and code fields, the
// recovery code screens and "start over". A passphrase, a recovery code or a prepared vault lives only in the state of
// the component that shows it and is gone when it closes; nothing here logs, stores or puts one in a URL.

/** A message to show, with its placeholders. */
export type Msg = { key: MessageKey; vars?: Record<string, string | number>; ok?: boolean };

/** What to say for a vault step that came back with an error code (the dialogs and the Settings card). */
export const DIALOG_ERROR: Record<FlowError, MessageKey> = {
  unauthorized: "portals.vault.err.unauthorized",
  unavailable: "portals.passwordUnavailable",
  not_found: "common.tryAgain",
  too_many: "portals.passwordTooMany",
  no_vault: "portals.vault.err.noVaultYet",
  wrong_vault: "portals.vault.err.wrongVault",
  changed: "portals.vault.err.changed",
  exists: "portals.vault.err.exists",
  orphans: "portals.vault.err.orphans",
  bad_record: "portals.vault.err.badRecord",
  // Not the password row's "type it again" text: nothing here is retyped (Setup, Unlock, the Settings card's steps).
  device_mode: "portals.vault.err.deviceNow",
  failed: "portals.passwordError",
};

/**
 * What to say when a step that moves passwords or deletes the old vault didn't run one tab at a time
 * (portal-vault-client.ts locked): this browser has no cross-tab lock, or the step was given up after a request hung.
 */
export const LOCK_ERROR: Record<LockError, MessageKey> = {
  no_locks: "settings.storage.err.noLocks",
  timeout: "settings.storage.err.timeout",
};

/** The word "start over" asks for, the same in every language (like Delete account's). */
export const RESET_WORD = "DELETE";

// 16 px text, so phones don't zoom into the field.
const FIELD = "mt-1 block w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-base";
export const DIALOG_WIDTH = "w-[min(30rem,calc(100vw-2rem))]";

export function MessageLine({ msg }: { msg: Msg | null }) {
  const t = useT();
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-done" : "text-urgent"}`}>
      {t(msg.key, msg.vars)}
    </p>
  );
}

/** One run at a time: a second click (or Enter) while a slow step is still going does nothing. */
export function useRunner() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await f();
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { busy, run };
}

/** A passphrase field: never capitalised, corrected or spell-checked by phone keyboards. */
export function PassInput({
  label,
  value,
  onChange,
  autoComplete,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "new-password" | "current-password";
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <input
        ref={inputRef}
        type="password"
        className={FIELD}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
    </label>
  );
}

/** A recovery code (or one group of it): any spacing, dashes and case are fine, the client reads them all. */
export function CodeInput({ label, value, onChange, inputRef }: { label: string; value: string; onChange: (v: string) => void; inputRef?: React.Ref<HTMLInputElement> }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <input
        ref={inputRef}
        type="text"
        className={`${FIELD} font-mono uppercase tracking-wider`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
      />
    </label>
  );
}

/** A new passphrase typed twice; `check()` says what is wrong with it (passphraseProblem, then the repeat), or null. */
export function useNewPassphrase(email: string | null) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const check = (): Msg | null => {
    const problem = passphraseProblem(first, email);
    if (problem === "too_short") return { key: "portals.vault.pass.tooShort", vars: { n: PASSPHRASE_MIN } };
    if (problem === "is_email") return { key: "portals.vault.pass.isEmail" };
    if (first.normalize("NFC") !== second.normalize("NFC")) return { key: "portals.vault.pass.mismatch" };
    return null;
  };
  const clear = () => {
    setFirst("");
    setSecond("");
  };
  return { first, second, setFirst, setSecond, check, clear };
}

export function NewPassphraseFields({ np, label }: { np: ReturnType<typeof useNewPassphrase>; label?: string }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <PassInput label={label ?? t("portals.vault.pass.new")} value={np.first} onChange={np.setFirst} autoComplete="new-password" />
      <PassInput label={t("portals.vault.pass.repeat")} value={np.second} onChange={np.setSecond} autoComplete="new-password" />
      <p className="text-xs text-zinc-500">{t("portals.vault.pass.rule", { n: PASSPHRASE_MIN })}</p>
    </div>
  );
}

/** Step 2 of setup or of a new code: the code in numbered groups, with Copy and Download. */
export function RecoveryCodeView({ code }: { code: string }) {
  const t = useT();
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const formatted = formatRecoveryCode(code);
  const groups = Array.from({ length: RECOVERY_GROUPS }, (_, i) => recoveryGroup(code, i + 1));
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-700">{t("portals.vault.code.intro")}</p>
      <ol aria-label={t("portals.vault.code.label")} className="grid grid-cols-4 gap-2">
        {groups.map((g, i) => (
          <li key={i} className="rounded-md border border-zinc-300 px-1 py-1.5 text-center">
            <span className="block text-[11px] leading-tight text-zinc-500">{i + 1}</span>
            <span className="font-mono text-base font-semibold tracking-wider">{g}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass("secondary", "sm")} onClick={async () => setCopied((await copyText(formatted)) ? "copied" : "failed")}>
          {copied === "copied" ? t("common.copied") : copied === "failed" ? t("portals.copyFailedShort") : t("common.copy")}
        </button>
        <button
          type="button"
          className={buttonClass("secondary", "sm")}
          onClick={() => downloadText("recovery-code.txt", `${t("portals.vault.code.fileLine")}\n${formatted}\n`, "text/plain;charset=utf-8")}
        >
          {t("portals.vault.code.download")}
        </button>
      </div>
    </div>
  );
}

/** Step 3: the code is hidden and one group of it is typed back, which proves it was saved somewhere. */
export function GroupCheck({
  group,
  value,
  onChange,
  busy,
  submitLabel,
  busyLabel,
  onBack,
  onSubmit,
}: {
  group: number;
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
  submitLabel: string;
  busyLabel: string;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const t = useT();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-sm text-zinc-700">{t("portals.vault.check.intro", { n: group })}</p>
      <CodeInput label={t("portals.vault.check.label", { n: group })} value={value} onChange={onChange} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonClass("primary", "sm")} disabled={busy || !value.trim()}>
          {busy ? busyLabel : submitLabel}
        </button>
        <button type="button" className={buttonClass("quiet", "sm")} disabled={busy} onClick={onBack}>
          {t("portals.vault.check.back")}
        </button>
      </div>
    </form>
  );
}

/**
 * "Delete all saved passwords and start over": typed confirmation, then the vault and every saved password go. Pass the
 * surrounding flow's `runner` so its own buttons wait while this runs (and this waits for them).
 */
export function StartOver({ onDone, runner }: { onDone?: () => void; runner?: ReturnType<typeof useRunner> }) {
  const t = useT();
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<Msg | null>(null);
  const own = useRunner();
  const { busy, run } = runner ?? own;
  // Only ever shown after a click (a Settings part or a dialog), never in the server's HTML, so asking the browser here is safe.
  const locks = canLock();
  const ready = typed.trim() === RESET_WORD && locks;
  const go = () =>
    run(async () => {
      if (!ready) return;
      setMsg(null);
      const err = await resetVault();
      if (err) return setMsg({ key: err === "no_locks" || err === "timeout" ? LOCK_ERROR[err] : DIALOG_ERROR[err] });
      setTyped("");
      onDone?.();
    });
  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-700">{t("portals.vault.reset.body")}</p>
      <label className="block text-sm">
        <span className="text-zinc-600">{t("portals.vault.reset.prompt", { word: RESET_WORD })}</span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="mt-1 block w-48 rounded-md border border-zinc-300 px-2 py-1 text-base"
        />
      </label>
      <button type="button" className={buttonClass("danger", "sm")} disabled={busy || !ready} onClick={() => void go()}>
        {busy ? t("portals.vault.reset.busy") : t("portals.vault.reset.button")}
      </button>
      {!locks && <p className="text-sm font-medium text-zinc-800">{t("settings.storage.err.noLocks")}</p>}
      <MessageLine msg={msg} />
    </div>
  );
}

/** One line while this tab's vault is open, with a Lock button. Device mode has nothing to lock, so nothing shows. */
export function VaultUnlockedBar({ className = "" }: { className?: string }) {
  const t = useT();
  const vault = useVault();
  if (vault.mode === "device" || vault.lock !== "unlocked") return null;
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 ${className}`}>
      <p className="min-w-0 flex-1" role="status">
        {t("portals.vault.unlockedNote")}
      </p>
      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => lock()}>
        {t("portals.vault.lockNow")}
      </button>
    </div>
  );
}

/**
 * Loads the password state (the vault, or this device's slots) once a student is signed in, so the notes below show on a
 * fresh Portals / My list load without a login row being opened first. loadSlots runs once per page and account, so the
 * rows and the notes share the one load.
 */
function useLoadedPasswords() {
  const student = useStudent();
  // Students only: a teacher opening a student URL renders once before RoleGate redirects.
  const userId = student.role === "student" ? (student.auth?.userId ?? null) : null;
  useEffect(() => {
    if (userId) void loadSlots();
  }, [userId]);
}

/**
 * "This device only", said once per page: on a device that holds none of this account's passwords, the fields are empty
 * because the passwords live where they were typed. It loads the password state itself on mount (useLoadedPasswords).
 */
export function DevicePasswordsNote({ className = "" }: { className?: string }) {
  const t = useT();
  const vault = useVault();
  const student = useStudent();
  useLoadedPasswords();
  if (!student.auth || vault.status !== "ready" || vault.mode !== "device" || !vault.deviceAvailable || vault.deviceCount > 0) return null;
  return <p className={`rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 ${className}`}>{t("portals.device.elsewhereNote")}</p>;
}

/**
 * Vault mode, Portals and My list: passwords still kept on this device outside the vault (a switch whose Setup was
 * closed midway, a different password in the vault, or a switch made on another device). One line with "Move them into
 * the vault": it opens Setup or Unlock first when needed and the move then runs by itself (portal-vault-client.ts
 * moveIntoVault). Says how many moved, and links to Settings when some differ from the vault. It loads the password
 * state itself on mount (useLoadedPasswords), so it shows without a login row being opened. Warning tone while some
 * passwords are still on this device; done tone once they all moved.
 */
export function LeftoverPasswordsBanner({ className = "" }: { className?: string }) {
  const t = useT();
  const vault = useVault();
  const student = useStudent();
  const { busy, run } = useRunner();
  useLoadedPasswords();
  const [moved, setMoved] = useState<number | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  if (!student.auth || vault.status !== "ready" || vault.mode !== "vault" || !vault.deviceChecked) return null;
  const n = vault.deviceCount;
  const auto = vault.autoMoved;
  const movedNow = moved ?? (auto?.ok && !auto.setupNeeded ? auto.moved.length : 0);
  if (n === 0 && !movedNow) return null;
  const move = () =>
    run(async () => {
      setError(null);
      setMoved(null);
      const r = await moveIntoVault();
      if (r === "dialog") return;
      if (r.ok) setMoved(r.moved.length);
      else if (r.error === "no_locks" || r.error === "timeout") setError(LOCK_ERROR[r.error]);
      else if (r.error === "wrong_mode") setError("settings.storage.err.nowDevice");
      else setError((DIALOG_ERROR as Partial<Record<string, MessageKey>>)[r.error] ?? "portals.leftover.failed");
    });
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${toneClass(n > 0 ? "soon" : "done")} ${className}`}>
      {n > 0 && <p className="min-w-0 flex-1">{t(n === 1 ? "portals.leftover.one" : "portals.leftover.many", { n })}</p>}
      {n > 0 && (
        <button type="button" className={buttonClass("secondary", "sm")} disabled={busy || !vault.canSwitch} onClick={() => void move()}>
          {busy ? t("settings.storage.toVault.busy") : t("settings.vault.leftoverMove")}
        </button>
      )}
      {n > 0 && !vault.canSwitch && <p className="w-full">{t("portals.leftover.noLocks")}</p>}
      {n > 0 && vault.conflicts.size > 0 && (
        <Link href="/settings#passwords" className="font-medium underline">
          {t("portals.leftover.conflicts")}
        </Link>
      )}
      {movedNow > 0 && (
        <p role="status" className="w-full text-done">
          {t("portals.leftover.moved", { n: movedNow })}
        </p>
      )}
      {error && (
        <p role="alert" className="w-full text-urgent">
          {t(error)}
        </p>
      )}
    </div>
  );
}

/** The open vault dialog, if any (mounted once in app/layout.tsx). Signed-out pages have none. */
export function VaultDialogHost() {
  const vault = useVault();
  const student = useStudent();
  if (!vault.dialog || !student.auth) return null;
  const email = student.auth.email;
  return vault.dialog === "setup" ? <SetupDialog key="setup" email={email} /> : <UnlockDialog key="unlock" email={email} />;
}

const Title = ({ children }: { children: React.ReactNode }) => <h2 className="font-display text-lg font-bold">{children}</h2>;

// Step 1 makes the vault in memory (prepare: slow on purpose), step 2 shows its recovery code, step 3 asks for one group
// of it and only then stores the vault (commit). `prepared` holds the new key and code (not the passphrase, which step 1
// clears): in this component's state only, dropped when the dialog closes.
function SetupDialog({ email }: { email: string | null }) {
  const t = useT();
  const np = useNewPassphrase(email);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<Msg | null>(null);
  const [blocked, setBlocked] = useState<"exists" | "orphans" | null>(null);
  const runner = useRunner(); // shared with the Start over below, so Create vault waits while it runs
  const { busy, run } = runner;

  const begin = () =>
    run(async () => {
      const bad = np.check();
      if (bad) return setMsg(bad);
      setMsg(null);
      try {
        const p = await prepare(np.first);
        np.clear();
        setPrepared(p);
        setStep(2);
      } catch {
        setMsg({ key: "portals.vault.setup.prepareFailed" });
      }
    });

  const create = () =>
    run(async () => {
      if (!prepared) return;
      setMsg(null);
      setBlocked(null);
      const r = await commit(prepared, typed);
      if (r === "ok") return closeVaultDialog();
      if (r === "group_mismatch") {
        // Back to the code itself, so the student can check it against where they saved it.
        setStep(2);
        return setMsg({ key: "portals.vault.check.mismatch", vars: { n: prepared.confirmGroup } });
      }
      // Another tab (or a double click whose reply was lost) may have just made a vault: never jump to Start over for it.
      if (r === "exists" || r === "orphans") return setBlocked(r);
      // The vault may have been stored and only the reply lost: the same step again is safe (it finds its own vault).
      if (r === "failed") return setMsg({ key: "portals.vault.setup.unconfirmed" });
      setMsg({ key: DIALOG_ERROR[r] });
    });

  const title = step === 1 ? t("portals.vault.setup.title") : step === 2 ? t("portals.vault.setup.codeTitle") : t("portals.vault.setup.checkTitle");
  return (
    <Modal
      title={
        <>
          <p className="text-xs font-medium text-zinc-500">{t("portals.vault.setup.step", { n: step })}</p>
          <Title>{title}</Title>
        </>
      }
      onClose={closeVaultDialog}
      className={DIALOG_WIDTH}
    >
      <div className="space-y-3">
        {step === 1 && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void begin();
            }}
          >
            <p className="text-sm text-zinc-700">{t("portals.vault.setup.intro")}</p>
            <p className={`rounded-md border px-3 py-2 text-sm font-medium ${toneClass("soon")}`}>{t("portals.vault.setup.warning")}</p>
            <NewPassphraseFields np={np} />
            <MessageLine msg={msg} />
            <button type="submit" className={buttonClass("primary", "sm")} disabled={busy || !np.first || !np.second}>
              {busy ? t("portals.vault.setup.creating") : t("portals.vault.setup.continue")}
            </button>
          </form>
        )}
        {step === 2 && prepared && (
          <>
            <RecoveryCodeView code={prepared.recoveryCode} />
            <MessageLine msg={msg} />
            <button
              type="button"
              className={buttonClass("primary", "sm")}
              onClick={() => {
                setMsg(null);
                setStep(3);
              }}
            >
              {t("portals.vault.code.saved")}
            </button>
          </>
        )}
        {step === 3 && prepared && (
          <>
            <GroupCheck
              group={prepared.confirmGroup}
              value={typed}
              onChange={setTyped}
              busy={busy}
              submitLabel={t("portals.vault.setup.create")}
              busyLabel={t("portals.vault.setup.creating")}
              onBack={() => {
                setMsg(null);
                setBlocked(null);
                setStep(2);
              }}
              onSubmit={() => void create()}
            />
            <MessageLine msg={msg} />
            {blocked === "exists" && (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-urgent">
                  {t("portals.vault.setup.exists")}
                </p>
                <button type="button" className={buttonClass("secondary", "sm")} onClick={() => openVaultDialog("unlock")}>
                  {t("portals.vault.setup.unlockInstead")}
                </button>
              </div>
            )}
            {blocked === "orphans" && (
              <div className="space-y-2 border-t border-zinc-200 pt-3">
                <p role="alert" className="text-sm text-urgent">
                  {t("portals.vault.setup.orphans")}
                </p>
                <StartOver
                  runner={runner}
                  onDone={() => {
                    setBlocked(null);
                    setMsg({ key: "portals.vault.setup.resetDone", ok: true });
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// Passphrase, or ("forgot it") the recovery code plus a new passphrase typed twice. A wrong secret changes nothing.
function UnlockDialog({ email }: { email: string | null }) {
  const t = useT();
  const vault = useVault();
  const [mode, setMode] = useState<"passphrase" | "recovery">("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [code, setCode] = useState("");
  const np = useNewPassphrase(email);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [noVault, setNoVault] = useState(false);
  const { busy, run } = useRunner();
  const first = useRef<HTMLInputElement>(null);

  // Focus the first field once the dialog is open (the modal focuses its panel when it opens, after this mounts).
  useEffect(() => {
    const id = setTimeout(() => first.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [mode]);

  const switchTo = (next: "passphrase" | "recovery") => {
    setMode(next);
    setMsg(null);
    setNoVault(false);
  };

  const submit = () =>
    run(async () => {
      setMsg(null);
      setNoVault(false);
      let r: Awaited<ReturnType<typeof unlock>>;
      if (mode === "passphrase") {
        if (!passphrase) return;
        r = await unlock({ passphrase });
      } else {
        if (!code.trim()) return;
        const bad = np.check();
        if (bad) return setMsg(bad);
        r = await unlock({ recovery: code }, np.first);
      }
      if (r === "ok") return closeVaultDialog();
      if (r === "wrong") return setMsg({ key: mode === "passphrase" ? "portals.vault.unlock.wrong" : "portals.vault.unlock.wrongCode" });
      if (r === "no_vault") return setNoVault(true);
      // With a new passphrase the change may have landed and only its reply been lost: the same step again is safe.
      if (r === "failed" && mode === "recovery") return setMsg({ key: "portals.vault.unlock.unconfirmed" });
      setMsg({ key: DIALOG_ERROR[r] });
    });

  const ready = mode === "passphrase" ? !!passphrase : !!code.trim() && !!np.first && !!np.second;
  return (
    <Modal title={<Title>{t("portals.vault.unlock.title")}</Title>} onClose={closeVaultDialog} className={DIALOG_WIDTH}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {mode === "passphrase" ? (
          <>
            <p className="text-sm text-zinc-700">{t("portals.vault.unlock.intro")}</p>
            <PassInput inputRef={first} label={t("portals.vault.pass.label")} value={passphrase} onChange={setPassphrase} autoComplete="current-password" />
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-700">{t("portals.vault.unlock.recoveryIntro")}</p>
            <CodeInput inputRef={first} label={t("portals.vault.unlock.codeLabel")} value={code} onChange={setCode} />
            <NewPassphraseFields np={np} />
          </>
        )}
        <MessageLine msg={msg} />
        {/* unlock() reads the account again when it finds no vault, so a stale tab learns here that the passwords moved to this device. */}
        {noVault && vault.mode === "device" && (
          <p role="alert" className="text-sm text-urgent">
            {t("portals.vault.err.deviceNow")}
          </p>
        )}
        {noVault && vault.mode !== "device" && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-urgent">
              {t("portals.vault.err.noVaultYet")}
            </p>
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => openVaultDialog("setup")}>
              {t("portals.vault.setUp")}
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={buttonClass("primary", "sm")} disabled={busy || !ready}>
            {busy ? t("portals.vault.unlock.busy") : mode === "passphrase" ? t("portals.vault.unlock") : t("portals.vault.unlock.recoverButton")}
          </button>
          <button type="button" className={buttonClass("quiet", "sm")} disabled={busy} onClick={() => switchTo(mode === "passphrase" ? "recovery" : "passphrase")}>
            {mode === "passphrase" ? t("portals.vault.unlock.forgot") : t("portals.vault.unlock.usePassphrase")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
