// Reading the access token of a request: the "Authorization: Bearer <token>" header, and who the token was issued to.
// The token check keeps AI connections (Connect AI / MCP) away from the saved-password route (portal-vault-handler.ts),
// and is also used by account-server.ts and google-server.ts. Pure (node:buffer only, no Supabase). Never log a token.

/** The token of an "Authorization: Bearer <token>" header, or null. */
export function bearerToken(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1] : null;
}

/**
 * Who a Supabase access token was issued to, read from its payload. Tokens the OAuth server mints for an AI connection
 * (Connect AI / MCP) carry a `client_id` claim (see mcp/claims.ts); the website's own session tokens never do. Any
 * token with that claim, whatever its value, is "ai_client" and gets no access to passwords; an unreadable one is
 * "invalid". The signature and session are checked separately (auth.getUser), so editing the payload gains nothing.
 */
export function tokenSource(token: string): "website" | "ai_client" | "invalid" {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return "invalid";
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return "invalid";
    return Object.hasOwn(claims, "client_id") ? "ai_client" : "website";
  } catch {
    return "invalid";
  }
}
