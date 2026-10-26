import type { Metadata } from "next";
import { TeacherClassesPage } from "@/components/TeacherClassesPage";

export const metadata: Metadata = { title: "Classes" };

export default function TeacherClassesRoute() {
  return <TeacherClassesPage />;
}
