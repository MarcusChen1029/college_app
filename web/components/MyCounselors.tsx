"use client";

import { useCallback, useEffect, useState } from "react";
import { codeErrorMessage, isPlausibleCode, normalizeCode, type CodePreview } from "@/lib/join-codes";
import { leaveTeacher, myTeachers, previewCode, redeemCode, setShareEssays, type MyTeacher } from "@/lib/links-api";
import { buttonClass } from "@/lib/ui";

const btn = buttonClass("secondary", "sm");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

/** Student view: linked teachers (essay sharing, leave) and a "join with a code" flow with a confirm step. */
export function MyCounselors() {
  const [teachers, setTeachers] = useState<MyTeacher[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  // The code that was previewed travels with the preview, so "Confirm" can only redeem what the student was shown.
  const [preview, setPreview] = useState<{ code: string; data: CodePreview } | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setListError(null);
    try {
      setTeachers(await myTeachers());
    } catch (e) {
      setTeachers(null); // don't keep showing a list that may be out of date
      setListError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    let live = true;
    myTeachers().then(
      (t) => live && setTeachers(t),
      (e) => live && setListError(errMsg(e)),
    );
    return () => {
      live = false;
    };
  }, []);

  async function toggleEssays(t: MyTeacher, value: boolean) {
    setListError(null);
    setBusy(true);
    const set = (v: boolean) => setTeachers((cur) => cur && cur.map((x) => (x.teacherId === t.teacherId ? { ...x, shareEssays: v } : x)));
    set(value);
    try {
      await setShareEssays(t.teacherId, value);
    } catch (e) {
      set(!value);
      setListError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function leave(t: MyTeacher) {
    if (!confirm(`Leave ${t.displayName}? They will no longer see your data.`)) return;
    setBusy(true);
    setListError(null);
    try {
      await leaveTeacher(t.teacherId);
      await load();
    } catch (e) {
      setListError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(null);
    setPreview(null);
    if (!isPlausibleCode(code)) return setJoinError(codeErrorMessage("invalid"));
    setBusy(true);
    const res = await previewCode(code);
    setBusy(false);
    if (res.ok) setPreview({ code: normalizeCode(code), data: res.preview });
    else setJoinError(codeErrorMessage(res.error));
  }

  async function join() {
    if (!preview) return;
    setBusy(true);
    const res = await redeemCode(preview.code);
    if (res.ok) {
      setPreview(null);
      setCode("");
      await load();
    } else {
      setPreview(null);
      setJoinError(codeErrorMessage(res.error));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5 rounded-lg border border-zinc-200 p-5">
      <h3 className="font-display text-lg font-bold">My counselors and teachers</h3>
      {listError && (
        <p role="alert" className="text-sm text-urgent">
          {listError}
        </p>
      )}
      {teachers === null ? (
        listError ? (
          <button type="button" className={btn} onClick={() => void load()}>
            Try again
          </button>
        ) : (
          <div className="h-16 animate-pulse rounded-lg bg-zinc-100" />
        )
      ) : teachers.length === 0 ? (
        <p className="text-sm text-zinc-500">You aren&apos;t linked to anyone yet. Enter the code your teacher or counselor gave you.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {teachers.map((t) => (
            <li key={t.teacherId} className="space-y-2 py-3 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{t.displayName}</p>
                  <p className="text-sm text-zinc-500">
                    {[t.school, t.classNames.length > 0 ? `Class: ${t.classNames.join(", ")}` : null, `Linked ${new Date(t.linkedAt).toLocaleDateString()}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <button type="button" disabled={busy} className={buttonClass("danger", "sm")} aria-label={`Leave ${t.displayName}`} onClick={() => void leave(t)}>
                  Leave
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" aria-label={`Let them see my essays (${t.displayName})`} checked={t.shareEssays} disabled={busy} onChange={(e) => void toggleEssays(t, e.target.checked)} />
                Let them see my essays
              </label>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={check} className="flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 text-sm font-medium">
          Join with a code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 font-mono uppercase tracking-widest"
            placeholder="XXXX-XXXX"
          />
        </label>
        <button type="submit" disabled={busy || code.trim() === ""} className={buttonClass("primary", "sm")}>
          Check code
        </button>
      </form>
      {joinError && (
        <p role="alert" className="text-sm text-urgent">
          {joinError}
        </p>
      )}

      {preview && (
        <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <p className="font-semibold">
            {preview.data.teacherName}
            {preview.data.school ? ` (${preview.data.school})` : ""}{" "}
            <span className="font-normal">{preview.data.className ? `class ${preview.data.className}` : "one-on-one"}</span>
          </p>
          {preview.data.alreadyLinked && (
            <p className="text-sm">
              You&apos;re already linked to {preview.data.teacherName}
              {preview.data.className ? "; joining adds you to this class." : "."}
            </p>
          )}
          <p className="text-sm text-zinc-700">
            They will be able to see your profile, test scores, college list, deadlines, checklist and activities (and essays, if you leave that on). They will
            never see your portal logins or private notes.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={buttonClass("primary", "sm")} onClick={() => void join()}>
              Confirm and join
            </button>
            <button type="button" disabled={busy} className={btn} onClick={() => setPreview(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
