"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildContextPack, type PackCollege } from "@/lib/ai-context";
import { customDeadline, customSummary } from "@/lib/custom-college";
import type { StudentProfile } from "@/lib/fit";
import { useT } from "@/lib/i18n/client";
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
  const tr = useT();
  const full = plan.fullAiContext; // `plan` is student.plan: the plan in force today

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
    <Modal title={<h2 className="text-lg font-semibold">{tr("application.ai.title")}</h2>} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-zinc-600">
          {tr("application.ai.intro")}
        </p>
        {full ? (
          <p className={`rounded-md border p-2 text-xs ${toneClass("done")}`}>
            {tr("application.ai.full", { plan: tr(`payments.planName.${plan.key}`) })}
          </p>
        ) : (
          <p className="rounded-md bg-blue-50 p-2 text-xs text-blue-900">
            {tr("application.ai.freePre")}
            <Link href="/pricing" className="font-semibold underline">
              {tr("application.ai.freeUpgrade")}
            </Link>
            {tr("application.ai.freePost")}
          </p>
        )}
        {load?.state === "error" && (
          <p className={`rounded-md border p-2 text-xs ${toneClass("soon")}`}>
            {tr("application.ai.loadError", { message: load.message })}
          </p>
        )}
        {text == null ? (
          <div className="h-80 animate-pulse rounded-md bg-zinc-100" aria-label={tr("application.ai.loadingAria")} />
        ) : (
          <textarea
            readOnly
            value={text}
            className="h-80 w-full resize-y rounded-md border border-zinc-300 bg-zinc-50 p-2 font-mono text-xs"
            aria-label={tr("application.ai.textAria")}
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button className={buttonClass("primary", "sm")} disabled={!text} onClick={copy}>
            {tr("application.ai.copyClipboard")}
          </button>
          <button
            className={buttonClass("secondary", "sm")}
            disabled={!text}
            onClick={download}
          >
            {tr("application.ai.download")}
          </button>
          {copied && (
            <span role="status" className="text-xs text-zinc-500">
              {copied === "copied" ? tr("application.ai.copiedOk") : tr("application.ai.copyFail")}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function AiContextButton({ label, ...props }: Omit<Parameters<typeof Dialog>[0], "onClose"> & { label?: string }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={buttonClass("secondary", "sm")}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {label ?? tr("application.ai.button")}
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
  label,
}: {
  colleges: CollegeSummary[];
  deadlines: Deadline[];
  plans: Lookups["plans"];
  englishTests: Lookups["englishTests"];
  /** The button's text where the default ("✦ Copy for AI") doesn't fit the screen. */
  label?: string;
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
      label={label}
    />
  );
}
