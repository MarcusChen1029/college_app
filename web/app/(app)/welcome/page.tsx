import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { WelcomeForm } from "@/components/WelcomeForm";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const t = await getT();
  return (
    <div data-app-screen className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl font-bold">{t("profile.welcome.title")}</h1>
      <WelcomeForm />
    </div>
  );
}
