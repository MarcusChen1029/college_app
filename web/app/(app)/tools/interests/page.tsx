import type { Metadata } from "next";
import InterestQuiz from "@/components/InterestQuiz";

export const metadata: Metadata = { title: "Interest quiz" };

export default function InterestsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold">Interest quiz</h1>
        <p className="text-zinc-600">
          Thirty quick questions about what you would enjoy doing. You get a three-letter Holland (RIASEC) code, careers whose interest
          profile is closest to yours, and the college programs linked to those careers. Your answers stay in this browser only.
        </p>
      </div>
      <InterestQuiz />
    </div>
  );
}
