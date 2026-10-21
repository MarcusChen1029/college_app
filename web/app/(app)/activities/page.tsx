import { ActivitiesEditor } from "@/components/ActivitiesEditor";

export const metadata = { title: "Activities" };

export default function ActivitiesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Activities</h1>
        <p className="text-sm text-zinc-500">
          Draft your Common App activities (10) and honors (5), and your UC activities &amp; awards (20), with the same limits the forms use.
        </p>
      </div>
      <ActivitiesEditor />
    </div>
  );
}
