import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Wave } from "@/components/Doodles";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { RoleGate } from "@/components/RoleGate";
import { SignInDialogHost } from "@/components/SignInDialog";
import { SiteNav } from "@/components/SiteNav";
import { missingSupabaseEnv } from "@/lib/config";
import { HTML_LANG, makeT } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
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
  title: { default: "Trakur", template: "%s · Trakur" },
  description: "Track US colleges: tiers, Common Data Set scores, deadlines, English requirements and costs.",
};

const FOOTER_LINKS = [
  ["/privacy", "legal.footer.privacy"],
  ["/terms", "legal.footer.terms"],
  ["/security", "legal.footer.security"],
  ["/contact", "legal.footer.contact"],
  ["/pricing", "nav.pricing"],
  ["/help", "nav.help"],
] as const;

const HEADER = "sticky top-0 z-20 print:hidden border-b border-blue-100 bg-white";
const NAV = "mx-auto flex max-w-7xl items-center gap-x-4 px-4 lg:gap-x-6 py-3 text-sm font-medium";

function Brand() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-display text-lg font-bold tracking-tight">
      <Image src="/logo.png" alt="" width={28} height={28} priority />
      Trakur
    </Link>
  );
}

// The language lives in a cookie. Reading it is request data, so (under cacheComponents) it happens inside this Suspense
// boundary: the prerendered shell is the bare header below, and the page streams in already in the visitor's language.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: LocaleRoot's inline script may change `lang` before React hydrates.
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-white text-ink">
        <Suspense fallback={<ShellFallback />}>
          <LocaleRoot>{children}</LocaleRoot>
        </Suspense>
      </body>
    </html>
  );
}

function ShellFallback() {
  return (
    <>
      <header className={HEADER}>
        <div className={NAV}>
          <Brand />
          <div className="h-9" />
        </div>
      </header>
      <main className="flex-1" />
    </>
  );
}

async function LocaleRoot({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = makeT(locale);
  const missingEnv = missingSupabaseEnv();
  return (
    <I18nProvider locale={locale}>
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: `document.documentElement.lang=${JSON.stringify(HTML_LANG[locale])}` }}
      />
      <header className={HEADER}>
        <nav aria-label={t("nav.primary")} className={NAV}>
          <Brand />
          <SiteNav />
          <LanguageSwitch className="shrink-0" />
        </nav>
      </header>
      <Suspense>
        <RoleGate />
      </Suspense>
      <Suspense>
        <SignInDialogHost />
      </Suspense>
      <main className="flex-1">
        {missingEnv.length > 0 ? (
          <div className="mx-auto max-w-xl px-4 py-24 text-center">
            <h1 className="text-3xl font-bold">{t("setup.title")}</h1>
            <p className="mt-3 text-zinc-500">{t("setup.body", { vars: missingEnv.join(", ") })}</p>
          </div>
        ) : (
          children
        )}
      </main>
      <footer className="relative mt-0 print:hidden bg-zinc-100 pb-6 pt-2 text-center text-xs text-zinc-500">
        <Wave className="absolute -top-[39px] left-0 h-10 w-full" fill="#e9f2fa" />
        <nav aria-label={t("legal.footer.label")} className="mx-auto max-w-2xl px-4 pt-6">
          {/* Phones: two even rows of three; wider screens: one centered row. */}
          <ul className="grid grid-cols-3 gap-y-2 text-center text-sm font-medium text-zinc-600 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-6">
            {FOOTER_LINKS.map(([href, key]) => (
              <li key={href}>
                <Link href={href} className="hover:text-zinc-900 hover:underline underline-offset-4">
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mx-auto max-w-2xl px-4 pt-4">{t("footer.disclaimer")}</p>
      </footer>
    </I18nProvider>
  );
}
