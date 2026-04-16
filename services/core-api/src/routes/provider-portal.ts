import { FastifyInstance } from 'fastify'
import { randomUUID } from 'crypto'
import { requireAuth } from '../middleware/auth'
import { redisChannel } from '../redis-channels'
import { indexProviderService } from '../search-index'
import { getSubscriptionStatus, QUARTERLY_PAISE, QUARTERLY_DAYS } from '../subscription'
import { sendPushNotification } from '../notifications'
import { checkTextFields } from '../content-filter'
import { checkImage } from '../image-moderator'

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

      const flagged = checkTextFields({ providerName, address, displayName })
      if (flagged) return reply.status(400).send({ error: `${flagged} contains inappropriate language` })

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
        id:                string
        name:              string
        address:           string | null
        phone:             string | null
        status:            string
        profile_image_url: string | null
        pan_number:        string | null
        bank_account_number: string | null
        bank_ifsc:         string | null
        bank_holder_name:  string | null
        aadhaar_last4:     string | null
        gst_number:        string | null
      }>(
        `SELECT id, name, address, phone, status, profile_image_url,
                pan_number, bank_account_number, bank_ifsc, bank_holder_name, aadhaar_last4, gst_number
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
        discount_pct:  number
      }>(
        `SELECT id, category_slug, title, price_paise, duration_mins, is_available, discount_pct
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
  // PATCH /v1/provider/me — update provider profile (name, phone, address)
  // ─────────────────────────────────────────────────────────────────────────
  app.patch<{ Body: { name?: string; phone?: string; address?: string; profileImageUrl?: string; panNumber?: string; bankAccountNumber?: string; bankIfsc?: string; bankHolderName?: string; aadhaarLast4?: string; gstNumber?: string } }>(
    '/me',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ctx = await requireProviderAuth(app, req, reply)
      if (!ctx) return

      const { name, phone, address, profileImageUrl, panNumber, bankAccountNumber, bankIfsc, bankHolderName, aadhaarLast4, gstNumber } = req.body ?? {}

      const flagged = checkTextFields({ name, address })
      if (flagged) return reply.status(400).send({ error: `${flagged} contains inappropriate language` })

      if (profileImageUrl) {
        try {
          const mod = await checkImage(profileImageUrl)
          if (!mod.safe) return reply.status(400).send({ error: 'Image flagged as inappropriate' })
        } catch {
          return reply.status(503).send({ error: 'Image moderation service unavailable' })
        }
      }

      const sets: string[] = []
      const vals: unknown[] = []
      let idx = 1

      if (name !== undefined) {
        const trimmed = (name ?? '').trim()
        if (trimmed.length < 2) return reply.status(400).send({ error: 'Name must be at least 2 characters' })
        sets.push(`name = $${idx++}`)
        vals.push(trimmed)
      }
      if (phone !== undefined) {
        sets.push(`phone = $${idx++}`)
        vals.push(phone?.trim() || null)
      }
      if (address !== undefined) {
        sets.push(`address = $${idx++}`)
        vals.push(address?.trim() || null)
      }
      if (profileImageUrl !== undefined) {
        if (profileImageUrl && typeof profileImageUrl === 'string' && profileImageUrl.length > 5 * 1024 * 1024) {
          return reply.status(400).send({ error: 'profileImageUrl too large (max 5 MB)' })
        }
        sets.push(`profile_image_url = $${idx++}`)
        vals.push(profileImageUrl?.trim() || null)
      }
      if (panNumber !== undefined) {
        if (panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber.trim().toUpperCase()))
          return reply.status(400).send({ error: 'Invalid PAN format (e.g. ABCDE1234F)' })
        sets.push(`pan_number = $${idx++}`)
        vals.push(panNumber?.trim().toUpperCase() || null)
      }
      if (bankAccountNumber !== undefined) {
        if (bankAccountNumber && !/^\d{9,18}$/.test(bankAccountNumber.trim()))
          return reply.status(400).send({ error: 'Bank account number must be 9–18 digits' })
        sets.push(`bank_account_number = $${idx++}`)
        vals.push(bankAccountNumber?.trim() || null)
      }
      if (bankIfsc !== undefined) {
        if (bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc.trim().toUpperCase()))
          return reply.status(400).send({ error: 'Invalid IFSC format (e.g. SBIN0001234)' })
        sets.push(`bank_ifsc = $${idx++}`)
        vals.push(bankIfsc?.trim().toUpperCase() || null)
      }
      if (bankHolderName !== undefined) {
        if (bankHolderName && (bankHolderName.trim().length < 2 || !/^[A-Za-z\s.'\-]+$/.test(bankHolderName.trim())))
          return reply.status(400).send({ error: 'Holder name must be at least 2 characters (letters, spaces, dots, hyphens only)' })
        sets.push(`bank_holder_name = $${idx++}`)
        vals.push(bankHolderName?.trim() || null)
      }
      if (aadhaarLast4 !== undefined) {
        if (aadhaarLast4 && !/^\d{4}$/.test(aadhaarLast4.trim()))
          return reply.status(400).send({ error: 'Aadhaar last 4 must be exactly 4 digits' })
        sets.push(`aadhaar_last4 = $${idx++}`)
        vals.push(aadhaarLast4?.trim() || null)
      }
      if (gstNumber !== undefined) {
        if (gstNumber && !/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]$/.test(gstNumber.trim().toUpperCase()))
          return reply.status(400).send({ error: 'Invalid GST format' })
        sets.push(`gst_number = $${idx++}`)
        vals.push(gstNumber?.trim().toUpperCase() || null)
      }

      if (sets.length === 0) return reply.status(400).send({ error: 'No fields to update' })

      sets.push(`updated_at = NOW()`)
      vals.push(ctx.providerId)

      const { rows } = await app.db.query<{
        id: string; name: string; address: string | null; phone: string | null; status: string; profile_image_url: string | null
      }>(
        `UPDATE providers SET ${sets.join(', ')} WHERE id = $${idx}
         RETURNING id, name, address, phone, status, profile_image_url, pan_number, bank_account_number, bank_ifsc, bank_holder_name, aadhaar_last4, gst_number`,
        vals,
      )

      return reply.send({ provider: rows[0] })
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
        id:             string
        user_name:      string | null
        user_email:     string
        user_phone:     string | null
        service_title:  string
        scheduled_at:   string
        status:         string
        price_paise:    number
        notes:          string | null
        created_at:     string
        payment_mode:   string
        payment_status: string
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
           b.created_at,
           b.payment_mode,
           b.payment_status
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

      // ── Publish booking.responded via Redis pub/sub (fire-and-forget) ──
      const event = {
        event_id:       randomUUID(),
        event_type:     'booking.responded',
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
      }
      app.redis.publish(
        redisChannel.user(booking.user_id),
        JSON.stringify(event),
      ).catch((err: Error) =>
        app.log.error({ err }, '[redis] Failed to publish booking.responded'),
      )

      // ── Send FCM push notification to the user (fire-and-forget) ────────
      {
        const statusLabel = action === 'accept' ? 'accepted ✅' : action === 'reject' ? 'declined ❌' : 'rescheduled 📅'
        sendPushNotification(app.db, booking.user_id, {
          title: `Booking ${statusLabel}`,
          body:  `${booking.provider_name ?? 'Your provider'} has ${statusLabel.replace(/\s*[✅❌📅]/, '')} your booking${booking.service_title ? ` for "${booking.service_title}"` : ''}`,
          data: {
            type:       'booking.responded',
            booking_id: booking.id,
            action,
          },
        }).catch((err: Error) =>
          app.log.error({ err }, '[fcm] Failed to send booking response push notification'),
        )
      }

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
      if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.length > 5 * 1024 * 1024) {
        return reply.status(400).send({ error: 'imageUrl is required (max 5 MB)' })
      }

      try {
        const mod = await checkImage(imageUrl)
        if (!mod.safe) return reply.status(400).send({ error: 'Image flagged as inappropriate' })
      } catch {
        return reply.status(503).send({ error: 'Image moderation service unavailable' })
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
  // Toggle availability and/or set discount for a service
  // Body: { isAvailable?: boolean, discountPct?: number }
  // ─────────────────────────────────────────────────────────────────────────
  app.patch<{
    Params: { serviceId: string }
    Body:   { isAvailable?: boolean; discountPct?: number }
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

      const { isAvailable, discountPct } = req.body

      if (isAvailable === undefined && discountPct === undefined) {
        return reply.status(400).send({ error: 'provide isAvailable and/or discountPct' })
      }
      if (isAvailable !== undefined && typeof isAvailable !== 'boolean') {
        return reply.status(400).send({ error: 'isAvailable must be a boolean' })
      }
      if (discountPct !== undefined) {
        if (typeof discountPct !== 'number' || discountPct < 0 || discountPct > 50) {
          return reply.status(400).send({ error: 'discountPct must be 0–50' })
        }
      }

      // Build dynamic SET clause
      const sets: string[] = []
      const vals: unknown[] = []
      let idx = 1

      if (isAvailable !== undefined) {
        sets.push(`is_available = $${idx++}`)
        vals.push(isAvailable)
      }
      if (discountPct !== undefined) {
        sets.push(`discount_pct = $${idx++}`)
        vals.push(discountPct)
      }

      vals.push(serviceId, ctx.providerId)

      const { rowCount } = await app.db.query(
        `UPDATE provider_services
            SET ${sets.join(', ')}
          WHERE id = $${idx++} AND provider_id = $${idx}`,
        vals,
      )

      if (!rowCount) return reply.status(404).send({ error: 'service not found' })

      // Re-index to OpenSearch so search results show updated discount
      const { rows: svc } = await app.db.query<{
        title: string; category_slug: string; price_paise: number; duration_mins: number;
        discount_pct: number; is_available: boolean;
      }>(
        `SELECT title, category_slug, price_paise, duration_mins, discount_pct, is_available
           FROM provider_services WHERE id = $1`,
        [serviceId],
      )
      const { rows: pInfo } = await app.db.query<{
        name: string; address: string | null; city_name: string; area_name: string | null;
        likes_count: number; status: string; is_featured: boolean; is_boosted: boolean;
      }>(
        `SELECT p.name, p.address, c.name AS city_name, a.name AS area_name,
                p.likes_count, p.status, p.is_featured, p.is_boosted
           FROM providers p
           JOIN cities c ON c.id = p.city_id
           LEFT JOIN areas a ON a.id = p.area_id
          WHERE p.id = $1`,
        [ctx.providerId],
      )
      if (svc[0] && pInfo[0]) {
        const discountedPricePaise = svc[0].discount_pct > 0
          ? Math.round(svc[0].price_paise * (1 - svc[0].discount_pct / 100))
          : svc[0].price_paise
        void indexProviderService({
          provider_id:   ctx.providerId,
          provider_name: pInfo[0].name,
          service_id:    serviceId,
          service_title: svc[0].title,
          category_slug: svc[0].category_slug,
          address:       pInfo[0].address,
          city_name:     pInfo[0].city_name,
          area_name:     pInfo[0].area_name,
          price_paise:   svc[0].price_paise,
          duration_mins: svc[0].duration_mins,
          likes_count:   pInfo[0].likes_count,
          status:        pInfo[0].status,
          updated_at:    new Date().toISOString(),
          discount_pct:  svc[0].discount_pct,
          discounted_price_paise: discountedPricePaise,
          is_featured:   pInfo[0].is_featured,
          is_boosted:    pInfo[0].is_boosted,
        })
      }

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

      const flagged = checkTextFields({ title })
      if (flagged) return reply.status(400).send({ error: 'title contains inappropriate language' })

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

      // Index into search service (fire-and-forget)
      const { rows: pInfo } = await app.db.query<{
        name:      string
        address:   string | null
        city_name: string
        area_name: string | null
        likes_count: number
        status:    string
      }>(
        `SELECT p.name, p.address, c.name AS city_name, a.name AS area_name,
                p.likes_count, p.status
           FROM providers p
           JOIN cities c ON c.id = p.city_id
           LEFT JOIN areas a ON a.id = p.area_id
          WHERE p.id = $1`,
        [ctx.providerId],
      )
      if (pInfo[0]) {
        void indexProviderService({
          provider_id:   ctx.providerId,
          provider_name: pInfo[0].name,
          service_id:    rows[0].id,
          service_title: rows[0].title,
          category_slug: rows[0].category_slug,
          address:       pInfo[0].address,
          city_name:     pInfo[0].city_name,
          area_name:     pInfo[0].area_name,
          price_paise:   rows[0].price_paise,
          duration_mins: rows[0].duration_mins,
          likes_count:   pInfo[0].likes_count,
          status:        pInfo[0].status,
          updated_at:    new Date().toISOString(),
        })
      }

      return reply.status(201).send({ service: rows[0] })
    },
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // ── SUBSCRIPTION ROUTES ───────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  /** GET /v1/provider/subscription — current subscription status */
  app.get('/subscription', async (req, reply) => {
    const ctx = await requireProviderAuth(app, req, reply)
    if (!ctx) return
    const subscription = await getSubscriptionStatus(app.db, ctx.providerId)
    return { subscription }
  })

  /** POST /v1/provider/subscription/purchase — create Razorpay order */
  app.post('/subscription/purchase', async (req, reply) => {
    const ctx = await requireProviderAuth(app, req, reply)
    if (!ctx) return

    const { autoRenew } = (req.body as any) ?? {}

    // Create a pending subscription row
    const subId = randomUUID()
    const pendingExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString() // placeholder, updated on verify
    await app.db.query(
      `INSERT INTO provider_subscriptions (id, provider_id, plan, status, auto_renew, starts_at, expires_at)
       VALUES ($1, $2, 'quarterly', 'pending', $3, NOW(), $4)`,
      [subId, ctx.providerId, autoRenew ?? false, pendingExpiry],
    )

    // Create Razorpay order via payment-service
    const PAYMENT = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3002'
    const receipt = `sub_${ctx.providerId.slice(0, 8)}_${Date.now()}`

    const rzpRes = await fetch(`${PAYMENT}/v1/razorpay/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booking_id: receipt,
        amount_paise: QUARTERLY_PAISE,
        currency: 'INR',
      }),
    })

    if (!rzpRes.ok) {
      const errText = await rzpRes.text()
      app.log.error({ errText }, 'Payment service error')
      return reply.status(502).send({ error: 'Payment service error' })
    }

    const rzpOrder = (await rzpRes.json()) as { razorpay_order_id: string; razorpay_key_id: string }

    return {
      subscription_id: subId,
      razorpay_order_id: rzpOrder.razorpay_order_id,
      razorpay_key_id: rzpOrder.razorpay_key_id,
      amount_paise: QUARTERLY_PAISE,
      currency: 'INR',
    }
  })

  /** POST /v1/provider/subscription/verify — verify Razorpay payment */
  app.post('/subscription/verify', async (req, reply) => {
    const ctx = await requireProviderAuth(app, req, reply)
    if (!ctx) return

    const { subscription_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body as any

    if (!subscription_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return reply.status(400).send({ error: 'Missing payment details' })
    }

    // Verify signature via payment-service
    const PAYMENT = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3002'
    const verifyRes = await fetch(`${PAYMENT}/v1/razorpay/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      }),
    })

    if (!verifyRes.ok) {
      return reply.status(400).send({ error: 'Payment verification failed' })
    }

    // Activate subscription
    const now = new Date()
    const expiresAt = new Date(now.getTime() + QUARTERLY_DAYS * 24 * 60 * 60 * 1000)

    const { rows } = await app.db.query(
      `UPDATE provider_subscriptions
          SET status = 'active',
              starts_at = $2,
              expires_at = $3,
              razorpay_order_id = $4,
              razorpay_payment_id = $5
        WHERE id = $1 AND provider_id = $6
        RETURNING *`,
      [subscription_id, now.toISOString(), expiresAt.toISOString(),
       razorpay_order_id, razorpay_payment_id, ctx.providerId],
    )

    if (!rows[0]) {
      return reply.status(404).send({ error: 'Subscription not found' })
    }

    // Clear lapsed state on provider
    await app.db.query(
      `UPDATE providers SET subscription_required = true, subscription_grace_until = NULL WHERE id = $1`,
      [ctx.providerId],
    )

    return { ok: true, subscription: rows[0] }
  })

  /** PATCH /v1/provider/subscription/auto-renew — toggle auto-renew */
  app.patch('/subscription/auto-renew', async (req, reply) => {
    const ctx = await requireProviderAuth(app, req, reply)
    if (!ctx) return

    const { autoRenew } = req.body as any
    await app.db.query(
      `UPDATE provider_subscriptions SET auto_renew = $2
       WHERE provider_id = $1 AND status = 'active' AND expires_at > NOW()`,
      [ctx.providerId, !!autoRenew],
    )
    return { ok: true }
  })

  // ── DELETE /v1/provider/me ──────────────────────────────────────────────
  // Soft-delete provider account: anonymise PII, mark as deleted.
  // DPDPA compliance — right to erasure. KYC data retained 7 years per tax law.
  app.delete('/me', async (req, reply) => {
    const ctx = await requireProviderAuth(app, req, reply)
    if (!ctx) return

    const client = await app.db.connect()
    try {
      await client.query('BEGIN')

      // Deactivate all services
      await client.query(
        `UPDATE provider_services SET is_available = false WHERE provider_id = $1`,
        [ctx.providerId],
      )

      // Anonymise provider profile (keep KYC/financial data for 7-year retention)
      await client.query(
        `UPDATE providers
         SET name          = 'Deleted Provider',
             phone         = NULL,
             address        = NULL,
             profile_image_url = NULL,
             updated_at     = NOW()
         WHERE id = $1`,
        [ctx.providerId],
      )

      // Anonymise user row
      await client.query(
        `UPDATE users
         SET email      = 'deleted_' || id || '@deleted.local',
             phone      = NULL,
             status     = 'deleted',
             deleted_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [ctx.userId],
      )

      // Remove push tokens
      await client.query(
        `DELETE FROM devices WHERE user_id = $1`,
        [ctx.userId],
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    return reply.status(200).send({ ok: true, message: 'Account deleted. Your data has been anonymised. KYC records retained per legal obligation.' })
  })
}
