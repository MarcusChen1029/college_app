import type { Metadata } from "next";
import { Suspense } from "react";
import { TeacherClassPage } from "@/components/classroom/gc/TeacherClassPage";

export const metadata: Metadata = { title: "Class" };

const Skeleton = () => <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

// The page reads ?tab= (the open tab), so it sits under a Suspense boundary; so does the route parameter.
export default function TeacherClassRoute({ params }: PageProps<"/teacher/classes/[classId]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <ClassById params={params} />
    </Suspense>
  );
}

async function ClassById({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  return <TeacherClassPage classId={classId} />;
}
