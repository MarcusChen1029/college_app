"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ESSAY_STATUSES, isDone, newEssay, safeLink, type Checklist, type Essay } from "@/lib/checklist";
import { docTitle } from "@/lib/google-doc-title";
import { registerColleges, useStudent, type ListEntry } from "@/lib/student-store";
import { browserSupabase } from "@/lib/supabase-browser";
import type { CollegeSummary } from "@/lib/types";

const noop = () => () => {};
const input = "min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm";
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

const GOOGLE_NOTICE: Record<string, string> = {
  connected: "Google Docs connected. + New Google Doc now creates the doc in your Google Drive and links it here.",
  error: "Couldn't connect Google Docs. Try again, or keep using + New Google Doc and Paste link.",
  reconnect: "Google Docs access has expired or was removed. Press Connect Google Docs to turn it back on.",
  failed: "Couldn't create the Google Doc. Try again in a moment, or use Paste link.",
};

// Read once on load: /api/google/callback sends the student back with ?google=connected|error.
function initialNotice(): string | null {
  if (typeof window === "undefined") return null;
  const g = new URLSearchParams(window.location.search).get("google");
  return g === "connected" || g === "error" ? g : null;
}

const TONE: Record<Essay["status"], string> = {
  not_started: "text-zinc-500",
  brainstorming: "text-blue-700",
  drafting: "text-amber-700",
  revising: "text-violet-700",
  final: "text-emerald-700",
};

function EssayRow({
  essay,
  index,
  onChange,
  onRemove,
  docs,
}: {
  essay: Essay;
  index: number;
  onChange: (patch: Partial<Essay>) => void;
  onRemove: () => void;
  docs?: GoogleDocs;
}) {
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
        <span className="w-5 text-right text-xs tabular-nums text-zinc-400">{index + 1}.</span>
        <input
          ref={titleRef}
          className={`${input} min-w-48 flex-1`}
          defaultValue={essay.title}
          placeholder="Prompt or name, e.g. Why us?"
          aria-label={`Essay ${index + 1} name`}
          onBlur={(e) => e.target.value !== essay.title && onChange({ title: e.target.value })}
        />
        <select
          className={`${input} ${TONE[essay.status]}`}
          value={essay.status}
          aria-label={`Essay ${index + 1} status`}
          onChange={(e) => onChange({ status: e.target.value as Essay["status"] })}
        >
          {ESSAY_STATUSES.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" className="rounded px-1 text-zinc-400 hover:text-rose-600" aria-label={`Remove essay ${index + 1}`} onClick={onRemove}>
          ✕
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-7">
        {link ? (
          <>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
            >
              Open Google Doc ↗
            </a>
            <input
              key={essay.url}
              type="url"
              className={`${input} min-w-48 flex-1 text-xs text-zinc-500`}
              defaultValue={essay.url}
              aria-label={`Essay ${index + 1} Google Doc link`}
              onBlur={(e) => e.target.value.trim() !== essay.url && onChange({ url: e.target.value.trim() })}
            />
            <button type="button" className="text-xs text-zinc-500 hover:text-rose-600" onClick={() => onChange({ url: "" })}>
              Unlink
            </button>
          </>
        ) : (
          <>
            {docs?.connected ? (
              <button
                type="button"
                disabled={creating}
                className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                title="Creates a Google Doc in your Drive, links it to this essay and opens it."
                onClick={createDoc}
              >
                {creating ? "Creating…" : "+ New Google Doc ↗"}
              </button>
            ) : (
              <a
                href={NEW_DOC_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
                title="Opens a blank Google Doc in a new tab. Copy its link and press Paste link."
              >
                + New Google Doc ↗
              </a>
            )}
            <button type="button" className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50" onClick={paste}>
              Paste link
            </button>
            {docs && !docs.connected && (
              <button
                type="button"
                className="rounded-md border border-blue-300 px-3 py-1 text-sm text-blue-700 hover:bg-blue-50"
                title="Lets this site create essay docs in your Google Drive in one click. It can only see files it creates."
                onClick={docs.connect}
              >
                Connect Google Docs
              </button>
            )}
            <input
              type="url"
              className={`${input} min-w-48 flex-1`}
              defaultValue=""
              placeholder="…or paste an existing Google Doc link"
              aria-label={`Essay ${index + 1} Google Doc link`}
              onBlur={(e) => e.target.value.trim() && onChange({ url: e.target.value.trim() })}
            />
            {pasteFailed && <span className="w-full text-xs text-rose-600">No link found on your clipboard. Copy the doc&apos;s address first, or paste it into the box.</span>}
            {createFailed && <span className="w-full text-xs text-rose-600">{GOOGLE_NOTICE.failed}</span>}
          </>
        )}
      </div>
    </li>
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
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${done ? "bg-emerald-600 text-white" : "border border-zinc-300"}`}
          aria-label={done ? "essays done" : "essays not done"}
        >
          {done ? "✓" : ""}
        </span>
        <h2 className="text-xl font-bold">
          <Link href={`/colleges/${college.slug}`} className="hover:underline">
            {college.name}
          </Link>
        </h2>
        {essays.length > 0 && !c.no_essays && <span className="text-xs tabular-nums text-zinc-500">{finals}/{essays.length} final</span>}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600">
          <input type="checkbox" checked={!!c.no_essays} onChange={(e) => set({ no_essays: e.target.checked })} />
          This college requires no essays
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
            <p className="text-sm text-zinc-500">No essays added yet.</p>
          )}
          <button
            type="button"
            className="rounded-md border border-dashed border-zinc-300 px-3 py-1 text-sm text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
            onClick={() => set({ essay_list: [...essays, newEssay()] })}
          >
            + Add essay
          </button>
        </div>
      )}
    </section>
  );
}

export function EssaysPage({ colleges }: { colleges: CollegeSummary[] }) {
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

  const entries = student.list.flatMap((entry) => {
    const college = colleges.find((c) => c.slug === entry.slug);
    return college ? [{ entry, college }] : [];
  });

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        Add colleges to{" "}
        <Link href="/application/list" className="text-blue-600 underline">
          My list
        </Link>{" "}
        and their essays will show up here.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {notice && GOOGLE_NOTICE[notice] && (
        <p
          role="status"
          className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${notice === "connected" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
        >
          <span className="flex-1">{GOOGLE_NOTICE[notice]}</span>
          <button type="button" className="text-xs opacity-70 hover:opacity-100" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ✕
          </button>
        </p>
      )}
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
