import { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'

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
}
