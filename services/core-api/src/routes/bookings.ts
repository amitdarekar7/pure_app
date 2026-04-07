import { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'

export async function bookingRoutes(app: FastifyInstance) {
  /**
   * POST /v1/bookings
   * Authenticated. Creates a booking request (status = 'pending').
   */
  app.post<{
    Body: {
      providerServiceId: string
      scheduledAt:       string   // ISO 8601
      notes?:            string
    }
  }>(
    '/',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { providerServiceId, scheduledAt, notes } = req.body

      if (!/^[0-9a-f-]{36}$/i.test(providerServiceId)) {
        return reply.status(400).send({ error: 'providerServiceId must be a valid UUID' })
      }

      const scheduled = new Date(scheduledAt)
      if (isNaN(scheduled.getTime()) || scheduled <= new Date()) {
        return reply.status(400).send({ error: 'scheduledAt must be a future ISO date' })
      }

      // Resolve DB user_id from firebase_uid
      const { rows: uRows } = await app.db.query<{ id: string }>(
        `SELECT id FROM users WHERE firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })
      const userId = uRows[0].id

      // Look up the service to get provider_id and price
      const { rows: sRows } = await app.db.query<{
        provider_id:  string
        price_paise:  number
        is_available: boolean
      }>(
        `SELECT provider_id, price_paise, is_available
         FROM provider_services
         WHERE id = $1`,
        [providerServiceId],
      )
      if (!sRows[0]) return reply.status(404).send({ error: 'service not found' })
      if (!sRows[0].is_available) return reply.status(409).send({ error: 'service not available' })

      const { provider_id, price_paise } = sRows[0]

      const { rows } = await app.db.query<{ id: string; status: string; scheduled_at: string }>(
        `INSERT INTO bookings
           (user_id, provider_id, provider_service_id, scheduled_at, price_paise, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, status, scheduled_at`,
        [userId, provider_id, providerServiceId, scheduled.toISOString(), price_paise, notes ?? null],
      )

      return reply.status(201).send({ booking: rows[0] })
    },
  )

  /**
   * GET /v1/bookings/my
   * Authenticated. Returns all bookings for the current user.
   */
  app.get(
    '/my',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { rows: uRows } = await app.db.query<{ id: string }>(
        `SELECT id FROM users WHERE firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })

      const { rows } = await app.db.query<{
        id:            string
        provider_name: string
        service_title: string
        scheduled_at:  string
        status:        string
        price_paise:   number
      }>(
        `SELECT
           b.id,
           p.name          AS provider_name,
           ps.title        AS service_title,
           b.scheduled_at,
           b.status,
           b.price_paise
         FROM   bookings         b
         JOIN   providers        p  ON p.id  = b.provider_id
         JOIN   provider_services ps ON ps.id = b.provider_service_id
         WHERE  b.user_id = $1
         ORDER  BY b.scheduled_at DESC`,
        [uRows[0].id],
      )

      return reply.send({ bookings: rows })
    },
  )
}
