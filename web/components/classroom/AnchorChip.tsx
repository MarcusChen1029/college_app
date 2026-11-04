"use client";

import Link from "next/link";
import { studentHref, teacherHref } from "@/lib/anchors";
import type { AnchorInfo } from "@/lib/classroom";
import { useT } from "@/lib/i18n/client";
import { anchorText } from "./ClassroomText";

const CHIP = "inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 align-middle text-[13px] font-semibold text-ink";
const TEXT = "min-w-0 [overflow-wrap:anywhere]";

/**
 * What a conversation, comment or task is about, as a small pill. A link (with ↗) to the item when the item is still
 * there and shared (`info.available`), otherwise plain text that says so. A teacher's links need the student's id;
 * a student's general chip opens its conversation when `conversationId` is given. `onFollow` runs when the link is
 * followed, so a dialog that holds the chip can close itself.
 */
export function AnchorChip({
  info,
  role,
  studentId,
  conversationId,
  onFollow,
}: {
  info: AnchorInfo;
  role: "teacher" | "student";
  studentId?: string;
  conversationId?: string;
  onFollow?: () => void;
}) {
  const t = useT();
  const text = anchorText(t, info, role);
  const href = !info.available ? null : role === "student" ? studentHref(info.anchor, conversationId) : studentId ? teacherHref(info.anchor, studentId) : null;

  if (!href) {
    return (
      <span className={CHIP}>
        <span className={TEXT}>{text}</span>
        {!info.available && <span className="shrink-0 font-normal text-zinc-600">({t("classroom.anchor.unavailable")})</span>}
      </span>
    );
  }
  return (
    <Link href={href} onClick={onFollow} className={`${CHIP} hover:border-zinc-400 hover:bg-white`}>
      <span className={TEXT}>{text}</span>
      <span aria-hidden="true">↗</span>
    </Link>
  );
}
