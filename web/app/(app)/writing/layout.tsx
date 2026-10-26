import { SectionTabs } from "@/components/SectionTabs";
import type { NavItem } from "@/lib/roles";

const TABS: readonly NavItem[] = [
  ["/writing/essays", "Essays"],
  ["/writing/activities", "Activities"],
];

export default function WritingLayout({ children }: LayoutProps<"/writing">) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold print:hidden">Writing</h1>
      <SectionTabs label="Writing" tabs={TABS} />
      {children}
    </div>
  );
}
