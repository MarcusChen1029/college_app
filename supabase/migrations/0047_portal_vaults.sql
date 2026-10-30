-- End-to-end portal password vault, database side (design: docs/superpowers/specs/2026-10-29-e2e-portal-vault-design.md,
-- plan: docs/superpowers/plans/2026-10-29-e2e-portal-vault.md).
-- Saved portal passwords move from encryption by the web server (0040: the AES key lives in the server's env) to
-- encryption in the student's own browser. A random vault key encrypts every password; that key is stored here only
-- wrapped (encrypted) twice: under a key derived from the student's passphrase, and under one derived from a recovery
-- code. The server and the database hold opaque strings and nothing that opens them.
-- portal_vaults: one row per user. Every text column other than version is unpadded base64url made in the browser.
--   key_id          16 random characters naming this vault (not derived from any secret). Every value in
--                   portal_passwords.sealed starts "e1.<key_id>.", so a value saved under a replaced vault (another tab after
--                   "start over") is refused instead of stored where nobody can open it. Old server-sealed rows start "v1.".
--   pass_*, rec_*   the passphrase and recovery-code wrappers: pass_salt / rec_salt = 16-byte salt (22 characters);
--                   pass_check / rec_check = SHA-256 of the 32-byte check value (43); pass_wrapped / rec_wrapped = the vault key
--                   under AES-256-GCM, 12-byte IV + 32-byte key + 16-byte tag = 60 bytes (80). The exact lengths are enforced here.
--   pass_iterations PBKDF2-SHA-256 rounds for the passphrase wrapper, stored per vault so it can be raised; 600000 is the floor.
-- Same lockdown as portal_passwords (0040): RLS on with no policies and every client grant revoked, so anon and
-- authenticated tokens (the website's and an AI connection's alike) can't read or write it. Only the server, with the
-- service-role key, reaches it, through POST /api/portal-passwords (which also refuses AI-connection tokens).
-- Three functions do the steps that must be atomic. They are plain SECURITY INVOKER with an empty search_path, and
-- EXECUTE is revoked from public, anon and authenticated (Supabase grants the last two on every new public function by
-- default), so only service_role can call them, through supabase-js rpc(). A malformed p_record, an over-long slot or
-- value, or a missing field raises the table's own check / not-null error: the server validates first, the constraints
-- are the backstop. Results are text codes the server maps to HTTP statuses.
--   portal_vault_create(user, record) -> 'ok' | 'exists' (a vault row is there) | 'orphans' (the user has e1 rows, which
--       belong to a vault that is gone; only portal_vault_reset clears them). Old v1 rows don't block creation.
--   portal_vault_put(user, slot, sealed, expected, insert_only)
--       -> 'ok' | 'no_vault' | 'wrong_vault' | 'changed' | 'occupied' | 'too_many'
--       It first takes FOR SHARE on the user's vault row and only then compares the key id, and portal_vault_reset deletes
--       that row first: a save that read the old key id either finishes before the reset starts or sees no vault (or the
--       new key id) after it, so a value sealed under a deleted vault can never land after a reset.
--       expected is the portal_passwords.updated_at the caller last read (compare-and-set, 'changed' if the row differs or
--       is missing); pass the exact string PostgREST returned, microseconds included. It wins if insert_only is also set.
--       insert_only never overwrites ('occupied'). Without either, it upserts. A new slot beyond 500 rows per user
--       (MAX_SLOTS_PER_USER in web/lib/portal-vault-server.ts) is 'too_many'; an existing slot is never refused for that.
--   portal_vault_reset(user): deletes the vault row, then every portal_passwords row of the user, in one transaction.
-- Changing the passphrase or recovery code (vault_update) is a plain compare-and-set UPDATE of portal_vaults by the
-- server on updated_at, which that UPDATE must set itself (there is no trigger), so it has no function here.
-- Applying this to the live project is a rollout step after the code is reviewed (owner's OK); nothing uses it before then.

create table public.portal_vaults (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  version         text not null check (version = 'e1'),
  key_id          text not null check (key_id ~ '^[A-Za-z0-9_-]{16}$'),
  pass_salt       text not null check (pass_salt ~ '^[A-Za-z0-9_-]+$' and char_length(pass_salt) = 22),
  pass_iterations integer not null check (pass_iterations between 600000 and 10000000),
  pass_check      text not null check (pass_check ~ '^[A-Za-z0-9_-]+$' and char_length(pass_check) = 43),
  pass_wrapped    text not null check (pass_wrapped ~ '^[A-Za-z0-9_-]+$' and char_length(pass_wrapped) = 80),
  rec_salt        text not null check (rec_salt ~ '^[A-Za-z0-9_-]+$' and char_length(rec_salt) = 22),
  rec_check       text not null check (rec_check ~ '^[A-Za-z0-9_-]+$' and char_length(rec_check) = 43),
  rec_wrapped     text not null check (rec_wrapped ~ '^[A-Za-z0-9_-]+$' and char_length(rec_wrapped) = 80),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.portal_vaults enable row level security;
revoke all on table public.portal_vaults from public, anon, authenticated;
grant select, insert, update, delete on table public.portal_vaults to service_role;

-- Creates the user's vault from p_record (jsonb with the table's columns other than user_id and the two timestamps).
create function public.portal_vault_create(p_user uuid, p_record jsonb) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  v_rows integer;
begin
  if exists (select 1 from public.portal_vaults v where v.user_id = p_user) then
    return 'exists';
  end if;
  if exists (select 1 from public.portal_passwords pw where pw.user_id = p_user and pw.sealed like 'e1.%') then
    return 'orphans';
  end if;
  insert into public.portal_vaults (user_id, version, key_id, pass_salt, pass_iterations, pass_check, pass_wrapped,
                                    rec_salt, rec_check, rec_wrapped)
  values (p_user, p_record ->> 'version', p_record ->> 'key_id', p_record ->> 'pass_salt',
          (p_record ->> 'pass_iterations')::integer, p_record ->> 'pass_check', p_record ->> 'pass_wrapped',
          p_record ->> 'rec_salt', p_record ->> 'rec_check', p_record ->> 'rec_wrapped')
  on conflict (user_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return 'exists'; end if;  -- another request created it between the check and the insert
  return 'ok';
end $$;
revoke execute on function public.portal_vault_create(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.portal_vault_create(uuid, jsonb) to service_role;

-- Saves one sealed password. See the header for the result codes and the locking.
create function public.portal_vault_put(p_user uuid, p_slot text, p_sealed text, p_expected timestamptz, p_insert_only boolean)
returns text
language plpgsql security invoker set search_path = '' as $$
declare
  v_key_id text;
  v_rows   integer;
begin
  -- The share lock is held until this transaction ends; portal_vault_reset's DELETE of the vault row waits for it.
  select v.key_id into v_key_id from public.portal_vaults v where v.user_id = p_user for share;
  if not found then return 'no_vault'; end if;
  if p_sealed is null or p_sealed not like 'e1.%' or split_part(p_sealed, '.', 2) is distinct from v_key_id then
    return 'wrong_vault';
  end if;

  if p_expected is not null then
    update public.portal_passwords set sealed = p_sealed, updated_at = now()
    where user_id = p_user and slot = p_slot and updated_at = p_expected;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then return 'changed'; end if;
    return 'ok';
  end if;

  if not exists (select 1 from public.portal_passwords pw where pw.user_id = p_user and pw.slot = p_slot)
     and (select count(*) from public.portal_passwords pw where pw.user_id = p_user) >= 500 then
    return 'too_many';
  end if;

  if coalesce(p_insert_only, false) then
    insert into public.portal_passwords (user_id, slot, sealed, updated_at) values (p_user, p_slot, p_sealed, now())
    on conflict (user_id, slot) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then return 'occupied'; end if;
    return 'ok';
  end if;

  insert into public.portal_passwords (user_id, slot, sealed, updated_at) values (p_user, p_slot, p_sealed, now())
  on conflict (user_id, slot) do update set sealed = excluded.sealed, updated_at = now();
  return 'ok';
end $$;
revoke execute on function public.portal_vault_put(uuid, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.portal_vault_put(uuid, text, text, timestamptz, boolean) to service_role;

-- "Start over": the vault row goes first (waiting for any portal_vault_put that holds FOR SHARE on it), then the passwords
-- sealed under it. Also the only way to clear orphan e1 rows (a vault that is gone but whose passwords are still there).
create function public.portal_vault_reset(p_user uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.portal_vaults where user_id = p_user;
  delete from public.portal_passwords where user_id = p_user;
end $$;
revoke execute on function public.portal_vault_reset(uuid) from public, anon, authenticated;
grant execute on function public.portal_vault_reset(uuid) to service_role;
