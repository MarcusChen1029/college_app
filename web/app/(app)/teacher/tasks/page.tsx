import type { Metadata } from "next";
import { TeacherTasks } from "@/components/TeacherTasks";

export const metadata: Metadata = { title: "Tasks" };

export default function TeacherTasksPage() {
  return <TeacherTasks />;
}
