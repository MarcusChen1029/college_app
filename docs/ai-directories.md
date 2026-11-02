# Listing the free lookup connector in the Claude and ChatGPT directories

These are steps for the **owner**. They submit something under the owner's name and accounts, so no agent does them.
Everything below comes from `docs/superpowers/research/2026-11-02-ai-connector-plans.md` (section "Directory listing"),
checked 2026-11-02. Vendor pages change: re-read the linked page at the moment you submit.

## Which URL to submit

Submit the **public lookup connector**: `https://www.track-ur-college.com/public/mcp`.

- It needs no sign-in, only reads, and returns the same sourced college facts as the college pages. Its two tools,
  `search_colleges` and `get_college`, each have a `title` and `readOnlyHint: true` (listed by `tools/list`).
- Claude's requirements allow "OAuth 2.0 for authenticated tools (or no auth for public data)". This server is the
  no-auth case, so there is no OAuth flow for a reviewer to get through.
- Do **not** submit the private connector (`https://www.track-ur-college.com/mcp`) as the first listing. It reads and
  changes one student's list behind OAuth, has write and delete tools that need the read/destructive annotations
  reviewed, and both directories ask for a populated or demo account for reviewers.

## Before you submit (both directories)

1. **Privacy policy URL**: `https://www.track-ur-college.com/privacy`. Both directories require one. It is still a
   draft; `OPERATOR_NAME` and `CONTACT_EMAIL` in `web/lib/legal.ts` are `null` (see the legal-pages open items), so fill
   those and have it reviewed first. ChatGPT also wants the policy to disclose the data your tools return: here that is
   public college facts only. The connector stores nothing about its callers, but it does hold each caller's network
   address in server memory for up to 10 minutes to apply the rate limit; the privacy page does not mention the public
   connector yet, so add that before you submit.
2. **Support contact**: `https://www.track-ur-college.com/contact` (needs the contact email above).
3. **Documentation URL**: `https://www.track-ur-college.com/llms.txt` describes the connector in plain text, and
   `https://www.track-ur-college.com/connect-ai` explains Connect AI to students. Decide which one you want to give as
   the public documentation page.
4. **Icon**: Claude's form asks for one. `web/public/logo.png` is the site logo; check the size the form wants.
5. Run both tools yourself against the deployed URL (see "Test it" below) before you confirm anything.

## Claude (Connectors Directory)

- **Where**: https://claude.ai/directory/manage, "Submit new", choose "MCP connector"
  (https://claude.com/docs/connectors/building/submission).
- **Who can submit**: "any paid Claude plan" (Pro, Max, Ultra, Team, Enterprise). On Team or Enterprise an Owner submits
  (Enterprise can grant a "Directory" permission through a custom role). **A Free account cannot submit**
  (https://claude.com/docs/directory/publish).
- **What the form needs**:
  - a remote server reachable over `https://`
  - every tool has a `title` plus `readOnlyHint` or `destructiveHint` (both tools do)
  - compliance with the Anthropic Software Directory Terms and Policy
  - documentation URL, privacy policy URL, support contact and an icon
  - a populated test account for reviewers (a no-sign-in server has nothing to log in to; the research does not say
    whether Anthropic waives this, so say so in the form)
  - your confirmation that you ran every tool (MCP Inspector, or added as a custom connector)
  - seven compliance acknowledgments: guidelines, first-party API usage, financial transactions, AI media generation,
    prompt injection, conversation data collection, public documentation
- **Policy points that touch this connector**
  (https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy): collect only data needed for
  function (1E); MCP servers provide destructive-behavior annotations (5E); comply with supported countries and regions (1A).
- **What happens next**: an automatic policy scan, then the connector is listed by default as a "Community" connector
  with no action needed. Anthropic may escalate to a "Verified" review, where a reviewer tests each tool. Review times
  "vary with queue volume". Escalations: mcp-review@anthropic.com.
- **Audience note**: Claude accounts require age 18 or over
  (https://support.claude.com/en/articles/13117299-minimum-age-requirement-access-restriction), so this listing serves
  adult students and parents, not most high-school students.

## ChatGPT (plugin directory, formerly "apps directory")

- **Where**: https://platform.openai.com/plugins, "Upload new or existing plugin", choose a verified developer identity,
  upload a plugin ZIP, then "Submit for review" with the policy attestations. After approval you choose "Publish plugin"
  (https://developers.openai.com/plugins/deploy/submission; the page is undated, so confirm the steps on screen).
- **Who can submit**: organization owners, or members with "Apps Management Write" (granted by an owner). Individual or
  business **identity verification** must be completed in organization settings first.
- **What review looks at**
  (https://developers.openai.com/plugins/deploy/app-review):
  - a public HTTPS endpoint
  - a demo account reviewers can log into with no extra configuration and **without MFA** (again, a no-sign-in server has
    no login; the research does not say it is exempt, so ask in the form)
  - `readOnlyHint` false for any tool that creates, updates or deletes, and the destructive annotation true for
    irreversible tools (neither applies to the two public tools, which only read)
  - a privacy policy (HTTPS) that discloses the data your tools return
  - "For now, projects with EU data residency cannot submit plugins with MCP servers for review": use a project with
    global data residency
- **Availability**: `publication.countries` is an allowlist of uppercase country codes. The page does not say Taiwan is
  excluded or special; add `"TW"` explicitly if you want it.
- **Content rules** (https://developers.openai.com/plugins/plugin-guidelines): plugins "must be suitable for general
  audiences, including users aged 13-17" and may not explicitly target children under 13. College facts fit this.
- **Review time**: not confirmed.
- **Reach**: the directory is available across ChatGPT plans, but installing or using an individual plugin depends on the
  plan, workspace, role and region (https://help.openai.com/en/articles/20001256-plugins-in-chatgpt, about 2026-10-29).

## Test it before you submit

Replace the address with the deployed one. With an MCP client (MCP Inspector, or add it as a custom connector in Claude),
or with curl:

```
curl -s -X POST https://www.track-ur-college.com/public/mcp \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expect exactly two tools. A `get_college` call with `{"slug":"rice"}` should return the details ending in a `Track it:`
line, and an unknown slug a "No college with slug" tool error. The server allows 60 requests per 10 minutes per address
and answers HTTP 429 after that; a reviewer working through every tool stays well under it.

## Not covered

Gemini has no public listing process that the research could confirm. Whether a directory-listed ChatGPT plugin works on
the Free and Go plans, and how long OpenAI's review takes, are open questions in the research file.
