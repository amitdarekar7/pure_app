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
app.register(publicAuthRoutes, { prefix: '/v1/auth' })
app.register(authRoutes, { prefix: '/v1/auth' })
app.register(userRoutes, { prefix: '/v1/users' })
app.register(locationRoutes, { prefix: '/v1/locations' })
app.register(providerRoutes, { prefix: '/v1/providers' })

app.get('/health', async () => ({
  status: 'ok',
  ts: new Date().toISOString(),
}))

// ── Start ─────────────────────────────────────────────────────────────────────
const port = parseInt(process.env.PORT ?? '3000', 10)
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})
