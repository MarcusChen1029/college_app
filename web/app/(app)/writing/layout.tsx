import { NavText, SectionTabs } from "@/components/SectionTabs";
import type { NavItem } from "@/lib/roles";
import { PAGE_TITLE } from "@/lib/ui";

const TABS: readonly NavItem[] = [
  ["/writing/essays", "Essays"],
  ["/writing/activities", "Activities"],
];

export default function WritingLayout({ children }: LayoutProps<"/writing">) {
  return (
    <div className="space-y-6">
      <h1 className={`${PAGE_TITLE} print:hidden`}>
        <NavText label="Writing" />
      </h1>
      <SectionTabs label="Writing" tabs={TABS} />
      {children}
    </div>
  );
}
