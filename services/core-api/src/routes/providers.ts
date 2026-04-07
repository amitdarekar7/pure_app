import { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'

export async function providerRoutes(app: FastifyInstance) {
  /**
   * GET /v1/providers?cityId=<uuid>&category=<slug>
   * Public. Optionally reads Authorization header to inject is_liked per row.
   */
  app.get<{ Querystring: { cityId?: string; category?: string } }>(
    '/',
    async (req, reply) => {
      const { cityId, category } = req.query

      if (!cityId || !/^[0-9a-f-]{36}$/i.test(cityId)) {
        return reply.status(400).send({ error: 'cityId is required and must be a valid UUID' })
      }
      if (!category || !/^[a-z0-9_-]{1,50}$/.test(category)) {
        return reply.status(400).send({ error: 'category is required' })
      }

      // Resolve user_id from firebase_uid if a valid token was supplied
      let userId: string | null = null
      const authorization = req.headers.authorization
      if (authorization?.startsWith('Bearer ')) {
        try {
          const { verifyIdToken } = await import('../firebase-admin')
          const decoded = await verifyIdToken(authorization.slice(7))
          const { rows: uRows } = await app.db.query<{ id: string }>(
            `SELECT id FROM users WHERE firebase_uid = $1`,
            [decoded.uid],
          )
          userId = uRows[0]?.id ?? null
        } catch {
          // unauthenticated — is_liked defaults to false
        }
      }

      const { rows } = await app.db.query<{
        id:            string
        name:          string
        address:       string | null
        area_name:     string | null
        service_id:    string
        service_title: string
        price_paise:   number
        duration_mins: number
        likes_count:   number
        is_liked:      boolean
      }>(
        `SELECT
           p.id,
           p.name,
           p.address,
           a.name        AS area_name,
           ps.id         AS service_id,
           ps.title      AS service_title,
           ps.price_paise,
           ps.duration_mins,
           p.likes_count,
           CASE WHEN pl.provider_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_liked
         FROM   providers        p
         JOIN   provider_services ps ON ps.provider_id   = p.id
         LEFT   JOIN areas        a  ON a.id             = p.area_id
         LEFT   JOIN provider_likes pl
                ON  pl.provider_id = p.id
               AND  pl.user_id     = $3
         WHERE  p.city_id        = $1
           AND  ps.category_slug = $2
           AND  p.status         = 'active'
           AND  ps.is_available  = true
         ORDER  BY p.likes_count DESC, p.name ASC`,
        [cityId, category, userId],
      )

      return reply.send({ providers: rows })
    },
  )

  /**
   * POST /v1/providers/:id/like
   * Authenticated. Records the like for this user; increments counter once.
   */
  app.post<{ Params: { id: string } }>(
    '/:id/like',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = req.params
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return reply.status(400).send({ error: 'invalid provider id' })
      }

      // Resolve DB user_id from firebase_uid
      const { rows: uRows } = await app.db.query<{ id: string }>(
        `SELECT id FROM users WHERE firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })
      const userId = uRows[0].id

      // Insert like row; skip if already liked (ON CONFLICT DO NOTHING)
      const { rowCount } = await app.db.query(
        `INSERT INTO provider_likes (user_id, provider_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [userId, id],
      )

      let likes_count: number
      if ((rowCount ?? 0) > 0) {
        // New like — increment counter
        const { rows } = await app.db.query<{ likes_count: number }>(
          `UPDATE providers SET likes_count = likes_count + 1 WHERE id = $1 RETURNING likes_count`,
          [id],
        )
        if (rows.length === 0) return reply.status(404).send({ error: 'not found' })
        likes_count = rows[0].likes_count
      } else {
        // Already liked — return current count without changing it
        const { rows } = await app.db.query<{ likes_count: number }>(
          `SELECT likes_count FROM providers WHERE id = $1`,
          [id],
        )
        if (rows.length === 0) return reply.status(404).send({ error: 'not found' })
        likes_count = rows[0].likes_count
      }

      return reply.send({ likes_count })
    },
  )

  /**
   * POST /v1/providers/:id/unlike
   * Authenticated. Removes the like for this user; decrements counter.
   */
  app.post<{ Params: { id: string } }>(
    '/:id/unlike',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = req.params
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return reply.status(400).send({ error: 'invalid provider id' })
      }

      const { rows: uRows } = await app.db.query<{ id: string }>(
        `SELECT id FROM users WHERE firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })
      const userId = uRows[0].id

      const { rowCount } = await app.db.query(
        `DELETE FROM provider_likes WHERE user_id = $1 AND provider_id = $2`,
        [userId, id],
      )

      let likes_count: number
      if ((rowCount ?? 0) > 0) {
        const { rows } = await app.db.query<{ likes_count: number }>(
          `UPDATE providers SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1 RETURNING likes_count`,
          [id],
        )
        if (rows.length === 0) return reply.status(404).send({ error: 'not found' })
        likes_count = rows[0].likes_count
      } else {
        const { rows } = await app.db.query<{ likes_count: number }>(
          `SELECT likes_count FROM providers WHERE id = $1`,
          [id],
        )
        if (rows.length === 0) return reply.status(404).send({ error: 'not found' })
        likes_count = rows[0].likes_count
      }

      return reply.send({ likes_count })
    },
  )

  /**
   * GET /v1/providers/:id?serviceId=<uuid>
   * Public (optional auth for is_liked). Returns single provider + service detail.
   */
  app.get<{ Params: { id: string }; Querystring: { serviceId?: string } }>(
    '/:id',
    async (req, reply) => {
      const { id } = req.params
      const { serviceId } = req.query

      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return reply.status(400).send({ error: 'invalid provider id' })
      }
      if (serviceId && !/^[0-9a-f-]{36}$/i.test(serviceId)) {
        return reply.status(400).send({ error: 'invalid serviceId' })
      }

      let userId: string | null = null
      const authorization = req.headers.authorization
      if (authorization?.startsWith('Bearer ')) {
        try {
          const { verifyIdToken } = await import('../firebase-admin')
          const decoded = await verifyIdToken(authorization.slice(7))
          const { rows: uRows } = await app.db.query<{ id: string }>(
            `SELECT id FROM users WHERE firebase_uid = $1`,
            [decoded.uid],
          )
          userId = uRows[0]?.id ?? null
        } catch { /* unauthenticated */ }
      }

      const params: unknown[] = [id, userId]
      const serviceFilter = serviceId ? `AND ps.id = $3` : ''
      if (serviceId) params.push(serviceId)

      const { rows } = await app.db.query<{
        id:            string
        name:          string
        address:       string | null
        phone:         string | null
        area_name:     string | null
        city_name:     string | null
        service_id:    string
        service_title: string
        price_paise:   number
        duration_mins: number
        category_slug: string
        likes_count:   number
        is_liked:      boolean
      }>(
        `SELECT
           p.id,
           p.name,
           p.address,
           p.phone,
           a.name  AS area_name,
           c.name  AS city_name,
           ps.id   AS service_id,
           ps.title         AS service_title,
           ps.price_paise,
           ps.duration_mins,
           ps.category_slug,
           p.likes_count,
           CASE WHEN pl.provider_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_liked
         FROM   providers         p
         JOIN   provider_services ps ON ps.provider_id = p.id
         LEFT   JOIN areas         a  ON a.id           = p.area_id
         LEFT   JOIN cities        c  ON c.id           = p.city_id
         LEFT   JOIN provider_likes pl
                ON  pl.provider_id = p.id
               AND  pl.user_id     = $2
         WHERE  p.id = $1
           ${serviceFilter}
           AND p.status       = 'active'
           AND ps.is_available = true
         LIMIT 1`,
        params,
      )

      if (!rows[0]) return reply.status(404).send({ error: 'provider not found' })
      return reply.send({ provider: rows[0] })
    },
  )
}
