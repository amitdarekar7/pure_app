import { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import { checkTextFields } from '../content-filter'
import { checkImage } from '../image-moderator'

interface UpdateProfileBody {
  displayName?: string
  avatarUrl?:   string
  phone?:       string
  bio?:         string
  address?:     string
  locale?:      string
  timezone?:    string
}

export async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth)

  // ── GET /v1/users/me ──────────────────────────────────────────────────────
  app.get('/me', async (req, reply) => {
    const uid   = req.firebaseUid
    const email = req.firebaseEmail

    // Auto-provision the DB record on first access (idempotent)
    await app.db.query(
      `INSERT INTO users (firebase_uid, email)
       VALUES ($1, $2)
       ON CONFLICT (firebase_uid) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()`,
      [uid, email],
    )

    const result = await app.db.query(
      `SELECT
         u.id, u.email, u.phone, u.status, u.created_at,
         p.display_name, p.avatar_url, p.bio, p.address, p.locale, p.timezone
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.firebase_uid = $1`,
      [uid],
    )

    if (!result.rows[0]) {
      return reply.status(404).send({ error: 'User not found' })
    }

    return result.rows[0]
  })

  // ── PATCH /v1/users/me ────────────────────────────────────────────────────
  app.patch<{ Body: UpdateProfileBody }>('/me', async (req, reply) => {
    const uid = req.firebaseUid
    const { displayName, avatarUrl, phone, bio, address, locale, timezone } = req.body

    const flagged = checkTextFields({ displayName, bio, address })
    if (flagged) return reply.status(400).send({ error: `${flagged} contains inappropriate language` })

    if (avatarUrl) {
      try {
        const mod = await checkImage(avatarUrl)
        if (!mod.safe) return reply.status(400).send({ error: 'Image flagged as inappropriate' })
      } catch {
        return reply.status(503).send({ error: 'Image moderation service unavailable' })
      }
    }

    const userResult = await app.db.query(
      `SELECT id FROM users WHERE firebase_uid = $1`,
      [uid],
    )

    if (!userResult.rows[0]) {
      return reply.status(404).send({ error: 'User not found' })
    }

    const userId: string = userResult.rows[0].id

    // Update phone on the users row if provided
    if (phone !== undefined) {
      await app.db.query(
        `UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2`,
        [phone.trim() || null, userId],
      )
    }

    await app.db.query(
      `INSERT INTO profiles (user_id, display_name, avatar_url, bio, address, locale, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
         avatar_url   = COALESCE(EXCLUDED.avatar_url,   profiles.avatar_url),
         bio          = COALESCE(EXCLUDED.bio,          profiles.bio),
         address      = COALESCE(EXCLUDED.address,      profiles.address),
         locale       = COALESCE(EXCLUDED.locale,       profiles.locale),
         timezone     = COALESCE(EXCLUDED.timezone,     profiles.timezone),
         updated_at   = NOW()`,
      [userId, displayName ?? null, avatarUrl ?? null, bio ?? null, address ?? null, locale ?? 'en-US', timezone ?? 'UTC'],
    )

    return reply.status(204).send()
  })

  // ── GET /v1/users/me/devices ──────────────────────────────────────────────
  app.get('/me/devices', async (req) => {
    const uid = req.firebaseUid

    const result = await app.db.query(
      `SELECT d.id, d.platform, d.device_model, d.last_seen_at, d.created_at
       FROM devices d
       JOIN users u ON u.id = d.user_id
       WHERE u.firebase_uid = $1
       ORDER BY d.last_seen_at DESC`,
      [uid],
    )

    return { devices: result.rows }
  })

  // ── PUT /v1/users/me/push-token ───────────────────────────────────────────
  // Register or update the FCM push token for the current user's device.
  // Body: { token: string, platform: 'ios' | 'android' | 'web' }
  app.put<{
    Body: { token: string; platform: string }
  }>(
    '/me/push-token',
    { preHandler: requireAuth },
    async (req, reply) => {
      const uid = req.firebaseUid
      const { token, platform } = req.body ?? {}

      if (!token || typeof token !== 'string') {
        return reply.status(400).send({ error: 'token is required' })
      }
      if (!['ios', 'android', 'web'].includes(platform)) {
        return reply.status(400).send({ error: 'platform must be ios, android, or web' })
      }

      const { rows: uRows } = await app.db.query<{ id: string }>(
        `SELECT id FROM users WHERE firebase_uid = $1`,
        [uid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })

      // Upsert: insert a device row or update the push_token if the device_token already exists
      await app.db.query(
        `INSERT INTO devices (user_id, device_token, platform, push_token, last_seen_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (device_token)
         DO UPDATE SET push_token = $4, last_seen_at = NOW()`,
        [uRows[0].id, `fcm:${uid}:${platform}`, platform, token],
      )

      return reply.status(204).send()
    },
  )

  // ── DELETE /v1/users/me ───────────────────────────────────────────────────
  // Soft-delete the user account: anonymise PII, mark as deleted.
  // DPDPA compliance — right to erasure.
  app.delete('/me', async (req, reply) => {
    const uid = req.firebaseUid

    const { rows } = await app.db.query<{ id: string }>(
      `SELECT id FROM users WHERE firebase_uid = $1`,
      [uid],
    )
    if (!rows[0]) return reply.status(404).send({ error: 'User not found' })

    const userId = rows[0].id

    const client = await app.db.connect()
    try {
      await client.query('BEGIN')

      // Anonymise profile
      await client.query(
        `UPDATE profiles
         SET display_name = 'Deleted User',
             avatar_url   = NULL,
             bio          = NULL,
             address      = NULL,
             updated_at   = NOW()
         WHERE user_id = $1`,
        [userId],
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
        [userId],
      )

      // Remove push tokens
      await client.query(
        `DELETE FROM devices WHERE user_id = $1`,
        [userId],
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    return reply.status(200).send({ ok: true, message: 'Account deleted. Your data has been anonymised.' })
  })

  // ── GET /v1/users/me/export ───────────────────────────────────────────────
  // DPDPA compliance — right to data portability.
  // Returns all personal data as JSON.
  app.get('/me/export', async (req, reply) => {
    const uid = req.firebaseUid

    const { rows: uRows } = await app.db.query<{ id: string }>(
      `SELECT id FROM users WHERE firebase_uid = $1`,
      [uid],
    )
    if (!uRows[0]) return reply.status(404).send({ error: 'User not found' })

    const userId = uRows[0].id

    // Gather all user data in parallel
    const [profile, bookings, invoices, devices] = await Promise.all([
      app.db.query(
        `SELECT u.id, u.email, u.phone, u.status, u.created_at,
                p.display_name, p.avatar_url, p.bio, p.address, p.locale, p.timezone
           FROM users u
           LEFT JOIN profiles p ON p.user_id = u.id
          WHERE u.id = $1`,
        [userId],
      ),
      app.db.query(
        `SELECT b.id, b.status, b.scheduled_at, b.price_paise, b.original_price_paise,
                b.discount_pct, b.commission_paise, b.gst_paise, b.tcs_paise, b.tds_paise,
                b.payment_mode, b.payment_status, b.created_at,
                ps.title AS service_title, ps.duration_mins,
                pr.name AS provider_name
           FROM bookings b
           JOIN provider_services ps ON ps.id = b.provider_service_id
           JOIN providers pr ON pr.id = b.provider_id
          WHERE b.user_id = $1
          ORDER BY b.created_at DESC`,
        [userId],
      ),
      app.db.query(
        `SELECT invoice_number, service_amount_paise, discount_paise,
                taxable_value_paise, cgst_paise, sgst_paise, total_tax_paise,
                total_paise, financial_year, created_at
           FROM invoices
          WHERE user_id = $1
          ORDER BY created_at DESC`,
        [userId],
      ),
      app.db.query(
        `SELECT platform, device_model, last_seen_at, created_at
           FROM devices
          WHERE user_id = $1`,
        [userId],
      ),
    ])

    return reply.send({
      exported_at: new Date().toISOString(),
      profile: profile.rows[0] ?? null,
      bookings: bookings.rows,
      invoices: invoices.rows,
      devices: devices.rows,
    })
  })
}
