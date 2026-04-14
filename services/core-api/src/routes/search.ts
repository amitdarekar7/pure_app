/**
 * routes/search.ts — PostgreSQL full-text + trigram search
 *
 * GET /v1/search?q=<query>[&city=<name>][&area=<name>][&category=<slug>][&page=1][&size=20]
 *
 * Returns results in the same shape the mobile app already expects
 * (OpenSearch-compatible wrapper: { hits: { total: { value }, hits: [...] } }).
 */

import { FastifyInstance } from 'fastify'

export async function searchRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      q:        string
      city?:    string
      area?:    string
      category?: string
      page?:    string
      size?:    string
    }
  }>('/search', async (req, reply) => {
    const q = (req.query.q ?? '').trim()
    if (!q) return reply.status(400).send({ error: "query parameter 'q' is required" })

    const page = Math.max(1, parseInt(req.query.page ?? '1', 10) || 1)
    const size = Math.min(100, Math.max(1, parseInt(req.query.size ?? '20', 10) || 20))
    const offset = (page - 1) * size

    // Build WHERE clauses
    const conditions: string[] = [`status = 'active'`]
    const params: (string | number)[] = []
    let paramIdx = 1

    // Full-text OR trigram — at least one must match
    // We use plainto_tsquery for multi-word and prefix matching
    // plus trigram similarity for single-word typo tolerance
    const tsQuery = q.split(/\s+/).map(w => `${w}:*`).join(' & ')
    conditions.push(`(search_vector @@ to_tsquery('english', $${paramIdx}) OR word_similarity($${paramIdx + 1}, search_text) > 0.3)`)
    params.push(tsQuery, q.toLowerCase())
    paramIdx += 2

    if (req.query.city) {
      conditions.push(`LOWER(city_name) = LOWER($${paramIdx})`)
      params.push(req.query.city)
      paramIdx++
    }
    if (req.query.area) {
      conditions.push(`LOWER(area_name) = LOWER($${paramIdx})`)
      params.push(req.query.area)
      paramIdx++
    }
    if (req.query.category) {
      conditions.push(`category_slug = $${paramIdx}`)
      params.push(req.query.category)
      paramIdx++
    }

    const where = conditions.join(' AND ')

    // Score: ts_rank (full-text relevance)
    //      + similarity (typo tolerance)
    //      + boost for featured (×3) and boosted (×2)
    const scoreExpr = `(
      ts_rank(search_vector, to_tsquery('english', $1)) * 10
      + word_similarity($2, search_text) * 5
    ) * CASE WHEN is_featured THEN 3 ELSE 1 END
      * CASE WHEN is_boosted  THEN 2 ELSE 1 END`

    // Count query
    const countSql = `SELECT COUNT(*)::int AS total FROM provider_search WHERE ${where}`
    const { rows: countRows } = await app.db.query<{ total: number }>(countSql, params)
    const total = countRows[0]?.total ?? 0

    // Data query
    const dataSql = `
      SELECT
        service_id, provider_id, provider_name, service_title, category_slug,
        address, city_name, area_name, price_paise, duration_mins, discount_pct,
        discounted_price_paise, likes_count, is_featured, is_boosted,
        ${scoreExpr} AS score
      FROM provider_search
      WHERE ${where}
      ORDER BY score DESC, likes_count DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `
    params.push(size, offset)

    const { rows } = await app.db.query(dataSql, params)

    // Map to OpenSearch-compatible shape so mobile app needs zero changes
    const hits = rows.map((r: any) => ({
      _id:    r.service_id,
      _score: parseFloat(r.score) || 0,
      _source: {
        provider_id:          r.provider_id,
        provider_name:        r.provider_name,
        service_id:           r.service_id,
        service_title:        r.service_title,
        category_slug:        r.category_slug,
        address:              r.address,
        city_name:            r.city_name,
        area_name:            r.area_name,
        price_paise:          r.price_paise,
        duration_mins:        r.duration_mins,
        discount_pct:         r.discount_pct,
        discounted_price_paise: r.discounted_price_paise,
        likes_count:          r.likes_count,
        is_featured:          r.is_featured,
        is_boosted:           r.is_boosted,
      },
      highlight: {}, // no HTML highlights — mobile already strips <em> tags
    }))

    return reply.send({
      hits: { total: { value: total }, hits },
    })
  })

  // ── Refresh materialized view (called after index changes) ───────────────
  // POST /v1/search/refresh — admin or internal
  app.post('/search/refresh', async (req, reply) => {
    const key = process.env.ADMIN_KEY
    if (key && req.headers['x-admin-key'] !== key) {
      return reply.status(403).send({ error: 'forbidden' })
    }
    await app.db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY provider_search')
    return reply.send({ ok: true })
  })
}
