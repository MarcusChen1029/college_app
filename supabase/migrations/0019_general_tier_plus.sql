-- General tier gets S++, S+, S, A++, … D+, D (15 steps). Subject tiers stay plain S/A/B/C/D.
-- Existing rows keep their plain letter; sort_order 1 = best.

-- sort_order is unique, so move the old rows out of the way before renumbering.
update public.tiers set sort_order = sort_order + 100;

insert into public.tiers (code, sort_order, description) values
  ('S++', 1,  'Elite, top of S'),
  ('S+',  2,  'Elite, upper S'),
  ('S',   3,  'Elite: admit rate around 8% or lower, top global name'),
  ('A++', 4,  'Highly selective, top of A'),
  ('A+',  5,  'Highly selective, upper A'),
  ('A',   6,  'Highly selective: roughly top 25 nationally / top liberal arts colleges'),
  ('B++', 7,  'Very selective, top of B'),
  ('B+',  8,  'Very selective, upper B'),
  ('B',   9,  'Very selective: roughly top 26–60, strong flagships'),
  ('C++', 10, 'Selective, top of C'),
  ('C+',  11, 'Selective, upper C'),
  ('C',   12, 'Selective: roughly top 61–120'),
  ('D++', 13, 'Accessible, top of D'),
  ('D+',  14, 'Accessible, upper D'),
  ('D',   15, 'Accessible: broad admissions')
on conflict (code) do update set sort_order = excluded.sort_order, description = excluded.description;

-- Only the general category may use the + variants.
alter table public.institution_tiers
  add constraint institution_tiers_plus_general_only
  check (category_key = 'general' or tier_code in ('S', 'A', 'B', 'C', 'D'));
