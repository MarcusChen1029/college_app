import Link from "next/link";
import { AiChatDemo } from "@/components/home/AiChatDemo";
import { getSummaries } from "@/lib/data";
import { fmtInt } from "@/lib/format";
import { collegeCounts } from "@/lib/home-stats";
import { getT } from "@/lib/i18n/server";
import { buttonClass } from "@/lib/ui";

const step = (i: number) => ({ "--i": i }) as React.CSSProperties;

/** "AI guesses. We cite the source." -> ["AI guesses. ", "We cite the source."] (also after "，"), so the two beats can
 *  sit on their own lines on phones and share one line on wide screens. The first beat keeps the title's own space (none
 *  after a full-width comma). No break mark: the whole title. */
function beats(title: string): [string, string] {
  const m = /^(.+?[.!?。，,]\s*)(\S.*)$/u.exec(title);
  return m ? [m[1], m[2]] : [title, ""];
}

/**
 * The home page's pitch to people who already pay for ChatGPT or Claude: AI guesses, Trakur cites the source, and the
 * AI can keep the list. Copy for AI comes first (it works with any chatbot, free ChatGPT included); connecting is second.
 * The college count is the same live count as the rest of the page (lib/home-stats.ts), never a typed-in number.
 */
export async function AskYourAi() {
  const [t, colleges] = await Promise.all([getT(), getSummaries()]);
  const count = fmtInt(collegeCounts(colleges).total);
  const [lead, rest] = beats(t("home.ai.title"));

  return (
    <section className="bg-blue-200 py-28 text-ink sm:py-40">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">
        <p data-reveal className="text-lg font-semibold">
          {t("home.ai.eyebrow")}
        </p>
        <h2 data-reveal style={step(1)} className="mt-4 font-display text-[clamp(2.5rem,4.4vw,4rem)] font-extrabold leading-[0.95] tracking-[-0.035em]">
          <span className="block lg:inline">{lead}</span>
          <span className="block lg:inline">{rest}</span>
        </h2>
        <div className="mt-12 grid gap-14 lg:mt-16 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-5">
            <p data-reveal style={step(2)} className="max-w-xl text-xl leading-relaxed">
              {t("home.ai.body", { count })}
            </p>
            <div data-reveal style={step(3)} className="mt-10">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Link href="/application/list#ai" className={buttonClass("primary")}>
                  {t("home.ai.ctaCopy")}
                </Link>
                <Link href="/connect-ai" className={buttonClass("secondary")}>
                  {t("home.ai.ctaConnect")}
                </Link>
              </div>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-zinc-700">{t("home.ai.note")}</p>
            </div>
          </div>
          <div data-reveal style={step(2)} className="w-full max-w-[720px] lg:col-span-7 lg:max-w-none">
            <AiChatDemo
              labels={{
                example: t("home.ai.exampleLabel"),
                you: t("home.ai.demo.speakerYou"),
                ai: t("home.ai.demo.speakerAi"),
                user1: t("home.ai.demo.user1"),
                ai1: t("home.ai.demo.ai1"),
                user2: t("home.ai.demo.user2"),
                ai2: t("home.ai.demo.ai2"),
                list: t("nav.myList"),
                rice: t("home.ai.demo.rowRice"),
                northwestern: t("home.ai.demo.rowNorthwestern"),
                submitted: t("home.ai.demo.statusSubmitted"),
                inProgress: t("home.ai.demo.statusInProgress"),
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
