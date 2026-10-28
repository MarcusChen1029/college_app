-- New tables and sequences in public are not reachable through the Data API until a migration grants them
-- (2026-10-28 final review, R7-1). Until now every new table got full anon/authenticated privileges by default, so one
-- that a migration forgot to put under row-level security would have been readable and writable by anyone.
-- Existing tables keep their grants. A new table that clients use needs explicit grants, e.g.
--   grant select, insert, update, delete on public.<table> to authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
