"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { focusAttr } from "@/lib/anchors";
import { safeLink } from "@/lib/checklist";
import { customSummary } from "@/lib/custom-college";
import { PS_PROMPTS, sharedEssaysFor, togglePick, UC_PICKS, UC_PIQS, type EssayDoc, type PersonalEssays } from "@/lib/personal-essays";
import { useT } from "@/lib/i18n/client";
import { registerColleges, useStudent } from "@/lib/student-store";
import { entrySupplements, reuseGroups, slotPrompts, withRequiredSlots, type SupplementsData } from "@/lib/supplements";
import { buttonClass, PANEL, SECTION_TITLE, toneClass } from "@/lib/ui";
import type { CollegeSummary } from "@/lib/types";
import { ItemMarkers } from "./classroom/ItemMarker";
import { useFocusTarget } from "./classroom/useFocusTarget";
import { CollegeEssayCard } from "./CollegeEssayCard";
import { DoneMark, FoldButton } from "./EssayFold";
import { EssayReusePanel } from "./EssayReusePanel";
import { EssayRow, GOOGLE_NOTICE, googlePost, initialNotice, type GoogleAccess, type GoogleDocs, type GoogleStatus } from "./EssayRow";
import { EmptyNote } from "./EmptyState";

const noop = () => () => {};

const OPEN_KEY = "essays-open";
const HASH = "#essays-";
// Fold keys for the two shared cards; colleges use their slug, which never starts with "@".
const PS_KEY = "@ps";
const UC_KEY = "@uc";
const PS_ID = "personal-statement";
const UC_ID = "uc-essays";

/** What a same-page link points at: the card to open (its fold key) and the element to bring into view. */
function hashTarget(hash: string): { key: string; id: string } | null {
  if (hash === `#${PS_ID}`) return { key: PS_KEY, id: PS_ID };
  if (hash === `#${UC_ID}`) return { key: UC_KEY, id: UC_ID };
  if (hash.startsWith(HASH) && hash.length > HASH.length) return { key: hash.slice(HASH.length), id: hash.slice(1) };
  return null;
}

/** The cards that are open, kept for this tab so a reload or the Google sign-in round trip doesn't fold them. */
function storedOpen(): Set<string> {
  try {
    const v: unknown = JSON.parse(window.sessionStorage.getItem(OPEN_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
  } catch {
    return new Set();
  }
}

/** One essay with a fixed name (status + Google Doc), stored on the profile rather than on a college. */
/** `name` is the English name used for the Google Doc title; `display` is what the student sees. */
function SharedDoc({
  name,
  display,
  displayHidden = false,
  doc,
  onChange,
  google,
}: {
  name: string;
  display: string;
  /** The heading above already names it: keep the name for screen readers only. */
  displayHidden?: boolean;
  doc: Partial<EssayDoc>;
  onChange: (patch: Partial<EssayDoc>) => void;
  google?: GoogleAccess;
}) {
  const docs: GoogleDocs | undefined = google && { connected: google.connected, connect: google.connect, create: () => google.createNamed(name) };
  return (
    <ul>
      <EssayRow
        essay={{ id: name, title: name, url: doc.url ?? "", status: doc.status ?? "not_started" }}
        index={0}
        label={display}
        labelHidden={displayHidden}
        docs={docs}
        onChange={(p) => onChange({ ...(p.status ? { status: p.status } : {}), ...(p.url !== undefined ? { url: p.url } : {}) })}
      />
    </ul>
  );
}

const SHARED_CARD = `${PANEL} p-5 sm:p-6`;
const SHARED_HEAD = "flex flex-wrap items-center gap-x-3 gap-y-1";
const PROMPT_BOX = "rounded-xl bg-white p-3";

type Fold = { expanded: boolean; onToggle: () => void };

/** A shared card's header: done mark and the title that folds it, then its one-line facts. */
function SharedHead({ id, done, title, fold, itemKey, children }: { id: string; done: boolean; title: string; fold: Fold; itemKey?: string; children: ReactNode }) {
  return (
    <div className={SHARED_HEAD}>
      <div className="flex min-w-0 items-center gap-3">
        <DoneMark done={done} />
        <h2 className={`min-w-0 ${SECTION_TITLE}`}>
          <FoldButton expanded={fold.expanded} controls={`${id}-body`} onToggle={fold.onToggle}>
            {title}
          </FoldButton>
        </h2>
      </div>
      <span className="text-[13px] text-zinc-600">{children}</span>
      <ItemMarkers itemKey={itemKey} />
    </div>
  );
}

function PersonalStatement({ essays, onChange, google, fold }: { essays: PersonalEssays; onChange: (e: PersonalEssays) => void; google?: GoogleAccess; fold: Fold }) {
  const t = useT();
  const ps = essays.ps ?? {};
  const set = (patch: NonNullable<PersonalEssays["ps"]>) => onChange({ ...essays, ps: { ...ps, ...patch } });
  return (
    <section id={PS_ID} data-focus={focusAttr({ kind: "essay", ref: "ps" })} className={SHARED_CARD}>
      <SharedHead id={PS_ID} done={ps.status === "final"} title={t("writing.psHeading")} fold={fold} itemKey={focusAttr({ kind: "essay", ref: "ps" })}>
        {t("writing.psWords")} · {t("writing.psNote")}
      </SharedHead>
      {/* Hidden rather than unmounted, as the college cards are. */}
      <div id={`${PS_ID}-body`} hidden={!fold.expanded} className="mt-3 space-y-3">
        <SharedDoc name="Common App Personal Statement" display={t("writing.psName")} displayHidden doc={ps} onChange={set} google={google} />
        {/* The seven prompts are the most useful thing here: all shown, picked like a list, the choice ringed in ink. */}
        <fieldset className="space-y-3 pt-2">
          <legend className="flex flex-wrap items-baseline gap-x-3 text-[15px] font-semibold text-ink">
            <span>
              {t("writing.psPrompts")}
              {ps.prompt ? t("writing.psChose", { n: ps.prompt }) : ""}
            </span>
            {ps.prompt && (
              <button type="button" className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-ink" onClick={() => set({ prompt: null })}>
                {t("writing.clearChoice")}
              </button>
            )}
          </legend>
          <ul className="grid gap-2 lg:grid-cols-2">
            {PS_PROMPTS.map((p, i) => (
              // An odd last prompt (the seventh) runs the full width rather than leaving half a row empty.
              <li key={p.id} className={i === PS_PROMPTS.length - 1 && PS_PROMPTS.length % 2 === 1 ? "lg:col-span-2" : undefined}>
                <label className="flex h-full cursor-pointer items-start gap-3 rounded-xl bg-white p-3 text-[15px] leading-relaxed text-ink ring-ink transition-shadow hover:ring-1 has-[:checked]:ring-2 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-blue-400">
                  <input type="radio" name="ps-prompt" className="mt-1.5 shrink-0 accent-ink" checked={ps.prompt === p.id} onChange={() => set({ prompt: p.id })} />
                  <span>
                    <strong className="tabular-nums">{p.id}.</strong> {p.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </div>
    </section>
  );
}

function UcEssays({ essays, onChange, google, fold }: { essays: PersonalEssays; onChange: (e: PersonalEssays) => void; google?: GoogleAccess; fold: Fold }) {
  const t = useT();
  const uc = essays.uc ?? {};
  const picks = uc.picks ?? [];
  const setUc = (patch: NonNullable<PersonalEssays["uc"]>) => onChange({ ...essays, uc: { ...uc, ...patch } });
  const done = picks.length === UC_PICKS && picks.every((id) => uc.docs?.[id]?.status === "final");
  return (
    <section id={UC_ID} className={SHARED_CARD}>
      <SharedHead id={UC_ID} done={done} title={t("writing.ucHeading")} fold={fold}>
        {t("writing.ucChoose", { pick: UC_PICKS, total: UC_PIQS.length })} · {t("writing.ucWords")} ·{" "}
        <span className={`tabular-nums ${picks.length === UC_PICKS ? "font-medium text-done" : ""}`}>{t("writing.ucChosen", { n: picks.length, pick: UC_PICKS })}</span>
      </SharedHead>
      <ul id={`${UC_ID}-body`} hidden={!fold.expanded} className="mt-3 space-y-2">
        {UC_PIQS.map((q) => {
          const picked = picks.includes(q.id);
          const name = `UC PIQ ${q.id}`; // English: becomes the Google Doc title
          const display = t("writing.ucName", { n: q.id });
          return (
            <li key={q.id} data-focus={focusAttr({ kind: "essay", ref: `uc:${q.id}` })} className={`${PROMPT_BOX} space-y-2`}>
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
              <ItemMarkers itemKey={focusAttr({ kind: "essay", ref: `uc:${q.id}` })} className="pl-6" />
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

  // Cards start folded: a long list was one very long page. The server renders only the skeleton, so reading
  // the tab's storage while the state is created can't make the first render differ.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => (typeof window === "undefined" ? new Set() : storedOpen()));
  const setOpen = useCallback(
    (slugs: string[], open: boolean) =>
      setOpened((prev) => {
        const next = new Set(prev);
        for (const s of slugs) {
          if (open) next.add(s);
          else next.delete(s);
        }
        return next;
      }),
    [],
  );
  useEffect(() => {
    try {
      window.sessionStorage.setItem(OPEN_KEY, JSON.stringify([...opened]));
    } catch {}
  }, [opened]);

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

  // A jump link (?focus=essay:ps, essay:uc:3, essay:supp:<slug>:<id>) opens the card that holds the essay, through the same
  // card keys the #hash links use; the hook then scrolls to the essay and flashes it.
  useFocusTarget({
    ready,
    open: (a) => {
      if (a.kind !== "essay" || !a.ref) return;
      const hash = a.ref === "ps" ? `#${PS_ID}` : a.ref.startsWith("uc:") ? `#${UC_ID}` : `${HASH}${a.ref.split(":")[1]}`;
      const target = hashTarget(hash);
      if (target) setOpen([target.key], true);
    },
  });

  // A link to one card (#essays-<slug> from the reuse chips and My list's checklist, #uc-essays from a UC campus) opens it.
  // The cards appear only once the list has loaded, after the browser's own jump to the anchor, so the card is brought
  // into view here, once it has opened: until then the page may be too short to scroll a last card to the top.
  const scrollTarget = useRef<string | null>(null);
  const openHash = useCallback(
    (hash: string) => {
      const target = hashTarget(hash);
      if (!target) return;
      scrollTarget.current = target.id;
      setOpen([target.key], true);
    },
    [setOpen],
  );
  useEffect(() => {
    if (!ready) return;
    const fromUrl = () => openHash(window.location.hash);
    fromUrl();
    window.addEventListener("hashchange", fromUrl);
    return () => window.removeEventListener("hashchange", fromUrl);
  }, [ready, openHash]);
  useEffect(() => {
    const id = scrollTarget.current;
    if (!id) return;
    scrollTarget.current = null;
    document.getElementById(id)?.scrollIntoView();
  }, [opened]);

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

  // The Common App personal statement shows before any college is on the list too: nearly every list needs it.
  const showPs = entries.length === 0 || shared.commonApp;
  const keys = [...(showPs ? [PS_KEY] : []), ...(shared.uc ? [UC_KEY] : []), ...entries.map(({ college }) => college.slug)];
  const allOpen = keys.every((k) => opened.has(k));
  const fold = (key: string): Fold => ({ expanded: opened.has(key), onToggle: () => setOpen([key], !opened.has(key)) });

  return (
    // Same-page links (the reuse chips, a UC campus's "uses the PIQs") open the card they point at, also when the URL
    // already ends in that hash and no hashchange follows.
    <div
      className="space-y-6"
      onClick={(e) => {
        const link = (e.target as Element).closest('a[href^="#"]');
        if (link) openHash(link.getAttribute("href") ?? "");
      }}
    >
      {notice && GOOGLE_NOTICE[notice] && (
        <p
          role="status"
          className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${toneClass(notice === "connected" ? "done" : "soon")}`}
        >
          <span className="flex-1">{t(GOOGLE_NOTICE[notice])}</span>
          <button type="button" className="text-base leading-none opacity-70 hover:opacity-100" aria-label={t("writing.dismiss")} onClick={() => setNotice(null)}>
            ×
          </button>
        </p>
      )}
      {entries.length > 0 && <EssayReusePanel groups={reuse} />}
      <div className="space-y-3" data-focus={focusAttr({ kind: "section", ref: "essays" })}>
        {keys.length > 1 && (
          <div className="flex justify-end">
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(keys, !allOpen)}>
              {allOpen ? t("writing.collapseAll") : t("writing.expandAll")}
            </button>
          </div>
        )}
        {showPs && <PersonalStatement essays={essays} onChange={saveEssays} google={google} fold={fold(PS_KEY)} />}
        {shared.uc && <UcEssays essays={essays} onChange={saveEssays} google={google} fold={fold(UC_KEY)} />}
        {entries.map(({ entry, college }) => (
          <CollegeEssayCard
            key={`${student.auth?.userId ?? "local"}-${entry.slug}`}
            checklist={entry.checklist}
            college={college}
            rec={entrySupplements(supplements, college.slug)}
            international={!!student.profile.international}
            onChange={(checklist) => student.update(entry.slug, { checklist })}
            google={google}
            {...fold(college.slug)}
          />
        ))}
      </div>
      {entries.length === 0 && (
        <EmptyNote
          action={
            <Link href="/application/list" className={buttonClass("secondary", "sm")}>
              {t("application.openMyList")}
            </Link>
          }
        >
          {t("writing.emptyPre")}
          <strong className="font-semibold">{t("nav.myList")}</strong>
          {t("writing.emptyPost")}
        </EmptyNote>
      )}
    </div>
  );
}
