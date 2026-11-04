import { Suspense } from "react";
import { StudentClassPage } from "@/components/classroom/gc/StudentClassPage";

export const metadata = { title: "Class" };

const Skeleton = () => <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

// The page reads ?tab= and ?c= (the open tab and conversation), so it sits under a Suspense boundary; so does the route parameter.
export default function ClassRoute({ params }: PageProps<"/counselor/class/[classId]">) {
  return (
    <div data-app-screen>
      <Suspense fallback={<Skeleton />}>
        <ClassById params={params} />
      </Suspense>
    </div>
  );
}

async function ClassById({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  return <StudentClassPage classId={classId} />;
}
