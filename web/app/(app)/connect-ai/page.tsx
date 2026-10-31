import { Suspense } from "react";
import { ConnectAi } from "@/components/ConnectAi";
import { CopyContextCard } from "@/components/CopyContextCard";
import { getDeadlines, getLookups, getSummaries } from "@/lib/data";
import { PANEL } from "@/lib/ui";

export const metadata = { title: "Connect AI" };

async function CopyData() {
  const [colleges, deadlines, lookups] = await Promise.all([getSummaries(), getDeadlines(), getLookups()]);
  return <CopyContextCard colleges={colleges} deadlines={deadlines} plans={lookups.plans} englishTests={lookups.englishTests} />;
}

export default function ConnectAiPage() {
  return (
    <div data-app-screen>
      <ConnectAi
        copy={
          <Suspense fallback={<div className={`h-32 animate-pulse ${PANEL}`} />}>
            <CopyData />
          </Suspense>
        }
      />
    </div>
  );
}
