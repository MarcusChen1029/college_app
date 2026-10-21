import type { Metadata } from "next";
import Link from "next/link";
import { AccountLink } from "@/components/AccountPanel";
import { Wave } from "@/components/Doodles";
import { missingSupabaseEnv } from "@/lib/config";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const body = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "College Tracker", template: "%s · College Tracker" },
  description: "Track US colleges: tiers, Common Data Set scores, deadlines, English requirements and costs.",
};

const NAV = [
  ["/colleges", "Colleges"],
  ["/compare", "Compare"],
  ["/interested", "Interested"],
  ["/my-list", "My list"],
  ["/activities", "Activities"],
  ["/profile", "Profile"],
  ["/pricing", "Pricing"],
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  const missingEnv = missingSupabaseEnv();
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-white text-ink">
        <header className="sticky top-0 z-20 border-b border-blue-100 bg-white/90 backdrop-blur">
          <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm font-medium">
            <Link href="/" className="font-display text-lg font-bold tracking-tight">
              <span aria-hidden className="mr-1.5 inline-block rounded-md bg-blue-500 px-1.5 text-white">
                C
              </span>
              College Tracker
            </Link>
            <div className="flex items-center gap-5">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="text-zinc-600 hover:text-blue-600">
                  {label}
                </Link>
              ))}
            </div>
            <span className="ml-auto flex items-center gap-4">
              <AccountLink />
              <Link href="/start" className="rounded-full bg-ink px-4 py-1.5 text-white hover:bg-blue-700">
                Get started
              </Link>
            </span>
          </nav>
        </header>
        <main className="flex-1">
          {missingEnv.length > 0 ? (
            <div className="mx-auto max-w-xl px-4 py-24 text-center">
              <h1 className="text-3xl font-bold">Setup incomplete</h1>
              <p className="mt-3 text-zinc-500">
                This deployment is missing environment variables: <code>{missingEnv.join(", ")}</code>. Add them (copy from{" "}
                <code>web/.env.example</code>), then redeploy — they are baked in at build time.
              </p>
            </div>
          ) : (
            children
          )}
        </main>
        <footer className="relative mt-0 bg-zinc-100 pb-6 pt-2 text-center text-xs text-zinc-500">
          <Wave className="absolute -top-[39px] left-0 h-10 w-full" fill="#e9f2fa" />
          <p className="mx-auto max-w-2xl px-4 pt-6">
            Data comes from official Common Data Sets and admissions websites. Always confirm on the college&apos;s own site before applying.
          </p>
        </footer>
      </body>
    </html>
  );
}
