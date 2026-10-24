import type { Metadata } from "next";
import { TeacherDeadlines } from "@/components/TeacherDeadlines";

export const metadata: Metadata = { title: "Upcoming deadlines" };

export default function TeacherDeadlinesPage() {
  return <TeacherDeadlines />;
}
