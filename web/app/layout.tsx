import type { Metadata } from "next";
import Link from "next/link";
import { AccountLink } from "@/components/AccountPanel";
import { missingSupabaseEnv } from "@/lib/config";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "College Tracker", template: "%s · College Tracker" },
  description: "Track US colleges: tiers, Common Data Set scores, deadlines, English requirements and costs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const missingEnv = missingSupabaseEnv();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="text-base font-semibold">
              🎓 College Tracker
            </Link>
            <Link href="/" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white">
              Colleges
            </Link>
            <Link href="/compare" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white">
              Compare
            </Link>
            <Link href="/my-list" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white">
              My list
            </Link>
            <span className="ml-auto">
              <AccountLink />
            </span>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          {missingEnv.length > 0 ? (
            <div className="mx-auto max-w-xl py-16 text-center">
              <h1 className="text-2xl font-semibold">Setup incomplete</h1>
              <p className="mt-2 text-sm text-zinc-500">
                This deployment is missing environment variables: <code>{missingEnv.join(", ")}</code>.
                Add them (copy from <code>web/.env.example</code>), then redeploy — they are baked in at build time.
              </p>
            </div>
          ) : (
            children
          )}
        </main>
        <footer className="border-t border-zinc-200 px-4 py-4 text-center text-xs text-zinc-500 dark:border-zinc-800">
          Data from official Common Data Sets and admissions websites — always confirm on the college&apos;s site before applying.
        </footer>
      </body>
    </html>
  );
}
