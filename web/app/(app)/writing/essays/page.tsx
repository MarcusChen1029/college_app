import { Suspense } from "react";
import { EssaysPage } from "@/components/EssaysPage";
import { getPlatforms, getSummaries } from "@/lib/data";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Essays" };

async function Data() {
  const [colleges, platforms] = await Promise.all([getSummaries(), getPlatforms()]);
  return <EssaysPage colleges={colleges} platforms={platforms} />;
}

export default async function EssaysRoute() {
  const t = await getT();
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        {t("writing.essaysIntroPre")}
        <strong>{t("writing.newDocName")}</strong>
        {t("writing.essaysIntroMid")}
        <strong>{t("writing.pasteLink")}</strong>
        {t("writing.essaysIntroPost")}
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
        <Data />
      </Suspense>
    </div>
  );
}
