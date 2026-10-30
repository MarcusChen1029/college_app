"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsRow } from "@/components/settings/SettingsRow";
import type { TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { isPlausibleCode, normalizeCode, type CodeError, type CodePreview } from "@/lib/join-codes";
import { leaveTeacher, myTeachers, previewCode, redeemCode, setShareEssays, type MyTeacher } from "@/lib/links-api";
import { buttonClass } from "@/lib/ui";

const btn = buttonClass("secondary", "sm");

/** lib/join-codes.ts codeErrorMessage, in the visitor's language. */
function codeError(t: TFunction, error: CodeError): string {
  if (error === "rate_limited") return t("settings.code.rateLimited");
  if (error === "invalid") return t("settings.code.invalid");
  return t("common.tryAgain");
}

/** Student view: linked teachers (essay sharing, leave) and a "join with a code" flow with a confirm step. */
export function MyCounselors() {
  const t = useT();
  const errMsg = useCallback((e: unknown) => (e instanceof Error ? e.message : t("common.tryAgain")), [t]);
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
  }, [errMsg]);

  useEffect(() => {
    let live = true;
    myTeachers().then(
      (list) => live && setTeachers(list),
      (e) => live && setListError(errMsg(e)),
    );
    return () => {
      live = false;
    };
  }, [errMsg]);

  async function toggleEssays(teacher: MyTeacher, value: boolean) {
    setListError(null);
    setBusy(true);
    const set = (v: boolean) => setTeachers((cur) => cur && cur.map((x) => (x.teacherId === teacher.teacherId ? { ...x, shareEssays: v } : x)));
    set(value);
    try {
      await setShareEssays(teacher.teacherId, value);
    } catch (e) {
      set(!value);
      setListError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function leave(teacher: MyTeacher) {
    if (!confirm(t("settings.counselors.leaveConfirm", { name: teacher.displayName }))) return;
    setBusy(true);
    setListError(null);
    try {
      await leaveTeacher(teacher.teacherId);
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
    if (!isPlausibleCode(code)) return setJoinError(codeError(t, "invalid"));
    setBusy(true);
    const res = await previewCode(code);
    setBusy(false);
    if (res.ok) setPreview({ code: normalizeCode(code), data: res.preview });
    else setJoinError(codeError(t, res.error));
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
      setJoinError(codeError(t, res.error));
    }
    setBusy(false);
  }

  return (
    <SettingsRow headingId="counselors-heading" title={t("settings.counselors.title")} description={<p>{t("misc.settings.counselorsDesc")}</p>}>
      <div className="space-y-5">
      {listError && (
        <p role="alert" className="text-sm text-urgent">
          {listError}
        </p>
      )}
      {teachers === null ? (
        listError ? (
          <button type="button" className={btn} onClick={() => void load()}>
            {t("error.retry")}
          </button>
        ) : (
          <div className="h-16 animate-pulse rounded-lg bg-zinc-100" />
        )
      ) : teachers.length === 0 ? (
        <p className="text-base text-zinc-700">{t("settings.counselors.empty")}</p>
      ) : (
        <ul className="divide-y divide-zinc-200">
          {teachers.map((teacher) => (
            <li key={teacher.teacherId} className="space-y-2 py-3 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-ink">{teacher.displayName}</p>
                  <p className="text-sm text-zinc-600">
                    {[
                      teacher.school,
                      teacher.classNames.length > 0 ? t("settings.counselors.class", { names: teacher.classNames.join(", ") }) : null,
                      t("settings.counselors.linked", { date: new Date(teacher.linkedAt).toLocaleDateString() }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className={buttonClass("danger", "sm")}
                  aria-label={t("settings.counselors.leaveLabel", { name: teacher.displayName })}
                  onClick={() => void leave(teacher)}
                >
                  {t("settings.counselors.leave")}
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={t("settings.counselors.shareEssaysLabel", { name: teacher.displayName })}
                  checked={teacher.shareEssays}
                  disabled={busy}
                  onChange={(e) => void toggleEssays(teacher, e.target.checked)}
                />
                {t("settings.counselors.shareEssays")}
              </label>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={check} className="flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 text-sm font-semibold text-ink">
          {t("settings.counselors.joinCode")}
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="mt-1.5 block h-10 w-full rounded-xl border border-zinc-300 bg-white px-3.5 text-base font-semibold uppercase tracking-widest text-ink placeholder:font-normal placeholder:text-zinc-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="XXXX-XXXX"
          />
        </label>
        <button type="submit" disabled={busy || code.trim() === ""} className={buttonClass("primary", "sm")}>
          {t("settings.counselors.check")}
        </button>
      </form>
      {joinError && (
        <p role="alert" className="text-sm text-urgent">
          {joinError}
        </p>
      )}

      {preview && (
        <div className="space-y-3 rounded-2xl bg-blue-50 p-5">
          <p className="font-semibold">
            {preview.data.teacherName}
            {preview.data.school ? ` (${preview.data.school})` : ""}{" "}
            <span className="font-normal">
              {preview.data.className ? t("settings.counselors.inClass", { name: preview.data.className }) : t("settings.counselors.oneOnOne")}
            </span>
          </p>
          {preview.data.alreadyLinked && (
            <p className="text-sm">
              {t("settings.counselors.already", { name: preview.data.teacherName })}
              {preview.data.className ? t("settings.counselors.alreadyClass") : t("settings.counselors.alreadyEnd")}
            </p>
          )}
          <p className="text-sm text-zinc-700">{t("settings.counselors.whatTheySee")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={buttonClass("primary", "sm")} onClick={() => void join()}>
              {t("settings.counselors.confirm")}
            </button>
            <button type="button" disabled={busy} className={btn} onClick={() => setPreview(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
      </div>
    </SettingsRow>
  );
}
