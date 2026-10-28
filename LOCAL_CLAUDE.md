# Continue this project in a local Claude Code session

## 1. One-time setup
```bash
# Claude Code (requires Node 18+)
npm install -g @anthropic-ai/claude-code

# Get the code
git clone https://github.com/MarcusChen1029/college_app.git
cd college_app
git checkout claude/inspiring-hypatia-817lp8     # or main, once merged

# App dependencies + env
cd web && cp .env.example .env.local && npm install && cd ..
```

## 2. Connect Supabase (so Claude can read and write the database)
Pick one:
- **claude.ai connector:** if Supabase is already connected to your claude.ai account, it's available when you
  sign in to Claude Code with the same account (`/mcp` shows the connected servers).
- **Or add the Supabase MCP server yourself:** create a personal access token at
  supabase.com → Account → Access Tokens, then:
  ```bash
  claude mcp add supabase -s local -e SUPABASE_ACCESS_TOKEN=<your-token> -- \
    npx -y @supabase/mcp-server-supabase@latest --project-ref=eyvmtaggayqizllaseiu
  ```
  `-s local` keeps the token in your own Claude config, outside the repo. Don't use `-s project`: it writes the token into
  `.mcp.json` in this (public) repo. The token can control every project in your Supabase account, so never commit it.
- Sessions that read web pages (research waves) should run **without** the Supabase server connected: a planted instruction
  in a page could ask the agent to run SQL against student data.

Locally you'll see approval prompts for UPDATE/DELETE statements and can approve them, unlike in the cloud session.

## 3. Start
```bash
cd college_app
claude
```
Claude Code reads `CLAUDE.md` automatically (project context, rules, status, next tasks).
Good first prompt:

> Read CLAUDE.md and PLAN.md. Then help me verify the Vercel deployment fix and set up Supabase sign-in.
> After that, continue with the next tasks in CLAUDE.md.

## 4. Saving tokens
- Start a fresh session per task; `CLAUDE.md` carries the context, so you don't need to re-explain.
- Use `/compact` when a session gets long, and `/clear` between unrelated tasks.
- Point Claude at specific files (e.g. "edit `web/lib/data.ts`") instead of asking it to explore the repo.
- Data collection (scraping CDS files) is the most token-heavy work. Do one college per session.
