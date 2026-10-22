"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildContextPack, type PackCollege } from "@/lib/ai-context";
import type { StudentProfile } from "@/lib/fit";
import type { Plan } from "@/lib/plans";
import type { CollegeDetail, Deadline, Lookups } from "@/lib/types";
import { Modal } from "./Modal";

type Details = Record<string, CollegeDetail | null>;
type Load = { state: "loading" } | { state: "done"; details: Details } | { state: "error"; message: string };

/** Fetches full records for the listed colleges once the dialog opens (paid plans only). */
function useDetails(slugs: string[], enabled: boolean): Load | null {
  const key = slugs.join(",");
  const [load, setLoad] = useState<{ key: string; load: Load } | null>(null);
  useEffect(() => {
    if (!enabled || !key) return;
    let live = true;
    fetch(`/api/college-details?slugs=${encodeURIComponent(key)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return ((await r.json()) as { colleges: Details }).colleges;
      })
      .then((details) => live && setLoad({ key, load: { state: "done", details } }))
      .catch((e: Error) => live && setLoad({ key, load: { state: "error", message: e.message } }));
    return () => {
      live = false;
    };
  }, [key, enabled]);
  if (!enabled || !key) return null;
  return load?.key === key ? load.load : { state: "loading" };
}

function Dialog({
  colleges,
  profile,
  plan,
  deadlines,
  lookups,
  onClose,
}: {
  colleges: Omit<PackCollege, "detail">[];
  profile: StudentProfile;
  plan: Plan;
  deadlines: Deadline[];
  lookups: Pick<Lookups, "plans" | "englishTests">;
  onClose: () => void;
}) {
  const full = plan.fullAiContext;
  const load = useDetails(colleges.map((c) => c.college.slug), full);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);

  const text = useMemo(() => {
    if (full && load?.state === "loading") return null;
    const details = load?.state === "done" ? load.details : {};
    return buildContextPack({
      profile,
      colleges: colleges.map((c) => ({ ...c, detail: full ? details[c.college.slug] ?? null : undefined })),
      deadlines,
      planLabels: Object.fromEntries(lookups.plans.map((p) => [p.key, p.label])),
      englishTestNames: Object.fromEntries(lookups.englishTests.map((t) => [t.key, t.name])),
      full,
    });
  }, [full, load, profile, colleges, deadlines, lookups]);

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  };
  const download = () => {
    if (!text) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    a.download = "college-application-context.md";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Modal title={<h2 className="text-lg font-semibold">Copy for AI</h2>} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-zinc-600 dark:text-zinc-300">
          Paste this into ChatGPT, Claude or Gemini so it starts from your real scores, list and deadlines instead of guessing. Portal logins and
          notes are never included.
        </p>
        {full ? (
          <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            Full version ({plan.name} plan): each college&apos;s deadlines, English minimums, essays, cost and aid, how majors are admitted, your
            activities and a numbered source link for every number.
          </p>
        ) : (
          <p className="rounded-md bg-blue-50 p-2 text-xs text-blue-900 dark:bg-blue-950 dark:text-blue-100">
            Free version: your profile and a one-line summary per college.{" "}
            <Link href="/pricing" className="font-semibold underline">
              Upgrade
            </Link>{" "}
            to include every college&apos;s deadlines, English minimums, essays, cost and aid, your activities, and a source link for every number,
            so your AI can check its answers against official data.
          </p>
        )}
        {load?.state === "error" && (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Couldn&apos;t load college details ({load.message}). The text below has the summary only for now.
          </p>
        )}
        {text == null ? (
          <div className="h-80 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" aria-label="Loading college details" />
        ) : (
          <textarea
            readOnly
            value={text}
            className="h-80 w-full resize-y rounded-md border border-zinc-300 bg-zinc-50 p-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            aria-label="Context to paste into your AI"
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50" disabled={!text} onClick={copy}>
            Copy to clipboard
          </button>
          <button
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            disabled={!text}
            onClick={download}
          >
            Download .md
          </button>
          {copied && (
            <span role="status" className="text-xs text-zinc-500">
              {copied === "copied" ? "Copied. Paste it as your first message." : "Couldn't copy. Click the text, then press Ctrl+C."}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function AiContextButton(props: Omit<Parameters<typeof Dialog>[0], "onClose">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        ✦ Copy for AI
      </button>
      {open && <Dialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
