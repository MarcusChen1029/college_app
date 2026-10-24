"use client";

// Loads data once per `load` function identity (wrap it in useCallback) and again on retry.
// While a load is pending, and after a failure, `data` is null, so stale results are never shown.

import { useEffect, useState } from "react";

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

type Result<T> = { load: () => Promise<T>; nonce: number; data: T | null; error: string | null };

export function useLoad<T>(load: () => Promise<T>) {
  const [nonce, setNonce] = useState(0);
  const [res, setRes] = useState<Result<T> | null>(null);

  useEffect(() => {
    let live = true;
    load().then(
      (data) => live && setRes({ load, nonce, data, error: null }),
      (e) => live && setRes({ load, nonce, data: null, error: errMsg(e) }),
    );
    return () => {
      live = false;
    };
  }, [load, nonce]);

  const fresh = res !== null && res.load === load && res.nonce === nonce;
  return {
    data: fresh ? res.data : null,
    error: fresh ? res.error : null,
    loading: !fresh,
    retry: () => setNonce((n) => n + 1),
  };
}
