"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Old links pointed at `/profile#account` and `/teacher#account`; hashes never reach the server, so redirect here. */
export function LegacyAccountHash() {
  const router = useRouter();
  useEffect(() => {
    const check = () => {
      if (window.location.hash === "#account") router.replace("/settings");
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [router]);
  return null;
}
