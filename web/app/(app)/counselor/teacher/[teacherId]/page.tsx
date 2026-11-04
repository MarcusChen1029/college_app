import { Suspense } from "react";
import { StudentOneOnOne } from "@/components/classroom/gc/StudentOneOnOne";

export const metadata = { title: "1-on-1" };

const Skeleton = () => <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

// The page reads ?c= (an open conversation), so it sits under a Suspense boundary; so does the route parameter.
export default function OneOnOneRoute({ params }: PageProps<"/counselor/teacher/[teacherId]">) {
  return (
    <div data-app-screen>
      <Suspense fallback={<Skeleton />}>
        <OneOnOne params={params} />
      </Suspense>
    </div>
  );
}

async function OneOnOne({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = await params;
  return <StudentOneOnOne teacherId={teacherId} />;
}
