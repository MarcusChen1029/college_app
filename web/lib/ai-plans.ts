// Which AI plans can add a custom connector and make changes, and each vendor's minimum age.
//
// Every value here comes from docs/superpowers/research/2026-11-02-ai-connector-plans.md (official vendor pages, read
// 2026-11-02) and from nothing else. Anything the research could not confirm is "notConfirmed", never a guess: the Connect AI
// page shows it as "Not confirmed", with the check date. To change a row, re-check the vendor's page, update CHECKED_ON and
// the research file together.

/** `readOnly` = it works but cannot make changes (ChatGPT Pro: read and fetch only). */
export type Support = "yes" | "readOnly" | "no" | "notConfirmed";

export type PlanRow = {
  vendor: "ChatGPT" | "Claude" | "Gemini";
  /** The vendor's own product name for the plan, so it stays English. */
  plan: string;
  /** Can this plan add a custom connector by its address? */
  connect: Support;
  /** Can the connected AI make changes (add a college, tick an item), not only read? */
  changes: Support;
  /** English data note, shown as it is. */
  note?: string;
  /** The vendor's own help or docs page for this row. */
  source: string;
};

/** The day the vendor pages were read. Shown as "Checked …" next to the table. */
export const CHECKED_ON = "2026-11-02";

const CHATGPT_SOURCE = "https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt";
const CLAUDE_SOURCE = "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp";
const GEMINI_SOURCE = "https://support.google.com/gemini/answer/17209137?hl=en";

const CHATGPT_UNLISTED = "OpenAI's help page doesn't list this plan, so we can't say. Connecting is done on the web.";

export const PLAN_ROWS: readonly PlanRow[] = [
  { vendor: "ChatGPT", plan: "Free", connect: "notConfirmed", changes: "notConfirmed", note: CHATGPT_UNLISTED, source: CHATGPT_SOURCE },
  { vendor: "ChatGPT", plan: "Go", connect: "notConfirmed", changes: "notConfirmed", note: CHATGPT_UNLISTED, source: CHATGPT_SOURCE },
  {
    vendor: "ChatGPT",
    plan: "Plus",
    connect: "notConfirmed",
    changes: "notConfirmed",
    note: "OpenAI's help page doesn't list Plus and other sources disagree. Check your account. Connecting is done on the web.",
    source: CHATGPT_SOURCE,
  },
  {
    vendor: "ChatGPT",
    plan: "Pro",
    connect: "yes",
    changes: "readOnly",
    note: "Read and fetch only, per OpenAI's help page. Connecting is done on the web.",
    source: CHATGPT_SOURCE,
  },
  {
    vendor: "ChatGPT",
    plan: "Business",
    connect: "yes",
    changes: "yes",
    note: "Workspace admins or owners add it and members use it after it is published. ChatGPT asks to confirm changes. Web only.",
    source: CHATGPT_SOURCE,
  },
  {
    vendor: "ChatGPT",
    plan: "Enterprise / Edu",
    connect: "yes",
    changes: "yes",
    note: "Admins or owners add it, and members an admin allows. Admins can switch individual actions on or off. Web only.",
    source: CHATGPT_SOURCE,
  },
  { vendor: "Claude", plan: "Free", connect: "yes", changes: "yes", note: "Limited to one custom connector.", source: CLAUDE_SOURCE },
  {
    vendor: "Claude",
    plan: "Pro / Max",
    connect: "yes",
    changes: "yes",
    note: "You can set each tool to always allow, ask first or blocked.",
    source: CLAUDE_SOURCE,
  },
  {
    vendor: "Claude",
    plan: "Team",
    connect: "yes",
    changes: "yes",
    note: "Only Owners and Primary Owners can add it. Members then connect individually.",
    source: CLAUDE_SOURCE,
  },
  {
    vendor: "Claude",
    plan: "Enterprise",
    connect: "yes",
    changes: "yes",
    note: "Owners, Primary Owners or a role with permission can add it. Owners can turn off specific tool calls.",
    source: CLAUDE_SOURCE,
  },
  {
    vendor: "Claude",
    plan: "Education",
    connect: "notConfirmed",
    changes: "notConfirmed",
    note: "Anthropic's Education help article doesn't mention connectors.",
    source: "https://support.claude.com/en/articles/11139144-use-claude-for-education-at-your-university",
  },
  {
    vendor: "Gemini",
    plan: "Personal account",
    connect: "yes",
    changes: "yes",
    note: "Gemini app with Free, Google AI Pro or Ultra. Only for personal Google accounts, 18+ and in the US, English only. Gemini asks you to confirm every change.",
    source: GEMINI_SOURCE,
  },
  {
    vendor: "Gemini",
    plan: "Work or school account",
    connect: "no",
    changes: "no",
    note: "Google Workspace in the Gemini app. Not available when you sign in with a work or school Google Account.",
    source: GEMINI_SOURCE,
  },
  {
    vendor: "Gemini",
    plan: "Gemini Enterprise",
    connect: "yes",
    changes: "yes",
    note: "A separate product that an administrator sets up. Each change asks for confirmation by default.",
    source: "https://support.google.com/g/answer/17106276",
  },
];

/**
 * The minimum age to use each vendor's AI with a custom connector. `note` is the English statement; the page words it per
 * language from `minAge` (lib/i18n/messages/misc.ts, misc.connect.age.*).
 */
export const AGE_RULES: { vendor: PlanRow["vendor"]; minAge: number; note: string; source: string }[] = [
  {
    vendor: "Claude",
    minAge: 18,
    note: "Claude accounts are for people 18 and over.",
    source: "https://support.claude.com/en/articles/13117299-minimum-age-requirement-access-restriction",
  },
  {
    vendor: "ChatGPT",
    minAge: 13,
    note: "ChatGPT is for people 13 and over. Under 18, a parent's permission is needed.",
    source: "https://help.openai.com/en/articles/8313401-is-chatgpt-safe-for-all-ages",
  },
  {
    vendor: "Gemini",
    minAge: 18,
    note: "Custom connectors in the Gemini app are for people 18 and over, in the US.",
    source: GEMINI_SOURCE,
  },
];
