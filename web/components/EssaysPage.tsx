"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ESSAY_STATUSES, isDone, newEssay, safeLink, type Checklist, type Essay } from "@/lib/checklist";
import { customSummary, isCustomSlug } from "@/lib/custom-college";
import { docTitle } from "@/lib/google-doc-title";
import { PS_PROMPTS, sharedEssaysFor, togglePick, UC_PICKS, UC_PIQS, type EssayDoc, type PersonalEssays } from "@/lib/personal-essays";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";
import { registerColleges, useStudent, type ListEntry } from "@/lib/student-store";
import { essayTone } from "@/lib/status";
import { buttonClass, toneClass } from "@/lib/ui";
import { browserSupabase } from "@/lib/supabase-browser";
import type { CollegeSummary } from "@/lib/types";

const noop = () => () => {};
const inputBase = "min-w-0 rounded-md border px-2 py-1 text-sm";
const input = `${inputBase} border-zinc-300 bg-white`;
const NEW_DOC_URL = "https://docs.new";

// One-click Google Docs (POST /api/google/*). Only offered when the server is configured and the student is
// signed in; otherwise the page keeps the docs.new + paste-a-link flow.
type GoogleStatus = { configured: boolean; connected: boolean };
type NewDocResult = { url: string } | { error: string };
type GoogleDocs = { connected: boolean; connect: () => void; create: (essayTitle: string, index: number) => Promise<NewDocResult> };
type GoogleAccess = { connected: boolean; connect: () => void; createNamed: (name: string) => Promise<NewDocResult> };

async function googlePost(path: string, body: unknown = {}): Promise<{ status: number; data: Record<string, unknown> }> {
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

const GOOGLE_NOTICE: Record<string, MessageKey> = {
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
function initialNotice(): string | null {
  if (typeof window === "undefined") return null;
  const g = new URLSearchParams(window.location.search).get("google");
  return g === "connected" || g === "error" ? g : null;
}

function EssayRow({
  essay,
  index,
  onChange,
  onRemove,
  docs,
  label,
}: {
  essay: Essay;
  index: number;
  onChange: (patch: Partial<Essay>) => void;
  /** Omit for an essay that can't be removed. */
  onRemove?: () => void;
  docs?: GoogleDocs;
  /** A fixed name instead of an editable one (personal statement, UC questions). */
  label?: string;
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
          <span className="min-w-48 flex-1 text-sm font-medium">{label}</span>
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
          <button type="button" className="rounded px-1 text-zinc-400 hover:text-urgent" aria-label={t("writing.removeEssayAria", { n: index + 1 })} onClick={onRemove}>
            ✕
          </button>
        )}
      </div>
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

/** One essay with a fixed name (status + Google Doc), stored on the profile rather than on a college. */
/** `name` is the English name used for the Google Doc title; `display` is what the student sees. */
function SharedDoc({ name, display, doc, onChange, google }: { name: string; display: string; doc: Partial<EssayDoc>; onChange: (patch: Partial<EssayDoc>) => void; google?: GoogleAccess }) {
  const docs: GoogleDocs | undefined = google && { connected: google.connected, connect: google.connect, create: () => google.createNamed(name) };
  return (
    <ul>
      <EssayRow
        essay={{ id: name, title: name, url: doc.url ?? "", status: doc.status ?? "not_started" }}
        index={0}
        label={display}
        docs={docs}
        onChange={(p) => onChange({ ...(p.status ? { status: p.status } : {}), ...(p.url !== undefined ? { url: p.url } : {}) })}
      />
    </ul>
  );
}

const SHARED_CARD = "space-y-3 rounded-3xl border-2 border-zinc-200 p-5";
const PROMPT_BOX = "rounded-xl border border-zinc-200 p-3";

function PersonalStatement({ essays, onChange, google }: { essays: PersonalEssays; onChange: (e: PersonalEssays) => void; google?: GoogleAccess }) {
  const t = useT();
  const ps = essays.ps ?? {};
  const set = (patch: NonNullable<PersonalEssays["ps"]>) => onChange({ ...essays, ps: { ...ps, ...patch } });
  return (
    <section className={SHARED_CARD}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-xl font-bold">{t("writing.psHeading")}</h2>
        <span className="text-xs text-zinc-500">{t("writing.psWords")} · {t("writing.psNote")}</span>
      </div>
      <SharedDoc name="Common App Personal Statement" display={t("writing.psName")} doc={ps} onChange={set} google={google} />
      <details className={PROMPT_BOX}>
        <summary className="cursor-pointer text-sm font-medium">
          {t("writing.psPrompts")}
          {ps.prompt ? t("writing.psChose", { n: ps.prompt }) : ""}
        </summary>
        <ul className="mt-2 space-y-2">
          {PS_PROMPTS.map((p) => (
            <li key={p.id}>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="ps-prompt" className="mt-1" checked={ps.prompt === p.id} onChange={() => set({ prompt: p.id })} />
                <span>
                  <strong>{p.id}.</strong> {p.text}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {ps.prompt && (
          <button type="button" className="mt-2 text-xs text-zinc-500 hover:text-urgent" onClick={() => set({ prompt: null })}>
            {t("writing.clearChoice")}
          </button>
        )}
      </details>
    </section>
  );
}

function UcEssays({ essays, onChange, google }: { essays: PersonalEssays; onChange: (e: PersonalEssays) => void; google?: GoogleAccess }) {
  const t = useT();
  const uc = essays.uc ?? {};
  const picks = uc.picks ?? [];
  const setUc = (patch: NonNullable<PersonalEssays["uc"]>) => onChange({ ...essays, uc: { ...uc, ...patch } });
  return (
    <section className={SHARED_CARD}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-xl font-bold">{t("writing.ucHeading")}</h2>
        <span className="text-xs text-zinc-500">
          {t("writing.ucChoose", { pick: UC_PICKS, total: UC_PIQS.length })} · {t("writing.ucWords")} ·{" "}
          <span className={`tabular-nums ${picks.length === UC_PICKS ? "font-medium text-done" : ""}`}>
            {t("writing.ucChosen", { n: picks.length, pick: UC_PICKS })}
          </span>
        </span>
      </div>
      <ul className="space-y-2">
        {UC_PIQS.map((q) => {
          const picked = picks.includes(q.id);
          const name = `UC PIQ ${q.id}`; // English: becomes the Google Doc title
          const display = t("writing.ucName", { n: q.id });
          return (
            <li key={q.id} className={`${PROMPT_BOX} space-y-2`}>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  aria-label={t("writing.answerQuestionAria", { n: q.id })}
                  checked={picked}
                  disabled={!picked && picks.length >= UC_PICKS}
                  onChange={() => {
                    const next = togglePick(picks, q.id);
                    if (next) setUc({ picks: next });
                  }}
                />
                <details className="min-w-0 flex-1">
                  <summary className="cursor-pointer text-sm font-medium">
                    {q.id}. {q.title}
                  </summary>
                  <p className="mt-1 text-sm text-zinc-600">{q.text}</p>
                </details>
              </div>
              {picked && (
                <div className="pl-6">
                  <SharedDoc name={name} display={display} doc={uc.docs?.[q.id] ?? {}} onChange={(p) => setUc({ docs: { ...uc.docs, [q.id]: { ...uc.docs?.[q.id], ...p } } })} google={google} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CollegeEssays({
  entry,
  college,
  onChange,
  google,
}: {
  entry: ListEntry;
  college: CollegeSummary;
  onChange: (checklist: Checklist) => void;
  google?: GoogleAccess;
}) {
  const t = useT();
  const docs: GoogleDocs | undefined = google && {
    connected: google.connected,
    connect: google.connect,
    create: (essayTitle, index) => google.createNamed(docTitle(college, essayTitle, index)),
  };
  const c = entry.checklist;
  const essays = c.essay_list ?? [];
  const set = (patch: Partial<Checklist>) => onChange({ ...c, ...patch });
  const setEssay = (id: string, patch: Partial<Essay>) => set({ essay_list: essays.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const finals = essays.filter((e) => e.status === "final").length;
  const done = isDone("essays", c);
  return (
    <section className="rounded-3xl border-2 border-zinc-200 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${done ? "bg-done text-white" : "border border-zinc-300"}`}
          aria-label={done ? t("writing.essaysDoneAria") : t("writing.essaysNotDoneAria")}
        >
          {done ? "✓" : ""}
        </span>
        <h2 className="text-xl font-bold">
          {isCustomSlug(college.slug) ? (
            college.name
          ) : (
            <Link href={`/colleges/${college.slug}`} className="hover:underline">
              {college.name}
            </Link>
          )}
        </h2>
        {essays.length > 0 && !c.no_essays && <span className="text-xs tabular-nums text-zinc-500">{t("writing.finalCount", { done: finals, total: essays.length })}</span>}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600">
          <input type="checkbox" checked={!!c.no_essays} onChange={(e) => set({ no_essays: e.target.checked })} />
          {t("writing.noEssaysRequired")}
        </label>
      </div>
      {!c.no_essays && (
        <div className="space-y-2">
          {essays.length > 0 ? (
            <ul className="space-y-2">
              {essays.map((e, i) => (
                <EssayRow
                  key={e.id}
                  essay={e}
                  index={i}
                  onChange={(patch) => setEssay(e.id, patch)}
                  onRemove={() => set({ essay_list: essays.filter((x) => x.id !== e.id) })}
                  docs={docs}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">{t("writing.noEssaysYet")}</p>
          )}
          <button
            type="button"
            className="rounded-md border border-dashed border-zinc-300 px-3 py-1 text-sm text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
            onClick={() => set({ essay_list: [...essays, newEssay()] })}
          >
            {t("writing.addEssay")}
          </button>
        </div>
      )}
    </section>
  );
}

export function EssaysPage({ colleges, platforms }: { colleges: CollegeSummary[]; platforms: Record<string, string[]> }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => registerColleges(colleges), [colleges, student.list.length]);

  const userId = student.auth?.userId;
  const [status, setStatus] = useState<(GoogleStatus & { userId: string }) | null>(null);
  const [notice, setNotice] = useState<string | null>(initialNotice);
  useEffect(() => {
    // Drop ?google=… so a reload doesn't repeat the message.
    const url = new URL(window.location.href);
    if (url.searchParams.has("google")) {
      url.searchParams.delete("google");
      window.history.replaceState(window.history.state, "", url);
    }
  }, []);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    googlePost("/api/google/status")
      .then(({ data }) => live && setStatus({ userId, configured: data.configured === true, connected: data.connected === true }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId]);

  // Signed out, not configured, or status not loaded yet: undefined keeps the original paste-a-link flow.
  const current = status && status.userId === userId && status.configured ? status : null;
  const google: GoogleAccess | undefined = current
    ? {
        connected: current.connected,
        connect: async () => {
          setNotice(null);
          const { data } = await googlePost("/api/google/start").catch(() => ({ data: {} as Record<string, unknown> }));
          if (typeof data.url === "string" && data.url.startsWith("https://accounts.google.com/")) window.location.assign(data.url);
          else setNotice("error");
        },
        createNamed: async (name) => {
          const { data } = await googlePost("/api/google/doc", { title: name }).catch(() => ({ data: {} as Record<string, unknown> }));
          if (typeof data.url === "string" && safeLink(data.url)) return { url: data.url };
          const error = typeof data.error === "string" ? data.error : "failed";
          if (error === "reconnect" || error === "not_connected") {
            setStatus({ ...current, connected: false });
            setNotice("reconnect");
            return { error: "reconnect" };
          }
          if (error === "not_configured") setStatus({ ...current, configured: false });
          return { error };
        },
      }
    : undefined;

  if (!mounted || !student.ready) return <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

  // Custom colleges have no row in our data; without them here their Essays item could never be finished.
  const entries = student.list.flatMap((entry) => {
    const college = entry.custom ? customSummary(entry.rowId ?? entry.slug, entry.custom) : colleges.find((c) => c.slug === entry.slug);
    return college ? [{ entry, college }] : [];
  });

  const shared = sharedEssaysFor(entries.map(({ college }) => platforms[college.id]));
  const essays = student.profile.essays ?? {};
  const saveEssays = (next: PersonalEssays) => student.updateProfile({ essays: next });

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        {t("writing.emptyPre")}
        <Link href="/application/list" className="text-blue-600 underline">
          {t("nav.myList")}
        </Link>
        {t("writing.emptyPost")}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {notice && GOOGLE_NOTICE[notice] && (
        <p
          role="status"
          className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${toneClass(notice === "connected" ? "done" : "soon")}`}
        >
          <span className="flex-1">{t(GOOGLE_NOTICE[notice])}</span>
          <button type="button" className="text-xs opacity-70 hover:opacity-100" aria-label={t("writing.dismiss")} onClick={() => setNotice(null)}>
            ✕
          </button>
        </p>
      )}
      {shared.commonApp && <PersonalStatement essays={essays} onChange={saveEssays} google={google} />}
      {shared.uc && <UcEssays essays={essays} onChange={saveEssays} google={google} />}
      {entries.map(({ entry, college }) => (
        <CollegeEssays
          key={`${student.auth?.userId ?? "local"}-${entry.slug}`}
          entry={entry}
          college={college}
          onChange={(checklist) => student.update(entry.slug, { checklist })}
          google={google}
        />
      ))}
    </div>
  );
}
