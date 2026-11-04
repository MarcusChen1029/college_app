import { NavText, SectionTabs } from "@/components/SectionTabs";
import type { NavItem } from "@/lib/roles";
import { PAGE_TITLE } from "@/lib/ui";

const TABS: readonly NavItem[] = [
  ["/application/interested", "Interested"],
  ["/application/list", "My list"],
  ["/application/portals", "Portals"],
  ["/application/recommenders", "Recommenders"],
  ["/application/scholarships", "Scholarships"],
  ["/application/results", "Results"],
];

export default function ApplicationLayout({ children }: LayoutProps<"/application">) {
  return (
    <div data-app-screen className="space-y-6">
      <h1 className={`${PAGE_TITLE} print:hidden`}>
        <NavText label="My colleges" />
      </h1>
      <SectionTabs label="My colleges" tabs={TABS} />
      {children}
    </div>
  );
}
