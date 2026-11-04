import { Suspense } from "react";
import { StudentTaskPage } from "@/components/classroom/gc/StudentTaskPage";

export const metadata = { title: "Task" };

const Skeleton = () => <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

// The route parameter is read under a Suspense boundary, as on the other dynamic classroom pages.
export default function TaskRoute({ params }: PageProps<"/counselor/task/[taskId]">) {
  return (
    <div data-app-screen>
      <Suspense fallback={<Skeleton />}>
        <TaskById params={params} />
      </Suspense>
    </div>
  );
}

async function TaskById({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return <StudentTaskPage taskId={taskId} />;
}
