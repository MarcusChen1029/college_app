-- Read-only: how many plaintext portal passwords are still waiting to move into the encrypted store
-- (portal_passwords, migration 0040). Nothing here changes data. The site moves a student's passwords itself on their
-- next visit (POST /api/portal-passwords "migrate": copy, read back, open, then compare-and-set remove), and
-- scripts/backfill-portal-passwords.mjs can do the same for students who don't come back.
-- Run before patch 2026-10-28-drop-portal-password-column.sql: that patch refuses to run unless every count is 0.
-- Counts only (no values). "unplaceable" ones can't be moved by the site (a key or id outside the slot format, a
-- password over 512 characters, a non-text value); they need a person's decision before the drop patch deletes them.

-- 1. student_colleges.portal_password (column dropped = this query errors: nothing left to count)
select count(*)                         as college_plaintext,
       count(distinct user_id)          as students
from public.student_colleges
where coalesce(portal_password, '') <> '';

-- 2. password values inside student_profiles.portals, split by whether the site can place them
with pw as (
  select sp.user_id, v.place, v.val
  from public.student_profiles sp
  cross join lateral public.portal_password_values(sp.portals) v   -- migration 0043
)
select count(*)                                                     as profile_plaintext,
       count(distinct user_id)                                      as students,
       count(*) filter (where jsonb_typeof(val) <> 'string'
                           or char_length(val #>> '{}') > 512
                           or place like 'custom:#%'
                           or place !~ '^(system:[a-z0-9_-]{1,40}|campus:[a-z0-9_-]{1,40}:.+|custom:[A-Za-z0-9_-]{1,100})$') as unplaceable
from pw;

-- 3. what the store holds (for comparison; sealed values are never shown)
select count(*) as stored_passwords, count(distinct user_id) as students from public.portal_passwords;
