-- One-row note fix for Leeds deadlines[1] (09e9c0d1-e1ec-52d7-96d3-b6a062781ff8), owner-approved 2026-11-04.
-- Live still had the pre-2026-10-30 wording because supabase/patches/2026-10-30-student-facing-notes.sql was never run;
-- this sets the row to the committed data file's value so live matches the files (the rest of the 10-30 patch is a
-- separate decision). Holds an UPDATE: the owner approves it. Safe to run twice.
begin;
update public.deadlines set notes = 'The Economics BSc page states ''The deadline for international students to apply to Leeds University Business School courses is 30 June'' (no year is printed, so 30 June 2027 is assumed).' where id = '09e9c0d1-e1ec-52d7-96d3-b6a062781ff8' and notes = 'The Economics BSc page states ''The deadline for international students to apply to Leeds University Business School courses is 30 June'' (no year printed; read as 30 June 2027).';
do $$ begin
  if (select notes from public.deadlines where id = '09e9c0d1-e1ec-52d7-96d3-b6a062781ff8') is distinct from 'The Economics BSc page states ''The deadline for international students to apply to Leeds University Business School courses is 30 June'' (no year is printed, so 30 June 2027 is assumed).' then
    raise exception 'FAIL: Leeds deadlines[1] note is not the committed value';
  end if;
end $$;
commit;
select 'leeds note fixed' as result;
