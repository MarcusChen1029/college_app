// JSON-RPC batching: one HTTP body that is an array of messages. MCP removed batching in the 2025-06-18 spec, but the SDK's
// legacy stateless path still accepts up to 100 messages in one POST and runs them all, which would multiply a per-request
// rate limit by 100. The public connector rejects batches before the SDK sees them. Pure, so it is unit-tested.

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
