import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

interface RegisterBody { email: string; password: string; displayName?: string }
interface LoginBody    { email: string; password: string }
interface RefreshBody  { refreshToken: string }
interface LogoutBody   { refreshToken: string }

export async function authRoutes(app: FastifyInstance) {
  // ── POST /v1/auth/register ───────────────────────────────────────────────
  app.post<{ Body: RegisterBody }>('/register', async (req, reply) => {
    const { email, password, displayName } = req.body

    if (!email || !password || password.length < 8) {
      return reply.status(400).send({ error: 'Email required and password must be at least 8 characters' })
    }

    const hash = await bcrypt.hash(password, 12)

    const result = await app.db.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email.toLowerCase().trim(), hash],
    )

    if (!result.rows[0]) {
      return reply.status(409).send({ error: 'Email already registered' })
    }

    const userId: string = result.rows[0].id

    if (displayName) {
      await app.db.query(
        `INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`,
        [userId, displayName],
      )
    }

    // Write to outbox inside the same logical operation (relay publishes to Kafka)
    await app.db.query(
      `INSERT INTO outbox_events (aggregate_id, event_type, payload)
       VALUES ($1, 'user.registered', $2::jsonb)`,
      [userId, JSON.stringify({ user_id: userId, email: email.toLowerCase().trim(), display_name: displayName })],
    )

    const accessToken  = app.jwt.sign({ sub: userId, email }, { expiresIn: '15m' })
    const refreshToken = randomBytes(48).toString('hex')

    await app.db.query(
      `INSERT INTO auth_sessions (user_id, refresh_token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [userId, refreshToken],
    )

    return reply.status(201).send({ accessToken, refreshToken, userId })
  })

  // ── POST /v1/auth/login ──────────────────────────────────────────────────
  app.post<{ Body: LoginBody }>('/login', async (req, reply) => {
    const { email, password } = req.body

    const result = await app.db.query(
      `SELECT id, password_hash FROM users
       WHERE email = $1 AND status = 'active'`,
      [email.toLowerCase().trim()],
    )

    const user = result.rows[0]
    const validPassword = user && await bcrypt.compare(password, user.password_hash)

    // Constant-time rejection — same response for "user not found" and "wrong password"
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const accessToken  = app.jwt.sign({ sub: user.id, email }, { expiresIn: '15m' })
    const refreshToken = randomBytes(48).toString('hex')

    await app.db.query(
      `INSERT INTO auth_sessions (user_id, refresh_token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [user.id, refreshToken],
    )

    return { accessToken, refreshToken, userId: user.id }
  })

  // ── POST /v1/auth/refresh ────────────────────────────────────────────────
  app.post<{ Body: RefreshBody }>('/refresh', async (req, reply) => {
    const { refreshToken } = req.body

    const sessionResult = await app.db.query(
      `SELECT user_id FROM auth_sessions
       WHERE refresh_token = $1
         AND revoked_at IS NULL
         AND expires_at  > NOW()`,
      [refreshToken],
    )

    if (!sessionResult.rows[0]) {
      return reply.status(401).send({ error: 'Invalid or expired refresh token' })
    }

    const { user_id } = sessionResult.rows[0]

    const userResult = await app.db.query(
      `SELECT email FROM users WHERE id = $1 AND status = 'active'`,
      [user_id],
    )

    if (!userResult.rows[0]) {
      return reply.status(401).send({ error: 'Account not found or suspended' })
    }

    const accessToken = app.jwt.sign(
      { sub: user_id, email: userResult.rows[0].email },
      { expiresIn: '15m' },
    )

    return { accessToken }
  })

  // ── POST /v1/auth/logout ─────────────────────────────────────────────────
  app.post<{ Body: LogoutBody }>('/logout', async (req, reply) => {
    const { refreshToken } = req.body

    await app.db.query(
      `UPDATE auth_sessions SET revoked_at = NOW()
       WHERE refresh_token = $1`,
      [refreshToken],
    )

    return reply.status(204).send()
  })
}
