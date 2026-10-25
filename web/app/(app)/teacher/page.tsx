import type { Metadata } from "next";
import { LegacyAccountHash } from "@/components/LegacyAccountHash";
import { TeacherHome } from "@/components/TeacherHome";

export const metadata: Metadata = { title: "Teacher dashboard" };

export default function TeacherPage() {
  return (
    <>
      <LegacyAccountHash />
      <TeacherHome />
    </>
  );
}
