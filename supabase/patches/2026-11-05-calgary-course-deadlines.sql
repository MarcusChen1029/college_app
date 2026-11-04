-- Calgary course application deadlines (2026-11-05, Task 11 of the UK/CA/AU part 1 plan). NOT APPLIED.
--
-- Why: the University of Calgary dates page (https://www.ucalgary.ca/future-students/undergraduate/admissions/dates,
-- read 2026-11-05) gives "March 1 - Application deadline: Fall undergraduate admission"; the requirements pages that
-- gave 1 Apr 2027 could not be re-read (site maintenance). The controller ruled for the earlier date. Calgary's
-- university deadline row moves to 2027-03-01 in 2026-11-05-uk-ca-au-deadlines.sql (an UPDATE by id); the three
-- courses' programs.application_deadline (shown on the college page) move here. Matches data/colleges/calgary.json in
-- the same commit. The course deadline rows in 2026-11-05-uk-ca-au-deadlines.sql already carry 2027-03-01.
--
-- It contains UPDATEs, so it needs the owner: the Supabase MCP holds UPDATE for the owner's approval (60 s timeout), or
-- the owner runs it in the dashboard SQL Editor.
-- Run after (or with) 2026-11-05-uk-ca-au-deadlines.sql, in the Supabase SQL Editor. Running it twice is harmless:
-- the second run updates 0 rows and the guard still passes. The guard aborts (nothing changes) unless all three
-- courses end on 2027-03-01.

begin;

update public.programs p
set application_deadline = '2027-03-01'
from public.institutions i
where p.institution_id = i.id
  and i.slug = 'calgary'
  and p.slug in ('computer-science', 'economics', 'engineering-common-first-year')
  and p.application_deadline = '2027-04-01';

do $$
begin
  if (select count(*) from public.programs p join public.institutions i on i.id = p.institution_id
      where i.slug = 'calgary'
        and p.slug in ('computer-science', 'economics', 'engineering-common-first-year')
        and p.application_deadline = '2027-03-01') <> 3 then
    raise exception 'Calgary course deadlines: expected 3 courses on 2027-03-01; nothing changed';
  end if;
end $$;

commit;

select p.slug, p.application_deadline from public.programs p join public.institutions i on i.id = p.institution_id
where i.slug = 'calgary' order by p.slug;
