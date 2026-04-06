import { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'

interface SyncBody         { displayName?: string }
interface LookupEmailBody  { phone: string }

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  const [domainName, ...ext] = domain.split('.')
  return `${local[0]}***@${domainName[0]}***.${ext.join('.')}`
}

// ── Public auth routes (no Firebase token required) ───────────────────────────
export async function publicAuthRoutes(app: FastifyInstance) {
  // POST /v1/auth/lookup-email — find a masked email address by phone number
  app.post<{ Body: LookupEmailBody }>('/lookup-email', async (req, reply) => {
    const { phone } = req.body ?? {}

    if (!phone || typeof phone !== 'string') {
      return reply.status(400).send({ error: 'phone is required' })
    }

    // Normalise: strip non-digit chars except leading +
    const normalised = phone.replace(/(?!^\+)\D/g, '')

    const result = await app.db.query(
      `SELECT email FROM users WHERE phone = $1 LIMIT 1`,
      [normalised],
    )

    if (!result.rows[0]) {
      return reply.status(404).send({ error: 'No account found with that phone number.' })
    }

    return { maskedEmail: maskEmail(result.rows[0].email) }
  })
}

// ── Authenticated auth routes ─────────────────────────────────────────────────
export async function authRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth)

  // POST /v1/auth/sync — called after Firebase registration to provision the
  // user record in our DB. Idempotent: safe to call multiple times.
  app.post<{ Body: SyncBody }>('/sync', async (req, reply) => {
    const uid   = req.firebaseUid
    const email = req.firebaseEmail
    const { displayName } = req.body ?? {}

    const result = await app.db.query(
      `INSERT INTO users (firebase_uid, email)
       VALUES ($1, $2)
       ON CONFLICT (firebase_uid) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()
       RETURNING id`,
      [uid, email],
    )
    const userId: string = result.rows[0].id

    if (displayName) {
      await app.db.query(
        `INSERT INTO profiles (user_id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()`,
        [userId, displayName],
      )
    }

    return { userId }
  })
}
