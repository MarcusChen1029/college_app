import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/LegalPage";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("/security");

const SECTIONS: readonly LegalSection[] = [
  { id: "basics", title: "security.basics.title", body: [["security.basics.https", "security.basics.storage", "security.basics.rls", "security.basics.google"]] },
  // The bold sentence of p1 (saved logins are not encrypted with a separate key) is set apart in the tinted panel.
  {
    id: "logins",
    title: "security.logins.title",
    body: ["security.logins.p1", "security.logins.p2", "security.logins.device", "security.logins.p3", "security.logins.p4"],
    callout: "security.logins.p1",
  },
  {
    id: "teachers",
    title: "security.teachers.title",
    body: [
      "security.teachers.p1",
      "security.teachers.canTitle",
      ["security.teachers.canName", "security.teachers.canScores", "security.teachers.canList", "security.teachers.canActivities", "security.teachers.canEssays"],
      "security.teachers.cantTitle",
      ["security.teachers.cantLogins", "security.teachers.cantNotes", "security.teachers.cantTranscript", "security.teachers.cantResume"],
      "security.teachers.p2",
    ],
  },
  {
    id: "extension",
    title: "security.extension.title",
    body: ["security.extension.p1", "security.extension.p2", "security.extension.p3", "security.extension.p4", "security.extension.p5"],
  },
  { id: "share", title: "security.share.title", body: ["security.share.p1", "security.share.p2", "security.share.p3"] },
  { id: "google", title: "security.google.title", body: ["security.google.p1", "security.google.p2", "security.google.p3"] },
  { id: "ai", title: "security.ai.title", body: ["security.ai.copy", "security.ai.connect", "security.ai.limit"] },
  { id: "people", title: "security.people.title", body: ["security.people.p1", "security.people.p2"] },
  {
    id: "you",
    title: "security.you.title",
    body: [["security.you.google", "security.you.passwords", "security.you.shared", "security.you.revoke", "security.you.essays"]],
  },
  { id: "report", title: "security.report.title", body: ["security.report.p1"] },
];

export default function SecurityPage() {
  return <LegalPage title="security.title" intro={["security.intro"]} sections={SECTIONS} contactSection="report" summary="basics" />;
}
