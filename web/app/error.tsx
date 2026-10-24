"use client";

import { useEffect } from "react";
import { buttonClass } from "@/lib/ui";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-zinc-500">
        We couldn&apos;t load this page. The data service may be temporarily unavailable.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className={`mt-4 ${buttonClass("secondary", "sm")}`}
      >
        Try again
      </button>
    </div>
  );
}
