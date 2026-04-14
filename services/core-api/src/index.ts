import 'dotenv/config'
import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyRedis from '@fastify/redis'
import { Pool } from 'pg'
import { getFirebaseAdmin } from './firebase-admin'
import { authRoutes, publicAuthRoutes } from './routes/auth'
import { userRoutes } from './routes/users'
import { locationRoutes } from './routes/locations'
import { providerRoutes } from './routes/providers'
import { bookingRoutes } from './routes/bookings'
import { providerPortalRoutes } from './routes/provider-portal'
import { promotionRoutes } from './routes/promotions'
import { eventStreamRoutes } from './routes/events'
import { indexProviderService } from './search-index'

// ── Startup env validation ───────────────────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'REDIS_URL'] as const
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[startup] Required environment variable "${key}" is not set. Exiting.`)
    process.exit(1)
  }
}

// Validate Firebase Admin config early so misconfiguration fails at startup
try {
  getFirebaseAdmin()
} catch (err) {
  console.error('[startup] Firebase Admin init failed:', (err as Error).message)
  process.exit(1)
}

// Augment FastifyInstance with the `db` decorator
declare module 'fastify' {
  interface FastifyInstance {
    db: Pool
  }
}

const app = Fastify({
  logger: {
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty' }
        : undefined,
  },
  bodyLimit: 10 * 1024 * 1024, // 10 MB — needed for base64 image data URIs from web clients
})

// ── Database ────────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
app.decorate('db', pool)

// ── Plugins ─────────────────────────────────────────────────────────────────
app.register(fastifyCors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
})

app.register(fastifyRedis, {
  url: process.env.REDIS_URL!,
})

// ── Routes ───────────────────────────────────────────────────────────────────
app.register(publicAuthRoutes,  { prefix: '/v1/auth' })
app.register(authRoutes,        { prefix: '/v1/auth' })
app.register(userRoutes,        { prefix: '/v1/users' })
app.register(locationRoutes,    { prefix: '/v1/locations' })
app.register(providerRoutes,    { prefix: '/v1/providers' })
app.register(bookingRoutes,     { prefix: '/v1/bookings' })
app.register(providerPortalRoutes, { prefix: '/v1/provider' })
app.register(promotionRoutes,      { prefix: '/v1/promotions' })
app.register(eventStreamRoutes,    { prefix: '/v1/events' })

// ── Admin: bulk-sync all providers → OpenSearch ──────────────────────────────
// POST /v1/admin/search-sync
// Protected by a static admin key (ADMIN_KEY env var).
// Call this once after first deploy to backfill existing providers.
app.post('/v1/admin/search-sync', async (req, reply) => {
  const key = process.env.ADMIN_KEY
  if (key && req.headers['x-admin-key'] !== key) {
    return reply.status(403).send({ error: 'forbidden' })
  }

  const { rows } = await app.db.query<{
    provider_id:   string
    provider_name: string
    service_id:    string
    service_title: string
    category_slug: string
    address:       string | null
    city_name:     string
    area_name:     string | null
    price_paise:   number
    duration_mins: number
    likes_count:   number
    status:        string
    is_featured:   boolean
    is_boosted:    boolean
    discount_pct:  number
  }>(`
    SELECT
      p.id            AS provider_id,
      p.name          AS provider_name,
      ps.id           AS service_id,
      ps.title        AS service_title,
      ps.category_slug,
      p.address,
      c.name          AS city_name,
      a.name          AS area_name,
      ps.price_paise,
      ps.duration_mins,
      ps.discount_pct,
      p.likes_count,
      p.status,
      p.is_featured,
      p.is_boosted
    FROM   providers p
    JOIN   provider_services ps ON ps.provider_id = p.id
    JOIN   cities c             ON c.id = p.city_id
    LEFT   JOIN areas a         ON a.id = p.area_id
    WHERE  ps.is_available = true
  `)

  const now = new Date().toISOString()
  let indexed = 0
  for (const row of rows) {
    const discountedPricePaise = row.discount_pct > 0
      ? Math.round(row.price_paise * (1 - row.discount_pct / 100))
      : row.price_paise
    void indexProviderService({
      ...row,
      updated_at: now,
      discounted_price_paise: discountedPricePaise,
    })
    indexed++
  }

  return reply.send({ queued: indexed })
})

// ── Admin: expire promotions + update provider flags ──────────────────────────
// POST /v1/admin/expire-promotions
// Also runs automatically every 15 minutes via setInterval.
app.post('/v1/admin/expire-promotions', async (req, reply) => {
  const key = process.env.ADMIN_KEY
  if (key && req.headers['x-admin-key'] !== key) {
    return reply.status(403).send({ error: 'forbidden' })
  }

  const expired = await expirePromotions()
  return reply.send({ expired })
})

async function expirePromotions(): Promise<number> {
  // Mark expired promotions
  const { rowCount } = await pool.query(
    `UPDATE provider_promotions SET status = 'expired'
     WHERE status = 'active' AND expires_at <= NOW()`,
  )

  // Reset provider flags where no active promotions remain
  await pool.query(
    `UPDATE providers
     SET is_featured = false, featured_until = NULL
     WHERE is_featured = true
       AND NOT EXISTS (
         SELECT 1 FROM provider_promotions pp
         WHERE pp.provider_id = providers.id
           AND pp.promotion_type = 'featured'
           AND pp.status = 'active'
           AND pp.expires_at > NOW()
       )`,
  )
  await pool.query(
    `UPDATE providers
     SET is_boosted = false, boosted_until = NULL
     WHERE is_boosted = true
       AND NOT EXISTS (
         SELECT 1 FROM provider_promotions pp
         WHERE pp.provider_id = providers.id
           AND pp.promotion_type = 'boost'
           AND pp.status = 'active'
           AND pp.expires_at > NOW()
       )`,
  )

  return rowCount ?? 0
}

// Run expiry check every 15 minutes
setInterval(() => {
  expirePromotions().catch(err =>
    console.error('[cron] expire-promotions failed:', err),
  )
}, 15 * 60 * 1000)

// ── Auto no-show detection ───────────────────────────────────────────────────
// Marks confirmed bookings as no_show if scheduled_at + grace period has passed
// without check-in. Runs every 10 minutes.
async function detectNoShows(): Promise<number> {
  const { rows: cfgRows } = await pool.query<{ value: string }>(
    `SELECT value FROM platform_config WHERE key = 'no_show_grace_mins'`,
  )
  const graceMins = cfgRows[0] ? parseInt(cfgRows[0].value, 10) : 30

  const { rowCount } = await pool.query(
    `UPDATE bookings
        SET status = 'no_show',
            no_show = true,
            updated_at = NOW()
      WHERE status = 'confirmed'
        AND no_show = false
        AND checked_in_at IS NULL
        AND scheduled_at + ($1 || ' minutes')::interval < NOW()`,
    [graceMins],
  )

  return rowCount ?? 0
}

setInterval(() => {
  detectNoShows().catch(err =>
    console.error('[cron] detect-noshows failed:', err),
  )
}, 10 * 60 * 1000)

app.get('/health', async () => ({
  status: 'ok',
  ts: new Date().toISOString(),
}))

// ── Kafka removed — real-time events now use Redis pub/sub directly ──────────
// The @fastify/redis plugin provides app.redis for both pub/sub publishing
// (in route handlers) and the SSE subscriber (in events.ts).

// ── Start ─────────────────────────────────────────────────────────────────────
const port = parseInt(process.env.PORT ?? '3000', 10)
app.listen({ port, host: '0.0.0.0' }, async (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  app.log.info(`[shutdown] ${signal} received`)
  await Promise.allSettled([
    app.close(),
  ])
  process.exit(0)
}
process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT',  () => shutdown('SIGINT'))

