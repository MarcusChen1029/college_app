import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyToken } from "@/lib/mcp/auth";
import { registerTools } from "@/lib/mcp/tools";

// Connect AI: an MCP server (stateless Streamable HTTP) that lets a Senior-plan student's ChatGPT or Claude read
// and update their tracker data. Sign-in is Supabase's OAuth 2.1 server; every tool runs as the student (see tools.ts).

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "college-tracker", version: "1.0.0" },
  instructions:
    "College Tracker holds one student's college applications. Call get_applications and get_profile first to see where they stand. " +
    "Use the data from these tools instead of guessing, and say when something isn't published. " +
    "Confirm with the student before deleting an activity or marking an application submitted.",
});

// Unauthenticated requests get 401 with a WWW-Authenticate header pointing at the protected-resource metadata,
// which names Supabase as the authorization server.
const authed = withMcpAuth(handler, verifyToken, { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp" });

export { authed as GET, authed as POST, authed as DELETE };
