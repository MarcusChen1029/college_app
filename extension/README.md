# Common App filler (Chrome extension)

Chrome MV3 side panel that fills the Common App courses and grades section from the transcript in the College Tracker. It signs in with a transcript-only token (never a Supabase session) obtained from the tracker's `/extension/connect` page.

Pinned extension id: `omnpdpbgbbdbnnaimhppoclimbeeognl` (derived from the public `key` in `manifest.json`; also `NEXT_PUBLIC_EXTENSION_ID` in `web/.env.example`). The private key was discarded and must never be committed (`*.pem` is gitignored).

## Develop

```bash
cd extension
npm install
npm test            # node --test on src/*.test.ts and scripts/*.test.mjs
npx tsc --noEmit
node build.mjs      # writes dist/ ; TRACKER_URL=https://your-tracker.example node build.mjs for a deployed tracker (default http://localhost:3000)
node scripts/extension-id.mjs "<base64 key>"   # prints the id derived from a key
```

## Load and sign in (manual check)

Messages sent with `chrome.runtime.sendMessage` are not delivered to the frame that sent them, so the sign-in calls below must be run from the side panel's console, not from the service worker console. The service worker console is only used to look at `chrome.storage.local`.

1. Run the tracker locally: `cd web && npm run dev`. `web/.env.local` must contain `NEXT_PUBLIC_EXTENSION_ID=omnpdpbgbbdbnnaimhppoclimbeeognl`; restart the dev server if you just added it.
2. Build the extension: `cd extension && node build.mjs`.
3. In Chrome open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and choose the `extension/dist` folder.
4. Check that the extension card shows the id `omnpdpbgbbdbnnaimhppoclimbeeognl`. If it shows a different id, the manifest `key` was not picked up.
5. Open the side panel: click the extension's toolbar icon (the puzzle-piece menu lists it if it is not pinned). Until Task 8 it only shows the text "Common App filler".
6. Open the panel's console: right-click inside the side panel, choose Inspect, then open the Console tab of the window that appears.
7. Sign in. In the panel console run:
   `await chrome.runtime.sendMessage({type:"signIn"})`
   A window opens showing the tracker's connect page (sign in to the tracker first if asked). Click Allow. Expected response: `{type: "signIn", ok: true}`. If you click Cancel the response is `{type: "signIn", ok: false}`.
8. Confirm the token is stored. On `chrome://extensions`, click "service worker" on the extension card to open its console and run:
   `await chrome.storage.local.get("token")`
   Expected: `{token: "<long string>"}`.
9. Fetch the transcript. In the panel console run:
   `await chrome.runtime.sendMessage({type:"loadTranscript"})`
   Expected for a student account: `{type: "loadTranscript", result: {ok: true, schools: [...], courses: [...]}}` with camelCase fields such as `academicYear`. A teacher account gives `result: {ok: false, reason: "students_only"}`. No token or a revoked token gives `result: {ok: false, reason: "signed_out"}` and the stored token is removed.
10. Sign out. In the panel console run:
    `await chrome.runtime.sendMessage({type:"signOut"})`
    Expected response: `{type: "signOut"}`. Run the `chrome.storage.local.get("token")` command from step 8 in the service worker console again; it now returns `{}`.

The token lives only in `chrome.storage.local` and is never logged.
