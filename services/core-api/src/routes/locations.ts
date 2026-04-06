import { FastifyInstance } from 'fastify'

// ── Public location routes (no auth required) ─────────────────────────────────
export async function locationRoutes(app: FastifyInstance) {
  // GET /v1/locations/cities — list all cities ordered alphabetically
  // Cached 1 hour at CDN/proxy level; cities rarely change
  app.get('/cities', async (_req, reply) => {
    const { rows } = await app.db.query<{
      id: string; name: string; state: string; is_rural: boolean
    }>(`
      SELECT id, name, state, is_rural
      FROM   cities
      ORDER  BY name ASC
    `)
    reply.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
    return reply.send({ cities: rows })
  })

  // GET /v1/locations/cities/:cityId/areas — list areas for a given city
  app.get<{ Params: { cityId: string } }>(
    '/cities/:cityId/areas',
    async (req, reply) => {
      const { cityId } = req.params

      // Validate cityId is a UUID to prevent injection
      if (!/^[0-9a-f-]{36}$/i.test(cityId)) {
        return reply.status(400).send({ error: 'invalid cityId' })
      }

      const { rows } = await app.db.query<{
        id: string; city_id: string; name: string; pincode: string | null
      }>(
        `SELECT id, city_id, name, pincode
         FROM   areas
         WHERE  city_id = $1
         ORDER  BY name ASC`,
        [cityId],
      )
      reply.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
      return reply.send({ areas: rows })
    },
  )
}
