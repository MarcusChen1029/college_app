"use client";

// One essay row (status, Google Doc) shared by the Writing > Essays page and its per-college prompt slots.
import { useRef, useState } from "react";
import { ESSAY_STATUSES, safeLink, type Essay } from "@/lib/checklist";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";
import { essayTone } from "@/lib/status";
import { buttonClass, toneClass } from "@/lib/ui";
import { browserSupabase } from "@/lib/supabase-browser";

export const inputBase = "min-w-0 rounded-md border px-2 py-1 text-sm";
export const input = `${inputBase} border-zinc-300 bg-white`;
export const NEW_DOC_URL = "https://docs.new";

// One-click Google Docs (POST /api/google/*). Only offered when the server is configured and the student is
// signed in; otherwise the page keeps the docs.new + paste-a-link flow.
export type GoogleStatus = { configured: boolean; connected: boolean };
export type NewDocResult = { url: string } | { error: string };
export type GoogleDocs = { connected: boolean; connect: () => void; create: (essayTitle: string, index: number) => Promise<NewDocResult> };
export type GoogleAccess = { connected: boolean; connect: () => void; createNamed: (name: string) => Promise<NewDocResult> };

export async function googlePost(path: string, body: unknown = {}): Promise<{ status: number; data: Record<string, unknown> }> {
  const { data } = await browserSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { status: 401, data: { error: "unauthorized" } };
  const res = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export const GOOGLE_NOTICE: Record<string, MessageKey> = {
  connected: "writing.notice.connected",
  error: "writing.notice.error",
  reconnect: "writing.notice.reconnect",
  failed: "writing.notice.failed",
};

const STATUS_KEYS: Record<Essay["status"], MessageKey> = {
  not_started: "writing.status.not_started",
  brainstorming: "writing.status.brainstorming",
  drafting: "writing.status.drafting",
  revising: "writing.status.revising",
  final: "writing.status.final",
};

// Read once on load: /api/google/callback sends the student back with ?google=connected|error.
export function initialNotice(): string | null {
  if (typeof window === "undefined") return null;
  const g = new URLSearchParams(window.location.search).get("google");
  return g === "connected" || g === "error" ? g : null;
}

export function EssayRow({
  essay,
  index,
  onChange,
  onRemove,
  docs,
  label,
  badge,
  detail,
  removeLabel,
}: {
  essay: Essay;
  index: number;
  onChange: (patch: Partial<Essay>) => void;
  /** Omit for an essay that can't be removed. */
  onRemove?: () => void;
  docs?: GoogleDocs;
  /** A fixed name instead of an editable one (personal statement, UC questions, college prompts). */
  label?: string;
  /** Pills next to a fixed label (word limit, "Optional"…). */
  badge?: React.ReactNode;
  /** Shown under the name row: a college prompt's text. */
  detail?: React.ReactNode;
  /** Accessible name and tooltip for ✕ when it means something other than "remove essay n". */
  removeLabel?: string;
}) {
  const t = useT();
  const [pasteFailed, setPasteFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const link = safeLink(essay.url);
  const createDoc = async () => {
    if (!docs || creating) return;
    // Open the tab now, inside the click, so popup blockers allow it; point it at the doc once it exists.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setCreating(true);
    setCreateFailed(false);
    const result = await docs.create(titleRef.current?.value ?? essay.title, index);
    setCreating(false);
    if ("url" in result) {
      onChange({ url: result.url });
      if (tab) tab.location.href = result.url;
      else window.open(result.url, "_blank", "noopener,noreferrer");
    } else {
      tab?.close();
      if (result.error !== "reconnect") setCreateFailed(true);
    }
  };
  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (safeLink(text)) {
        onChange({ url: text });
        setPasteFailed(false);
      } else setPasteFailed(true);
    } catch {
      setPasteFailed(true);
    }
  };
  return (
    <li className="space-y-1.5 rounded-xl border border-zinc-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {label ? (
          <span className="flex min-w-48 flex-1 flex-wrap items-center gap-2 text-sm font-medium">
            {label}
            {badge}
          </span>
        ) : (
          <>
            <span className="w-5 text-right text-xs tabular-nums text-zinc-400">{index + 1}.</span>
            <input
              ref={titleRef}
              className={`${input} min-w-48 flex-1`}
              defaultValue={essay.title}
              placeholder={t("writing.namePlaceholder")}
              aria-label={t("writing.essayNameAria", { n: index + 1 })}
              onBlur={(e) => e.target.value !== essay.title && onChange({ title: e.target.value })}
            />
          </>
        )}
        <select
          className={`${inputBase} ${toneClass(essayTone(essay.status))}`}
          value={essay.status}
          aria-label={t("writing.statusAria", { name: label ?? t("writing.essayN", { n: index + 1 }) })}
          onChange={(e) => onChange({ status: e.target.value as Essay["status"] })}
        >
          {ESSAY_STATUSES.map(([k]) => (
            <option key={k} value={k}>
              {t(STATUS_KEYS[k])}
            </option>
          ))}
        </select>
        {onRemove && (
          <button type="button" className="rounded px-1 text-zinc-400 hover:text-urgent" aria-label={removeLabel ?? t("writing.removeEssayAria", { n: index + 1 })} title={removeLabel} onClick={onRemove}>
            ✕
          </button>
        )}
      </div>
      {detail}
      <div className={`flex flex-wrap items-center gap-2 ${label ? "" : "pl-7"}`}>
        {link ? (
          <>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("primary", "sm")}
            >
              {t("writing.openDoc")}
            </a>
            <input
              key={essay.url}
              type="url"
              className={`${input} min-w-48 flex-1 text-xs text-zinc-500`}
              defaultValue={essay.url}
              aria-label={t("writing.docLinkAria", { n: index + 1 })}
              onBlur={(e) => e.target.value.trim() !== essay.url && onChange({ url: e.target.value.trim() })}
            />
            <button type="button" className="text-xs text-zinc-500 hover:text-urgent" onClick={() => onChange({ url: "" })}>
              {t("writing.unlink")}
            </button>
          </>
        ) : (
          <>
            {docs?.connected ? (
              <button
                type="button"
                disabled={creating}
                className={buttonClass("primary", "sm")}
                title={t("writing.newDocCreateTitle")}
                onClick={createDoc}
              >
                {creating ? t("writing.creating") : t("writing.newDoc")}
              </button>
            ) : (
              <a
                href={NEW_DOC_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass("primary", "sm")}
                title={t("writing.newDocBlankTitle")}
              >
                {t("writing.newDoc")}
              </a>
            )}
            <button type="button" className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50" onClick={paste}>
              {t("writing.pasteLink")}
            </button>
            {docs && !docs.connected && (
              <button
                type="button"
                className="rounded-md border border-blue-300 px-3 py-1 text-sm text-blue-700 hover:bg-blue-50"
                title={t("writing.connectDocsTitle")}
                onClick={docs.connect}
              >
                {t("writing.connectDocs")}
              </button>
            )}
            <input
              type="url"
              className={`${input} min-w-48 flex-1`}
              defaultValue=""
              placeholder={t("writing.pastePlaceholder")}
              aria-label={t("writing.docLinkAria", { n: index + 1 })}
              onBlur={(e) => e.target.value.trim() && onChange({ url: e.target.value.trim() })}
            />
            {pasteFailed && <span className="w-full text-xs text-urgent">{t("writing.pasteFailed")}</span>}
            {createFailed && <span className="w-full text-xs text-urgent">{t(GOOGLE_NOTICE.failed)}</span>}
          </>
        )}
      </div>
    </li>
  );
}
