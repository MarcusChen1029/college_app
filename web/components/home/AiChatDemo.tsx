"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { StatusPill } from "@/components/StatusPill";

export type AiChatDemoLabels = {
  example: string;
  user1: string;
  ai1: string;
  user2: string;
  ai2: string;
  list: string;
  rice: string;
  northwestern: string;
  submitted: string;
  inProgress: string;
};

/** One moment of the script: which message is being typed (and how far), how many bubbles are out, and whether the AI is
 *  "thinking" (dots under the last message). Bubbles go out in order: user 1, AI 1, user 2, AI 2. */
type Frame = { draft: 0 | 1 | 2; typed: number; sent: number; thinking: boolean };

const FINAL: Frame = { draft: 0, typed: 0, sent: 4, thinking: false };
const START_MS = 500;
const HOLD_TYPED_MS = 380;
const HOLD_SENT_MS = 450;
const THINK_MS = 1100;
const HOLD_ANSWER_MS = 1700;

/** Each frame with how long it stays. A message types in about a second whatever its length (letters or characters). */
function script(len1: number, len2: number): [Frame, number][] {
  const out: [Frame, number][] = [];
  let sent = 0;
  for (const [draft, len] of [[1, len1], [2, len2]] as const) {
    const perChar = Math.min(90, Math.max(40, Math.round(1000 / len)));
    for (let n = 0; n <= len; n++) out.push([{ draft, typed: n, sent, thinking: false }, n === len ? HOLD_TYPED_MS : perChar]);
    sent += 1;
    out.push([{ draft: 0, typed: 0, sent, thinking: false }, HOLD_SENT_MS]);
    out.push([{ draft: 0, typed: 0, sent, thinking: true }, THINK_MS]);
    sent += 1;
    out.push([{ draft: 0, typed: 0, sent, thinking: false }, HOLD_ANSWER_MS]);
  }
  return out;
}

// Plays only with motion allowed and an IntersectionObserver; otherwise (and on the server) the finished chat shows.
const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribe = (onChange: () => void) => {
  const m = window.matchMedia(REDUCE);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
};
const canAnimate = () => "IntersectionObserver" in window && !window.matchMedia(REDUCE).matches;

const SHOWN = "opacity-100 translate-y-0";
const HIDDEN = "opacity-0 translate-y-2";
const FADE = "transition-[opacity,translate] duration-300 ease-out motion-reduce:transition-none";

/**
 * The home page's example chat: a student tells their AI "I submitted Rice today", the AI answers, and the list card
 * beside it flips Rice to Submitted; then "What's left this week?" gets the open items from the same list. Plays once,
 * when the chat is 40% in view. Only list actions (status, checklist): no college facts. Every bubble holds its full
 * text from the start (space reserved, nothing reflows; screen readers read the whole chat); only opacity and
 * transform change. The typing happens in the composer, which is decoration.
 */
export function AiChatDemo({ labels }: { labels: AiChatDemoLabels }) {
  const animate = useSyncExternalStore(subscribe, canAnimate, () => false);
  const drafts = useMemo(() => [Array.from(labels.user1), Array.from(labels.user2)] as const, [labels.user1, labels.user2]);
  const frames = useMemo(() => script(drafts[0].length, drafts[1].length), [drafts]);
  const [step, setStep] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chatRef.current;
    if (!animate || !el) return;
    let timer: number | undefined;
    let i = 0;
    const next = () => {
      i += 1;
      setStep(i);
      if (i < frames.length - 1) timer = window.setTimeout(next, frames[i][1]);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        timer = window.setTimeout(next, START_MS + frames[0][1]);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [animate, frames]);

  // Clamped: a language switch can swap in shorter messages mid-play.
  const f = animate ? frames[Math.min(step, frames.length - 1)][0] : FINAL;
  const draft = f.draft === 0 ? [] : drafts[f.draft - 1];
  const riceDone = f.sent >= 2;
  const messages = [
    { from: "user", text: labels.user1 },
    { from: "ai", text: labels.ai1 },
    { from: "user", text: labels.user2 },
    { from: "ai", text: labels.ai2 },
  ] as const;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_17.5rem] md:items-end">
      <div ref={chatRef} className="rounded-[28px] bg-white p-4 sm:p-6">
        <p className="inline-flex rounded-full bg-sun px-3 py-1 text-[13px] font-semibold text-ink">{labels.example}</p>
        <ol className="mt-5 space-y-3">
          {messages.map((m, i) => {
            const shown = i < f.sent;
            return m.from === "user" ? (
              <li key={i} className={`flex justify-end ${FADE} ${shown ? SHOWN : HIDDEN}`}>
                <span className="max-w-[85%] rounded-[22px] rounded-br-md bg-ink px-4 py-2.5 text-base leading-snug text-white">{m.text}</span>
              </li>
            ) : (
              <li key={i} className="relative">
                <span aria-hidden className={`absolute left-0 top-0 flex gap-1 rounded-[22px] rounded-bl-md bg-blue-100 px-4 py-4 ${FADE} ${f.thinking && f.sent === i ? SHOWN : HIDDEN}`}>
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="size-2 rounded-full bg-ink/50 motion-safe:animate-pulse" style={{ animationDelay: `${d * 160}ms` }} />
                  ))}
                </span>
                <span
                  className={`block w-fit max-w-[92%] whitespace-pre-line rounded-[22px] rounded-bl-md bg-blue-100 px-4 py-2.5 text-base leading-snug text-ink ${FADE} ${shown ? SHOWN : HIDDEN}`}
                >
                  {m.text}
                </span>
              </li>
            );
          })}
        </ol>
        {/* The composer: the message types itself in, one character at a time; the untyped rest already holds its place
            (invisible), so the caret moves without anything reflowing. */}
        <div aria-hidden className="mt-5 flex h-12 items-center gap-2 rounded-full bg-zinc-100 pl-5 pr-1.5">
          <span className="min-w-0 flex-1 overflow-hidden whitespace-pre text-base text-ink">
            {draft.slice(0, f.typed).join("")}
            {f.draft !== 0 && <span className="-mx-px inline-block h-[1.15em] w-0.5 bg-ink align-[-0.2em] motion-safe:animate-pulse" />}
            <span className="opacity-0">{draft.slice(f.typed).join("")}</span>
          </span>
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white transition-[opacity,scale] duration-200 ${
              f.draft !== 0 && f.typed > 0 ? "opacity-100" : "opacity-30"
            } ${f.draft !== 0 && f.typed === draft.length ? "scale-90" : "scale-100"}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </span>
        </div>
      </div>

      {/* The list card, a receipt like the ones above: Rice ticks to Submitted when the AI answers. */}
      <div className="torn mx-auto w-full max-w-[19rem] rotate-[1.5deg] bg-zinc-50 pb-5 text-ink md:mx-0 md:mb-10 md:max-w-none">
        <div className="px-5 pt-5">
          <p className="font-display text-xl font-bold leading-tight">{labels.list}</p>
          <div aria-hidden className="tear mt-3" />
          <ul className="mt-3 space-y-3">
            <li className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold">{labels.rice}</span>
              <span key={riceDone ? "done" : "open"} className={animate ? "roll" : undefined}>
                <StatusPill tone={riceDone ? "done" : "progress"}>{riceDone ? labels.submitted : labels.inProgress}</StatusPill>
              </span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold">{labels.northwestern}</span>
              <StatusPill tone="progress">{labels.inProgress}</StatusPill>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
