-- Tier review v1 (2026-10-20): business tiers corrected (no undergrad business at Stanford/Harvard;
-- Haas, Stern, Sloan → S; Gies → A), Berkeley bio/econ → S, and every tier now carries a rationale.
-- Generated from data/cycle_2026_27.json by scripts/build_seed.py. Safe to re-run.
begin;
delete from institution_tiers;
insert into institution_tiers (institution_id, category_key, tier_code, rationale)
select 'caa9a1af-8f82-5061-8a81-0334c772233f'::uuid, v.* from (values
 ('general', 'A', 'Admit rate 11.4%'),
 ('computer_science', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('engineering', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('business', 'S', 'Haas undergraduate program is consistently a top-5 US undergraduate business program.'),
 ('biology_life_sci', 'S', 'Molecular & Cell Biology / Integrative Biology are among the strongest US life-science departments.'),
 ('pre_med', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('economics', 'S', 'Berkeley economics is a top-5 department nationally.'),
 ('math_physics', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('humanities', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('arts_design', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)')) v;
insert into institution_tiers (institution_id, category_key, tier_code, rationale)
select '1ad8cde2-72f3-52c3-b937-9ec013f2677d'::uuid, v.* from (values
 ('general', 'A', 'Admit rate 11.1%; SAT middle 50% 1500-1560'),
 ('computer_science', 'S', 'School of Computer Science is a top-3 US CS program.'),
 ('engineering', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('business', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('biology_life_sci', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('pre_med', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('economics', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('math_physics', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('humanities', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('arts_design', 'S', 'School of Drama, School of Design and School of Architecture are among the best in the US.')) v;
insert into institution_tiers (institution_id, category_key, tier_code, rationale)
select '71d87d83-bb3c-50f5-9315-7ebfb79b3ed0'::uuid, v.* from (values
 ('general', 'A', 'Admit rate 13.3%; SAT middle 50% 1370-1530'),
 ('computer_science', 'A', 'Top-10 CS program; just outside the top-5 group.'),
 ('engineering', 'S', 'Top-5 US engineering school across most disciplines.'),
 ('business', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('biology_life_sci', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('pre_med', 'C', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('economics', 'C', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('math_physics', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('humanities', 'C', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('arts_design', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)')) v;
insert into institution_tiers (institution_id, category_key, tier_code, rationale)
select 'e4c745cc-3156-52c3-aba3-bad66da2ea76'::uuid, v.* from (values
 ('general', 'S', 'Admit rate 4.2%'),
 ('computer_science', 'A', 'Strong CS within SEAS, below the MIT/Stanford/CMU/Berkeley group.'),
 ('engineering', 'B', 'SEAS is solid but smaller and less highly ranked than its sciences.'),
 ('biology_life_sci', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('pre_med', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('economics', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('math_physics', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('humanities', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('arts_design', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)')) v;
insert into institution_tiers (institution_id, category_key, tier_code, rationale)
select '415a0c1f-3b07-5a52-94a0-6bd450bba6c5'::uuid, v.* from (values
 ('general', 'S', 'Admit rate 4.6%; SAT middle 50% 1520-1570'),
 ('computer_science', 'S', 'EECS is a top-3 US CS program.'),
 ('engineering', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('business', 'S', 'Sloan''s undergraduate management/finance programs are consistently ranked among the top few in the US.'),
 ('biology_life_sci', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('pre_med', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('economics', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('math_physics', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('humanities', 'B', 'Strong in linguistics/philosophy, but humanities are not the focus of the curriculum.'),
 ('arts_design', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)')) v;
insert into institution_tiers (institution_id, category_key, tier_code, rationale)
select 'a89d4ad5-df02-5c82-9adc-dc8b82e72709'::uuid, v.* from (values
 ('general', 'A', 'Admit rate 9.1%; SAT middle 50% 1480-1550'),
 ('computer_science', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('engineering', 'C', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('business', 'S', 'Stern is consistently a top-5 US undergraduate business program.'),
 ('biology_life_sci', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('pre_med', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('economics', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('math_physics', 'A', 'Courant Institute makes NYU a leading applied-math department.'),
 ('humanities', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('arts_design', 'S', 'Tisch School of the Arts is among the leading US arts schools.'),
 ('nursing', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)')) v;
insert into institution_tiers (institution_id, category_key, tier_code, rationale)
select 'd7b0e604-36c4-57ec-8afa-11e1217143fe'::uuid, v.* from (values
 ('general', 'B', 'Admit rate 43.4%; SAT middle 50% 1220-1470'),
 ('computer_science', 'A', 'Strong CS within the top ~20.'),
 ('engineering', 'A', 'Top-10 engineering (aerospace especially strong).'),
 ('business', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('biology_life_sci', 'C', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('pre_med', 'C', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('economics', 'C', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('math_physics', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('humanities', 'C', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('arts_design', 'C', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('nursing', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)')) v;
insert into institution_tiers (institution_id, category_key, tier_code, rationale)
select '03e19bf0-cc16-5613-af62-bc77fcd4412d'::uuid, v.* from (values
 ('general', 'S', 'Admit rate 3.8%; SAT middle 50% 1520-1570'),
 ('computer_science', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('engineering', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('biology_life_sci', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('pre_med', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('economics', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('math_physics', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('humanities', 'S', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('arts_design', 'A', 'Product design and art practice strong; no conservatory-style arts school.')) v;
insert into institution_tiers (institution_id, category_key, tier_code, rationale)
select '4bbd7e56-a2f5-5ab6-9af7-1e0b6c3abb6d'::uuid, v.* from (values
 ('general', 'B', 'Admit rate 36.6%; SAT middle 50% 1390-1520'),
 ('computer_science', 'S', 'Grainger CS is a top-5 US program.'),
 ('engineering', 'S', 'Grainger College of Engineering is a top-5 US engineering school.'),
 ('business', 'A', 'Gies College of Business is a top-15 undergraduate business program (accountancy especially strong).'),
 ('biology_life_sci', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('pre_med', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('economics', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('math_physics', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('humanities', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('arts_design', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)')) v;
insert into institution_tiers (institution_id, category_key, tier_code, rationale)
select '2347bb33-a0d0-572c-b800-0e821b009b7e'::uuid, v.* from (values
 ('general', 'A', 'Admit rate 16.4%; SAT middle 50% 1370-1530'),
 ('computer_science', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('engineering', 'A', 'Top-10 engineering college; just outside the top-5 group.'),
 ('business', 'S', 'Ross BBA is a top-5 US undergraduate business program.'),
 ('biology_life_sci', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('pre_med', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('economics', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('math_physics', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('humanities', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('arts_design', 'B', 'Editorial judgment (v1, reviewed 2026-10-20)'),
 ('nursing', 'A', 'Editorial judgment (v1, reviewed 2026-10-20)')) v;
commit;
