"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { teacherAnchorOptions, type AnchorOption } from "@/components/classroom/anchorOptions";
import { BubbleIcon, LockIcon } from "@/components/classroom/icons";
import { TeacherItemContext, type TeacherItemContextValue } from "@/components/classroom/ItemActions";
import { TeacherDetailMessages } from "@/components/classroom/TeacherDetailMessages";
import { TeacherDetailTasks } from "@/components/classroom/TeacherDetailTasks";
import { revealItem, useFocusTarget } from "@/components/classroom/useFocusTarget";
import { useTeacherMarkers } from "@/components/classroom/useTeacherMarkers";
import { StatusPill } from "@/components/StatusPill";
import { ActivitiesPanel } from "@/components/TeacherDetailActivities";
import { CollegesPanel } from "@/components/TeacherDetailColleges";
import { EssaysPanel } from "@/components/TeacherDetailEssays";
import { InterestedPanel, OverviewPanel } from "@/components/TeacherDetailOverview";
import { btn } from "@/components/TeacherClassCard";
import { errorText, flagDetail, flagLabel } from "@/components/TeacherText";
import { TeacherNotes } from "@/components/TeacherNotes";
import { TeacherTabs } from "@/components/TeacherTabs";
import { anchorKey, teacherTabFor } from "@/lib/anchors";
import { myConversations } from "@/lib/classroom-api";
import { replyWaitingStudents, type Conversation } from "@/lib/classroom";
import { useLocale, useT } from "@/lib/i18n/client";
import { teacherStudent } from "@/lib/links-api";
import { computeFlags } from "@/lib/roster";
import { flagTone } from "@/lib/status";
import { detailToRoster } from "@/lib/roster-detail";
import { shortDate } from "@/lib/roster-view";
import { markerRoute } from "@/lib/teacher-markers";
import { useLoad } from "@/lib/use-load";

function Back() {
  const t = useT();
  return (
    <Link href="/teacher/students" className="text-sm font-semibold text-blue-700 underline underline-offset-4">
      {t("teacher.detail.back")}
    </Link>
  );
}

const badge = "rounded-full px-2.5 py-0.5 text-[13px] font-semibold";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The tab shown when the URL has no `tab` (or one this page has no tab for: TeacherTabs falls back to its first). */
const FIRST_TAB = "overview";

/**
 * What the teacher asked to do about an item (its ⋯ menu): comment on it, write a private note about it, or give the
 * student a task about it. The page holds it until the tab for that action has used it (each tab opens its form or
 * conversation on `option`, then calls back to clear it).
 */
export type Pending = { action: "comment" | "note" | "task"; option: AnchorOption };

/** The tab that holds each action. */
export const ACTION_TAB = { comment: "messages", note: "notes", task: "tasks" } as const satisfies Record<Pending["action"], string>;

/**
 * View of one linked student: header with attention flags, then Overview / Colleges / Activities / Essays / Interested, the
 * shared Tasks and Messages (conversations both of you can read) and the teacher's private Notes.
 */
export function TeacherStudentDetail({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  const load = useCallback(async () => {
    if (!UUID.test(id)) throw new Error("student not found"); // a mistyped link: skip the round trip
    return { detail: await teacherStudent(id), now: new Date() };
  }, [id]);
  const { data, error, retry } = useLoad(load);

  // This teacher's conversations, for the dot on the Messages tab and the "Reply waiting" flag. They are a convenience for
  // the header: if they can't be loaded there is simply no dot. The Messages tab loads its own copy and tells us when it changed.
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [conversationsNonce, setConversationsNonce] = useState(0);
  useEffect(() => {
    if (!UUID.test(id)) return; // a mistyped link: nothing to look up
    let live = true;
    myConversations().then(
      (list) => live && setConversations(list),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [id, conversationsNonce]);
  const reloadConversations = useCallback(() => setConversationsNonce((n) => n + 1), []);
  // Only this student's: the list is the teacher's whole inbox, and an earlier student's may still be here while this one loads.
  const replyWaiting = useMemo(() => replyWaitingStudents((conversations ?? []).filter((c) => c.otherId === id)), [conversations, id]);

  // The items a comment, note or task can be about, built once for the tabs that offer them.
  const options = useMemo(() => (data ? teacherAnchorOptions(data.detail, t) : []), [data, t]);
  const [pending, setPending] = useState<Pending | null>(null);
  const clearPending = useCallback(() => setPending(null), []);
  const presetFor = (action: Pending["action"]): AnchorOption | null => (pending?.action === action ? pending.option : null);

  // The markers on the items (a comment, private notes, open tasks): the conversations are the ones loaded above; the notes and
  // tasks are loaded by the hook and reloaded when the Notes or Tasks tab changes something.
  const [markersNonce, setMarkersNonce] = useState(0);
  const reloadMarkers = useCallback(() => setMarkersNonce((n) => n + 1), []);
  const markers = useTeacherMarkers(UUID.test(id) ? id : null, conversations, markersNonce);
  const optionByKey = useMemo(() => new Map(options.map((o) => [anchorKey(o.anchor), o])), [options]);
  // A new object each time a note marker is followed: the Notes tab then makes sure no filter hides the note.
  const [noteReveal, setNoteReveal] = useState<object | null>(null);
  const stopReveal = useRef<() => void>(() => {});
  useEffect(() => () => stopReveal.current(), []);

  // The tab and the item to jump to live in the URL (?s=<student>&tab=<tab>&focus=<kind>:<ref>, lib/anchors.ts teacherHref).
  // Choosing a tab replaces the URL entry, so tab clicks leave no history, and drops `focus`: that jump is over.
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get("tab") ?? FIRST_TAB;
  const goTab = (next: string, keepFocus: boolean) => {
    const q = new URLSearchParams(params.toString());
    q.set("tab", next);
    if (!keepFocus) q.delete("focus");
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  // A jump link whose tab is missing or wrong (an edited URL) is moved to the tab that holds the item first.
  useFocusTarget({
    ready: !!data,
    open: (a) => {
      const want = teacherTabFor(a);
      if (want !== tab) goTab(want, true);
    },
  });

  if (!data) {
    if (!error) return <div className="space-y-4"><Back /><div className="h-64 animate-pulse rounded-lg bg-zinc-100" /></div>;
    const notFound = /student not found/i.test(error);
    return (
      <div className="space-y-3">
        <Back />
        <p role="alert" className="text-sm text-urgent">
          {notFound ? t("teacher.detail.notFound") : errorText(t, error)}
        </p>
        {!notFound && (
          <button type="button" className={btn} onClick={retry}>
            {t("teacher.tryAgain")}
          </button>
        )}
      </div>
    );
  }

  const { detail, now } = data;
  const flags = computeFlags(detailToRoster(detail), now, { replyWaiting });

  // What the ⋯ menu and markers on the items do. An action holds the item in `pending` and opens the tab for it (the tab
  // opens its form or conversation on that item); a marker opens its tab too (the conversation, or the Notes / Tasks tab
  // scrolled to the first note or open task on the item: the rows carry `data-focus`, found once the tab has drawn them).
  const itemContext: TeacherItemContextValue = {
    studentName: detail.displayName,
    options: optionByKey,
    markers,
    onAction: (action, option) => {
      setPending({ action, option });
      goTab(ACTION_TAB[action], false);
    },
    onMarker: (what, option) => {
      const route = markerRoute(what, markers?.get(anchorKey(option.anchor)));
      setPending(route.openConversation ? { action: "comment", option } : null);
      if (route.tab === "notes") setNoteReveal({});
      goTab(route.tab, false);
      stopReveal.current();
      stopReveal.current = route.scrollTo ? revealItem(route.scrollTo) : () => {};
    },
  };

  return (
    <div className="space-y-6">
      <Back />
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold sm:text-3xl [overflow-wrap:anywhere]">{detail.displayName}</h1>
          {detail.profile.isInternational && <span className={`${badge} bg-blue-50 text-blue-700`}>{t("teacher.detail.international")}</span>}
          {detail.profile.needsAid && <span className={`${badge} bg-zinc-100 text-zinc-700`}>{t("teacher.detail.needsAid")}</span>}
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
          <span className="[overflow-wrap:anywhere]">{detail.email}</span>
          <span aria-hidden="true">·</span>
          {t("teacher.linked", { date: shortDate(detail.linkedAt, locale, now) })}
          {detail.classes.map((c) => (
            <span key={c.id} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[13px] text-zinc-700">
              {c.name}
            </span>
          ))}
        </p>
        <p className="text-sm">
          {t("teacher.detail.essaySharing")}<span className="font-semibold">{detail.shareEssays ? t("teacher.detail.on") : t("teacher.detail.off")}</span>
          {!detail.shareEssays && <span className="text-zinc-500"> {t("teacher.detail.notShared", { name: detail.displayName })}</span>}
        </p>
        {flags.length > 0 && (
          <ul className="space-y-2 rounded-2xl border border-zinc-200 p-4 text-sm">
            {flags.map((f) => (
              <li key={f.key} className="flex flex-wrap items-center gap-2">
                <StatusPill tone={flagTone(f.key)}>{flagLabel(t, f)}</StatusPill> {flagDetail(t, f, locale)}
              </li>
            ))}
          </ul>
        )}
      </header>

      <TeacherItemContext.Provider value={itemContext}>
        <TeacherTabs
          value={tab}
          onChange={(next) => {
            setPending(null); // choosing a tab by hand drops a request that has not been used yet
            goTab(next, false);
          }}
          label={t("teacher.detail.tabsLabel", { name: detail.displayName })}
          tabs={[
            { id: "overview", label: t("teacher.detail.tabOverview"), panel: <OverviewPanel detail={detail} now={now} /> },
            { id: "colleges", label: t("teacher.detail.tabColleges", { n: detail.colleges.length }), panel: <CollegesPanel detail={detail} now={now} /> },
            { id: "activities", label: t("teacher.detail.tabActivities"), panel: <ActivitiesPanel detail={detail} /> },
            { id: "essays", label: t("teacher.detail.tabEssays"), panel: <EssaysPanel detail={detail} /> },
            { id: "interested", label: t("teacher.detail.tabInterested", { n: detail.profile.interested.length }), panel: <InterestedPanel detail={detail} /> },
            {
              id: "tasks",
              label: t("teacher.detail.tabTasks"),
              panel: (
                <TeacherDetailTasks
                  studentId={detail.studentId}
                  studentName={detail.displayName}
                  options={options}
                  preset={presetFor("task")}
                  onPresetUsed={clearPending}
                  onChanged={reloadMarkers}
                />
              ),
            },
            {
              id: "messages",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <BubbleIcon />
                  {t("teacher.detail.tabMessages")}
                  {replyWaiting.has(detail.studentId) && (
                    <>
                      <span aria-hidden="true" className="size-2 rounded-full bg-blue-600" />
                      <span className="sr-only">({t("teacher.flag.replyWaiting")})</span>
                    </>
                  )}
                </span>
              ),
              panel: (
                <TeacherDetailMessages
                  studentId={detail.studentId}
                  studentName={detail.displayName}
                  options={options}
                  preset={presetFor("comment")}
                  onPresetUsed={clearPending}
                  onChanged={reloadConversations}
                />
              ),
            },
            {
              id: "notes",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <LockIcon />
                  {t("teacher.detail.tabNotes")}
                  <span className="sr-only">({t("teacher.detail.private")})</span>
                </span>
              ),
              keepMounted: true,
              panel: (
                <TeacherNotes
                  studentId={detail.studentId}
                  studentName={detail.displayName}
                  options={options}
                  preset={presetFor("note")}
                  onPresetUsed={clearPending}
                  reveal={noteReveal}
                  onChanged={reloadMarkers}
                />
              ),
            },
          ]}
        />
      </TeacherItemContext.Provider>
    </div>
  );
}
