import { ApplicationTabs } from "@/components/ApplicationTabs";

export default function ApplicationLayout({ children }: LayoutProps<"/application">) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">My application</h1>
      <ApplicationTabs />
      {children}
    </div>
  );
}
