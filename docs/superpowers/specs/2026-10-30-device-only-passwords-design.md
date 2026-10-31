# "This device only" portal passwords: design

Date: 2026-10-30. Status: approved by the owner in chat ("Build it").
Builds on: `docs/superpowers/specs/2026-10-29-e2e-portal-vault-design.md` (the locked vault) and the cleanup that removed the
v1 handover (migration 0048).

## Why

Some students don't want a vault passphrase. The owner asked for a privacy setting that turns the vault off. When it is
off, passwords are kept **only on the device** where the student typed them: never sent to Trakur's servers, not synced.

## What the student sees

- **Settings → Saved passwords**, a choice "Where to keep your portal passwords":
  - **Locked vault** (default; today's behavior): synced to every device you sign in on; needs your passphrase.
  - **This device only**: no passphrase; Show / Copy work right away; never sent to Trakur's servers; not on your phone or
    other computers; gone if you clear this browser's site data. Anyone using this browser profile while you're signed in
    can see them (said plainly under the option).
- The choice is **per account** (saved in the profile), so every device knows the mode. The passwords themselves live on
  the device where they were typed. On another device in device mode, password fields are empty with a one-line note
  "Passwords are kept on the device where you saved them."
- **Vault → this device:** needs the vault unlocked (offer Unlock). Every saved password is copied into this device and
  read back; only if all copies verify: the profile switches to device mode, then the vault and its server copies are
  deleted (confirm first: "Your other devices will no longer have these passwords"). If deleting the server copies
  fails, Settings shows "Your old vault still holds N passwords on our servers — Delete" until it succeeds.
- **This device → vault:** set up or unlock the vault (existing dialogs). This device's passwords are moved into it
  (insert-only; a slot the vault already holds with a different value stays on the device and is listed); only after
  they are confirmed stored: profile switches to vault mode, then the device copies are deleted.
- **Device mode, everyday use:** the password field works like the unlocked vault (type → save on blur, Show, Copy with
  clipboard auto-clear, Clear with confirm), no Lock button, no passphrase.
- **Settings in device mode:** "Delete passwords on this device" (confirm). Change passphrase / recovery code / Lock are
  hidden (no vault).
- **Signing out** keeps them on the device; they show again only for the same account when signed in. Signed-out
  visitors still can't save passwords.
- **Account deletion** also deletes that account's passwords on this device.
- The sign-in merge of passwords an older build saved in this browser ("Add to this account") stores them into the
  device store in device mode (insert-only; a different existing value keeps the old copy where it is).
- Teachers, parent links, AI connections and the extension never see passwords (unchanged).
- Security and Privacy pages: one short line each about the device option (en + zh-TW).

## How (decided)

- **Profile column** (migration 0049, after 0048): `student_profiles.password_storage text not null default 'vault'
  check (password_storage in ('vault','device'))`. Readable/writable by the student like other profile fields (check the
  table's existing grants and column-level grants; add what is needed). Not exposed to AI views, teacher RPCs, share
  links or the extension. Wire it through `web/lib/student-rows.ts` / the student store like other profile fields.
- **Device store** (new pure module + thin IndexedDB adapter):
  - One IndexedDB database per origin, e.g. `trakur-device-passwords`, holding per user id a **non-extractable**
    AES-256-GCM `CryptoKey` (generated on first use) and per (user id, slot) a sealed value
    `d1.<base64url(iv | ciphertext+tag)>`, additional data `device|user:<id>|slot:<slot>`.
  - Logic is written against an injected storage interface so Node tests run it with real WebCrypto and an in-memory
    store; the IndexedDB adapter is small and wrapped in try/catch. If IndexedDB is unavailable (some private windows),
    device mode says "This browser can't keep passwords" and saving is off; nothing throws.
  - Nothing from the device store is ever sent in a request. Passwords ≤ 512 chars, same slot rules as today.
- **Client:** the password client exposes the mode from the profile; in device mode, list / reveal / save / delete go
  to the device store; vault functions keep working in vault mode exactly as today. Switching flows live in a pure,
  tested module (inject the vault calls and the device store) with the orders above.
- **Copy:** all new text in English and zh-TW through the dictionaries (terms: 密碼保險箱 / 主密碼 / 復原碼; device
  mode = 只存在這台裝置).

## Non-goals

- Syncing device-mode passwords anywhere; exporting/importing files; per-device mode (the choice is per account).
- Changing the vault's crypto or server API.

## Tests and proof

- Node: device store round trip, tamper/other-user/other-slot fail, unavailable storage, switching flows in both
  directions incl. partial failure (nothing deleted unless every copy verified), lost profile write, conflicts.
- Browser (mock Supabase + playwright-cli, as for the vault): switch vault → device (passwords visible without
  passphrase, server rows gone), save/show/clear in device mode, reload, sign out/in, switch device → vault, a second
  "device" (fresh profile) shows the note, zh-TW, 375 px.
- Live: migration catalog check + a pre/post query; the owner's own account stays in vault mode unless they switch.
