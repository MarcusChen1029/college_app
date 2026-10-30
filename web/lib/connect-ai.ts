// Copy shared by the Connect AI page and the OAuth consent page. Keep in step with the tools in lib/mcp/tools.ts.

export const MCP_PATH = "/mcp";

export const AI_CAN = [
  "Read your profile, scores, college list, checklist, essays, notes, deadlines and activities",
  "Look up any college in the tracker, with its sourced numbers",
  "Add a college to your list and set its plan (ED, EA, RD…) and status",
  "Tick checklist items, add essays and update their status and links",
  "Add, edit and delete activities, honors and UC entries",
  "Update your scores, target regions and resume details",
] as const;

export const AI_CANNOT = [
  "See your portal passwords (they are locked with your vault passphrase), or change your portal logins",
  "Remove a college from your list",
  "Use Trakur's tools to delete an essay",
  "Change your subscription plan or reminder emails",
  "Use Trakur's tools to mark an application submitted before its checklist is complete, or record a decision before it is submitted",
] as const;

export const AI_EXAMPLES = [
  "I submitted Rice today.",
  "Add Northwestern as Early Decision.",
  "Mark my Brown recommendations as done.",
  "What's due in the next two weeks?",
  "Which of my colleges have the earliest deadlines, and what's still missing for each?",
] as const;

/**
 * Supabase doesn't document the id's format, so accept any URL-safe token. The id goes into a request path
 * (/oauth/authorizations/<id>), so slashes, dots and other characters are never sent to Supabase.
 */
export const isAuthorizationId = (v: string | null | undefined): v is string => !!v && /^[A-Za-z0-9_-]{8,256}$/.test(v);

/** The host an approval will send the student back to, or null when the address can't be read. */
export function redirectHost(uri: string): string | null {
  try {
    return new URL(uri).host || null;
  } catch {
    return null;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The address we may send the browser to after approve/deny. App registration is open (dynamic client
 * registration), so the return address is chosen by whoever registered the app: anything but https
 * (or http on this computer, for local MCP clients) could be a javascript:/data: URL running on our origin.
 */
export function safeReturnUrl(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const u = new URL(uri);
    if (u.protocol === "https:" && u.hostname) return u.href;
    if (u.protocol === "http:" && LOCAL_HOSTS.has(u.hostname)) return u.href;
    return null;
  } catch {
    return null;
  }
}

// Return addresses of the AI apps the Connect AI page tells students to use. Anyone can register an app with
// any name ("Claude"), so the consent page trusts the return host, never the name.
const KNOWN_AI_HOSTS = ["claude.ai", "claude.com", "anthropic.com", "chatgpt.com", "openai.com"];

export function isKnownAiHost(uri: string | null | undefined): boolean {
  const host = uri ? redirectHost(uri) : null;
  if (!host) return false;
  const name = host.toLowerCase().replace(/:\d+$/, "");
  return KNOWN_AI_HOSTS.some((h) => name === h || name.endsWith(`.${h}`));
}
