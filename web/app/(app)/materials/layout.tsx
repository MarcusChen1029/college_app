import { NavText, SectionTabs } from "@/components/SectionTabs";
import type { NavItem } from "@/lib/roles";
import { PAGE_TITLE } from "@/lib/ui";

const TABS: readonly NavItem[] = [
  ["/materials/essays", "Essays"],
  ["/materials/activities", "Activities"],
  ["/materials/transcript", "Transcript"],
  ["/materials/exams", "Exams"],
];

export default function MaterialsLayout({ children }: LayoutProps<"/materials">) {
  return (
    <div data-app-screen className="space-y-6">
      <h1 className={`${PAGE_TITLE} print:hidden`}>
        <NavText label="Materials" />
      </h1>
      <SectionTabs label="Materials" tabs={TABS} />
      {children}
    </div>
  );
}
