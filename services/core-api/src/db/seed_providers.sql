-- Seed: providers + provider_services for development/testing
-- Run: psql -U amitsangita -h localhost -d core_db < seed_providers.sql
--
-- Uses Mumbai area IDs that were seeded by locations.sql.
-- category_slug values must match CATEGORIES[].id in home.tsx.

-- ── providers ────────────────────────────────────────────────────────────────
INSERT INTO providers (id, name, city_id, area_id, address, phone, status)
VALUES
  -- Mumbai providers
  (
    'aaaa0001-0000-0000-0000-000000000001',
    'Glamour Studio Andheri',
    (SELECT id FROM cities WHERE name = 'Mumbai'),
    (SELECT id FROM areas  WHERE name = 'Andheri West' AND city_id = (SELECT id FROM cities WHERE name='Mumbai')),
    '12, Versova Road, Andheri West', '9900000001', 'active'
  ),
  (
    'aaaa0001-0000-0000-0000-000000000002',
    'Bliss Salon Bandra',
    (SELECT id FROM cities WHERE name = 'Mumbai'),
    (SELECT id FROM areas  WHERE name = 'Bandra West'  AND city_id = (SELECT id FROM cities WHERE name='Mumbai')),
    '5A, Hill Road, Bandra West', '9900000002', 'active'
  ),
  (
    'aaaa0001-0000-0000-0000-000000000003',
    'The Beauty Bar Powai',
    (SELECT id FROM cities WHERE name = 'Mumbai'),
    (SELECT id FROM areas  WHERE name = 'Powai'        AND city_id = (SELECT id FROM cities WHERE name='Mumbai')),
    '23, Hiranandani Gardens, Powai', '9900000003', 'active'
  ),
  -- Bengaluru providers
  (
    'aaaa0001-0000-0000-0000-000000000004',
    'Shear Magic Koramangala',
    (SELECT id FROM cities WHERE name = 'Bengaluru'),
    (SELECT id FROM areas  WHERE name = 'Koramangala'  AND city_id = (SELECT id FROM cities WHERE name='Bengaluru')),
    '80 Feet Road, Koramangala 4th Block', '9900000004', 'active'
  ),
  (
    'aaaa0001-0000-0000-0000-000000000005',
    'Noir Salon Indiranagar',
    (SELECT id FROM cities WHERE name = 'Bengaluru'),
    (SELECT id FROM areas  WHERE name = 'Indiranagar'  AND city_id = (SELECT id FROM cities WHERE name='Bengaluru')),
    '100 Feet Road, Indiranagar', '9900000005', 'active'
  )
ON CONFLICT (id) DO NOTHING;

-- ── provider_services ────────────────────────────────────────────────────────
INSERT INTO provider_services (provider_id, category_slug, title, price_paise, duration_mins, is_available)
VALUES
  -- Glamour Studio Andheri
  ('aaaa0001-0000-0000-0000-000000000001', 'haircut',      'Women''s Haircut & Blowdry',   80000,  60, true),
  ('aaaa0001-0000-0000-0000-000000000001', 'haircut',      'Men''s Haircut',                40000,  30, true),
  ('aaaa0001-0000-0000-0000-000000000001', 'facial',       'Gold Facial',                  150000,  75, true),
  ('aaaa0001-0000-0000-0000-000000000001', 'manicure',     'Classic Manicure',              50000,  45, true),
  ('aaaa0001-0000-0000-0000-000000000001', 'pedicure',     'Spa Pedicure',                  70000,  60, true),
  ('aaaa0001-0000-0000-0000-000000000001', 'waxing',       'Full Arms Wax',                 35000,  30, true),
  ('aaaa0001-0000-0000-0000-000000000001', 'threading',    'Eyebrow Threading',             10000,  15, true),

  -- Bliss Salon Bandra
  ('aaaa0001-0000-0000-0000-000000000002', 'haircut',      'Women''s Haircut',              70000,  45, true),
  ('aaaa0001-0000-0000-0000-000000000002', 'haircolor',    'Global Colour (Short)',        350000, 120, true),
  ('aaaa0001-0000-0000-0000-000000000002', 'haircolor',    'Highlights',                   550000, 180, true),
  ('aaaa0001-0000-0000-0000-000000000002', 'bridalmakeup', 'HD Bridal Makeup',            2500000, 240, true),
  ('aaaa0001-0000-0000-0000-000000000002', 'partymakeup',  'Party Makeup',                 500000,  90, true),
  ('aaaa0001-0000-0000-0000-000000000002', 'nailext',      'Gel Nail Extensions (20)',     120000, 120, true),

  -- The Beauty Bar Powai
  ('aaaa0001-0000-0000-0000-000000000003', 'facial',       'Hydrafacial',                  250000,  90, true),
  ('aaaa0001-0000-0000-0000-000000000003', 'facial',       'Cleanup + Scrub',               80000,  60, true),
  ('aaaa0001-0000-0000-0000-000000000003', 'manicure',     'Gel Manicure',                  90000,  60, true),
  ('aaaa0001-0000-0000-0000-000000000003', 'pedicure',     'Gel Pedicure',                 110000,  75, true),
  ('aaaa0001-0000-0000-0000-000000000003', 'straightening','Keratin Treatment (Short)',    2500000, 180, true),
  ('aaaa0001-0000-0000-0000-000000000003', 'hairstyling',  'Blowdry & Style',               80000,  45, true),

  -- Shear Magic Koramangala
  ('aaaa0001-0000-0000-0000-000000000004', 'haircut',      'Women''s Cut + Blowdry',        75000,  60, true),
  ('aaaa0001-0000-0000-0000-000000000004', 'haircut',      'Kids Haircut',                  30000,  20, true),
  ('aaaa0001-0000-0000-0000-000000000004', 'threading',    'Eyebrow + Upper Lip',           15000,  20, true),
  ('aaaa0001-0000-0000-0000-000000000004', 'waxing',       'Full Body Wax',                200000, 120, true),
  ('aaaa0001-0000-0000-0000-000000000004', 'facial',       'Fruit Facial',                  90000,  60, true),

  -- Noir Salon Indiranagar
  ('aaaa0001-0000-0000-0000-000000000005', 'haircut',      'Women''s Haircut',              90000,  60, true),
  ('aaaa0001-0000-0000-0000-000000000005', 'haircolor',    'Balayage',                     800000, 240, true),
  ('aaaa0001-0000-0000-0000-000000000005', 'hairstyling',  'Bridal Hair Trial',            300000, 120, true),
  ('aaaa0001-0000-0000-0000-000000000005', 'bridalmakeup', 'Engagement Makeup',           1500000, 180, true),
  ('aaaa0001-0000-0000-0000-000000000005', 'nailext',      'Acrylic Nail Extensions',      150000, 120, true),
  ('aaaa0001-0000-0000-0000-000000000005', 'manicure',     'Classic Manicure',              55000,  45, true)
ON CONFLICT DO NOTHING;
