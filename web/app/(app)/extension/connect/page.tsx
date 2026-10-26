import { Suspense } from "react";
import { ExtensionConnect } from "@/components/ExtensionConnect";

export const metadata = { title: "Connect the extension" };

export default function ExtensionConnectPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-60 max-w-xl animate-pulse rounded-2xl bg-zinc-100" />}>
      <ExtensionConnect />
    </Suspense>
  );
}
