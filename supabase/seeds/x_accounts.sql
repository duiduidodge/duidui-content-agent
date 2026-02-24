-- X (Twitter) account sources — fetched via Grok at each researcher run
-- Run in Supabase SQL Editor: project dashboard → SQL Editor → paste → Run
INSERT INTO sources (type, value, category, enabled) VALUES
  ('x_account', 'fejau_inc',       'Macro',     true),
  ('x_account', 'mementoresearch', 'Research',  true),
  ('x_account', 'EricBalchunas',   'ETF',       true),
  ('x_account', 'FourPillarsFP',   'Research',  true),
  ('x_account', 'GLC_Research',    'Research',  true),
  ('x_account', 'blocmates',       'Crypto',    true),
  ('x_account', 'KobeissiLetter',  'Macro',     true),
  ('x_account', 'ai_9684xtpa',     'AI',        true),
  ('x_account', 'glassnode',       'On-chain',  true)
ON CONFLICT DO NOTHING;
