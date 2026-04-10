import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import Redis from 'ioredis'
import { getFirebaseAdmin } from '../firebase-admin'
import { redisChannel } from '../kafka/consumer'

/**
 * SSE Events Route — /v1/events/stream
 *
 * Architecture:
 *   Mobile client → Long-lived HTTP (SSE) → core-api → Redis SUB → SSE writes
 *
 * Authentication:
 *   Clients pass their Firebase ID token as a query param:
 *   GET /v1/events/stream?token=<firebase-id-token>
 *   (Headers are not available for EventSource on web/native)
 *
 * Channel routing:
 *   - Regular users  subscribe to `user:{userId}`
 *   - Providers      subscribe to `provider:{providerId}`
 */
export async function eventStreamRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { token?: string; role?: string } }>(
    '/stream',
    async (req: FastifyRequest<{ Querystring: { token?: string; role?: string } }>, reply: FastifyReply) => {
      // ── 1. Authenticate via Firebase token in query param ───────────────
      const { token, role } = req.query
      if (!token) {
        return reply.status(401).send({ error: 'token query param required' })
      }

      let firebaseUid: string
      try {
        const decoded = await getFirebaseAdmin().auth().verifyIdToken(token)
        firebaseUid = decoded.uid
      } catch {
        return reply.status(401).send({ error: 'invalid or expired token' })
      }

      // ── 2. Resolve DB identity and determine subscription channel ───────
      let channel: string

      if (role === 'provider') {
        const { rows } = await app.db.query<{ provider_id: string }>(
          `SELECT pa.provider_id
             FROM users u
             JOIN provider_accounts pa ON pa.user_id = u.id
            WHERE u.firebase_uid = $1 AND u.role = 'provider'`,
          [firebaseUid],
        )
        if (!rows[0]?.provider_id) {
          return reply.status(403).send({ error: 'not a provider' })
        }
        channel = redisChannel.provider(rows[0].provider_id)
      } else {
        const { rows } = await app.db.query<{ id: string }>(
          `SELECT id FROM users WHERE firebase_uid = $1`,
          [firebaseUid],
        )
        if (!rows[0]) {
          return reply.status(401).send({ error: 'user not found' })
        }
        channel = redisChannel.user(rows[0].id)
      }

      // ── 3. Set SSE headers ───────────────────────────────────────────────
      // reply.raw.writeHead() bypasses Fastify's onSend CORS hook, so we must
      // add CORS headers manually here to allow browser EventSource / fetch.
      const origin = req.headers.origin ?? '*'
      reply.raw.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no',   // disable Nginx buffering
        'Access-Control-Allow-Origin':      origin,
        'Access-Control-Allow-Credentials': 'true',
      })

      // ── 4. Subscribe to Redis channel on a dedicated connection ─────────
      // Each SSE client needs its own Redis subscriber (Redis requires a
      // dedicated connection once in subscribe mode).
      const subscriber = new Redis(process.env.REDIS_URL!)
      await subscriber.subscribe(channel)

      // Send an initial heartbeat so the client knows it's connected
      reply.raw.write(`event: connected\ndata: ${JSON.stringify({ channel })}\n\n`)

      // ── 5. Forward Redis messages as SSE events ──────────────────────────
      subscriber.on('message', (_chan: string, message: string) => {
        // Guard: only forward messages for our channel
        if (_chan !== channel) return
        reply.raw.write(`data: ${message}\n\n`)
      })

      // ── 6. Heartbeat every 25 s to keep connection alive through proxies ─
      const heartbeat = setInterval(() => {
        reply.raw.write(`: heartbeat\n\n`)
      }, 25_000)

      // ── 7. Cleanup on disconnect ─────────────────────────────────────────
      req.raw.on('close', () => {
        clearInterval(heartbeat)
        subscriber.unsubscribe(channel).finally(() => subscriber.disconnect())
      })
    },
  )
}
