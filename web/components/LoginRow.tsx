"use client";

import { useEffect, useRef, useState } from "react";
import { safeLink } from "@/lib/checklist";
import { PASSWORD_MAX } from "@/lib/portal-slots";
import { copySecret, copyText, deletePassword, loadSlots, revealPassword, savePassword, useVault, type VaultError } from "@/lib/portal-vault-client";
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

const VAULT_ERROR_TEXT: Record<VaultError, MessageKey> = {
  unauthorized: "portals.passwordSignedOutNote",
  unavailable: "portals.passwordUnavailable",
  not_found: "portals.passwordMissing",
  unreadable: "portals.passwordUnreadable",
  too_many: "portals.passwordTooMany",
  failed: "portals.passwordError",
};

/**
 * The password of one login. It is never part of the login data: the page learns which slots hold a password
 * (once), and one password is fetched from the encrypted store only for Show or Copy, held by this field while the
 * row is open, and forgotten on Hide. Typing a new one saves it on blur; Clear deletes it. Signed out it stays off:
 * passwords are only kept, encrypted, in an account.
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
  useEffect(() => {
    if (signedIn && slot) void loadSlots();
  }, [signedIn, slot]);
  useEffect(() => () => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
  }, []);

  const flash = (key: MessageKey) => {
    setNote(key);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 6000);
  };
  const forget = () => {
    setDraft("");
    setRevealed(null);
    setShow(false);
  };

  const usable = signedIn && !!slot && vault.status !== "unavailable";
  const saved = !!slot && vault.slots.has(slot);
  const editing = draft !== (revealed ?? "");

  const fetchSaved = async (): Promise<string | null> => {
    if (!slot) return null;
    if (revealed !== null) return revealed;
    setBusy(true);
    const r = await revealPassword(slot);
    setBusy(false);
    if ("error" in r) {
      flash(VAULT_ERROR_TEXT[r.error]);
      return null;
    }
    return r.password;
  };

  const commit = async () => {
    if (!usable || !slot || !editing) return;
    const value = draft;
    // An emptied field changes nothing (the saved password stays); deleting one takes Clear, which asks first.
    if (!value) return forget();
    setBusy(true);
    const err = await savePassword(slot, value);
    setBusy(false);
    if (err) return flash(VAULT_ERROR_TEXT[err]);
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
    if (!slot || !window.confirm(t("portals.clearPasswordConfirm", { label }))) return;
    setBusy(true);
    const err = await deletePassword(slot);
    setBusy(false);
    if (err) return flash(VAULT_ERROR_TEXT[err]);
    forget();
    flash("portals.passwordDeletedNote");
  };

  const placeholder = !signedIn
    ? t("portals.passwordSignedOut")
    : vault.status === "unavailable"
      ? t("portals.passwordOff")
      : saved
        ? t("portals.passwordSaved")
        : vault.status === "loading"
          ? t("portals.passwordChecking")
          : t("portals.passwordPlaceholder");
  const standing: MessageKey | null = !signedIn
    ? "portals.passwordSignedOutNote"
    : vault.status === "unavailable"
      ? "portals.passwordUnavailable"
      : vault.status === "error"
        ? "portals.passwordError"
        : null;
  const shown = note ?? standing;
  // Keeps focus in the field while a button is pressed, so pressing Show doesn't first save a half-typed password.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <input
          type={show ? "text" : "password"}
          className={`${input} flex-1 disabled:bg-zinc-50`}
          value={draft}
          maxLength={PASSWORD_MAX}
          disabled={!usable}
          placeholder={placeholder}
          // A portal's password, not this site's: keep browsers and password managers from saving or filling it here.
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          aria-label={t("portals.passwordFor", { label })}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
        />
        {usable && (draft || saved) && (
          <button type="button" className={smallButton} disabled={busy} onMouseDown={keepFocus} onClick={() => void toggleShow()}>
            {show ? t("portals.hide") : t("portals.show")}
          </button>
        )}
        {usable && saved && !editing && (
          <>
            <button type="button" className={smallButton} disabled={busy} aria-label={t("portals.copyPassword", { label })} onMouseDown={keepFocus} onClick={() => void copy()}>
              {t("common.copy")}
            </button>
            <button type="button" className={smallButton} disabled={busy} aria-label={t("portals.clearPasswordFor", { label })} onMouseDown={keepFocus} onClick={() => void clear()}>
              {t("portals.clearPassword")}
            </button>
          </>
        )}
      </div>
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
      <div className={`rounded-xl border ${open ? "border-blue-300 bg-blue-50" : "border-zinc-200 bg-white"}`}>
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
