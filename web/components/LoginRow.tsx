"use client";

import { useState } from "react";
import { safeLink } from "@/lib/checklist";
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

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      className="shrink-0 rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
      aria-label={label}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? t("common.copied") : t("common.copy")}
    </button>
  );
}

/**
 * One portal as a collapsible box. The name opens the portal in a new tab; clicking anywhere
 * else on the box shows the saved login for checking or editing (saved on blur).
 */
export function LoginRow({
  name,
  hint,
  official,
  login,
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
  onSave: (l: Login) => void;
  onRemove?: () => void;
  onRename?: (name: string) => void;
  progress?: RowProgress;
  /** Shown left of the Done / Not done buttons (or alone when the row has no buttons), e.g. a count or a small pill. */
  status?: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(!name && !!onRename);
  const [show, setShow] = useState(false);
  const save = (patch: Partial<Login>) => {
    const next = { ...login, ...patch };
    if (next.url !== login.url || next.username !== login.username || next.password !== login.password) onSave(next);
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
              <div className="flex items-center gap-1">
                <input
                  type={show ? "text" : "password"}
                  className={`${input} flex-1`}
                  defaultValue={login.password}
                  placeholder={t("portals.passwordPlaceholder")}
                  autoComplete="new-password"
                  aria-label={t("portals.passwordFor", { label })}
                  onBlur={(e) => save({ password: e.target.value })}
                />
                <button type="button" className="shrink-0 rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-100" onClick={() => setShow((v) => !v)}>
                  {show ? t("portals.hide") : t("portals.show")}
                </button>
                <CopyButton value={login.password} label={t("portals.copyPassword", { label })} />
              </div>
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
