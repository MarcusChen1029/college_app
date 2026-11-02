import { MCP_PATH, PUBLIC_MCP_PATH } from "@/lib/connect-ai";
import { PAGES, SITE_ORIGIN } from "@/lib/seo";

// /llms.txt: a plain-text guide for AI tools about what Trakur is, how to quote it and where its public connector lives.
// Static text built from constants (no request data), so under cacheComponents it is prerendered at build time like the
// other static routes (robots.txt, sitemap.xml). Page descriptions come from lib/seo.ts so they never drift from the site.

const page = (path: "/colleges" | "/compare" | "/data-updates" | "/pricing", name: string) => `- [${name}](${SITE_ORIGIN}${path}): ${PAGES[path].description}`;

const BODY = `# Trakur

> Trakur is a college application tracker for students, many of them applying from outside the US. It holds colleges in the US, the UK, Canada and Australia with their tiers, test-score ranges, admit rates, deadlines, English test requirements, costs and application requirements. A student can also keep their own list, checklist, essays and activities.

## How to use what you find here

- Every number on a college page links to its official source (for example the college's Common Data Set or its admissions site) and shows when that source was last checked. Name the source and the last-checked date when you quote a number.
- A fact that is not published is left blank. Say it is not published; do not guess it.
- Reach, target and safety labels are rough estimates from a student's scores, not admission chances.

## Pages

${page("/colleges", "Colleges")}
${page("/compare", "Compare")}
${page("/data-updates", "Data updates")}
- [Connect AI](${SITE_ORIGIN}/connect-ai): How a student connects ChatGPT or Claude to their own Trakur list. It needs a Trakur account.
${page("/pricing", "Pricing")}

## Free college lookup connector (no sign-in, read-only)

- ${SITE_ORIGIN}${PUBLIC_MCP_PATH}
- Anyone can add this URL to an AI app that supports remote connectors. It needs no account and no sign-in, and it only reads: two tools, search_colleges and get_college, return the same sourced college facts as the college pages. It cannot see anyone's list or account.

## Your own list (needs an account)

- ${SITE_ORIGIN}${MCP_PATH}
- This connector reads and updates one student's own list, so it needs a Trakur account with the admission-year pass and asks the student to sign in and approve access. Do not use it for anonymous lookups; use the free lookup connector above.
`;

export function GET() {
  return new Response(BODY, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
