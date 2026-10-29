import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { WelcomeForm } from "@/components/WelcomeForm";
import { PAGE_TITLE } from "@/lib/ui";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const t = await getT();
  return (
    <div data-app-screen className="space-y-6">
      <h1 className={PAGE_TITLE}>{t("profile.welcome.title")}</h1>
      <WelcomeForm />
    </div>
  );
}
