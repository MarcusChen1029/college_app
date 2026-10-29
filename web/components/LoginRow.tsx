"use client";

import { useEffect, useRef, useState } from "react";
import { safeLink } from "@/lib/checklist";
import { PASSWORD_MAX } from "@/lib/portal-slots";
import {
  copySecret,
  copyText,
  deletePassword,
  loadSlots,
  lock as lockVault,
  openVaultDialog,
  revealPassword,
  savePassword,
  useVault,
  type VaultError,
} from "@/lib/portal-vault-client";
import { openUrl, type Login, type ProgressState } from "@/lib/portals";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { buttonClass, toneClass } from "@/lib/ui";

/** Looks up a per-system translation (name or hint); falls back to the English text when the key is missing. */
export const sysText = (t: TFunction, kind: "name" | "hint", key: string, fallback: string) => {
  const k = `portals.${kind}.${key}` as MessageKey;
  const v = t(k);
  return v === k ? fallback : v;
};

const input ="min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm";

/** What a row needs to show and change its Done / Not done mark. */
export type RowProgress = { state: ProgressState; note: string; onDone: (done: boolean | null) => void; onNote: (note: string) => void };

const pill = "rounded-full border px-3 py-1 text-xs font-semibold";
const pillIdle = "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50";

/** The Done / Not done pair. A pressed button uses its tone; unmarked shows neither pressed; pressing it again clears the mark. */
function ProgressButtons({ label, progress }: { label: string; progress: RowProgress }) {
  const t = useT();
  return (
    <div role="group" aria-label={t("portals.progressFor", { label })} className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-pressed={progress.state === "done"}
        className={`${pill} ${progress.state === "done" ? toneClass("done") : pillIdle}`}
        onClick={() => progress.onDone(progress.state === "done" ? null : true)}
      >
        {t("portals.done")}
      </button>
      <button
        type="button"
        aria-pressed={progress.state === "notDone"}
        className={`${pill} ${progress.state === "notDone" ? toneClass("soon") : pillIdle}`}
        onClick={() => progress.onDone(progress.state === "notDone" ? null : false)}
      >
        {t("portals.notDone")}
      </button>
    </div>
  );
}

const smallButton = "shrink-0 rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50";

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [done, setDone] = useState<"copied" | "failed" | null>(null);
  if (!value) return null;
  return (
    <button
      type="button"
      className={smallButton}
      aria-label={label}
      onClick={async () => {
        setDone((await copyText(value)) ? "copied" : "failed");
        setTimeout(() => setDone(null), 2500);
      }}
    >
      {done === "copied" ? t("common.copied") : done === "failed" ? t("portals.copyFailedShort") : t("common.copy")}
    </button>
  );
}

/** What a password row says when a vault step fails, one text per reason. */
const VAULT_ERROR_TEXT: Record<VaultError, MessageKey> = {
  unauthorized: "portals.vault.err.unauthorized",
  unavailable: "portals.passwordUnavailable",
  not_found: "portals.passwordMissing",
  too_many: "portals.passwordTooMany",
  failed: "portals.passwordError",
  other_vault: "portals.passwordUnreadable",
  locked: "portals.vault.err.locked",
  legacy: "portals.vault.err.legacy",
  no_vault: "portals.vault.err.noVault",
  wrong_vault: "portals.vault.err.wrongVault",
  changed: "portals.vault.err.changed",
  exists: "portals.vault.err.exists",
  orphans: "portals.vault.err.orphans",
  bad_record: "portals.vault.err.badRecord",
};

// A box in place of the input when the password can't be typed or shown here (locked, being moved, unreadable).
const box = "min-w-0 flex-1 truncate rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-sm text-zinc-500";
const vaultButton = "shrink-0 rounded-md border border-ink px-2 py-1 text-xs font-semibold text-ink hover:bg-zinc-100 disabled:opacity-50";
const wideVaultButton = "min-w-0 flex-1 rounded-md border border-dashed border-zinc-400 px-2 py-1 text-left text-sm font-medium text-blue-700 hover:bg-zinc-50";

/**
 * The password of one login. It is never part of the login data: the page learns which slots hold a password
 * (once), and one password is fetched and opened with this tab's vault key only for Show or Copy, held by this field
 * while the row is open, and forgotten on Hide or when the vault locks. Typing a new one saves it on blur; Clear
 * deletes it. Without a vault the field offers to set one up; while locked, to unlock. An old password that is still
 * being moved into the vault is never offered for deletion. Signed out it stays off.
 */
function PasswordField({ slot, signedIn, label }: { slot: string | null; signedIn: boolean; label: string }) {
  const t = useT();
  const vault = useVault();
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null); // the saved password, once fetched for Show
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<MessageKey | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whatever was shown or typed while the vault was open goes the moment it locks (Lock, sign-out, a change elsewhere).
  const open = vault.lock === "unlocked";
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setDraft("");
      setRevealed(null);
      setShow(false);
    }
  }
  // The lock as it is now, for a reply that arrives after the vault was locked meanwhile.
  const openNow = useRef(open);
  useEffect(() => {
    openNow.current = open;
  }, [open]);
  useEffect(() => {
    if (signedIn && slot) void loadSlots();
  }, [signedIn, slot]);
  useEffect(() => () => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
  }, []);

  const flash = (key: MessageKey, ms = 6000) => {
    setNote(key);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), ms);
  };
  const forget = () => {
    setDraft("");
    setRevealed(null);
    setShow(false);
  };
  // The stored vault is not this tab's any more (reset or replaced elsewhere): lock, and say to unlock again.
  const fail = (err: VaultError) => {
    if (err === "wrong_vault" || err === "no_vault") lockVault();
    flash(VAULT_ERROR_TEXT[err], 15000);
  };

  const usable = signedIn && !!slot && vault.status !== "unavailable";
  const saved = !!slot && vault.slots.has(slot);
  const unreadable = !!slot && vault.other.has(slot);
  const moving = !!slot && vault.legacySlots.has(slot);
  const editing = draft !== (revealed ?? "");

  const fetchSaved = async (): Promise<string | null> => {
    if (!slot) return null;
    if (revealed !== null) return revealed;
    setBusy(true);
    const r = await revealPassword(slot);
    setBusy(false);
    if ("error" in r) {
      fail(r.error);
      return null;
    }
    // Locked while the request was out: the password is neither shown nor copied.
    return openNow.current ? r.password : null;
  };

  const commit = async () => {
    if (!usable || !open || !slot || !editing) return;
    const value = draft;
    // An emptied field changes nothing (the saved password stays); deleting one takes Clear, which asks first.
    if (!value) return forget();
    setBusy(true);
    const err = await savePassword(slot, value);
    setBusy(false);
    if (err) return fail(err);
    forget();
    flash("portals.passwordSavedNote");
  };

  const toggleShow = async () => {
    if (show) {
      // Hiding an unchanged saved password forgets it; a half-typed one is only masked again.
      if (!editing) forget();
      else setShow(false);
      return;
    }
    if (draft) return setShow(true);
    const pw = await fetchSaved();
    if (pw === null) return;
    setRevealed(pw);
    setDraft(pw);
    setShow(true);
  };

  const copy = async () => {
    const pw = await fetchSaved();
    if (pw === null) return;
    // The browser can refuse (permission, an iframe, an unfocused page): say so instead of failing silently.
    flash((await copySecret(pw)) ? "portals.clipboardClears" : "portals.copyFailed");
  };

  const clear = async () => {
    // Never for an old password that is still being moved into the vault: it would be lost for good.
    if (!slot || moving || !window.confirm(t("portals.clearPasswordConfirm", { label }))) return;
    setBusy(true);
    const err = await deletePassword(slot);
    setBusy(false);
    if (err) return fail(err);
    forget();
    flash("portals.passwordDeletedNote");
  };

  // Keeps focus in the field while a button is pressed, so pressing Show doesn't first save a half-typed password.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();
  const clearButton = (
    <button type="button" className={smallButton} disabled={busy} aria-label={t("portals.clearPasswordFor", { label })} onMouseDown={keepFocus} onClick={() => void clear()}>
      {t("portals.clearPassword")}
    </button>
  );
  const fieldName = <span className="sr-only">{t("portals.passwordFor", { label })}: </span>;
  const unlockButton = (
    <button type="button" className={vaultButton} aria-label={t("portals.vault.unlockFor", { label })} onClick={() => openVaultDialog("unlock")}>
      {t("portals.vault.unlock")}
    </button>
  );

  let body: React.ReactNode;
  let standing: MessageKey | null = null;
  if (!usable || vault.lock === "unknown") {
    // Signed out, no slot yet, passwords off on this site, or the vault not known yet.
    const failed = usable && vault.status === "error";
    body = (
      <>
        <input
          type="password"
          className={`${input} flex-1 disabled:bg-zinc-50`}
          disabled
          placeholder={
            !signedIn
              ? t("portals.passwordSignedOut")
              : vault.status === "unavailable"
                ? t("portals.passwordOff")
                : usable && !failed
                  ? t("portals.passwordChecking")
                  : t("portals.passwordPlaceholder")
          }
          aria-label={t("portals.passwordFor", { label })}
        />
        {failed && (
          <button type="button" className={smallButton} onClick={() => void loadSlots()}>
            {t("portals.vault.retry")}
          </button>
        )}
      </>
    );
    standing = !signedIn ? "portals.passwordSignedOutNote" : vault.status === "unavailable" ? "portals.passwordUnavailable" : failed ? "portals.passwordError" : null;
  } else if (unreadable && !open) {
    // Saved under a vault that is gone: nothing can open it, only Clear helps (no key needed for that).
    body = (
      <>
        <span className={box}>
          {fieldName}
          {t("portals.vault.otherShort")}
        </span>
        {clearButton}
      </>
    );
    standing = "portals.passwordUnreadable";
  } else if (vault.lock === "none") {
    body = (
      <button type="button" className={wideVaultButton} onClick={() => openVaultDialog("setup")}>
        {t("portals.vault.setUp")}
      </button>
    );
    standing = moving ? "portals.vault.legacyNone" : null;
  } else if (vault.lock === "locked") {
    body = saved ? (
      <>
        <span className={box}>
          {fieldName}
          {t("portals.vault.lockedSaved")}
        </span>
        {unlockButton}
      </>
    ) : (
      <button type="button" className={wideVaultButton} aria-label={t("portals.vault.unlockFor", { label })} onClick={() => openVaultDialog("unlock")}>
        {t("portals.vault.unlockToAdd")}
      </button>
    );
    standing = moving ? "portals.vault.legacyLocked" : null;
  } else if (moving) {
    // Unlocked, and this old password is being moved into the vault right now (or its move failed and waits for the next unlock).
    body = (
      <span className={box}>
        {fieldName}
        {t("portals.vault.moving")}
      </span>
    );
    standing = "portals.vault.legacyMoving";
  } else {
    body = (
      <>
        <input
          type={show ? "text" : "password"}
          className={`${input} flex-1`}
          value={draft}
          maxLength={PASSWORD_MAX}
          placeholder={unreadable ? t("portals.vault.retype") : saved ? t("portals.passwordSaved") : t("portals.passwordPlaceholder")}
          // A portal's password, not this site's: keep browsers and password managers from saving or filling it here.
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          aria-label={t("portals.passwordFor", { label })}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
        />
        {(draft || (saved && !unreadable)) && (
          <button type="button" className={smallButton} disabled={busy} onMouseDown={keepFocus} onClick={() => void toggleShow()}>
            {show ? t("portals.hide") : t("portals.show")}
          </button>
        )}
        {saved && !editing && (
          <>
            {!unreadable && (
              <button type="button" className={smallButton} disabled={busy} aria-label={t("portals.copyPassword", { label })} onMouseDown={keepFocus} onClick={() => void copy()}>
                {t("common.copy")}
              </button>
            )}
            {clearButton}
          </>
        )}
      </>
    );
    standing = unreadable ? "portals.passwordUnreadable" : vault.status === "error" ? "portals.passwordError" : null;
  }
  const shown = note ?? standing;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">{body}</div>
      {shown && (
        <p className="mt-1 text-xs text-zinc-500" role="status">
          {t(shown)}
        </p>
      )}
    </div>
  );
}

/**
 * One portal as a collapsible box. The name opens the portal in a new tab; clicking anywhere
 * else on the box shows the saved login for checking or editing (saved on blur). The password is
 * kept apart from `login`, in the encrypted store under `slot` (portal-slots.ts).
 */
export function LoginRow({
  name,
  hint,
  official,
  login,
  slot,
  signedIn,
  onSave,
  onRemove,
  onRename,
  progress,
  status,
}: {
  name: string;
  hint?: string;
  official?: string | null;
  login: Login;
  /** Where this login's password is kept; null when it can't have one yet. */
  slot: string | null;
  signedIn: boolean;
  onSave: (l: Login) => void;
  onRemove?: () => void;
  onRename?: (name: string) => void;
  progress?: RowProgress;
  /** Shown left of the Done / Not done buttons (or alone when the row has no buttons), e.g. a count or a small pill. */
  status?: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(!name && !!onRename);
  const save = (patch: Partial<Login>) => {
    const next = { ...login, ...patch };
    if (next.url !== login.url || next.username !== login.username) onSave(next);
  };
  const link = safeLink(openUrl(login, official ?? null));
  const label = name || t("portals.untitled");
  return (
    <li>
      <div className={`rounded-xl border ${open ? "border-blue-300 bg-blue-50/40" : "border-zinc-200"}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-3">
          <div
            role="button"
            tabIndex={0}
            aria-expanded={open}
            aria-label={open ? t("portals.hideLogin", { label }) : t("portals.showLogin", { label })}
            className="flex min-w-0 flex-1 basis-56 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-50"
            onClick={() => setOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpen((v) => !v);
              }
            }}
          >
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-700 hover:underline"
                onClick={(e) => e.stopPropagation()}
                title={t("portals.open", { label })}
              >
                {label} ↗
              </a>
            ) : (
              <span className="font-semibold">{label}</span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{login.username || (link ? t("portals.noLogin") : t("portals.noLinkOrLogin"))}</span>
            <span aria-hidden className="text-zinc-400">
              {open ? "▾" : "▸"}
            </span>
          </div>
          {(progress || status) && (
            <div className="ml-3 flex flex-wrap items-center gap-2 sm:ml-0">
              {status}
              {progress && <ProgressButtons label={label} progress={progress} />}
            </div>
          )}
        </div>
        {progress?.state === "notDone" && (
          <div className="px-3 pb-2.5">
            <input
              key={progress.note}
              className={`${input} w-full`}
              defaultValue={progress.note}
              placeholder={t("portals.notePlaceholder")}
              aria-label={t("portals.noteLabel", { label })}
              onBlur={(e) => e.target.value.trim() !== progress.note && progress.onNote(e.target.value.trim())}
            />
          </div>
        )}
        {open && (
          <div className="space-y-2 border-t border-zinc-100 px-3 pb-3 pt-2">
            {hint && <p className="text-xs text-zinc-500">{hint}</p>}
            {onRename && (
              <input
                className={`${input} w-full font-semibold`}
                defaultValue={name}
                placeholder={t("portals.namePlaceholder")}
                aria-label={t("portals.nameLabel")}
                autoFocus={!name}
                onBlur={(e) => e.target.value.trim() !== name && onRename(e.target.value.trim())}
              />
            )}
            <div className="grid gap-2 sm:grid-cols-[2fr_1.5fr_1.5fr]">
              <input
                type="url"
                className={input}
                defaultValue={login.url}
                placeholder={official ?? t("portals.linkPlaceholder")}
                aria-label={t("portals.linkFor", { label })}
                onBlur={(e) => save({ url: e.target.value.trim() })}
              />
              <div className="flex items-center gap-1">
                <input
                  className={`${input} flex-1`}
                  defaultValue={login.username}
                  placeholder={t("portals.usernamePlaceholder")}
                  autoComplete="off"
                  aria-label={t("portals.usernameFor", { label })}
                  onBlur={(e) => save({ username: e.target.value.trim() })}
                />
                <CopyButton value={login.username} label={t("portals.copyUsername", { label })} />
              </div>
              <PasswordField slot={slot} signedIn={signedIn} label={label} />
            </div>
            {onRemove && (
              <button type="button" className={buttonClass("danger", "sm")} onClick={onRemove}>
                {t("common.remove")}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
