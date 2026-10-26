import Link from "next/link";
import { buttonClass } from "@/lib/ui";

/** Card for the Tools page (`/tools`): drop `<InterestQuizCard />` into its card grid. */
export default function InterestQuizCard() {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-ink bg-white p-5">
      <h2 className="text-xl font-bold">Interest quiz</h2>
      <p className="text-zinc-600">
        30 quick questions give you a three-letter Holland (RIASEC) code, matching careers from O*NET, and college programs worth a look.
      </p>
      <div>
        <Link href="/tools/interests" className={buttonClass("primary")}>
          Take the quiz
        </Link>
      </div>
    </section>
  );
}
