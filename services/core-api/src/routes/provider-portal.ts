import { FastifyInstance } from 'fastify'
import { randomUUID } from 'crypto'
import { requireAuth } from '../middleware/auth'
import { publish } from '../kafka/producer'
import { TOPICS } from '../kafka/topics'

/**
 * Provider Portal Routes — /v1/provider/*
 *
 * All routes require the caller to be a registered provider.
 * The helper `requireProviderAuth` validates the Firebase token AND
 * confirms the user has role='provider' in the DB.
 */

async function requireProviderAuth(
  app:   FastifyInstance,
  req:   import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
): Promise<{ userId: string; providerId: string } | null> {
  await requireAuth(req, reply)
  if (reply.sent) return null          // requireAuth already replied 401

  const { rows } = await app.db.query<{ id: string; provider_id: string; role: string }>(
    `SELECT u.id, u.role, pa.provider_id
       FROM users u
       LEFT JOIN provider_accounts pa ON pa.user_id = u.id
      WHERE u.firebase_uid = $1`,
    [req.firebaseUid],
  )

  if (!rows[0]) {
    reply.status(401).send({ error: 'user not found' })
    return null
  }
  if (rows[0].role !== 'provider') {
    reply.status(403).send({ error: 'not a provider account' })
    return null
  }
  if (!rows[0].provider_id) {
    reply.status(403).send({ error: 'provider account not linked to a provider profile' })
    return null
  }

  return { userId: rows[0].id, providerId: rows[0].provider_id }
}

export async function providerPortalRoutes(app: FastifyInstance) {
  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/provider/register
  // Registers a new provider user account. Creates a Firebase user → syncs
  // DB user with role='provider' → links to an existing provider row.
  //
  // Body: { providerName, address, cityId, email }
  // The client must first create the Firebase user and supply the ID token.
  // ─────────────────────────────────────────────────────────────────────────
  app.post<{
    Body: {
      providerName: string
      address?:     string
      cityId:       string
      phone?:       string
      displayName?: string
    }
  }>(
    '/register',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { providerName, address, cityId, phone, displayName } = req.body

      if (!providerName || typeof providerName !== 'string' || providerName.trim().length < 2) {
        return reply.status(400).send({ error: 'providerName is required (min 2 chars)' })
      }
      if (!/^[0-9a-f-]{36}$/i.test(cityId)) {
        return reply.status(400).send({ error: 'cityId must be a valid UUID' })
      }

      const client = await app.db.connect()
      try {
        await client.query('BEGIN')

        // 1. Upsert user with role=provider
        const { rows: uRows } = await client.query<{ id: string }>(
          `INSERT INTO users (firebase_uid, email, role)
           VALUES ($1, $2, 'provider')
           ON CONFLICT (firebase_uid) DO UPDATE
             SET email = EXCLUDED.email,
                 role  = 'provider',
                 updated_at = NOW()
           RETURNING id`,
          [req.firebaseUid, req.firebaseEmail],
        )
        const userId = uRows[0].id

        // 2. Upsert display name in profiles
        if (displayName) {
          await client.query(
            `INSERT INTO profiles (user_id, display_name)
             VALUES ($1, $2)
             ON CONFLICT (user_id) DO UPDATE
               SET display_name = EXCLUDED.display_name, updated_at = NOW()`,
            [userId, displayName],
          )
        }

        // 3. Check if already linked
        const { rows: existingLink } = await client.query(
          `SELECT provider_id FROM provider_accounts WHERE user_id = $1`,
          [userId],
        )
        if (existingLink[0]) {
          await client.query('ROLLBACK')
          return reply.status(409).send({ error: 'This account is already registered as a provider' })
        }

        // 4. Create the provider profile
        const { rows: pRows } = await client.query<{ id: string }>(
          `INSERT INTO providers (name, city_id, address, phone)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [providerName.trim(), cityId, address ?? null, phone ?? null],
        )
        const providerId = pRows[0].id

        // 5. Link user → provider
        await client.query(
          `INSERT INTO provider_accounts (user_id, provider_id)
           VALUES ($1, $2)`,
          [userId, providerId],
        )

        // 6. Seed default availability (Mon–Sat open 09:00–22:00, Sun closed)
        const defaultSchedule = [
          { day: 0, open: '09:00', close: '22:00', closed: true  },  // Sun
          { day: 1, open: '09:00', close: '22:00', closed: false },
          { day: 2, open: '09:00', close: '22:00', closed: false },
          { day: 3, open: '09:00', close: '22:00', closed: false },
          { day: 4, open: '09:00', close: '22:00', closed: false },
          { day: 5, open: '09:00', close: '22:00', closed: false },
          { day: 6, open: '09:00', close: '14:00', closed: false },  // Sat
        ]
        for (const s of defaultSchedule) {
          await client.query(
            `INSERT INTO provider_availability (provider_id, day_of_week, open_time, close_time, is_closed)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (provider_id, day_of_week) DO NOTHING`,
            [providerId, s.day, s.open, s.close, s.closed],
          )
        }

        await client.query('COMMIT')
        return reply.status(201).send({ userId, providerId })
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/provider/me
  // Returns the current provider's profile + services + today's bookings count
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    '/me',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ctx = await requireProviderAuth(app, req, reply)
      if (!ctx) return

      const { rows: pRows } = await app.db.query<{
        id:       string
        name:     string
        address:  string | null
        phone:    string | null
        status:   string
      }>(
        `SELECT id, name, address, phone, status
           FROM providers WHERE id = $1`,
        [ctx.providerId],
      )

      const { rows: svcRows } = await app.db.query<{
        id:            string
        category_slug: string
        title:         string
        price_paise:   number
        duration_mins: number
        is_available:  boolean
      }>(
        `SELECT id, category_slug, title, price_paise, duration_mins, is_available
           FROM provider_services WHERE provider_id = $1
          ORDER BY category_slug, title`,
        [ctx.providerId],
      )

      const { rows: statsRows } = await app.db.query<{
        pending:   string
        confirmed: string
        today:     string
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
           COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
           COUNT(*) FILTER (WHERE scheduled_at::date = CURRENT_DATE) AS today
         FROM bookings
         WHERE provider_id = $1`,
        [ctx.providerId],
      )

      return reply.send({
        provider: pRows[0],
        services: svcRows,
        stats:    statsRows[0],
      })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/provider/bookings?status=pending|confirmed|all
  // Returns incoming bookings for this provider
  // ─────────────────────────────────────────────────────────────────────────
  app.get<{ Querystring: { status?: string } }>(
    '/bookings',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ctx = await requireProviderAuth(app, req, reply)
      if (!ctx) return

      const { status } = req.query
      const allowedStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']
      const filterStatus = status && allowedStatuses.includes(status) ? status : null

      const { rows } = await app.db.query<{
        id:            string
        user_name:     string | null
        user_email:    string
        user_phone:    string | null
        service_title: string
        scheduled_at:  string
        status:        string
        price_paise:   number
        notes:         string | null
        created_at:    string
      }>(
        `SELECT
           b.id,
           pr.display_name  AS user_name,
           u.email          AS user_email,
           u.phone          AS user_phone,
           ps.title         AS service_title,
           b.scheduled_at,
           b.status,
           b.price_paise,
           b.notes,
           b.created_at
         FROM bookings b
         JOIN provider_services ps ON ps.id = b.provider_service_id
         JOIN users             u  ON u.id  = b.user_id
         LEFT JOIN profiles     pr ON pr.user_id = u.id
         WHERE b.provider_id = $1
           AND ($2::text IS NULL OR b.status = $2)
         ORDER BY b.scheduled_at DESC`,
        [ctx.providerId, filterStatus],
      )

      return reply.send({ bookings: rows })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // PATCH /v1/provider/bookings/:id
  // Accept, reject, or reschedule a booking
  // Body: { action: 'confirm' | 'reject' | 'reschedule', scheduledAt?: string }
  // ─────────────────────────────────────────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body:   { action: string; scheduledAt?: string }
  }>(
    '/bookings/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ctx = await requireProviderAuth(app, req, reply)
      if (!ctx) return

      const { id } = req.params
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return reply.status(400).send({ error: 'invalid booking id' })
      }

      const { action, scheduledAt } = req.body
      if (!['confirm', 'reject', 'reschedule'].includes(action)) {
        return reply.status(400).send({ error: 'action must be confirm | reject | reschedule' })
      }

      // Verify booking belongs to this provider
      const { rows: bRows } = await app.db.query<{ id: string; status: string }>(
        `SELECT id, status FROM bookings WHERE id = $1 AND provider_id = $2`,
        [id, ctx.providerId],
      )
      if (!bRows[0]) return reply.status(404).send({ error: 'booking not found' })

      const current = bRows[0].status
      if (current === 'cancelled' || current === 'completed') {
        return reply.status(409).send({ error: `Cannot modify a ${current} booking` })
      }

      let newStatus: string
      let newScheduledAt: string | null = null

      if (action === 'confirm') {
        newStatus = 'confirmed'
      } else if (action === 'reject') {
        newStatus = 'cancelled'
      } else {
        // reschedule — status stays pending, just update scheduled_at
        if (!scheduledAt) {
          return reply.status(400).send({ error: 'scheduledAt is required for reschedule' })
        }
        const d = new Date(scheduledAt)
        if (isNaN(d.getTime())) {
          return reply.status(400).send({ error: 'scheduledAt must be a valid ISO date' })
        }
        newStatus      = 'pending'
        newScheduledAt = d.toISOString()
      }

      const { rows: updated } = await app.db.query<{
        id:            string
        status:        string
        scheduled_at:  string
        user_id:       string
        provider_name: string
        service_title: string
      }>(
        `UPDATE bookings b
            SET status       = $1,
                scheduled_at = COALESCE($2::timestamptz, scheduled_at),
                updated_at   = NOW()
          WHERE b.id = $3
          RETURNING
            b.id,
            b.status,
            b.scheduled_at,
            b.user_id,
            (SELECT p.name  FROM providers         p  WHERE p.id  = b.provider_id)         AS provider_name,
            (SELECT ps.title FROM provider_services ps WHERE ps.id = b.provider_service_id) AS service_title`,
        [newStatus, newScheduledAt, id],
      )

      const booking = updated[0]

      // ── Publish booking.responded event to Kafka (fire-and-forget) ──────
      publish(TOPICS.BOOKING_RESPONDED, booking.id, {
        event_id:       randomUUID(),
        event_type:     TOPICS.BOOKING_RESPONDED,
        schema_version: '1.0.0',
        timestamp:      new Date().toISOString(),
        aggregate_id:   booking.id,
        data: {
          booking_id:    booking.id,
          user_id:       booking.user_id,
          provider_id:   ctx.providerId,
          provider_name: booking.provider_name,
          action,
          new_status:    booking.status,
          scheduled_at:  booking.scheduled_at ?? null,
          service_title: booking.service_title ?? null,
        },
      }).catch((err: Error) =>
        app.log.error({ err }, '[kafka] Failed to publish booking.responded'),
      )

      return reply.send({ booking: { id: booking.id, status: booking.status, scheduled_at: booking.scheduled_at } })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/provider/availability
  // Returns the weekly availability schedule for this provider
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    '/availability',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ctx = await requireProviderAuth(app, req, reply)
      if (!ctx) return

      const { rows } = await app.db.query<{
        day_of_week: number
        open_time:   string
        close_time:  string
        is_closed:   boolean
      }>(
        `SELECT day_of_week, open_time::text, close_time::text, is_closed
           FROM provider_availability
          WHERE provider_id = $1
          ORDER BY day_of_week`,
        [ctx.providerId],
      )

      return reply.send({ availability: rows })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /v1/provider/availability
  // Upserts the full weekly schedule
  // Body: { schedule: Array<{ dayOfWeek: 0-6, openTime: 'HH:MM', closeTime: 'HH:MM', isClosed: bool }> }
  // ─────────────────────────────────────────────────────────────────────────
  app.put<{
    Body: {
      schedule: Array<{
        dayOfWeek:  number
        openTime:   string
        closeTime:  string
        isClosed:   boolean
      }>
    }
  }>(
    '/availability',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ctx = await requireProviderAuth(app, req, reply)
      if (!ctx) return

      const { schedule } = req.body
      if (!Array.isArray(schedule) || schedule.length === 0) {
        return reply.status(400).send({ error: 'schedule must be a non-empty array' })
      }

      const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/
      for (const s of schedule) {
        if (typeof s.dayOfWeek !== 'number' || s.dayOfWeek < 0 || s.dayOfWeek > 6) {
          return reply.status(400).send({ error: 'dayOfWeek must be 0–6' })
        }
        if (!s.isClosed) {
          if (!timeRe.test(s.openTime))  return reply.status(400).send({ error: `invalid openTime "${s.openTime}"` })
          if (!timeRe.test(s.closeTime)) return reply.status(400).send({ error: `invalid closeTime "${s.closeTime}"` })
        }
      }

      const client = await app.db.connect()
      try {
        await client.query('BEGIN')
        for (const s of schedule) {
          await client.query(
            `INSERT INTO provider_availability
               (provider_id, day_of_week, open_time, close_time, is_closed)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (provider_id, day_of_week) DO UPDATE
               SET open_time  = EXCLUDED.open_time,
                   close_time = EXCLUDED.close_time,
                   is_closed  = EXCLUDED.is_closed`,
            [ctx.providerId, s.dayOfWeek, s.openTime, s.closeTime, s.isClosed],
          )
        }
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      return reply.send({ ok: true })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/provider/services/:serviceId/images
  // ─────────────────────────────────────────────────────────────────────────
  app.get<{ Params: { serviceId: string } }>(
    '/services/:serviceId/images',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ctx = await requireProviderAuth(app, req, reply)
      if (!ctx) return

      const { serviceId } = req.params
      if (!/^[0-9a-f-]{36}$/i.test(serviceId)) {
        return reply.status(400).send({ error: 'invalid serviceId' })
      }

      const { rows } = await app.db.query<{
        id:         string
        image_url:  string
        sort_order: number
        created_at: string
      }>(
        `SELECT id, image_url, sort_order, created_at
           FROM provider_service_images
          WHERE service_id  = $1
            AND provider_id = $2
          ORDER BY sort_order, created_at`,
        [serviceId, ctx.providerId],
      )

      return reply.send({ images: rows })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/provider/services/:serviceId/images
  // Adds a new image URL for a service
  // Body: { imageUrl: string, sortOrder?: number }
  // ─────────────────────────────────────────────────────────────────────────
  app.post<{
    Params: { serviceId: string }
    Body:   { imageUrl: string; sortOrder?: number }
  }>(
    '/services/:serviceId/images',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ctx = await requireProviderAuth(app, req, reply)
      if (!ctx) return

      const { serviceId } = req.params
      if (!/^[0-9a-f-]{36}$/i.test(serviceId)) {
        return reply.status(400).send({ error: 'invalid serviceId' })
      }

      const { imageUrl, sortOrder = 0 } = req.body
      if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.length > 2048) {
        return reply.status(400).send({ error: 'imageUrl is required (max 2048 chars)' })
      }

      // Verify service belongs to this provider
      const { rows: sRows } = await app.db.query<{ id: string }>(
        `SELECT id FROM provider_services WHERE id = $1 AND provider_id = $2`,
        [serviceId, ctx.providerId],
      )
      if (!sRows[0]) return reply.status(404).send({ error: 'service not found' })

      const { rows } = await app.db.query<{ id: string; image_url: string; sort_order: number }>(
        `INSERT INTO provider_service_images (service_id, provider_id, image_url, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING id, image_url, sort_order`,
        [serviceId, ctx.providerId, imageUrl, sortOrder],
      )

      return reply.status(201).send({ image: rows[0] })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /v1/provider/services/:serviceId/images/:imageId
  // ─────────────────────────────────────────────────────────────────────────
  app.delete<{
    Params: { serviceId: string; imageId: string }
  }>(
    '/services/:serviceId/images/:imageId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ctx = await requireProviderAuth(app, req, reply)
      if (!ctx) return

      const { serviceId, imageId } = req.params
      if (!/^[0-9a-f-]{36}$/i.test(serviceId) || !/^[0-9a-f-]{36}$/i.test(imageId)) {
        return reply.status(400).send({ error: 'invalid id' })
      }

      const { rowCount } = await app.db.query(
        `DELETE FROM provider_service_images
          WHERE id = $1 AND service_id = $2 AND provider_id = $3`,
        [imageId, serviceId, ctx.providerId],
      )

      if (!rowCount) return reply.status(404).send({ error: 'image not found' })
      return reply.send({ ok: true })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // PATCH /v1/provider/services/:serviceId
  // Toggle availability of a service
  // Body: { isAvailable: boolean }
  // ─────────────────────────────────────────────────────────────────────────
  app.patch<{
    Params: { serviceId: string }
    Body:   { isAvailable: boolean }
  }>(
    '/services/:serviceId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ctx = await requireProviderAuth(app, req, reply)
      if (!ctx) return

      const { serviceId } = req.params
      if (!/^[0-9a-f-]{36}$/i.test(serviceId)) {
        return reply.status(400).send({ error: 'invalid serviceId' })
      }

      const { isAvailable } = req.body
      if (typeof isAvailable !== 'boolean') {
        return reply.status(400).send({ error: 'isAvailable must be a boolean' })
      }

      const { rowCount } = await app.db.query(
        `UPDATE provider_services
            SET is_available = $1
          WHERE id = $2 AND provider_id = $3`,
        [isAvailable, serviceId, ctx.providerId],
      )

      if (!rowCount) return reply.status(404).send({ error: 'service not found' })
      return reply.send({ ok: true })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/provider/services
  // Create a new service for this provider
  // Body: { categorySlug, title, pricePaise, durationMins }
  // ─────────────────────────────────────────────────────────────────────────
  app.post<{
    Body: {
      categorySlug:  string
      title:         string
      pricePaise:    number
      durationMins:  number
    }
  }>(
    '/services',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ctx = await requireProviderAuth(app, req, reply)
      if (!ctx) return

      const { categorySlug, title, pricePaise, durationMins } = req.body

      if (!categorySlug || typeof categorySlug !== 'string' || categorySlug.trim().length < 2) {
        return reply.status(400).send({ error: 'categorySlug is required' })
      }
      if (!title || typeof title !== 'string' || title.trim().length < 2) {
        return reply.status(400).send({ error: 'title is required (min 2 chars)' })
      }
      if (typeof pricePaise !== 'number' || pricePaise < 0) {
        return reply.status(400).send({ error: 'pricePaise must be a non-negative number' })
      }
      if (typeof durationMins !== 'number' || durationMins < 1) {
        return reply.status(400).send({ error: 'durationMins must be >= 1' })
      }

      const { rows } = await app.db.query<{
        id:            string
        category_slug: string
        title:         string
        price_paise:   number
        duration_mins: number
        is_available:  boolean
      }>(
        `INSERT INTO provider_services
           (provider_id, category_slug, title, price_paise, duration_mins, is_available)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id, category_slug, title, price_paise, duration_mins, is_available`,
        [ctx.providerId, categorySlug.trim(), title.trim(), pricePaise, durationMins],
      )

      return reply.status(201).send({ service: rows[0] })
    },
  )
}
