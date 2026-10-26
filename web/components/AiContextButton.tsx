"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildContextPack, type PackCollege } from "@/lib/ai-context";
import { customDeadline, customSummary } from "@/lib/custom-college";
import type { StudentProfile } from "@/lib/fit";
import type { Plan } from "@/lib/plans";
import { useStudent } from "@/lib/student-store";
import type { CollegeDetail, CollegeSummary, Deadline, Lookups } from "@/lib/types";
import { buttonClass, toneClass } from "@/lib/ui";
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
        <p className="text-zinc-600">
          Paste this into ChatGPT, Claude or Gemini so it starts from your real scores, list and deadlines instead of guessing. Portal logins and
          notes are never included.
        </p>
        {full ? (
          <p className={`rounded-md border p-2 text-xs ${toneClass("done")}`}>
            Full version ({plan.name} plan): each college&apos;s deadlines, English minimums, essays, cost and aid, how majors are admitted, your
            activities and a numbered source link for every number.
          </p>
        ) : (
          <p className="rounded-md bg-blue-50 p-2 text-xs text-blue-900">
            Free version: your profile and a one-line summary per college.{" "}
            <Link href="/pricing" className="font-semibold underline">
              Upgrade
            </Link>{" "}
            to include every college&apos;s deadlines, English minimums, essays, cost and aid, your activities, and a source link for every number,
            so your AI can check its answers against official data.
          </p>
        )}
        {load?.state === "error" && (
          <p className={`rounded-md border p-2 text-xs ${toneClass("soon")}`}>
            Couldn&apos;t load college details ({load.message}). The text below has the summary only for now.
          </p>
        )}
        {text == null ? (
          <div className="h-80 animate-pulse rounded-md bg-zinc-100" aria-label="Loading college details" />
        ) : (
          <textarea
            readOnly
            value={text}
            className="h-80 w-full resize-y rounded-md border border-zinc-300 bg-zinc-50 p-2 font-mono text-xs"
            aria-label="Context to paste into your AI"
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button className={buttonClass("primary", "sm")} disabled={!text} onClick={copy}>
            Copy to clipboard
          </button>
          <button
            className={buttonClass("secondary", "sm")}
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
        className={buttonClass("secondary", "sm")}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        ✦ Copy for AI
      </button>
      {open && <Dialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The button wired to the signed-in or local student's own list. Renders nothing while loading or when the list is empty.
 * Custom colleges have no row in our data, so they are built from what the student typed.
 */
export function StudentAiContextButton({
  colleges,
  deadlines,
  plans,
  englishTests,
}: {
  colleges: CollegeSummary[];
  deadlines: Deadline[];
  plans: Lookups["plans"];
  englishTests: Lookups["englishTests"];
}) {
  const student = useStudent();
  if (!student.ready || student.list.length === 0) return null;
  const resolve = (e: (typeof student.list)[number]) => (e.custom ? customSummary(e.rowId ?? e.slug, e.custom) : colleges.find((c) => c.slug === e.slug));
  const allDeadlines = [...deadlines, ...student.list.flatMap((e) => (e.custom ? [customDeadline(e.rowId ?? e.slug, e.custom)] : [])).filter((d): d is Deadline => !!d)];
  return (
    <AiContextButton
      colleges={student.list.flatMap((e) => {
        const college = resolve(e);
        return college ? [{ college, plan: e.plan, status: e.status, checklist: e.checklist }] : [];
      })}
      profile={student.profile}
      plan={student.plan}
      deadlines={allDeadlines}
      lookups={{ plans, englishTests }}
    />
  );
}
