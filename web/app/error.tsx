"use client";

import { useEffect } from "react";

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
        className="mt-4 rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Try again
      </button>
    </div>
  );
}
