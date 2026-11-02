"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { detailSection } from "@/lib/ai-context";
import { AI_PROMPTS, previewLines, previewSlug, PROMPT_KEYS, promptText, withPrompt, type AiPrompt, type AiPromptId } from "@/lib/ai-prompts";
import { useLocale, useT } from "@/lib/i18n/client";
import { buttonClass, PANEL, toneClass } from "@/lib/ui";
import { packLabels, useContextPackText, useDetails, useStudentPack, type PackSource, type StudentPackData } from "./AiContextButton";
import { Modal } from "./Modal";
import { StatusIcon } from "./StatusPill";

/** What the Free preview shows: the pass-level detail block of one listed college, its first lines, then the way to the pass. */
function PreviewDialog({ slug, source, onClose }: { slug: string | null; source: PackSource; onClose: () => void }) {
  const t = useT();
  const load = useDetails(slug ? [slug] : [], true);
  const lines = useMemo(() => {
    if (!slug || load?.state !== "done") return null;
    const entry = source.colleges.find((c) => c.college.slug === slug);
    const detail = load.details[slug];
    if (!entry || !detail) return [];
    return previewLines(detailSection({ ...entry, detail }, packLabels(source.lookups)).join("\n"));
  }, [slug, load, source]);

  return (
    <Modal title={<h2 className="text-lg font-semibold">{t("ai.pack.previewTitle")}</h2>} onClose={onClose} className="w-[min(36rem,calc(100vw-2rem))]">
      <div className="space-y-4 text-sm">
        {!slug ? (
          <p className="text-base leading-relaxed text-ink">{t("ai.pack.previewNone")}</p>
        ) : lines == null && load?.state !== "error" ? (
          <div className="h-48 animate-pulse rounded-xl bg-zinc-100" aria-label={t("application.ai.loadingAria")} />
        ) : !lines?.length ? (
          <p className={`rounded-xl border p-3 ${toneClass("soon")}`}>{t("ai.pack.previewError")}</p>
        ) : (
          <>
            <p className="text-base leading-relaxed text-ink">{t("ai.pack.previewBody")}</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-ink">{lines.join("\n")}</pre>
          </>
        )}
        <Link href="/pricing" className={buttonClass("primary", "sm")}>
          {t("ai.pack.getPass")}
        </Link>
      </div>
    </Modal>
  );
}

/**
 * Ready-made questions for any chatbot: one click copies the question plus the student's pack (the same text "Copy for AI"
 * builds). Questions that need the pass-level detail show, on Free, what the pass adds instead of copying.
 */
export function AiPromptPack({ id, compact, ...data }: StudentPackData & { id?: string; compact?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const headingId = useId();
  const { ready, hasList, source, previewList } = useStudentPack(data);
  const { text: pack, load, full } = useContextPackText(source);
  const [note, setNote] = useState<{ id: AiPromptId; ok: boolean } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const jumped = useRef(false);

  // The page that holds this section shows a skeleton first (My list waits for the student's data), so when the address is
  // "...#ai" the browser's own jump to the hash finds nothing to scroll to. Once the section is really there, scroll to it once.
  // Instant, like the browser's own jump, so it never animates for someone who asked for reduced motion; the section's
  // scroll-mt keeps its heading clear of the sticky header.
  useEffect(() => {
    if (!ready || jumped.current) return;
    jumped.current = true;
    if (id && window.location.hash === `#${id}`) sectionRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [ready, id]);

  if (!ready) return <div id={id} className={`h-40 animate-pulse ${PANEL}`} />;

  const copy = async (p: AiPrompt) => {
    if (pack == null) return;
    try {
      // The pack is built before the click, so the copy runs inside the click (browsers that require a gesture allow it).
      await navigator.clipboard.writeText(withPrompt(promptText(t(PROMPT_KEYS[p.id].body), locale), pack));
      setNote({ id: p.id, ok: true });
    } catch {
      setNote({ id: p.id, ok: false });
    }
  };
  const status = note ? (note.ok ? t("ai.pack.copied") : t("application.ai.copyFail")) : pack == null ? t("application.ai.cardLoading") : "";

  return (
    <section ref={sectionRef} id={id} aria-labelledby={headingId} className={`${PANEL} scroll-mt-28 space-y-4 p-6`}>
      <div className="space-y-1.5">
        <h2 id={headingId} className="font-display text-xl font-bold tracking-tight text-ink">
          {t("ai.pack.title")}
        </h2>
        <p className="text-base leading-relaxed text-ink">{t("ai.pack.intro")}</p>
        {!hasList && <p className="text-sm text-zinc-600">{t("ai.pack.emptyNote")}</p>}
      </div>
      {load?.state === "error" && <p className={`rounded-2xl border px-4 py-3 text-sm ${toneClass("soon")}`}>{t("ai.pack.detailsError", { message: load.message })}</p>}
      <ul className={`grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
        {AI_PROMPTS.filter((p) => !p.mcpOnly).map((p) => {
          const locked = p.needsPass && !full;
          const copied = note?.id === p.id && note.ok;
          return (
            <li key={p.id}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-2.5 text-left hover:outline hover:outline-1 hover:outline-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60"
                disabled={!locked && pack == null}
                aria-haspopup={locked ? "dialog" : undefined}
                onClick={() => (locked ? setPreviewing(true) : void copy(p))}
              >
                <span className="text-[15px] font-semibold leading-snug text-ink">{t(PROMPT_KEYS[p.id].title)}</span>
                {locked ? (
                  <span className={`flex-none rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClass("neutral")}`}>{t("ai.pack.passTag")}</span>
                ) : (
                  <span className={`inline-flex flex-none items-center gap-1 text-[13px] font-semibold ${copied ? "text-done" : "text-blue-700"}`}>
                    {copied && <StatusIcon tone="done" />}
                    {t("ai.pack.copy")}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p role="status" className="min-h-5 text-sm text-zinc-600">
        {status}
      </p>
      {previewing && <PreviewDialog slug={previewSlug(previewList)} source={source} onClose={() => setPreviewing(false)} />}
    </section>
  );
}
