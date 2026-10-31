import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsPage } from "@/components/SettingsPage";
import { getSummaries } from "@/lib/data";

export const metadata: Metadata = { title: "Settings" };

// The colleges' display names, so Saved passwords can name a listed college's login (not its slug). Read like the
// Portals page does; until they arrive (or when they can't be read) the page works with slugs.
async function WithNames() {
  let names: Record<string, string> = {};
  try {
    names = Object.fromEntries((await getSummaries()).map((c) => [c.slug, c.short_name ?? c.name]));
  } catch {
    // Settings never depends on the college list
  }
  return <SettingsPage collegeNames={names} />;
}

export default function Page() {
  return (
    <div data-app-screen>
      <Suspense fallback={<SettingsPage />}>
        <WithNames />
      </Suspense>
    </div>
  );
}
