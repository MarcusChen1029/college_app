// What the public connector refuses before the MCP SDK sees a request, so one anonymous POST stays one cheap unit of the rate limit:
//  - JSON-RPC batching: one HTTP body that is an array of messages. MCP removed batching in the 2025-06-18 spec, but the SDK's
//    legacy stateless path still accepts up to 100 messages in one POST and runs them all, which would multiply a per-request
//    rate limit by 100.
//  - methods that open a long-lived stream: `subscriptions/listen` never returns a result, so one POST could hold a serverless
//    function open until its maxDuration (the SDK allows 1024 such streams per instance by default).
//  - a body over MAX_BODY_BYTES, or one that is not JSON, is not read at all.
// Pure, so it is unit-tested; the route does the Response building.

/** Largest POST body the public connector reads (its real requests are a few hundred bytes). Vercel itself caps bodies at 4.5 MB. */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Methods that hold a connection open until the client leaves. The connector has no events to deliver, so it answers none of them. */
const STREAMING_METHODS: ReadonlySet<string> = new Set(["subscriptions/listen"]);

/**
 * True when the body is a JSON array (a batch). A single object, anything that is not an array and text that is not JSON at all
 * are false: the last case is left to the MCP handler, which answers a parse error itself.
 */
export function isBatchBody(text: string): boolean {
  try {
    return Array.isArray(JSON.parse(text));
  } catch {
    return false;
  }
}

/** The single JSON-RPC message in `text`, or null when the body is not one JSON object (a batch, a scalar or not JSON at all). */
function singleMessage(text: string): Record<string, unknown> | null {
  try {
    const body: unknown = JSON.parse(text);
    return body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * True when the body is one JSON-RPC message whose top-level `method` opens a long-lived stream (`subscriptions/listen`).
 * Only the top-level method counts, so a tool argument that merely mentions it is fine. A batch or text that is not JSON is
 * false: they have their own answers.
 */
export function isRejectedMethod(text: string): boolean {
  const method = singleMessage(text)?.method;
  return typeof method === "string" && STREAMING_METHODS.has(method);
}

/** The `id` of the single JSON-RPC message in `text` (a string or number), else null: what an error answer should echo back. */
export function jsonRpcId(text: string): string | number | null {
  const id = singleMessage(text)?.id;
  return typeof id === "string" || typeof id === "number" ? id : null;
}

/** True when a content-length header says the body is larger than MAX_BODY_BYTES. A missing or unreadable header is false. */
export function isOversizedBody(contentLength: string | null | undefined): boolean {
  if (!contentLength || !/^\d+$/.test(contentLength.trim())) return false;
  return Number(contentLength.trim()) > MAX_BODY_BYTES;
}

/** True when a content-type header names application/json (any charset or other parameter). Anything else is left to the SDK to refuse. */
export function isJsonContentType(contentType: string | null | undefined): boolean {
  return (contentType ?? "").split(";")[0].trim().toLowerCase() === "application/json";
}
