insert into public.countries (code, name) values
  ('US','United States'), ('GB','United Kingdom'), ('CA','Canada'), ('AU','Australia')
on conflict (code) do update set name = excluded.name;

insert into public.tiers (code, sort_order, description) values
  ('S', 1, 'Elite: admit rate around 8% or lower, top global name'),
  ('A', 2, 'Highly selective: roughly top 25 nationally / top liberal arts colleges'),
  ('B', 3, 'Very selective: roughly top 26–60, strong flagships'),
  ('C', 4, 'Selective: roughly top 61–120'),
  ('D', 5, 'Accessible: broad admissions')
on conflict (code) do update set sort_order = excluded.sort_order, description = excluded.description;

insert into public.tier_categories (key, label, sort_order) values
  ('general',          'General',            0),
  ('computer_science', 'Computer Science',   1),
  ('engineering',      'Engineering',        2),
  ('business',         'Business',           3),
  ('biology_life_sci', 'Biology / Life Sci', 4),
  ('pre_med',          'Pre-Med',            5),
  ('economics',        'Economics',          6),
  ('math_physics',     'Math / Physics',     7),
  ('humanities',       'Humanities',         8),
  ('arts_design',      'Arts / Design',      9),
  ('nursing',          'Nursing',           10)
on conflict (key) do update set label = excluded.label, sort_order = excluded.sort_order;

insert into public.application_plans (key, label, binding, description) values
  ('ED',      'Early Decision',             true,  'Binding; apply to one ED school only'),
  ('ED2',     'Early Decision II',          true,  'Binding; later deadline than ED'),
  ('EA',      'Early Action',               false, 'Non-binding early round'),
  ('REA',     'Restrictive Early Action',   false, 'Non-binding, but limits other early private applications'),
  ('RD',      'Regular Decision',           false, 'Standard round'),
  ('ROLLING', 'Rolling',                    false, 'Decisions issued as applications complete')
on conflict (key) do update set label = excluded.label, binding = excluded.binding, description = excluded.description;

insert into public.english_tests (key, name, max_score) values
  ('TOEFL_IBT',  'TOEFL iBT',               120),
  ('IELTS',      'IELTS Academic',          9),
  ('DUOLINGO',   'Duolingo English Test',   160),
  ('PTE',        'PTE Academic',            90),
  ('CAMBRIDGE',  'Cambridge C1/C2 (scale)', 230)
on conflict (key) do update set name = excluded.name, max_score = excluded.max_score;
