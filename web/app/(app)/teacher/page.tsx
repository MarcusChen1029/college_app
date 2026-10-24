import type { Metadata } from "next";
import { TeacherHome } from "@/components/TeacherHome";

export const metadata: Metadata = { title: "Teacher dashboard" };

export default function TeacherPage() {
  return <TeacherHome />;
}
