-- Locations: cities and areas for the PURE service discovery platform
-- Run once against the core-api database:
--   psql $DATABASE_URL -f src/db/locations.sql

CREATE TABLE IF NOT EXISTS cities (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT  NOT NULL UNIQUE,
  state      TEXT  NOT NULL,
  is_rural   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cities_name  ON cities(name);
CREATE INDEX IF NOT EXISTS idx_cities_state ON cities(state);

CREATE TABLE IF NOT EXISTS areas (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id    UUID  NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name       TEXT  NOT NULL,
  pincode    CHAR(6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(city_id, name)
);

CREATE INDEX IF NOT EXISTS idx_areas_city_id ON areas(city_id);
CREATE INDEX IF NOT EXISTS idx_areas_name    ON areas(name);

-- ── Seed: 30 cities (metro + tier-2 + rural taluka) ──────────────────────────
INSERT INTO cities (name, state, is_rural) VALUES
  ('Mumbai',       'Maharashtra', false),
  ('Pune',         'Maharashtra', false),
  ('Nashik',       'Maharashtra', false),
  ('Aurangabad',   'Maharashtra', false),
  ('Kolhapur',     'Maharashtra', false),
  ('Delhi',        'Delhi',       false),
  ('Noida',        'Uttar Pradesh', false),
  ('Gurgaon',      'Haryana',     false),
  ('Faridabad',    'Haryana',     false),
  ('Bengaluru',    'Karnataka',   false),
  ('Mysuru',       'Karnataka',   false),
  ('Mangaluru',    'Karnataka',   false),
  ('Hyderabad',    'Telangana',   false),
  ('Warangal',     'Telangana',   false),
  ('Chennai',      'Tamil Nadu',  false),
  ('Coimbatore',   'Tamil Nadu',  false),
  ('Madurai',      'Tamil Nadu',  false),
  ('Ahmedabad',    'Gujarat',     false),
  ('Surat',        'Gujarat',     false),
  ('Vadodara',     'Gujarat',     false),
  ('Rajkot',       'Gujarat',     false),
  ('Kolkata',      'West Bengal', false),
  ('Jaipur',       'Rajasthan',   false),
  ('Jodhpur',      'Rajasthan',   false),
  ('Lucknow',      'Uttar Pradesh', false),
  ('Kanpur',       'Uttar Pradesh', false),
  ('Bhopal',       'Madhya Pradesh', false),
  ('Indore',       'Madhya Pradesh', false),
  ('Patna',        'Bihar',       false),
  ('Chandigarh',   'Punjab',      false)
ON CONFLICT (name) DO NOTHING;

-- ── Areas seed (≈200 total across all cities) ─────────────────────────────────
-- MUMBAI
WITH c AS (SELECT id FROM cities WHERE name='Mumbai')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Andheri West', '400058'), ('Andheri East', '400069'),
  ('Bandra West',  '400050'), ('Bandra East',  '400051'),
  ('Juhu',         '400049'), ('Goregaon',     '400062'),
  ('Malad',        '400064'), ('Borivali',     '400066'),
  ('Dadar',        '400014'), ('Worli',        '400018'),
  ('Lower Parel',  '400013'), ('Powai',        '400076'),
  ('Vikhroli',     '400083'), ('Thane',        '400601'),
  ('Navi Mumbai',  '400705')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- PUNE
WITH c AS (SELECT id FROM cities WHERE name='Pune')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Koregaon Park', '411001'), ('Viman Nagar',   '411014'),
  ('Kalyani Nagar', '411006'), ('Kothrud',       '411038'),
  ('Baner',         '411045'), ('Wakad',         '411057'),
  ('Hinjewadi',     '411057'), ('Hadapsar',      '411028'),
  ('Magarpatta',    '411028'), ('Pimpri',        '411017'),
  ('Chinchwad',     '411019'), ('Aundh',         '411007'),
  ('Deccan',        '411004'), ('Shivajinagar',  '411005'),
  ('Kondhwa',       '411048')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- DELHI / NCR
WITH c AS (SELECT id FROM cities WHERE name='Delhi')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Connaught Place', '110001'), ('Lajpat Nagar',  '110024'),
  ('South Extension', '110049'), ('Hauz Khas',     '110016'),
  ('Vasant Kunj',     '110070'), ('Dwarka',        '110078'),
  ('Rohini',          '110085'), ('Pitampura',     '110034'),
  ('Saket',           '110017'), ('Greater Kailash','110048'),
  ('Nehru Place',     '110019'), ('Janakpuri',     '110058'),
  ('Karol Bagh',      '110005'), ('Rajouri Garden','110027'),
  ('Preet Vihar',     '110092')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- NOIDA
WITH c AS (SELECT id FROM cities WHERE name='Noida')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Sector 18',   '201301'), ('Sector 62',  '201309'),
  ('Sector 63',   '201301'), ('Sector 15',  '201301'),
  ('Sector 44',   '201303'), ('Sector 137', '201305'),
  ('Greater Noida','201310')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- GURGAON
WITH c AS (SELECT id FROM cities WHERE name='Gurgaon')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('DLF Phase 1',  '122002'), ('DLF Phase 4',    '122009'),
  ('Sector 14',    '122001'), ('Sector 29',      '122001'),
  ('Sohna Road',   '122018'), ('MG Road',        '122002'),
  ('Cyber City',   '122002'), ('Palam Vihar',    '122017')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- BENGALURU
WITH c AS (SELECT id FROM cities WHERE name='Bengaluru')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Koramangala',  '560034'), ('Indiranagar',  '560038'),
  ('HSR Layout',   '560102'), ('BTM Layout',   '560029'),
  ('Whitefield',   '560066'), ('Electronic City','560100'),
  ('Jayanagar',    '560041'), ('JP Nagar',     '560078'),
  ('Rajajinagar',  '560010'), ('Malleshwaram', '560003'),
  ('Yelahanka',    '560064'), ('Bannerghatta', '560083'),
  ('Hebbal',       '560024'), ('Sarjapur Road','560035'),
  ('Marathahalli', '560037')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- HYDERABAD
WITH c AS (SELECT id FROM cities WHERE name='Hyderabad')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Banjara Hills',  '500034'), ('Jubilee Hills',   '500033'),
  ('Kondapur',       '500084'), ('Gachibowli',      '500032'),
  ('Madhapur',       '500081'), ('Begumpet',        '500016'),
  ('Secunderabad',   '500003'), ('Ameerpet',        '500016'),
  ('Dilsukhnagar',   '500060'), ('LB Nagar',       '500074'),
  ('Kompally',       '500014'), ('Kukatpally',      '500072'),
  ('HITEC City',     '500081'), ('Tarnaka',         '500017'),
  ('Uppal',          '500039')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- CHENNAI
WITH c AS (SELECT id FROM cities WHERE name='Chennai')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('T Nagar',       '600017'), ('Anna Nagar',     '600040'),
  ('Adyar',         '600020'), ('Velachery',      '600042'),
  ('OMR',           '600119'), ('Porur',          '600116'),
  ('Tambaram',      '600045'), ('Chromepet',      '600044'),
  ('Nungambakkam',  '600034'), ('Mylapore',       '600004'),
  ('Egmore',        '600008'), ('Perambur',       '600011'),
  ('Sholinganallur','600119'), ('Guindy',         '600032')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- AHMEDABAD
WITH c AS (SELECT id FROM cities WHERE name='Ahmedabad')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Navrangpura',  '380009'), ('Satellite',    '380015'),
  ('Prahlad Nagar','380015'), ('Bodakdev',     '380054'),
  ('Vastrapur',    '380054'), ('CG Road',      '380006'),
  ('Maninagar',    '380008'), ('Bopal',        '380058'),
  ('SG Highway',   '380054'), ('Thaltej',      '380059')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- KOLKATA
WITH c AS (SELECT id FROM cities WHERE name='Kolkata')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Park Street',    '700016'), ('Salt Lake',      '700064'),
  ('New Town',       '700156'), ('Ballygunge',     '700019'),
  ('Rajarhat',       '700135'), ('Howrah',         '711101'),
  ('Dumdum',         '700028'), ('Behala',         '700034'),
  ('Gariahat',       '700029'), ('Esplanade',      '700001')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- JAIPUR
WITH c AS (SELECT id FROM cities WHERE name='Jaipur')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Malviya Nagar', '302017'), ('Vaishali Nagar', '302021'),
  ('C Scheme',      '302001'), ('Tonk Road',      '302018'),
  ('Mansarovar',    '302020'), ('Sodala',         '302006'),
  ('Raja Park',     '302004'), ('Johari Bazar',   '302003')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- LUCKNOW
WITH c AS (SELECT id FROM cities WHERE name='Lucknow')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Hazratganj',   '226001'), ('Gomti Nagar',   '226010'),
  ('Alambagh',     '226005'), ('Aliganj',       '226024'),
  ('Indira Nagar', '226016'), ('Chinhat',       '226028'),
  ('Charbagh',     '226004'), ('Mahanagar',     '226006')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- SURAT
WITH c AS (SELECT id FROM cities WHERE name='Surat')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Adajan',      '395009'), ('Vesu',        '395007'),
  ('Pal',         '395009'), ('Udhna',       '394210'),
  ('Katargam',    '395004'), ('Athwa',       '395001'),
  ('Rander',      '395005'), ('Althan',      '395017')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- NASHIK
WITH c AS (SELECT id FROM cities WHERE name='Nashik')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Gangapur Road', '422005'), ('Cidco',        '422009'),
  ('Dwarka',        '422011'), ('Panchavati',   '422003'),
  ('Satpur',        '422007'), ('Indira Nagar', '422009')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- INDORE
WITH c AS (SELECT id FROM cities WHERE name='Indore')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Vijay Nagar',   '452010'), ('Palasia',      '452001'),
  ('Scheme 54',     '452010'), ('Rajwada',      '452001'),
  ('Bhawarkuan',    '452001'), ('AB Road',      '452008'),
  ('Bicholi Hapsi', '452016'), ('Super Corridor','452020')
) AS a(name,pincode) ON CONFLICT DO NOTHING;

-- CHANDIGARH
WITH c AS (SELECT id FROM cities WHERE name='Chandigarh')
INSERT INTO areas (city_id, name, pincode) SELECT c.id, a.name, a.pincode FROM c,
(VALUES
  ('Sector 17', '160017'), ('Sector 22', '160022'),
  ('Sector 35', '160035'), ('Sector 43', '160043'),
  ('Sector 8',  '160008'), ('Panchkula', '134109'),
  ('Mohali',    '160055'), ('Manimajra', '160101')
) AS a(name,pincode) ON CONFLICT DO NOTHING;
