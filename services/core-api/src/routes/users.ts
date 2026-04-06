import { FastifyInstance } from 'fastify'

interface UpdateProfileBody {
  displayName?: string
  avatarUrl?:   string
  bio?:         string
  locale?:      string
  timezone?:    string
}

export async function userRoutes(app: FastifyInstance) {
  // All routes in this plugin require a valid JWT
  app.addHook('onRequest', async (req, reply) => {
    try {
      await req.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  // ── GET /v1/users/me ──────────────────────────────────────────────────────
  app.get('/me', async (req, reply) => {
    const { sub } = req.user as { sub: string }

    const result = await app.db.query(
      `SELECT
         u.id, u.email, u.phone, u.status, u.created_at,
         p.display_name, p.avatar_url, p.bio, p.locale, p.timezone
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [sub],
    )

    if (!result.rows[0]) {
      return reply.status(404).send({ error: 'User not found' })
    }

    return result.rows[0]
  })

  // ── PATCH /v1/users/me ────────────────────────────────────────────────────
  app.patch<{ Body: UpdateProfileBody }>('/me', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { displayName, avatarUrl, bio, locale, timezone } = req.body

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
      [sub, displayName ?? null, avatarUrl ?? null, bio ?? null, locale ?? 'en-US', timezone ?? 'UTC'],
    )

    return reply.status(204).send()
  })

  // ── GET /v1/users/me/devices ──────────────────────────────────────────────
  app.get('/me/devices', async (req) => {
    const { sub } = req.user as { sub: string }

    const result = await app.db.query(
      `SELECT id, platform, device_model, last_seen_at, created_at
       FROM devices
       WHERE user_id = $1
       ORDER BY last_seen_at DESC`,
      [sub],
    )

    return { devices: result.rows }
  })
}
