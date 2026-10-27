-- Course-level offers for Canada and Australia, plus the US-curriculum route everywhere outside the US.
-- programs (0015) was UK-only: A-level/IB offers and a GBP fee. Canadian and Australian universities also admit
-- to a course, but publish AP / US-diploma requirements, an ATAR (Australia) and fees in CAD / AUD.

alter table public.programs
  add column apply_via    text,      -- 'UCAS', 'OUAC', 'Direct', 'UAC', 'VTAC'... (how an international applies)
  add column ap_offer     text,      -- US high school diploma route: AP scores and/or SAT/ACT
  add column atar         numeric(4,2) check (atar is null or atar between 30 and 99.95),  -- Australia: lowest selection rank / guaranteed ATAR
  add column intl_fee_cad integer check (intl_fee_cad is null or intl_fee_cad > 0),        -- per year, international tuition
  add column intl_fee_aud integer check (intl_fee_aud is null or intl_fee_aud > 0);        -- per year, international tuition
