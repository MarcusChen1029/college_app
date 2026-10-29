"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";

export default function NotFound() {
  const t = useT();
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
      <p className="mt-2 text-sm text-zinc-500">{t("notFound.body")}</p>
      <Link href="/colleges" className="mt-4 inline-block text-sm text-blue-700 hover:underline">
        {t("notFound.back")}
      </Link>
    </div>
  );
}
