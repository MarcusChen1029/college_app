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
  "See or change your portal usernames and passwords",
  "Remove a college from your list",
  "Delete an essay",
  "Change your subscription plan or reminder emails",
  "Mark an application submitted before its checklist is complete, or record a decision before it is submitted",
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
