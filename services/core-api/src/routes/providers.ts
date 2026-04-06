import { FastifyInstance } from 'fastify'

export async function providerRoutes(app: FastifyInstance) {
  /**
   * GET /v1/providers?cityId=<uuid>&category=<slug>
   * Returns providers in a city that offer a given service category,
   * with the matching service details (price, duration, title).
   */
  app.get<{ Querystring: { cityId?: string; category?: string } }>(
    '/',
    async (req, reply) => {
      const { cityId, category } = req.query

      if (!cityId || !/^[0-9a-f-]{36}$/i.test(cityId)) {
        return reply.status(400).send({ error: 'cityId is required and must be a valid UUID' })
      }
      if (!category || !/^[a-z0-9_-]{1,50}$/.test(category)) {
        return reply.status(400).send({ error: 'category is required' })
      }

      const { rows } = await app.db.query<{
        id:            string
        name:          string
        address:       string | null
        area_name:     string | null
        service_id:    string
        service_title: string
        price_paise:   number
        duration_mins: number
      }>(
        `SELECT
           p.id,
           p.name,
           p.address,
           a.name        AS area_name,
           ps.id         AS service_id,
           ps.title      AS service_title,
           ps.price_paise,
           ps.duration_mins
         FROM   providers        p
         JOIN   provider_services ps ON ps.provider_id   = p.id
         LEFT   JOIN areas        a  ON a.id             = p.area_id
         WHERE  p.city_id        = $1
           AND  ps.category_slug = $2
           AND  p.status         = 'active'
           AND  ps.is_available  = true
         ORDER  BY p.name ASC`,
        [cityId, category],
      )

      return reply.send({ providers: rows })
    },
  )
}
