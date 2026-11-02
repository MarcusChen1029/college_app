import assert from "node:assert/strict";
import { test } from "node:test";
import { McpServer } from "@modelcontextprotocol/server";
import { AI_PROMPTS, ASK_SENTENCE, connectorBody, LANGUAGE_NAME, previewLines, previewSlug, PROMPT_KEYS, promptText, withPrompt } from "./ai-prompts.ts";
import { en, zhTW } from "./i18n/messages/ai.ts";
import { registerPrompts } from "./mcp/prompts.ts";

test("AI_PROMPTS ids are unique and every id has en and zh-TW title and body", () => {
  const ids = AI_PROMPTS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ["due14", "conflicts", "balance", "essayOverlap", "costAid", "weekPlan", "weekly"]);
  const e = en as Record<string, string>;
  const z = zhTW as Record<string, string>;
  for (const id of ids) {
    for (const key of [PROMPT_KEYS[id].title, PROMPT_KEYS[id].body]) {
      assert.ok(e[key]?.trim(), `en ${key}`);
      assert.ok(z[key]?.trim(), `zh-TW ${key}`);
    }
  }
});

test("withPrompt joins with a separator", () => {
  assert.equal(withPrompt(" Hi \n", "PACK"), "Hi\n\n---\n\nPACK");
});

test("withPrompt keeps working on an empty pack", () => {
  assert.equal(withPrompt("Q", ""), "Q\n\n---\n\n");
});

test("previewLines skips blanks and caps", () => {
  assert.deepEqual(previewLines("a\n\n b\nc", 2), ["a", " b"]);
  assert.deepEqual(previewLines("a\n   \n\nb"), ["a", "b"]);
  assert.deepEqual(previewLines(""), []);
  assert.equal(previewLines(Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n")).length, 10);
});

test("previewSlug picks the first US college, null when none", () => {
  assert.equal(previewSlug([{ slug: "oxford", countryCode: "GB" }, { slug: "rice", countryCode: "US" }]), "rice");
  assert.equal(previewSlug([{ slug: "oxford", countryCode: "GB" }]), null);
  assert.equal(previewSlug([]), null);
  // A college with no country is treated as a US one.
  assert.equal(previewSlug([{ slug: "oxford", countryCode: "GB" }, { slug: "mine", countryCode: null }]), "mine");
});

test("pass prompts are balance, essayOverlap, costAid; only weekly is mcpOnly", () => {
  assert.deepEqual(AI_PROMPTS.filter((p) => p.needsPass).map((p) => p.id), ["balance", "essayOverlap", "costAid"]);
  assert.deepEqual(AI_PROMPTS.filter((p) => p.mcpOnly).map((p) => p.id), ["weekly"]);
});

test("every body ends with the shared sentence, in both languages", () => {
  for (const p of AI_PROMPTS) {
    const key = PROMPT_KEYS[p.id].body;
    assert.ok((en as Record<string, string>)[key].endsWith(`${ASK_SENTENCE} When a fact has a numbered source, cite it. Answer in {language}.`), `en ${key}`);
    assert.ok((zhTW as Record<string, string>)[key].includes("{language}"), `zh-TW ${key} lacks {language}`);
  }
});

test("promptText fills {language} from the UI language and leaves no placeholder", () => {
  const body = (en as Record<string, string>)[PROMPT_KEYS.due14.body];
  assert.ok(promptText(body, "en").endsWith("Answer in English."));
  assert.ok(promptText((zhTW as Record<string, string>)[PROMPT_KEYS.due14.body], "zh-TW").includes(LANGUAGE_NAME["zh-TW"]));
  assert.equal(LANGUAGE_NAME["zh-TW"], "Traditional Chinese (Taiwan)");
  for (const p of AI_PROMPTS) {
    for (const [locale, dict] of [["en", en], ["zh-TW", zhTW]] as const) assert.ok(!promptText((dict as Record<string, string>)[PROMPT_KEYS[p.id].body], locale).includes("{"), `${locale} ${p.id}`);
  }
});

test("connectorBody swaps 'use only the information below' for the tracker's tools, once, and leaves no placeholder", () => {
  for (const p of AI_PROMPTS) {
    const body = (en as Record<string, string>)[PROMPT_KEYS[p.id].body];
    assert.equal(body.split(ASK_SENTENCE).length, 2, `${p.id} has the sentence exactly once`);
    const out = connectorBody(body);
    assert.ok(out.includes("Use the tracker's tools for the data."), p.id);
    assert.ok(!out.includes(ASK_SENTENCE), p.id);
    assert.ok(!out.includes("{"), p.id);
    assert.ok(out.includes("When a fact has a numbered source, cite it."), p.id);
  }
});

test("registerPrompts registers every prompt, weekly included, with the English question and no pasted-pack wording", () => {
  const seen: { name: string; title?: string; text: string }[] = [];
  const fake = {
    registerPrompt(name: string, config: { title?: string }, cb: () => { messages: { role: string; content: { type: string; text: string } }[] }) {
      const m = cb().messages;
      assert.equal(m.length, 1);
      assert.equal(m[0].role, "user");
      assert.equal(m[0].content.type, "text");
      seen.push({ name, title: config.title, text: m[0].content.text });
      return {};
    },
  };
  registerPrompts(fake as unknown as McpServer);
  assert.deepEqual(seen.map((s) => s.name), ["due14", "conflicts", "balance", "essay_overlap", "cost_aid", "week_plan", "weekly"]);
  for (const s of seen) {
    assert.ok(s.title && !s.title.includes("{"), s.name);
    assert.ok(s.text.includes("Use the tracker's tools for the data."), s.name);
    assert.ok(!s.text.includes("below") && !s.text.includes("{"), s.name);
  }
  assert.equal(seen[0].text, connectorBody(en["ai.prompt.due14.body"]));
});

test("registerPrompts works on the real MCP server (names accepted, none registered twice)", () => {
  const server = new McpServer({ name: "test", version: "0" });
  registerPrompts(server);
  assert.throws(() => registerPrompts(server), /already registered/i);
});
