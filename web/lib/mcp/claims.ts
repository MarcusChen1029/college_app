// Turns the verified claims of a Supabase access token into the auth info the MCP handler passes to tools.
// Pure on purpose (no Supabase client) so it can be unit tested; auth.ts does the signature check.

export type McpAuth = {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
  extra: { userId: string; origin: string };
};

/**
 * Only tokens issued by the OAuth server carry a `client_id` claim. A website session token (what the browser holds)
 * has none, so requiring it keeps those from being replayed against /mcp.
 */
export function authFromClaims(token: string, claims: Record<string, unknown> | null | undefined, origin: string): McpAuth | undefined {
  if (!claims) return undefined;
  const { sub, client_id: clientId, scope, exp } = claims;
  if (typeof sub !== "string" || !sub) return undefined;
  if (typeof clientId !== "string" || !clientId) return undefined;
  return {
    token,
    clientId,
    scopes: typeof scope === "string" ? scope.split(/\s+/).filter(Boolean) : [],
    expiresAt: typeof exp === "number" ? exp : undefined,
    extra: { userId: sub, origin },
  };
}
