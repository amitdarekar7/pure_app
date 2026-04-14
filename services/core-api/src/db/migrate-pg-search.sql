-- migrate-pg-search.sql
-- Replaces OpenSearch with PostgreSQL full-text search + trigram fuzzy matching.
-- Run once against core_db.

-- 1. Enable trigram extension for fuzzy / typo-tolerant matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Materialised view that pre-joins providers ↔ services ↔ cities ↔ areas
--    and builds a weighted tsvector for full-text search.
CREATE MATERIALIZED VIEW IF NOT EXISTS provider_search AS
SELECT
  ps.id                     AS service_id,
  p.id                      AS provider_id,
  p.name                    AS provider_name,
  ps.title                  AS service_title,
  ps.category_slug,
  p.address,
  c.name                    AS city_name,
  a.name                    AS area_name,
  ps.price_paise,
  ps.duration_mins,
  ps.discount_pct,
  CASE WHEN ps.discount_pct > 0
       THEN ROUND(ps.price_paise * (1 - ps.discount_pct / 100.0))::int
       ELSE ps.price_paise END  AS discounted_price_paise,
  p.likes_count,
  p.status,
  COALESCE(p.is_featured, false) AS is_featured,
  COALESCE(p.is_boosted,  false) AS is_boosted,
  -- Weighted tsvector: A = provider name (highest), B = service title, C = area, D = city
  setweight(to_tsvector('english', COALESCE(p.name, '')),     'A') ||
  setweight(to_tsvector('english', COALESCE(ps.title, '')),   'B') ||
  setweight(to_tsvector('english', COALESCE(a.name, '')),     'C') ||
  setweight(to_tsvector('english', COALESCE(c.name, '')),     'D') AS search_vector,
  -- Raw text for trigram matching
  LOWER(COALESCE(p.name, '') || ' ' || COALESCE(ps.title, '') || ' ' ||
        COALESCE(a.name, '') || ' ' || COALESCE(c.name, ''))       AS search_text
FROM provider_services ps
JOIN providers p     ON p.id  = ps.provider_id
JOIN cities    c     ON c.id  = p.city_id
LEFT JOIN areas a    ON a.id  = p.area_id
WHERE ps.is_available = true;

-- 3. GIN index on the tsvector for full-text queries
CREATE INDEX IF NOT EXISTS idx_ps_search_vector ON provider_search USING GIN (search_vector);

-- 4. GIN trigram index on the raw text for fuzzy / partial matching
CREATE INDEX IF NOT EXISTS idx_ps_search_trgm   ON provider_search USING GIN (search_text gin_trgm_ops);

-- 5. Unique index so REFRESH … CONCURRENTLY works
CREATE UNIQUE INDEX IF NOT EXISTS idx_ps_service_id ON provider_search (service_id);
