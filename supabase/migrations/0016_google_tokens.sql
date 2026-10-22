-- Google Docs for essays: one encrypted Google refresh token (scope drive.file) per student.
-- Only the web server touches this table, with the service-role key. The token is AES-256-GCM encrypted
-- by the app (GOOGLE_TOKEN_ENCRYPTION_KEY) before it is stored, so the database never holds it in the clear.
-- It lives in public (not private) because supabase-js can only reach exposed schemas; RLS is on with
-- no policies and all grants are revoked, so anon and authenticated users can't read or write it.

create table public.google_tokens (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  refresh_token_encrypted text not null,
  created_at              timestamptz not null default now()
);
alter table public.google_tokens enable row level security;
revoke all on table public.google_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.google_tokens to service_role;
