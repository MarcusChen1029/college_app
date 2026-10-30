"use client";

import { useEffect, useState } from "react";
import { sysText } from "@/components/LoginRow";
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
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { SYSTEMS, type PortalData } from "@/lib/portals";
import {
  changePassphrase,
  commitRecovery,
  deleteDevicePasswords,
  deleteUnreadableServerCopies,
  dismissAutoMoved,
  loadSlots,
  lock,
  moveIntoVault,
  openVaultDialog,
  prepareRecovery,
  resolveConflict,
  retryServerDelete,
  switchToDevice,
  switchToVault,
  useVault,
  type PasswordMode,
  type PreparedRecovery,
  type ToDeviceResult,
  type ToVaultResult,
} from "@/lib/portal-vault-client";
import type { ListEntry } from "@/lib/student-rows";
import { useStudent } from "@/lib/student-store";
import { buttonClass, toneClass } from "@/lib/ui";

type Part = "change" | "code" | "reset";
/** What the card says after a step: one line, and under it plain notes (which logins a switch left where). */
type Result = { head: Msg; notes?: Msg[] };
type Action = "toDevice" | "toVault" | "deleteHere" | "deleteServer" | "dropUnreadable" | "resolve";
/** Display names of listed colleges by slug (the Settings page reads them with the college list). */
export type CollegeNames = Readonly<Record<string, string>>;

// What a switch error says. The codes come from password-mode.ts (through switchToDevice / switchToVault); one this
// file doesn't know yet (a newer client) gets the generic line, which never claims what did or didn't happen.
const SWITCH_ERROR: Partial<Record<string, MessageKey>> = {
  ...DIALOG_ERROR,
  locked: "portals.vault.err.locked",
  device_unavailable: "settings.storage.err.deviceUnavailable",
  unreadable: "settings.storage.err.unreadable",
  copy_failed: "settings.storage.err.copyFailed",
  changed: "settings.storage.err.changed",
  conflict: "settings.storage.err.conflict",
};
function switchError(to: PasswordMode, code: string): MessageKey {
  if (code === "mode_not_saved") return to === "device" ? "settings.storage.err.toDeviceModeNotSaved" : "settings.storage.err.toVaultModeNotSaved";
  // Moving into the vault, "device_unavailable" means this browser's passwords couldn't be read just now.
  if (to === "vault" && code === "device_unavailable") return "settings.storage.err.deviceReadFailed";
  return SWITCH_ERROR[code] ?? "settings.storage.err.generic";
}

// What a slot (portal-slots.ts) is called on the Portals page and My list, for the lists of passwords a switch left
// somewhere. A listed college's name comes from the college list the page read (`names`); its slug if that is missing.
function slotName(t: TFunction, list: readonly ListEntry[], portals: PortalData | undefined, names: CollegeNames | undefined, slot: string): string {
  const i = slot.indexOf(":");
  const kind = slot.slice(0, i);
  const id = slot.slice(i + 1);
  if (kind === "system") {
    const sys = SYSTEMS.find((s) => s.key === id);
    return sys ? sysText(t, "name", sys.key, sys.name) : id;
  }
  if (kind === "campus") return id.slice(id.indexOf(":") + 1);
  if (kind === "custom") return portals?.custom?.find((c) => c.id === id)?.name || t("portals.untitled");
  if (kind === "college") {
    const e = list.find((x) => (x.custom ? x.rowId : x.institutionId) === id);
    return e?.custom?.name || (e && names?.[e.slug]) || e?.slug || t("portals.untitled");
  }
  return slot;
}

/**
 * Settings > Saved passwords: where the account keeps its portal passwords (the locked vault or this device only, and
 * the switch between them), then, for the vault, whether it is set up and open in this tab and the ways to change it
 * (passphrase, recovery code, lock, start over); for this device, what it holds and the way to delete it. Each part is
 * mounted only while it is open, so a typed secret or a prepared code goes away when it closes. One runner for the
 * whole card, so a switch, a delete and a retry never overlap.
 */
export function VaultSettings({ collegeNames }: { collegeNames?: CollegeNames }) {
  const t = useT();
  const vault = useVault();
  const student = useStudent();
  const email = student.auth?.email ?? null;
  const [open, setOpen] = useState<Part | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const [picked, setPicked] = useState<PasswordMode | null>(null); // the option chosen but not switched to yet
  // Device mode: old-vault passwords nobody can open, found by the last switch or delete (their own way out below).
  const [unreadableHeld, setUnreadableHeld] = useState<string[]>([]);
  const { busy, run: runOnce } = useRunner();
  const [action, setAction] = useState<Action | null>(null); // which button's step is running, for its busy label
  const run = (name: Action, f: () => Promise<void>) =>
    runOnce(async () => {
      dismissAutoMoved(); // a result shown from an earlier move gives way to this step's
      setAction(name);
      try {
        await f();
      } finally {
        setAction(null);
      }
    });
  const doing = (name: Action) => busy && action === name;
  useEffect(() => {
    void loadSlots();
  }, []);

  const device = vault.mode === "device";
  const hasVault = vault.lock === "locked" || vault.lock === "unlocked";
  const ready = vault.status === "ready" || hasVault;
  // The account's mode is known once a load got through (and stays known if a later one fails). Device mode needs
  // nothing from the vault endpoint: it is "ready" as soon as this device answered, whatever the server said.
  const loaded = device ? vault.status === "ready" : vault.lock !== "unknown" && vault.status !== "unavailable";
  const target = picked !== null && picked !== vault.mode ? picked : null;
  const nameOf = (slot: string) => slotName(t, student.list, student.profile.portals, collegeNames, slot);
  const names = (slots: readonly string[]) => slots.map(nameOf).join(", ");
  const toggle = (part: Part) => {
    setDone(null);
    setOpen((cur) => (cur === part ? null : part));
  };
  const finish = (msg: Msg) => {
    setOpen(null);
    setDone({ head: msg });
  };
  const logins = (slots: readonly string[] | undefined): Msg[] => (slots?.length ? [{ key: "settings.storage.logins", vars: { names: names(slots) } }] : []);
  const failed = (to: PasswordMode, code: string, slots: readonly string[] | undefined) => setDone({ head: { key: switchError(to, code) }, notes: logins(slots) });

  // A switch to this device that worked, said accurately: "kept only on this device" only when every vault password is
  // here; when the old vault was kept because some aren't (yet), it says so and how many it still holds.
  const deviceSummary = (r: Extract<ToDeviceResult, { ok: true }>): Result => {
    const held = r.resetError === "conflict" || r.resetError === "copy_failed" || r.resetError === "unreadable" || r.resetError === "device_unavailable" || r.resetError === "locked";
    if (!held) return { head: { key: r.serverLeft > 0 || r.resetError ? "settings.storage.toDevice.doneServerLeft" : "settings.storage.toDevice.done", ok: true } };
    const notes: Msg[] =
      r.resetError === "conflict"
        ? [{ key: "settings.storage.err.conflict" }]
        : r.resetError === "unreadable"
          ? [{ key: "settings.device.unreadable", vars: { names: names(r.slots) } }]
          : logins(r.slots);
    return { head: { key: r.serverLeft === 1 ? "settings.storage.toDevice.heldOne" : "settings.storage.toDevice.heldMany", vars: { n: r.serverLeft }, ok: true }, notes };
  };

  // A move into the vault, said in one accurate summary: "Done" only when nothing stayed on this device.
  const moveSummary = (r: ToVaultResult): Result => {
    if (!r.ok) return { head: { key: switchError("vault", r.error) }, notes: logins(r.slots) };
    if (r.setupNeeded) return { head: { key: "settings.storage.toVault.setupNext", ok: true } };
    const notes: Msg[] = [];
    if (r.kept.length) notes.push({ key: "settings.storage.toVault.kept", vars: { names: names(r.kept) } });
    if (r.notMoved.length) notes.push({ key: "settings.storage.toVault.notMoved", vars: { names: names(r.notMoved) } });
    if (r.unreadable.length) notes.push({ key: "settings.storage.toVault.unreadable", vars: { names: names(r.unreadable) } });
    if (r.notDeleted.length) notes.push({ key: "settings.storage.toVault.notDeleted", vars: { names: names(r.notDeleted) } });
    if (r.deviceUnavailable) notes.push({ key: "settings.storage.toVault.deviceUnavailable" });
    const left = r.kept.length + r.notMoved.length + r.unreadable.length + r.notDeleted.length;
    return { head: left ? { key: "settings.storage.toVault.partial", vars: { n: r.moved.length }, ok: true } : { key: "settings.storage.toVault.done", ok: true }, notes };
  };

  const pick = (mode: PasswordMode) => {
    if (busy) return;
    setDone(null);
    setOpen(null);
    setPicked(mode === vault.mode ? null : mode);
  };

  // Vault -> this device. Copies first, checks each, then deletes the vault (portal-vault-client.ts switchToDevice).
  const toDevice = () =>
    run("toDevice", async () => {
      setDone(null);
      const r = await switchToDevice();
      if (!r.ok) return failed("device", r.error, r.slots);
      setPicked(null);
      setUnreadableHeld(r.resetError === "unreadable" ? r.slots : []);
      setDone(deviceSummary(r));
    });

  // This device -> the vault. From device mode the account switches first; with no vault yet the Setup dialog opens and
  // the move finishes by itself once the vault exists (its result then shows here as vault.autoMoved).
  const toVault = () =>
    run("toVault", async () => {
      setDone(null);
      const r = await switchToVault();
      if (r.ok) setPicked(null);
      setDone(moveSummary(r));
      if (r.ok && r.setupNeeded) openVaultDialog("setup");
    });

  // Vault mode: "Move them into the vault" for passwords still on this device. With the vault locked or not set up it
  // opens Unlock / Setup first, and the move runs by itself afterwards.
  const moveLeftovers = () =>
    run("toVault", async () => {
      setDone(null);
      const r = await moveIntoVault();
      if (r !== "dialog") setDone(moveSummary(r));
    });

  const deleteHere = (confirmKey: MessageKey) =>
    run("deleteHere", async () => {
      if (!window.confirm(t(confirmKey))) return;
      setDone(null);
      const err = await deleteDevicePasswords();
      if (err === null) return setDone({ head: { key: "settings.device.deleted", ok: true } });
      setDone({ head: { key: err === "unauthorized" ? DIALOG_ERROR.unauthorized : "settings.device.deleteFailed" } });
    });

  // Deletes the old vault from the server, once each of its passwords is checked against (or copied to) this device.
  const deleteServer = () =>
    run("deleteServer", async () => {
      setDone(null);
      const r = await retryServerDelete();
      setUnreadableHeld(!r.ok && r.error === "unreadable" ? r.slots : []);
      if (r.ok) return setDone({ head: { key: "settings.device.serverDeleted", ok: true } });
      if (r.error === "wrong_mode") return setDone({ head: { key: "settings.device.wrongMode" } });
      if (r.error === "unreadable") return setDone({ head: { key: "settings.device.unreadable", vars: { names: names(r.slots) } } });
      failed("device", r.error, r.slots);
      if (r.error === "locked") openVaultDialog("unlock");
    });

  // The way out of "unreadable": delete only the old vault's passwords nobody can open, then try the delete again (which
  // copies the others here first).
  const dropUnreadable = () =>
    run("dropUnreadable", async () => {
      if (!window.confirm(t("settings.device.dropUnreadableConfirm", { n: unreadableHeld.length }))) return;
      setDone(null);
      const dropped = await deleteUnreadableServerCopies();
      if (!dropped.ok) return setDone({ head: { key: dropped.error === "wrong_mode" ? "settings.device.wrongMode" : (SWITCH_ERROR[dropped.error] ?? "settings.storage.err.generic") } });
      setUnreadableHeld([]);
      const r = await retryServerDelete();
      setUnreadableHeld(!r.ok && r.error === "unreadable" ? r.slots : []);
      if (r.ok) return setDone({ head: { key: "settings.device.serverDeleted", ok: true } });
      if (r.error === "wrong_mode") return setDone({ head: { key: "settings.device.wrongMode" } });
      failed("device", r.error, r.slots);
      if (r.error === "locked") openVaultDialog("unlock");
    });

  // One login with different passwords here and in the vault: keep one copy, after a confirm naming the login.
  const resolve = (slot: string, keep: "vault" | "device") =>
    run("resolve", async () => {
      const name = nameOf(slot);
      if (!window.confirm(t(keep === "vault" ? "settings.conflict.confirmVault" : "settings.conflict.confirmDevice", { name }))) return;
      setDone(null);
      const err = await resolveConflict(slot, keep);
      if (err === null) return setDone({ head: { key: "settings.conflict.done", vars: { name }, ok: true } });
      setDone({ head: { key: err === "changed" ? "settings.conflict.changed" : (SWITCH_ERROR[err] ?? "settings.storage.err.generic") } });
    });

  let status: React.ReactNode;
  if (device) status = null; // the device part below says what this browser holds; it doesn't depend on the vault
  else if (vault.status === "unavailable") status = <p className="text-sm text-zinc-700">{t("portals.passwordUnavailable")}</p>;
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

  // One of the two places, as a radio card. The one in use says so; picking the other opens the switch panel below.
  const option = (mode: PasswordMode, title: MessageKey, hint: MessageKey, disabled: boolean, extra?: React.ReactNode) => {
    const checked = (target ?? vault.mode) === mode;
    return (
      <label
        className={`flex gap-3 rounded-xl border p-3 ${checked ? "border-blue-300 bg-blue-50" : "border-zinc-200"} ${disabled ? "opacity-60" : "cursor-pointer"} ${!checked && !disabled ? "hover:bg-zinc-50" : ""}`}
      >
        <input type="radio" name="password-storage" className="mt-1 shrink-0" checked={checked} disabled={disabled || busy} onChange={() => pick(mode)} />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">
            {t(title)}
            {vault.mode === mode && <span className="ml-2 text-xs font-medium text-zinc-500">{t("settings.storage.current")}</span>}
          </span>
          <span className="mt-0.5 block text-sm text-zinc-600">{t(hint)}</span>
          {extra}
        </span>
      </label>
    );
  };

  const cancel = (
    <button type="button" className={buttonClass("quiet", "sm")} disabled={busy} onClick={() => setPicked(null)}>
      {t("common.cancel")}
    </button>
  );
  const unlockButton = (
    <button type="button" className={buttonClass("primary", "sm")} disabled={busy} onClick={() => openVaultDialog("unlock")}>
      {t("portals.vault.unlock")}
    </button>
  );

  // The switch, confirmed here: what will happen, then the one button that does it (or the vault step it needs first).
  let panel: React.ReactNode = null;
  if (target === "device")
    panel = (
      <div className="space-y-3 rounded-xl border border-zinc-200 p-4">
        {vault.slots.size > 0 ? (
          <>
            <p className={`rounded-md border px-3 py-2 text-sm font-medium ${toneClass("soon")}`}>{t("settings.storage.toDevice.warning")}</p>
            <p className="text-sm text-zinc-700">{t("settings.storage.toDevice.body")}</p>
          </>
        ) : (
          <p className="text-sm text-zinc-700">{t("settings.storage.toDevice.noVault")}</p>
        )}
        {vault.lock === "locked" && <p className="text-sm text-zinc-700">{t("settings.storage.unlockFirst")}</p>}
        <div className="flex flex-wrap gap-2">
          {vault.lock === "locked" ? (
            unlockButton
          ) : (
            <button type="button" className={buttonClass("primary", "sm")} disabled={busy} onClick={() => void toDevice()}>
              {doing("toDevice") ? t("settings.storage.toDevice.busy") : t("settings.storage.toDevice.button")}
            </button>
          )}
          {cancel}
        </div>
      </div>
    );
  else if (target === "vault")
    panel = (
      <div className="space-y-3 rounded-xl border border-zinc-200 p-4">
        <p className="text-sm text-zinc-700">{t("settings.storage.toVault.body")}</p>
        {vault.lock === "none" && <p className="text-sm text-zinc-700">{t("settings.storage.toVault.setupFirst")}</p>}
        {vault.lock === "locked" && <p className="text-sm text-zinc-700">{t("settings.storage.unlockFirst")}</p>}
        <div className="flex flex-wrap gap-2">
          {/* No vault yet: the switch comes first (the server makes no vault in device mode), then the Setup dialog opens. */}
          {vault.lock === "locked" ? (
            unlockButton
          ) : (
            <button type="button" className={buttonClass("primary", "sm")} disabled={busy} onClick={() => void toVault()}>
              {doing("toVault") ? t("settings.storage.toVault.busy") : t("settings.storage.toVault.button")}
            </button>
          )}
          {cancel}
        </div>
      </div>
    );

  // Device mode: what this browser holds, and an old vault whose server copies are still to be deleted.
  const count = vault.deviceCount;
  const devicePart = device && (
    <div className="space-y-3">
      {/* A browser that can't keep passwords is said under the option above. */}
      {vault.deviceAvailable && (
        <p className="text-sm text-zinc-700">
          {count === 0 ? t("settings.device.countNone") : t(count === 1 ? "settings.device.countOne" : "settings.device.countMany", { n: count })}
        </p>
      )}
      {vault.deviceAvailable && count > 0 && (
        <button type="button" className={buttonClass("danger", "sm")} disabled={busy} onClick={() => void deleteHere("settings.device.deleteConfirm")}>
          {doing("deleteHere") ? t("portals.vault.reset.busy") : t("settings.device.delete")}
        </button>
      )}
      {(vault.serverLeft > 0 || hasVault) && target === null && (
        <div className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 ${toneClass("soon")}`}>
          <p className="min-w-0 flex-1 text-sm font-medium">
            {vault.serverLeft > 0
              ? t(vault.serverLeft === 1 ? "settings.device.serverLeftOne" : "settings.device.serverLeftMany", { n: vault.serverLeft })
              : t("settings.device.vaultLeft")}
          </p>
          {vault.serverLeft > 0 && vault.lock === "locked" ? (
            unlockButton
          ) : (
            <button type="button" className={buttonClass("secondary", "sm")} aria-label={t("settings.device.deleteServer")} disabled={busy} onClick={() => void deleteServer()}>
              {doing("deleteServer") ? t("portals.vault.reset.busy") : t("common.delete")}
            </button>
          )}
          {vault.serverLeft > 0 && vault.lock === "locked" && <p className="w-full text-sm">{t("settings.device.unlockOld")}</p>}
          {unreadableHeld.length > 0 && (
            <button type="button" className={buttonClass("danger", "sm")} disabled={busy} onClick={() => void dropUnreadable()}>
              {doing("dropUnreadable") ? t("portals.vault.reset.busy") : t("settings.device.dropUnreadable")}
            </button>
          )}
        </div>
      )}
    </div>
  );

  // What the card says now: the move that ran by itself once Setup / Unlock opened the vault (newer than anything this
  // card said before it; the next step here dismisses it), else this card's own last result.
  const summary = vault.autoMoved ? moveSummary(vault.autoMoved) : done;

  // Logins with one password here and a different one in the vault (found by a switch, a move or the old vault's
  // delete). Each keeps one copy, after a confirm; comparing needs the open vault.
  const conflicts = [...vault.conflicts];
  const conflictPart = conflicts.length > 0 && (
    <div className={`space-y-2 rounded-xl border p-4 ${toneClass("soon")}`}>
      <p className="text-sm font-semibold">{t("settings.conflict.title")}</p>
      <p className="text-sm">{t("settings.conflict.intro")}</p>
      {vault.lock !== "unlocked" && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm">{t("settings.conflict.unlock")}</p>
          {vault.lock === "locked" && unlockButton}
        </div>
      )}
      <ul className="space-y-2">
        {conflicts.map((slot) => (
          <li key={slot} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 break-words text-sm font-medium">{nameOf(slot)}</span>
            <button type="button" className={buttonClass("secondary", "sm")} disabled={busy || vault.lock !== "unlocked"} onClick={() => void resolve(slot, "vault")}>
              {t("settings.conflict.keepVault")}
            </button>
            <button type="button" className={buttonClass("secondary", "sm")} disabled={busy || vault.lock !== "unlocked"} onClick={() => void resolve(slot, "device")}>
              {t("settings.conflict.keepDevice")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  // Vault mode: passwords still on this device from "This device only" (another device switched back, or a switch kept
  // some here). Moving them needs the open vault; deleting them leaves the vault alone.
  const leftovers = !device && vault.deviceAvailable && count > 0 && (
    <div className="space-y-2 rounded-xl border border-zinc-200 p-4">
      <p className="text-sm text-zinc-700">{t("settings.vault.leftover", { n: count })}</p>
      <div className="flex flex-wrap gap-2">
        {/* Opens Unlock / Setup first when needed; the move then runs by itself. */}
        <button type="button" className={buttonClass("secondary", "sm")} disabled={busy} onClick={() => void moveLeftovers()}>
          {doing("toVault") ? t("settings.storage.toVault.busy") : t("settings.vault.leftoverMove")}
        </button>
        <button type="button" className={buttonClass("quiet", "sm")} disabled={busy} onClick={() => void deleteHere("settings.vault.leftoverDeleteConfirm")}>
          {doing("deleteHere") ? t("portals.vault.reset.busy") : t("settings.vault.leftoverDelete")}
        </button>
      </div>
    </div>
  );

  return (
    <section id="passwords" aria-labelledby="passwords-heading" className="scroll-mt-4 rounded-2xl border border-zinc-200 p-6">
      <h2 id="passwords-heading" className="mb-1 text-xl font-bold">
        {t("settings.vault.title")}
      </h2>
      <p className="mb-3 text-sm text-zinc-500">{t("settings.vault.intro")}</p>
      <div className="space-y-4">
        {loaded && (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold text-zinc-800">{t("settings.storage.legend")}</legend>
            {option("vault", "settings.storage.vault", "settings.storage.vaultHint", false)}
            {option(
              "device",
              "settings.storage.device",
              "settings.storage.deviceHint",
              !vault.deviceAvailable && !device,
              // Said only once this browser's storage has answered (it is read after the vault).
              vault.deviceChecked && !vault.deviceAvailable && <span className="mt-1 block text-sm font-medium text-zinc-800">{t("portals.device.unavailable")}</span>,
            )}
          </fieldset>
        )}
        {panel}
        {status && <div className="flex flex-wrap items-center gap-3">{status}</div>}
        {devicePart}
        {leftovers}
        {/* The result line comes before the conflict list, which its text points to ("below"). */}
        {summary && (
          <div className="space-y-1">
            <MessageLine msg={summary.head} />
            {summary.notes?.map((n) => (
              <p key={n.key} className="text-sm text-zinc-700">
                {t(n.key, n.vars)}
              </p>
            ))}
          </div>
        )}
        {conflictPart}
      </div>
      {/* Without a vault, only rows nobody can open (which block a new vault) need "start over". Device mode has no vault to change. */}
      {!device && ready && (hasVault || vault.other.size > 0) && (
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
