"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { TeacherGate } from "@/components/TeacherGate";
import { TeacherTabs } from "@/components/TeacherTabs";
import { useT } from "@/lib/i18n/client";
import { TeacherAnnouncements } from "./TeacherAnnouncements";
import { TeacherConversationList } from "./TeacherConversationList";

type Tab = "conversations" | "announcements";

/** The page's own address, so a reload or a shared link comes back to the same tab and conversation (spec 4.2). */
function messagesUrl(tab: Tab, conversationId: string | null): string {
  if (conversationId) return `/teacher/messages?c=${encodeURIComponent(conversationId)}`;
  return tab === "announcements" ? "/teacher/messages?tab=announcements" : "/teacher/messages";
}

const tabOf = (c: string | null, tab: string | null): Tab => (!c && tab === "announcements" ? "announcements" : "conversations");

function Board() {
  const t = useT();
  const params = useSearchParams();

  // The address (?c=<conversation>, ?tab=announcements) says what is open. Opening and closing keep it in step with
  // replaceState, so nothing navigates; an address that changes some other way (back, a link) is picked up here.
  const c = params.get("c");
  const tabParam = params.get("tab");
  const key = `${c ?? ""}|${tabParam ?? ""}`;
  const [seen, setSeen] = useState(key);
  const [openId, setOpenId] = useState<string | null>(c);
  const [tab, setTab] = useState<Tab>(tabOf(c, tabParam));
  if (key !== seen) {
    setSeen(key);
    setOpenId(c);
    setTab(tabOf(c, tabParam));
  }

  const openConversation = (id: string | null) => {
    setOpenId(id);
    window.history.replaceState(null, "", messagesUrl("conversations", id));
  };

  const selectTab = (next: string) => {
    const to: Tab = next === "announcements" ? "announcements" : "conversations";
    setTab(to);
    setOpenId(null);
    window.history.replaceState(null, "", messagesUrl(to, null));
  };

  return (
    <TeacherTabs
      label={t("classroom.msgs.tabsLabel")}
      value={tab}
      onChange={selectTab}
      tabs={[
        { id: "conversations", label: t("classroom.msgs.tab.conversations"), panel: <TeacherConversationList openId={openId} onOpen={openConversation} /> },
        { id: "announcements", label: t("classroom.msgs.tab.announcements"), panel: <TeacherAnnouncements /> },
      ]}
    />
  );
}

/**
 * The teacher's Messages page (spec 5.3, /teacher/messages): Conversations with their students and the Announcements
 * they post. Teachers only. Reads the address, so the page that renders it needs a Suspense boundary.
 */
export function TeacherMessages() {
  const t = useT();
  return (
    <TeacherGate returnTo="/teacher/messages">
      <div className="space-y-5">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("nav.messages")}</h1>
        <Board />
      </div>
    </TeacherGate>
  );
}
