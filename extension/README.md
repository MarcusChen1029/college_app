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

1. Run the tracker locally: `cd web && npm run dev` (needs `web/.env.local` with `NEXT_PUBLIC_EXTENSION_ID=omnpdpbgbbdbnnaimhppoclimbeeognl`; restart the dev server after changing it).
2. `cd extension && node build.mjs`.
3. Open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and choose `extension/dist`.
4. Confirm the card shows the id `omnpdpbgbbdbnnaimhppoclimbeeognl`. If it differs, the manifest `key` was not picked up.
5. Click the extension icon to open the side panel. (Until Task 8 the panel is a stub; trigger sign-in from the service worker console instead: on the extension card click "service worker", then run `chrome.runtime.sendMessage({type:"signIn"})` from the panel page console or call it via the panel once built.)
6. In the pop-up window sign in to the tracker if asked, then click Allow on the connect page.
7. In the service worker console, run `chrome.storage.local.get("token")`: it should hold the token. `chrome.runtime.sendMessage({type:"loadTranscript"})` returns the transcript.
8. To sign out run `chrome.runtime.sendMessage({type:"signOut"})`; the token is removed. An `invalid_token` response from the server also removes it.

The token lives only in `chrome.storage.local` and is never logged.
