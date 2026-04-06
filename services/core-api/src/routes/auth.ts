import { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'

interface SyncBody { displayName?: string }

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
