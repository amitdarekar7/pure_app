import { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import { checkTextFields } from '../content-filter'

export async function platformRoutes(app: FastifyInstance) {
  // ── GET /v1/platform/info ───────────────────────────────────────────────
  // Public — returns platform legal details for "About" page / footer.
  app.get('/info', async (_req, reply) => {
    const { rows } = await app.db.query<{ key: string; value: string }>(
      `SELECT key, value FROM platform_config
        WHERE key IN (
          'platform_legal_name', 'platform_cin', 'platform_gstin',
          'platform_address', 'platform_email', 'platform_phone',
          'grievance_officer', 'grievance_email',
          'nodal_officer', 'nodal_email'
        )`,
    )
    const info = Object.fromEntries(rows.map(r => [r.key, r.value]))
    return reply.send({ info })
  })

  // ── POST /v1/platform/complaints ───────────────────────────────────────
  // Authenticated — file a complaint.
  app.post<{
    Body: {
      category: string
      description: string
      providerId?: string
    }
  }>(
    '/complaints',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { category, description, providerId } = req.body ?? {}

      const validCategories = ['service_quality', 'payment', 'cancellation', 'content', 'privacy', 'other']
      if (!category || !validCategories.includes(category)) {
        return reply.status(400).send({ error: `category must be one of: ${validCategories.join(', ')}` })
      }
      if (!description || description.trim().length < 10) {
        return reply.status(400).send({ error: 'description must be at least 10 characters' })
      }

      const flagged = checkTextFields({ description })
      if (flagged) return reply.status(400).send({ error: 'description contains inappropriate language' })

      const { rows: uRows } = await app.db.query<{ id: string }>(
        `SELECT id FROM users WHERE firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })

      const { rows } = await app.db.query<{ id: string; status: string; created_at: string }>(
        `INSERT INTO complaints (user_id, provider_id, category, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, status, created_at`,
        [uRows[0].id, providerId ?? null, category, description.trim()],
      )

      return reply.status(201).send({ complaint: rows[0] })
    },
  )

  // ── GET /v1/platform/complaints/my ─────────────────────────────────────
  // Authenticated — list user's own complaints.
  app.get(
    '/complaints/my',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { rows: uRows } = await app.db.query<{ id: string }>(
        `SELECT id FROM users WHERE firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })

      const { rows } = await app.db.query(
        `SELECT c.id, c.category, c.description, c.status, c.resolution,
                c.created_at, c.resolved_at,
                p.name AS provider_name
           FROM complaints c
           LEFT JOIN providers p ON p.id = c.provider_id
          WHERE c.user_id = $1
          ORDER BY c.created_at DESC`,
        [uRows[0].id],
      )

      return reply.send({ complaints: rows })
    },
  )

  // ── GET /v1/platform/compliance-report ──────────────────────────────────
  // Admin — monthly complaint summary for e-commerce compliance.
  app.get('/compliance-report', async (req, reply) => {
    const key = process.env.ADMIN_KEY
    if (key && req.headers['x-admin-key'] !== key) {
      return reply.status(403).send({ error: 'forbidden' })
    }

    const { rows } = await app.db.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
         COUNT(*)::int AS received,
         COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'escalated')::int AS escalated
       FROM complaints
       GROUP BY DATE_TRUNC('month', created_at)
       ORDER BY month DESC
       LIMIT 12`,
    )

    return reply.send({ months: rows })
  })
}
