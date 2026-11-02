# Which AI plans can add a custom remote MCP connector (and do writes) - research, 2026-11-02

Date of research: 2026-11-02 (all pages "accessed 2026-11-02").
Feeds: the per-plan support table on the setup page, and the decision on a free public read-only connector.
Rule used: only what an official vendor page says is stated as fact. Anything else is written "not confirmed". Conflicts are listed in the section "Conflicting sources".

## Method

- Official help centers and developer docs only: help.openai.com, developers.openai.com, support.claude.com, claude.com/docs, support.google.com, docs.cloud.google.com, anthropic.com.
- Tools: Firecrawl search and scrape (several scrapes used its AI "query" extraction, so those quotes come from the extractor's answer, not a full-page read), then WebFetch and WebSearch after the Firecrawl credits ran out mid-task.
- help.openai.com returned HTTP 403 to WebFetch, so the OpenAI help pages below were read through Firecrawl only. A few OpenAI pages (ChatGPT for Teens, Snowflake template) could not be read.
- OpenAI help pages show relative dates ("Updated: 5 days ago"). Converted against 2026-11-02, "5 days ago" means about 2026-10-28.
- Vocabulary: OpenAI renamed "apps/connectors" to "plugins" (an app is now a part of a plugin). A "custom MCP server" is the same thing as the "connector added by URL" in the question.

## Direct answer

1. Claude: every plan except Education can add a custom remote MCP connector by URL with OAuth, including Free (limit one connector). Write tools are allowed, with per-tool approval prompts. Education: not confirmed. Taiwan is a supported region, but Claude accounts require age 18+.
2. ChatGPT: only Business and Enterprise/Edu are confirmed for full MCP including write actions, on web only. Pro is confirmed for read/fetch only. Free, Go and Plus: not confirmed (sources conflict). Taiwan is a supported country, no geo restriction on custom MCP.
3. Gemini: the consumer Gemini app has custom MCP apps with confirmed write actions, but only for users who are 18+ and in the US, personal Google account, English only. Taiwanese students cannot use it. Work/school (Workspace) accounts cannot use it either. Gemini Enterprise (a separate admin product) supports custom MCP with write actions, set up by an administrator.

## Per-plan table

| Vendor | Plan | Custom remote MCP (URL + OAuth)? | Write actions? | Mobile? | Source | Date |
|---|---|---|---|---|---|---|
| Claude | Free | Yes, limited to one custom connector | Tools may create/modify/delete; Claude asks per tool: Always allow / Needs approval / Blocked | Add: web/desktop is the primary path, installing on mobile is "in beta". Use on mobile: not stated for custom connectors in one sentence, but the network section says the cloud connection is the same "across every Claude client, including ... the mobile apps" | https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp ; https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities | accessed 2026-11-02 (pages undated) |
| Claude | Pro | Yes (Customize > Connectors > Add custom connector) | Yes, same as above | Same as above | same two pages | accessed 2026-11-02 |
| Claude | Max (and Ultra) | Yes | Yes | Same | same two pages | accessed 2026-11-02 |
| Claude | Team | Yes, but only Owners and Primary Owners can add it; members then connect individually | Yes | Same | same two pages | accessed 2026-11-02 |
| Claude | Enterprise | Yes; Owners, Primary Owners, or a custom role with "Manage access to Libraries" | Yes; owners can disable specific tool calls | Same | same two pages | accessed 2026-11-02 |
| Claude | Education (university plan) | Not confirmed. The Education help article does not mention connectors, custom connectors or MCP | Not confirmed | Not confirmed | https://support.claude.com/en/articles/11139144-use-claude-for-education-at-your-university | accessed 2026-11-02 |
| ChatGPT | Free | Not confirmed. Official help lists no Free access; a forum user reports the option missing on Free (anecdote, third party) | Not confirmed | Connecting is web only | https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt ; https://community.openai.com/t/developer-mode-missing-and-mcp-app-creation-unavailable-across-multiple-chatgpt-accounts/1402294 | help ~2026-10-28; forum 2026-10 |
| ChatGPT | Go | Not confirmed (same as Free) | Not confirmed | Connecting is web only | same | same |
| ChatGPT | Plus | Not confirmed, sources conflict. Help article does not list Plus. An OpenAI staff forum post (2026-10-01) says developer mode is gone and "everyone should have that functionality". A 2026-10-19 forum request says some Plus accounts do not see "Add custom MCP server" yet (rolling out, third-party report) | Not confirmed | Connecting is web only | help article above; https://community.openai.com/t/missing-add-custom-mcp-for-users/1407745 | help ~2026-10-28; forum 2026-10-01 and 2026-10-19 |
| ChatGPT | Pro | Yes, read/fetch only: "Pro users can connect custom MCP servers with read/fetch permissions". Full MCP "is only available to Business and Enterprise/Edu users, currently" | No per the help center (read/fetch). Conflict: developer docs say ChatGPT "supports both read and write tools" without naming plans | Connecting is web only ("No - web only") | https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt ; https://developers.openai.com/api/docs/guides/custom-mcp-server | help ~2026-10-28; docs undated |
| ChatGPT | Business | Yes. Only admins/owners can create and publish; members use it after publishing | Yes; "Write actions by default require confirmation"; tools without `readOnlyHint` are treated as write | Web only | same two pages | same |
| ChatGPT | Enterprise / Edu | Yes. Admins/owners, plus members an admin authorizes by RBAC ("Create plugins with MCPs"); only admins/owners publish | Yes; admins can switch individual actions on/off ("Action control"); new actions are off by default | Web only | https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt ; https://help.openai.com/en/articles/20001256-plugins-in-chatgpt | help ~2026-10-28 |
| Gemini | Free / Google AI Pro / Ultra (consumer Gemini app, personal Google account) | Yes, but only for users who are 18+ and in the US, English only, Keep Activity on. The page lists no subscription requirement, so per-plan differences: not confirmed | Yes: "Gemini requires manual confirmation for any write actions" | Add on gemini.google.com only. Once added, usable in the Gemini mobile app and web | https://support.google.com/gemini/answer/17209137?hl=en | accessed 2026-11-02 (page undated) |
| Gemini | Google Workspace (work or school account) in the Gemini app | No: "this feature isn't available if you sign in with a work or school Google Account" | n/a | n/a | https://support.google.com/gemini/answer/17209137?hl=en | accessed 2026-11-02 |
| Gemini | Gemini Enterprise (separate admin product, not a Workspace seat) | Yes, set up by an administrator as a "custom MCP server" data store/connection. Business edition guide: pre-GA terms, OAuth client registration with your identity provider | Yes: tools are "actions", each call asks for confirmation by default because they may mutate data; `readOnlyHint` skips it | Not stated | https://support.google.com/g/answer/17106276 ; https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/set-up-custom-mcp-server | Business guide "Last updated: September 15, 2026"; Standard/Plus doc "Last updated 2026-10-30" |

## Region (Taiwan) and age

| Item | Finding | Source | Date |
|---|---|---|---|
| ChatGPT in Taiwan | Taiwan is on the supported countries list | https://help.openai.com/en/articles/7947663-chatgpt-supported-countries | "Updated 11 days ago" (about 2026-10-22) |
| ChatGPT custom MCP geo limits | "Are there geo restrictions? No." | https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt | ~2026-10-28 |
| Claude in Taiwan | Taiwan appears on Anthropic's supported regions page | https://www.anthropic.com/legal/supported-regions | accessed 2026-11-02 |
| Claude minimum age | "We require all users to be at least 18 years old to create and use a Claude account." | https://support.claude.com/en/articles/13117299-minimum-age-requirement-access-restriction | dated March 16, 2026 |
| ChatGPT minimum age | Help center: not for children under 13; ages 13 to 18 need parental consent. Under-18 accounts are placed in "ChatGPT for Teens". Whether apps/plugins are restricted in Teens mode: not confirmed (page returned 403) | https://help.openai.com/en/articles/8313401-is-chatgpt-safe-for-all-ages (via search result summary; article is old) | not confirmed current |
| Gemini custom apps | "Be 18 or over and in the US." Not available in Taiwan | https://support.google.com/gemini/answer/17209137?hl=en | accessed 2026-11-02 |

Consequence for the audience (Taiwanese high-school students, many under 18): Claude consumer accounts exclude under-18s, Gemini custom apps exclude everyone outside the US and under 18. ChatGPT is the only one of the three that allows 13 to 17 year olds, and it is the one whose personal-plan custom MCP status is least clear.

## Directory listing

### Claude (Connectors Directory)

- Where: developer portal https://claude.ai/directory/manage, "Submit new", choose "MCP connector". Source: https://claude.com/docs/connectors/building/submission (accessed 2026-11-02).
- Who can submit: "any paid Claude plan" (Pro, Max, Ultra, Team, Enterprise). On Team/Enterprise an Owner submits (Enterprise can grant a "Directory" permission through a custom role). Free cannot submit. Source: https://claude.com/docs/directory/publish.
- Requirements: remote server reachable over `https://`; OAuth 2.0 for authenticated tools (or no auth for public data); every tool needs a `title` plus `readOnlyHint` or `destructiveHint`; must comply with the Anthropic Software Directory Terms and Policy; documentation URL, privacy policy URL, support contact, icon; a populated test account for reviewers; you must confirm you ran every tool (MCP Inspector or as a custom connector); seven compliance acknowledgments (guidelines, first-party API usage, financial transactions, AI media generation, prompt injection, conversation data collection, public documentation).
- Review criteria: split read and write tools, ideally write tools by action (create / update / delete) (https://claude.com/docs/connectors/building/review-criteria).
- Policy points that touch this project (https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy, "Updated this week"): collect only data needed for function (section 1E); MCP servers must provide destructive-behavior annotations (5E); comply with supported countries and regions (1A). Minors/under-18 and education records: not mentioned.
- Outcome: automatic policy scan, then listed by default as a "Community" connector with no action needed; Anthropic may escalate to "Verified" review (a reviewer tests each tool). Review times "vary with queue volume". Escalations: mcp-review@anthropic.com.
- Free-tier note: a Free user can add one custom connector but cannot submit to the directory.

### ChatGPT (plugin directory, formerly "apps directory")

- Where: https://platform.openai.com/plugins, "Upload new or existing plugin", choose a verified developer identity, upload a plugin ZIP, then "Submit for review" with policy attestations. After approval you choose to "Publish plugin". Source: https://developers.openai.com/plugins/deploy/submission (page undated; screenshots are file-named 20260927).
- Who: organization owners, or members with "Apps Management Write" (granted by an owner). Individual or business verification must be completed in organization settings.
- MCP server review (https://developers.openai.com/plugins/deploy/app-review): public HTTPS endpoint; a demo account the reviewers can log into with no extra configuration and without MFA; set `readOnlyHint` to false for any tool that creates/updates/deletes or triggers actions, and the destructive annotation to true for irreversible tools; privacy policy (HTTPS) that discloses the data your tools return. "For now, projects with EU data residency cannot submit plugins with MCP servers for review"; use a project with global data residency.
- Availability setting: `publication.countries` is an allowlist of uppercase country codes (the page does not say Taiwan is excluded or special; add "TW" explicitly if you want it).
- Content rules (https://developers.openai.com/plugins/plugin-guidelines): "Plugins must be suitable for general audiences, including users aged 13-17"; may not explicitly target children under 13.
- Review time: not confirmed.
- Directory reach: "The plugin directory is available across ChatGPT plans. Installing or using an individual plugin depends on your plan, workspace, role, region, and its included capabilities" (https://help.openai.com/en/articles/20001256-plugins-in-chatgpt, ~2026-10-29).

### Gemini (for completeness)

- Third parties use the Connected Apps Platform (https://developers.google.com/connected-apps) and "Gemini Developer Mode" for testing. A public listing/submission process: not confirmed (the overview page does not describe one).

## Conflicting sources

1. ChatGPT Pro/Plus: the help article (~2026-10-28) says full MCP is Business and Enterprise/Edu only and Pro is read/fetch. The developer docs say ChatGPT "supports both read and write tools" and only mention "workspace permissions". An OpenAI staff forum post (2026-10-01) says all eligible users can connect custom MCP servers; "eligible" is not defined. Users on forums report Plus rollout is incomplete (2026-10-19). Treat the help center as the vendor's statement of record, and label Free/Go/Plus "not confirmed".
2. Claude mobile: one sentence says custom connectors are available on "Claude, Cowork, and Claude Desktop" (mobile not named); another says web connectors are available on Claude Mobile and that installing connectors on mobile is in beta. Safe wording: add on web or desktop; use on mobile after adding is implied, not stated in one place.

## Open questions (not confirmed)

- ChatGPT Free, Go, Plus: can they add a custom MCP server by URL today, and with write? Needs a test in real accounts (ideally one from Taiwan).
- Whether a ChatGPT Teens (under 18) account can use plugins or custom MCP servers.
- Claude Education plan: custom connector availability.
- Whether a directory-listed ChatGPT plugin works on Free/Go in the mobile app; the help pages say only that connecting a custom server is web only.
- Gemini: whether any Google AI subscription tier is required for custom apps (page lists none); Gemini Enterprise mobile support; a public listing path.
- OpenAI directory review time and Claude Verified timeline.
- Google AI Advanced (the old name of AI Pro) was not checked separately.

## Implications for the setup page (inference, not vendor statements)

- A per-plan table is only safe for: Claude (all plans except Education, 18+), ChatGPT Business/Enterprise/Edu (web only, admin-controlled), ChatGPT Pro (read/fetch). Everything else should read "not confirmed - check your account".
- Gemini should be listed as "US only, 18+, personal account" so Taiwanese students know it is not for them.
- A directory listing (ChatGPT plugin directory, Claude Connectors Directory) is the route that does not depend on a plan allowing "add by URL", but the ChatGPT per-plan install rules for listed third-party plugins are also only partly documented. A read-only public connector would also avoid the Pro read/fetch limit.
