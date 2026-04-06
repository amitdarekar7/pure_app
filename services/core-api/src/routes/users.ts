import { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'

interface UpdateProfileBody {
  displayName?: string
  avatarUrl?:   string
  bio?:         string
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
         p.display_name, p.avatar_url, p.bio, p.locale, p.timezone
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
    const { displayName, avatarUrl, bio, locale, timezone } = req.body

    const userResult = await app.db.query(
      `SELECT id FROM users WHERE firebase_uid = $1`,
      [uid],
    )

    if (!userResult.rows[0]) {
      return reply.status(404).send({ error: 'User not found' })
    }

    const userId: string = userResult.rows[0].id

    await app.db.query(
      `INSERT INTO profiles (user_id, display_name, avatar_url, bio, locale, timezone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
         avatar_url   = COALESCE(EXCLUDED.avatar_url,   profiles.avatar_url),
         bio          = COALESCE(EXCLUDED.bio,          profiles.bio),
         locale       = COALESCE(EXCLUDED.locale,       profiles.locale),
         timezone     = COALESCE(EXCLUDED.timezone,     profiles.timezone),
         updated_at   = NOW()`,
      [userId, displayName ?? null, avatarUrl ?? null, bio ?? null, locale ?? 'en-US', timezone ?? 'UTC'],
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
}
