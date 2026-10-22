import { getPublicOrigin, metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";

// RFC 9728 metadata for clients that look at the site root. The protected resource is the MCP endpoint, not the site,
// so name /mcp explicitly (origin taken from the request the way mcp-handler does, honouring proxy headers).
// The authorization server is Supabase Auth's OAuth 2.1 server.
const authServerUrls = [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`];
const handler = (req: Request) => protectedResourceHandler({ authServerUrls, resourceUrl: `${getPublicOrigin(req)}/mcp` })(req);

export { handler as GET, handler as POST };
export const OPTIONS = metadataCorsOptionsRequestHandler();
