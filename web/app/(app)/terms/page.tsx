import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service" };

const SECTIONS: readonly LegalSection[] = [
  { id: "who", title: "legal.terms.who.title", body: ["legal.terms.who.p1", "legal.terms.who.p2"] },
  { id: "account", title: "legal.terms.account.title", body: ["legal.terms.account.p1", "legal.terms.account.p2"] },
  {
    id: "what",
    title: "legal.terms.what.title",
    body: ["legal.terms.what.p1", ["legal.terms.what.data", "legal.terms.what.estimates", "legal.terms.what.reminders", "legal.terms.what.advice"]],
  },
  { id: "content", title: "legal.terms.content.title", body: ["legal.terms.content.p1", "legal.terms.content.p2"] },
  { id: "portals", title: "legal.terms.portals.title", body: ["legal.terms.portals.p1", "legal.terms.portals.p2"] },
  { id: "teachers", title: "legal.terms.teachers.title", body: ["legal.terms.teachers.p1", "legal.terms.teachers.p2"] },
  {
    id: "use",
    title: "legal.terms.use.title",
    body: [
      "legal.terms.use.p1",
      ["legal.terms.use.law", "legal.terms.use.access", "legal.terms.use.abuse", "legal.terms.use.content", "legal.terms.use.impersonate"],
      "legal.terms.use.p2",
    ],
  },
  {
    id: "plans",
    title: "legal.terms.plans.title",
    body: [
      "legal.terms.plans.p1",
      ["legal.terms.plans.free", "legal.terms.plans.pass"],
      "legal.terms.plans.validity",
      "legal.terms.plans.activation",
      "legal.terms.plans.refund",
      "legal.terms.plans.processor",
    ],
  },
  { id: "others", title: "legal.terms.others.title", body: ["legal.terms.others.p1"] },
  { id: "changes", title: "legal.terms.changes.title", body: ["legal.terms.changes.p1", "legal.terms.changes.p2"] },
  { id: "liability", title: "legal.terms.liability.title", body: ["legal.terms.liability.p1", "legal.terms.liability.p2"] },
  { id: "law", title: "legal.terms.law.title", body: ["legal.terms.law.p1"] },
  { id: "updates", title: "legal.terms.updates.title", body: ["legal.terms.updates.p1"] },
  { id: "contact", title: "legal.terms.contact.title", body: ["legal.terms.contact.p1"] },
];

export default function TermsPage() {
  return <LegalPage title="legal.terms.title" intro={["legal.terms.intro"]} sections={SECTIONS} contactSection="contact" />;
}
