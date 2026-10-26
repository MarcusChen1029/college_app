import type { Metadata } from "next";

// Share-link pages (/share/parent/<token>, /share/portfolio/<token>): outside the signed-in app area,
// never indexed, and the secret URL is not sent as a Referer to any link they contain.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export default function ShareLayout({ children }: LayoutProps<"/share">) {
  return <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-8 print:p-0">{children}</div>;
}
