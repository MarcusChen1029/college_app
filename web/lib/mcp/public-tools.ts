import "server-only";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getCollege, getLookups, getSummaries } from "../data";
import { REGIONS } from "../regions";
import { collegeDetailText, findSummary, matchColleges, moreNote, notFound, searchRow, text, toolError } from "./college-format";

// The free public lookup connector: two read-only tools over the college data every visitor can already see on the site.
// No sign-in, and this file never touches a student's rows (it imports nothing that reads them): the answers are the same
// sourced text the signed-in `get_college` gives for a college that isn't on the student's list, with no checklist block.
// Each answer ends by pointing back to the tracker.

const SEARCH_LIMIT = 10;

const trackItLine = (origin: string, slug: string) => `Track it: ${origin}/colleges/${slug} — save it to your list with a free account.`;
const browseLine = (origin: string) => `Browse and compare all colleges: ${origin}/colleges — save any of them to your list with a free account.`;

/** A database hiccup becomes a plain tool error. The raw message goes to the server log only: this server is public. */
function unavailable(e: unknown): CallToolResult {
  console.error("public lookup tool failed:", e);
  return toolError("Couldn't load college data right now. Try again in a minute.");
}

export function registerPublicTools(server: McpServer, opts: { origin: string }): void {
  const { origin } = opts;

  server.registerTool(
    "search_colleges",
    {
      title: "Search colleges",
      description: `Search Trakur's colleges by name, short name, slug or city. Returns up to ${SEARCH_LIMIT} public summaries (admit rates, SAT range, test policy, tiers, offered application plans). Use the slug with get_college. Public data only: this connector can't see anyone's college list.`,
      inputSchema: z.object({
        query: z.string().trim().min(1).max(100).describe("Part of a name, slug or city (1-100 characters)."),
        region: z.enum(REGIONS.map((r) => r.code) as [string, ...string[]]).optional().describe("Country code: US, GB, CA or AU."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false, title: "Search colleges" },
    },
    async ({ query, region }) => {
      try {
        const matches = matchColleges(await getSummaries(), query, region);
        const body = JSON.stringify(
          {
            total: matches.length,
            shown: Math.min(SEARCH_LIMIT, matches.length),
            colleges: matches.slice(0, SEARCH_LIMIT).map(searchRow),
            note: moreNote(matches.length, SEARCH_LIMIT),
          },
          null,
          2,
        );
        return text(`${body}\n\n${browseLine(origin)}`);
      } catch (e) {
        return unavailable(e);
      }
    },
  );

  server.registerTool(
    "get_college",
    {
      title: "Get college details",
      description:
        "The full sourced detail for one college as Markdown: admissions, test scores, deadlines, English requirements, application requirements, supplemental essay prompts (exact text, limits, who must answer), international proof-of-funding documents, cost and aid, with numbered source links and the date the sources were last checked. Anything not published is left out; say so rather than guessing. Public data only: this connector can't see anyone's college list.",
      inputSchema: z.object({ slug: z.string().min(1).max(100).describe("The slug from search_colleges, e.g. rice.") }),
      annotations: { readOnlyHint: true, openWorldHint: false, title: "Get college details" },
    },
    async ({ slug }) => {
      try {
        // Check the slug against the cached list first, so made-up slugs never cost a database query.
        const college = findSummary(await getSummaries(), slug);
        if (!college) return notFound(slug);
        const [detail, lookups] = await Promise.all([getCollege(slug), getLookups()]);
        return text(`${collegeDetailText({ college, detail, lookups })}\n\n${trackItLine(origin, college.slug)}`);
      } catch (e) {
        return unavailable(e);
      }
    },
  );
}
