import { pageMetadata } from "@/lib/seo";

// The page's own metadata export (just a title) is left alone; this adds the description and canonical URL around it.
export const metadata = pageMetadata("/terms");

export default function TermsLayout({ children }: LayoutProps<"/terms">) {
  return children;
}
