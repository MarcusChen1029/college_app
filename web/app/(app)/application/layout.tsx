import { SectionTabs } from "@/components/SectionTabs";
import type { NavItem } from "@/lib/roles";

const TABS: readonly NavItem[] = [
  ["/application/interested", "Interested"],
  ["/application/list", "My list"],
  ["/application/portals", "Portals"],
  ["/application/recommenders", "Recommenders"],
  ["/application/transcript", "Transcript"],
  ["/application/scholarships", "Scholarships"],
  ["/application/results", "Results"],
];

export default function ApplicationLayout({ children }: LayoutProps<"/application">) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">My colleges</h1>
      <SectionTabs label="My colleges" tabs={TABS} />
      {children}
    </div>
  );
}
