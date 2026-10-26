"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n/client";
import { buttonClass } from "@/lib/ui";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-semibold">{t("error.title")}</h1>
      <p className="mt-2 text-sm text-zinc-500">{t("error.body")}</p>
      <button
        type="button"
        onClick={() => retry()}
        className={`mt-4 ${buttonClass("secondary", "sm")}`}
      >
        {t("error.retry")}
      </button>
    </div>
  );
}
