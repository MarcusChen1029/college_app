import type { Metadata } from "next";
import { TeacherCharts } from "@/components/TeacherCharts";

export const metadata: Metadata = { title: "Class charts" };

export default function TeacherChartsPage() {
  return <TeacherCharts />;
}
