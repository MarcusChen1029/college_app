import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy" };

// Section ids are link targets: /terms links #teachers and #rights, /security links #sharing (lib/legal.test.ts checks).
const SECTIONS: readonly LegalSection[] = [
  {
    id: "summary",
    title: "privacy.summary.title",
    body: [["privacy.summary.noAccount", "privacy.summary.noSale", "privacy.summary.control", "privacy.summary.logins", "privacy.summary.delete"]],
  },
  {
    id: "collect",
    title: "privacy.collect.title",
    body: [
      "privacy.collect.p1",
      [
        "privacy.collect.account",
        "privacy.collect.role",
        "privacy.collect.profile",
        "privacy.collect.list",
        "privacy.collect.logins",
        "privacy.collect.transcript",
        "privacy.collect.writing",
        "privacy.collect.people",
        "privacy.collect.teacher",
        "privacy.collect.share",
        "privacy.collect.email",
        "privacy.collect.extension",
        "privacy.collect.google",
        "privacy.collect.ai",
      ],
      "privacy.collect.p2",
    ],
  },
  {
    id: "use",
    title: "privacy.use.title",
    body: ["privacy.use.p1", ["privacy.use.service", "privacy.use.reminders", "privacy.use.share", "privacy.use.charts", "privacy.use.safety"], "privacy.use.p2"],
  },
  { id: "teachers", title: "privacy.teachers.title", body: ["privacy.teachers.p1", "privacy.teachers.p2", "privacy.teachers.p3"] },
  {
    id: "sharing",
    title: "privacy.sharing.title",
    body: [["privacy.sharing.providers", "privacy.sharing.chosen", "privacy.sharing.law"], "privacy.sharing.links"],
  },
  { id: "ai", title: "privacy.ai.title", body: ["privacy.ai.copy", "privacy.ai.connect", "privacy.ai.token"] },
  { id: "storage", title: "privacy.storage.title", body: ["privacy.storage.p1", "privacy.storage.p2"] },
  { id: "retention", title: "privacy.retention.title", body: ["privacy.retention.p1", "privacy.retention.p2", "privacy.retention.p3"] },
  {
    id: "rights",
    title: "privacy.rights.title",
    body: ["privacy.rights.p1", "privacy.rights.self", ["privacy.rights.edit", "privacy.rights.revoke", "privacy.rights.google"], "privacy.rights.contact"],
  },
  { id: "minors", title: "privacy.minors.title", body: ["privacy.minors.p1", "privacy.minors.p2"] },
  { id: "security", title: "privacy.security.title", body: ["privacy.security.p1"] },
  { id: "changes", title: "privacy.changes.title", body: ["privacy.changes.p1"] },
  { id: "contact", title: "privacy.contact.title", body: ["privacy.contact.p1"] },
];

export default function PrivacyPage() {
  return <LegalPage title="privacy.title" intro={["privacy.intro"]} sections={SECTIONS} contactSection="contact" />;
}
