"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { safeLink } from "@/lib/checklist";
import { customSummary } from "@/lib/custom-college";
import { PS_PROMPTS, sharedEssaysFor, togglePick, UC_PICKS, UC_PIQS, type EssayDoc, type PersonalEssays } from "@/lib/personal-essays";
import { useT } from "@/lib/i18n/client";
import { registerColleges, useStudent } from "@/lib/student-store";
import { entrySupplements, reuseGroups, slotPrompts, withRequiredSlots, type SupplementsData } from "@/lib/supplements";
import { buttonClass, PANEL, toneClass } from "@/lib/ui";
import type { CollegeSummary } from "@/lib/types";
import { CollegeEssayCard } from "./CollegeEssayCard";
import { EssayReusePanel } from "./EssayReusePanel";
import { EssayRow, GOOGLE_NOTICE, googlePost, initialNotice, type GoogleAccess, type GoogleDocs, type GoogleStatus } from "./EssayRow";
import { EmptyNote } from "./EmptyState";

const noop = () => () => {};

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

const SHARED_CARD = `space-y-3 ${PANEL} p-5 sm:p-6`;
const PROMPT_BOX = "rounded-xl bg-white p-3";

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
    <section id="uc-essays" className={SHARED_CARD}>
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

export function EssaysPage({ colleges, platforms, supplements }: { colleges: CollegeSummary[]; platforms: Record<string, string[]>; supplements: SupplementsData }) {
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

  // Store the prompts every applicant must write as "not started" essays, so "Essays" on the checklist can't read
  // done while one of them was never begun (e.g. only a hand-added essay is final). Runs once the list is loaded.
  const ready = mounted && student.ready;
  useEffect(() => {
    if (!ready) return;
    for (const entry of student.list) {
      const next = withRequiredSlots(entry.checklist, slotPrompts(entrySupplements(supplements, entry.slug)));
      if (next !== entry.checklist) student.update(entry.slug, { checklist: next });
    }
  }, [ready, student, supplements]);

  if (!ready) return <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

  // Custom colleges have no row in our data; without them here their Essays item could never be finished.
  const entries = student.list.flatMap((entry) => {
    const college = entry.custom ? customSummary(entry.rowId ?? entry.slug, entry.custom) : colleges.find((c) => c.slug === entry.slug);
    return college ? [{ entry, college }] : [];
  });

  const shared = sharedEssaysFor(entries.map(({ college }) => platforms[college.id]));
  const essays = student.profile.essays ?? {};
  const saveEssays = (next: PersonalEssays) => student.updateProfile({ essays: next });
  const reuse = reuseGroups(
    entries.map(({ entry, college }) => ({ slug: college.slug, name: college.short_name ?? college.name, rec: entrySupplements(supplements, college.slug), checklist: entry.checklist })),
  );

  if (entries.length === 0) {
    return (
      <EmptyNote
        action={
          <Link href="/application/list" className={buttonClass("primary", "sm")}>
            {t("application.openMyList")}
          </Link>
        }
      >
        {t("writing.emptyPre")}
        <strong className="font-semibold">{t("nav.myList")}</strong>
        {t("writing.emptyPost")}
      </EmptyNote>
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
      <EssayReusePanel groups={reuse} />
      {shared.commonApp && <PersonalStatement essays={essays} onChange={saveEssays} google={google} />}
      {shared.uc && <UcEssays essays={essays} onChange={saveEssays} google={google} />}
      {entries.map(({ entry, college }) => (
        <CollegeEssayCard
          key={`${student.auth?.userId ?? "local"}-${entry.slug}`}
          checklist={entry.checklist}
          college={college}
          rec={entrySupplements(supplements, college.slug)}
          international={!!student.profile.international}
          onChange={(checklist) => student.update(entry.slug, { checklist })}
          google={google}
        />
      ))}
    </div>
  );
}
