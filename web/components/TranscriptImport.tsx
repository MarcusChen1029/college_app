"use client";

import { useMemo, useState } from "react";
import { fieldClass } from "@/components/TranscriptCourseForm";
import { StatusPill } from "@/components/StatusPill";
import { useStudent } from "@/lib/student-store";
import { LEVEL_LABEL, SUBJECT_LABEL, type CourseInput } from "@/lib/transcript";
import { buildImportPlan, buildPrompt, parseImportText, TRANSCRIPT_FORMAT_VERSION, type ImportPlan } from "@/lib/transcript-import";
import { buttonClass } from "@/lib/ui";

type Mode = "add" | "replace";

/** Copy a prompt for any AI, paste its JSON back, review every row, then save. Nothing is saved before the review. */
export function TranscriptImport({ onDone }: { onDone?: () => void }) {
  const { transcriptSchools, transcriptCourses, addTranscriptSchool, addTranscriptCourses, replaceSchoolCourses } = useStudent();
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [data, setData] = useState<unknown>(undefined);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [forced, setForced] = useState<Set<number>>(new Set()); // duplicate rows the student chose to save anyway
  const [modes, setModes] = useState<Record<number, Mode>>({});
  const [copied, setCopied] = useState(false);

  // The plan is recomputed from what the student has now, so a duplicate stays a duplicate while they work.
  // A school set to "Replace" does not count its own current courses as duplicates: they are about to be swapped for the pasted ones.
  const plan: ImportPlan | null = useMemo(() => {
    if (data === undefined) return null;
    const replacing = new Set(Object.entries(modes).filter(([, m]) => m === "replace").map(([i]) => Number(i)));
    return buildImportPlan(data, { schools: transcriptSchools, courses: transcriptCourses }, "ai_import", replacing);
  }, [data, modes, transcriptSchools, transcriptCourses]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildPrompt());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setParseError("Couldn't copy automatically. Select the prompt below and copy it by hand.");
    }
  }

  function review() {
    const r = parseImportText(text);
    if (!r.ok) {
      setParseError(r.error);
      setData(undefined);
      return;
    }
    setParseError(null);
    setSkipped(new Set());
    setForced(new Set());
    setModes({});
    setData(r.data);
  }

  const rows = plan?.rows ?? [];
  const schoolOf = (i: number) => plan?.schools[i];
  /** A row can be saved when it is valid, not a duplicate, not unticked, and its school exists or can be created. */
  const savable = (i: number) => {
    const r = rows[i];
    const s = schoolOf(r.schoolIndex);
    return !!r.input && !!s && (s.existingId !== null || s.input !== null);
  };
  const included = (i: number) => savable(i) && (rows[i].duplicateOf === null ? !skipped.has(i) : forced.has(i));
  const includedCount = rows.filter((_, i) => included(i)).length;
  const modeOf = (schoolIndex: number): Mode => modes[schoolIndex] ?? "add";
  const replaceCount = (existingId: string | null) => transcriptCourses.filter((c) => c.schoolId === existingId).length;
  /** Replacing a school with nothing would just delete it, so each replaced school needs at least one row to save. */
  const replaceEmpty = !!plan?.schools.some((s, i) => s.existingId && modeOf(i) === "replace" && !rows.some((r, ri) => r.schoolIndex === i && included(ri)));

  function save() {
    if (!plan) return;
    const replacing = plan.schools.flatMap((s, i) => (s.existingId && modeOf(i) === "replace" ? [replaceCount(s.existingId)] : []));
    const lost = replacing.reduce((a, b) => a + b, 0);
    if (lost > 0 && !confirm(`Replacing deletes ${lost} existing course${lost === 1 ? "" : "s"} and their per-system overrides. Continue?`)) return;
    plan.schools.forEach((s, i) => {
      const mine = rows.map((_, ri) => ri).filter((ri) => rows[ri].schoolIndex === i && included(ri));
      const replace = s.existingId !== null && modeOf(i) === "replace";
      if (!mine.length && !replace) return;
      const schoolId = s.existingId ?? (s.input ? addTranscriptSchool(s.input) : null);
      if (!schoolId) return;
      const base = replace ? 1 : transcriptCourses.filter((c) => c.schoolId === schoolId).reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
      const inputs: CourseInput[] = mine.map((ri, n) => ({ ...(rows[ri].input as CourseInput), schoolId, sortOrder: base + n }));
      if (replace) replaceSchoolCourses(schoolId, inputs, "ai_import");
      else addTranscriptCourses(schoolId, inputs, "ai_import");
    });
    setText("");
    setData(undefined);
    onDone?.();
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="imp-1" className="space-y-3 rounded-lg border border-zinc-200 p-5">
        <h2 id="imp-1" className="font-display text-lg font-bold">
          1. Get your transcript typed up by an AI
        </h2>
        <p className="text-sm text-zinc-600">
          Copy this prompt, give it to any AI you use (Claude, ChatGPT, Gemini) together with your transcript as a PDF, photo or pasted text, then paste its answer below. The AI is told to copy every grade exactly as printed and never convert it.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={buttonClass("primary", "sm")} onClick={copyPrompt}>
            Copy prompt for your AI
          </button>
          {copied && (
            <span role="status" className="text-sm text-done">
              Copied
            </span>
          )}
        </div>
      </section>

      <section aria-labelledby="imp-2" className="space-y-3 rounded-lg border border-zinc-200 p-5">
        <h2 id="imp-2" className="font-display text-lg font-bold">
          2. Paste the AI&apos;s answer
        </h2>
        <label className="text-sm font-medium">
          The JSON ({TRANSCRIPT_FORMAT_VERSION})
          <textarea className={`${fieldClass} min-h-40 font-mono text-xs`} value={text} onChange={(e) => setText(e.target.value)} placeholder='{ "version": "transcript.v1", "schools": [ ... ] }' />
        </label>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={review} disabled={!text.trim()}>
          Review
        </button>
        {parseError && (
          <p role="alert" className="text-sm text-urgent">
            {parseError}
          </p>
        )}
        {plan?.error && (
          <p role="alert" className="text-sm text-urgent">
            {plan.error}
          </p>
        )}
      </section>

      {plan && !plan.error && (
        <section aria-labelledby="imp-3" className="space-y-4 rounded-lg border border-zinc-200 p-5">
          <h2 id="imp-3" className="font-display text-lg font-bold">
            3. Review before saving
          </h2>
          {plan.schools.map((s, i) => (
            <div key={i} className="space-y-1 rounded-md bg-zinc-50 p-3 text-sm">
              <p className="font-medium">
                {s.name || "(no school name)"}{" "}
                <span className="font-normal text-zinc-500">{s.existingId ? "· already on your transcript" : s.input ? "· new school" : ""}</span>
              </p>
              {s.errors.map((e) => (
                <p key={e} className="text-urgent">
                  {e}
                </p>
              ))}
              {s.existingId && (
                <fieldset className="flex flex-wrap items-center gap-4">
                  <legend className="sr-only">What to do with {s.name}&apos;s existing courses</legend>
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name={`mode-${i}`} checked={modeOf(i) === "add"} onChange={() => setModes((m) => ({ ...m, [i]: "add" }))} />
                    Add to existing courses
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name={`mode-${i}`} checked={modeOf(i) === "replace"} onChange={() => setModes((m) => ({ ...m, [i]: "replace" }))} />
                    Replace this school&apos;s courses
                  </label>
                  {modeOf(i) === "replace" && (
                    <span className="text-urgent">This deletes {replaceCount(s.existingId)} existing course{replaceCount(s.existingId) === 1 ? "" : "s"} and their per-system overrides.</span>
                  )}
                </fieldset>
              )}
            </div>
          ))}

          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500">No courses found in that answer.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="p-2">Save</th>
                    <th className="p-2">School</th>
                    <th className="p-2">Year</th>
                    <th className="p-2">Course</th>
                    <th className="p-2">Level · subject</th>
                    <th className="p-2">Credit</th>
                    <th className="p-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="p-2">
                        <input
                          type="checkbox"
                          aria-label={`Save row ${i + 1}`}
                          disabled={!savable(i)}
                          checked={included(i)}
                          onChange={(e) =>
                            (r.duplicateOf === null ? setSkipped : setForced)((cur) => {
                              const next = new Set(cur);
                              // a normal row is ticked until skipped; a duplicate is unticked until forced
                              if (e.target.checked === (r.duplicateOf === null)) next.delete(i);
                              else next.add(i);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="p-2">{r.schoolName}</td>
                      <td className="p-2">{r.input ? r.input.academicYear : ""}</td>
                      <td className="p-2">{r.input?.name ?? (typeof (r.raw as { name?: unknown })?.name === "string" ? String((r.raw as { name: string }).name) : "")}</td>
                      <td className="p-2">{r.input ? `${LEVEL_LABEL[r.input.level]} · ${SUBJECT_LABEL[r.input.subject]}` : ""}</td>
                      <td className="p-2">{r.input?.credit ?? ""}</td>
                      <td className="p-2">
                        {r.errors.length > 0 ? (
                          <ul className="list-disc pl-4 text-urgent">
                            {r.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        ) : r.duplicateOf !== null ? (
                          <StatusPill tone="neutral">Already in your transcript (tick to save anyway)</StatusPill>
                        ) : (
                          <StatusPill tone="done">Ready</StatusPill>
                        )}
                        {r.warnings.length > 0 && (
                          <ul className="mt-1 list-disc pl-4 text-xs text-soon">
                            {r.warnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={buttonClass("primary", "sm")} onClick={save} disabled={includedCount === 0 || replaceEmpty}>
              Save {includedCount} course{includedCount === 1 ? "" : "s"}
            </button>
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setData(undefined)}>
              Cancel
            </button>
            {replaceEmpty && <span className="text-sm text-urgent">A school set to Replace needs at least one course to save; otherwise switch it to Add.</span>}
          </div>
        </section>
      )}
    </div>
  );
}
