import type { McpServer } from "@modelcontextprotocol/server";
import { AI_PROMPTS, connectorBody, connectorName, PROMPT_KEYS } from "../ai-prompts.ts";
import { en } from "../i18n/messages/ai.ts";

// The ready-made questions from "Copy for AI", offered again inside the AI app (Claude lists them in its prompt menu).
// They carry the English wording without a pasted pack: the AI fetches the data with the tracker's tools, so a prompt
// is only a question. Static text, no student data, so no sign-in check is needed beyond the connector's own.

export function registerPrompts(server: McpServer): void {
  for (const { id } of AI_PROMPTS) {
    const keys = PROMPT_KEYS[id];
    server.registerPrompt(connectorName(id), { title: en[keys.title] }, () => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: connectorBody(en[keys.body]) } }],
    }));
  }
}
