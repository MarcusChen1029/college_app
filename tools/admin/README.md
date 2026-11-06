# Owner tools

A page for the site owner that runs on your own computer: make and change redeem codes, see who used them, and see all accounts.
It isn't part of the website and is never deployed. Changes go straight to the live database.

## Start it

One-time setup: create a file named `.env` in this folder with one line, using the secret key from Supabase > Project Settings > API Keys:

```
SUPABASE_SERVICE_ROLE_KEY=<the key>
```

Git ignores that file. The key can read every account, so never commit it or paste it into a chat. There's deliberately no `.env.example` here: a key once got pasted into that tracked file by mistake.

```bash
node tools/admin/server.mjs
```

Then open http://127.0.0.1:4177. Press Ctrl+C in the terminal to stop.

To look around with made-up data and no key:

```bash
node tools/admin/fake-supabase.mjs
```

That opens on http://127.0.0.1:4179.

## Rules it enforces

- Every new code has a usage limit (1 to 10,000) and an expiry date (the end of that day, Taipei time).
- A code you type yourself needs at least 12 characters. Leave it blank to get a random 16-character code.
- A code can't be switched on if it's short, has no limit, has no expiry date or has expired. That keeps the old `freetest` off.
- A limit can't go below the uses already made.
- Codes are never deleted, only switched off. Passes already given stay; to take one back, use `supabase/patches/refund-order.sql`.

The repository is public, so codes must stay out of it. They live only in the database.

## What it shows

Accounts lists email, name, school (teachers), role, plan, list size, joined date and last sign-in. Portal logins, notes, essays, grades and
other student records are never requested from the database (`loadAccounts` in `server.mjs` names its columns).

## How it stays private

The server holds a key that can read everything, and any website you have open can send requests to `127.0.0.1`. So it listens on
`127.0.0.1` only, refuses any other Host header (DNS rebinding), and every API call needs a token that changes on each start and that only
this page can read, must not come from another origin, and must be JSON if it's a write (`guardRequest` in `lib.mjs`). Database text is only
ever put on the page as text, because students type their own names.

## Tests

```bash
node --test tools/admin/lib.test.mjs tools/admin/server.test.mjs
```
