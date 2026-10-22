import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";

// RFC 9728 metadata for the resource at /mcp (the path-suffixed form clients try first).
const handler = protectedResourceHandler({ authServerUrls: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`] });

export { handler as GET, handler as POST };
export const OPTIONS = metadataCorsOptionsRequestHandler();
