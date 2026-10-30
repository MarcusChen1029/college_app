"use client";

import { useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";
import type { CollegeSummary, ScoreCode, ScoreCodeTest } from "@/lib/types";
import { EmptyNote } from "./EmptyState";

const TEST_LABEL: Record<ScoreCodeTest, string> = {
  sat: "SAT",
  act: "ACT",
  toefl: "TOEFL",
  ielts: "IELTS",
  duolingo: "Duolingo",
  pte: "PTE",
};

const VIEWS = {
  all: { label: "application.codes.viewAll", tests: ["sat", "act", "toefl", "ielts", "duolingo", "pte"] },
  testing: { label: "application.codes.viewTesting", tests: ["sat", "act"] },
  english: { label: "application.codes.viewEnglish", tests: ["toefl", "ielts", "duolingo", "pte"] },
} as const satisfies Record<string, { label: MessageKey; tests: readonly ScoreCodeTest[] }>;
type View = keyof typeof VIEWS;

const ENGLISH_REQUIRED = new Set(["required_nonnative", "required_all_international"]);

const includes: Record<View, (c: CollegeSummary) => boolean> = {
  all: () => true,
  testing: (c) => c.test_policy === "required",
  english: (c) => !!c.english_policy && ENGLISH_REQUIRED.has(c.english_policy),
};

export function SchoolCodes({ colleges, codes }: { colleges: CollegeSummary[]; codes: ScoreCode[] }) {
  const tr = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<View>("all");
  const [copied, setCopied] = useState<string | null>(null);

  const find = (id: string, test: ScoreCodeTest) => codes.find((c) => c.institution_id === id && c.test_key === test);
  const rows = colleges.filter(includes[view]);
  const tests = VIEWS[view].tests;
  // Cells without a code explain why (pick by name, self-report, not accepted) in numbered notes under the table.
  const notes: { college: string; test: ScoreCodeTest; text: string; url: string | null }[] = [];
  const noteNo = new Map<string, number>();
  for (const c of rows)
    for (const t of tests) {
      const sc = find(c.id, t);
      if (sc && !sc.code && sc.notes) {
        notes.push({ college: c.short_name ?? c.name, test: t, text: sc.notes, url: sc.source_url });
        noteNo.set(`${c.id}:${t}`, notes.length);
      }
    }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
    } catch {
      // clipboard blocked; the code is still visible to copy by hand
    }
  }

  const asText = () =>
    rows
      .map((c) => {
        const parts = tests.flatMap((t) => {
          const code = find(c.id, t)?.code;
          return code ? [`${TEST_LABEL[t]} ${code}`] : [];
        });
        return parts.length ? `${c.name}: ${parts.join(" · ")}` : null;
      })
      .filter(Boolean)
      .join("\n");

  return (
    <>
      <button
        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-zinc-50"
        onClick={() => dialog.current?.showModal()}
      >
        {tr("application.codes.button")}
      </button>
      <dialog
        ref={dialog}
        className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/30 backdrop:backdrop-blur-sm"
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-4">
          <div>
            <h2 className="font-semibold">{tr("application.codes.button")}</h2>
            <p className="text-xs text-zinc-500">{tr("application.codes.intro")}</p>
          </div>
          <button className="text-zinc-400 hover:text-zinc-700" onClick={() => dialog.current?.close()} aria-label={tr("common.close")}>
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-4 pb-2">
          <div className="inline-flex rounded-md border border-zinc-200 p-0.5 text-xs" role="tablist">
            {(Object.keys(VIEWS) as View[]).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                className={`rounded px-2.5 py-1 ${view === v ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"}`}
                onClick={() => setView(v)}
              >
                {tr(VIEWS[v].label)}
              </button>
            ))}
          </div>
          {rows.length > 0 && (
            <button className="ml-auto text-xs text-blue-700 underline" onClick={() => copy(asText(), "all")}>
              {copied === "all" ? tr("application.codes.copiedBang") : tr("application.codes.copyList")}
            </button>
          )}
        </div>

        <div className="max-h-[65vh] overflow-auto px-4 pb-4">
          {rows.length === 0 ? (
            <EmptyNote>
              {view === "testing"
                ? tr("application.codes.emptyTesting")
                : view === "english"
                  ? tr("application.codes.emptyEnglish")
                  : tr("application.codes.emptyAll")}
            </EmptyNote>
          ) : (
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-[13px] font-medium text-zinc-600">
                <tr>
                  <th className="py-2 pr-2">College</th>
                  {tests.map((t) => (
                    <th key={t} className="px-2 py-2">
                      {TEST_LABEL[t]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-zinc-100">
                    <td className="py-2 pr-2 font-medium">{c.short_name ?? c.name}</td>
                    {tests.map((t) => {
                      const sc = find(c.id, t);
                      const id = `${c.id}:${t}`;
                      return (
                        <td key={t} className="px-2 py-2 align-top">
                          {sc?.code ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs tabular-nums hover:bg-blue-100"
                                onClick={() => copy(sc.code!, id)}
                                title={sc.notes ?? tr("application.codes.copyCode")}
                              >
                                {copied === id ? tr("common.copied") : sc.code}
                              </button>
                              {sc.source_url && <SourceLink url={sc.source_url} />}
                            </span>
                          ) : noteNo.has(id) ? (
                            <span className="text-xs text-zinc-500" title={sc?.notes ?? undefined}>
                              {tr("application.codes.noCode")}<sup className="ml-0.5 text-[10px] text-blue-700">{noteNo.get(id)}</sup>
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {notes.length > 0 && (
            <ol className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
              {notes.map((n, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="w-4 shrink-0 text-right tabular-nums text-blue-700">{i + 1}</span>
                  <span>
                    <span className="font-medium">
                      {n.college} · {TEST_LABEL[n.test]}:
                    </span>{" "}
                    {n.text} {n.url && <SourceLink url={n.url} />}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-[11px] text-zinc-400">
            {tr("application.codes.footer")}
          </p>
        </div>
      </dialog>
    </>
  );
}

function SourceLink({ url }: { url: string }) {
  const tr = useT();
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-400 hover:text-blue-700" title={tr("application.codes.officialSource")}>
      src
    </a>
  );
}
