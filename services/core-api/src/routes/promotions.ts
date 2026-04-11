import { FastifyInstance } from 'fastify'
import { randomUUID } from 'crypto'
import { requireAuth } from '../middleware/auth'
import { indexProviderService } from '../search-index'

/**
 * Promotions Routes — /v1/promotions/*
 *
 * Handles: featured listing purchase, boost purchase, listing products,
 * and provider active promotions.
 */
export async function promotionRoutes(app: FastifyInstance) {
  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/promotions/products
  // Public. Returns all available promotion products.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/products', async (_req, reply) => {
    const { rows } = await app.db.query<{
      id:             string
      slug:           string
      name:           string
      description:    string | null
      price_paise:    number
      duration_hours: number
      promotion_type: string
    }>(
      `SELECT id, slug, name, description, price_paise, duration_hours, promotion_type
       FROM promotion_products
       WHERE is_active = true
       ORDER BY promotion_type, price_paise`,
    )
    return reply.send({ products: rows })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/promotions/purchase
  // Authenticated (provider). Purchase a promotion product.
  // Body: { productSlug: string }
  // ─────────────────────────────────────────────────────────────────────────
  app.post<{
    Body: { productSlug: string }
  }>(
    '/purchase',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { productSlug } = req.body

      if (!productSlug || typeof productSlug !== 'string') {
        return reply.status(400).send({ error: 'productSlug is required' })
      }

      // Resolve user → provider
      const { rows: uRows } = await app.db.query<{ id: string; provider_id: string | null }>(
        `SELECT u.id, pa.provider_id
         FROM users u
         LEFT JOIN provider_accounts pa ON pa.user_id = u.id
         WHERE u.firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })
      if (!uRows[0].provider_id) return reply.status(403).send({ error: 'not a provider account' })

      const userId = uRows[0].id
      const providerId = uRows[0].provider_id

      // Get product
      const { rows: pRows } = await app.db.query<{
        id:             string
        slug:           string
        name:           string
        price_paise:    number
        duration_hours: number
        promotion_type: string
      }>(
        `SELECT id, slug, name, price_paise, duration_hours, promotion_type
         FROM promotion_products
         WHERE slug = $1 AND is_active = true`,
        [productSlug],
      )
      if (!pRows[0]) return reply.status(404).send({ error: 'promotion product not found' })
      const product = pRows[0]

      // Check if provider already has an active promotion of the same type
      const { rows: activeRows } = await app.db.query(
        `SELECT id FROM provider_promotions
         WHERE provider_id = $1 AND promotion_type = $2 AND status = 'active' AND expires_at > NOW()`,
        [providerId, product.promotion_type],
      )
      if (activeRows.length > 0) {
        return reply.status(409).send({
          error: `You already have an active ${product.promotion_type} promotion`,
        })
      }

      // Create payment intent via payment service
      const paymentUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002'
      const idempotencyKey = `promo_${providerId}_${product.slug}_${Date.now()}`

      let intentResponse: { payment_intent_id: string; status: string }
      try {
        const res = await fetch(`${paymentUrl}/v1/payments/intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            amount_cents: product.price_paise, // paise = cents in INR context
            currency: 'INR',
            idempotency_key: idempotencyKey,
            commission_cents: product.price_paise, // 100% is platform revenue
            provider_id: providerId,
            intent_type: 'promotion',
          }),
        })
        intentResponse = await res.json() as { payment_intent_id: string; status: string }
      } catch (err) {
        app.log.error({ err }, 'Failed to create payment intent for promotion')
        return reply.status(502).send({ error: 'payment service unavailable' })
      }

      // Create the promotion record (pending until payment confirms)
      const expiresAt = new Date(Date.now() + product.duration_hours * 60 * 60 * 1000)

      const { rows: promoRows } = await app.db.query<{ id: string }>(
        `INSERT INTO provider_promotions
           (provider_id, promotion_product_id, payment_intent_id, promotion_type, status, starts_at, expires_at)
         VALUES ($1, $2, $3, $4, 'active', NOW(), $5)
         RETURNING id`,
        [providerId, product.id, intentResponse.payment_intent_id, product.promotion_type, expiresAt.toISOString()],
      )

      // Update provider flags
      if (product.promotion_type === 'featured') {
        await app.db.query(
          `UPDATE providers SET is_featured = true, featured_until = $2 WHERE id = $1`,
          [providerId, expiresAt.toISOString()],
        )
      } else {
        await app.db.query(
          `UPDATE providers SET is_boosted = true, boosted_until = $2 WHERE id = $1`,
          [providerId, expiresAt.toISOString()],
        )
      }

      // Sync to OpenSearch for search ranking
      try {
        await syncProviderToSearch(app, providerId)
      } catch (err) {
        app.log.error({ err }, 'Failed to sync provider to search after promotion')
      }

      return reply.status(201).send({
        promotion: {
          id: promoRows[0].id,
          type: product.promotion_type,
          product: product.name,
          expires_at: expiresAt.toISOString(),
        },
        payment_intent_id: intentResponse.payment_intent_id,
      })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/promotions/my
  // Authenticated (provider). Returns active promotions for this provider.
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    '/my',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { rows: uRows } = await app.db.query<{ provider_id: string | null }>(
        `SELECT pa.provider_id
         FROM users u
         LEFT JOIN provider_accounts pa ON pa.user_id = u.id
         WHERE u.firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]?.provider_id) return reply.status(403).send({ error: 'not a provider' })

      const { rows } = await app.db.query<{
        id:             string
        promotion_type: string
        product_name:   string
        status:         string
        starts_at:      string
        expires_at:     string
      }>(
        `SELECT pp.id, pp.promotion_type, pr.name AS product_name, pp.status, pp.starts_at, pp.expires_at
         FROM provider_promotions pp
         JOIN promotion_products pr ON pr.id = pp.promotion_product_id
         WHERE pp.provider_id = $1
         ORDER BY pp.created_at DESC
         LIMIT 20`,
        [uRows[0].provider_id],
      )

      return reply.send({ promotions: rows })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/promotions/config
  // Public. Returns platform commission rate and promo prices.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/config', async (_req, reply) => {
    const { rows } = await app.db.query<{ key: string; value: string }>(
      `SELECT key, value FROM platform_config`,
    )
    const config: Record<string, string> = {}
    for (const r of rows) config[r.key] = r.value
    return reply.send({ config })
  })
}

/**
 * Sync a provider's featured/boosted status to OpenSearch
 */
async function syncProviderToSearch(app: FastifyInstance, providerId: string) {
  const searchUrl = process.env.SEARCH_SERVICE_URL || 'http://localhost:3001'

  // Get all provider_services to update their search docs
  const { rows } = await app.db.query<{
    service_id:     string
    provider_name:  string
    service_title:  string
    category_slug:  string
    address:        string | null
    city_name:      string | null
    area_name:      string | null
    price_paise:    number
    duration_mins:  number
    likes_count:    number
    status:         string
    is_featured:    boolean
    is_boosted:     boolean
  }>(
    `SELECT
       ps.id AS service_id, p.name AS provider_name, ps.title AS service_title,
       ps.category_slug, p.address, c.name AS city_name, a.name AS area_name,
       ps.price_paise, ps.duration_mins, p.likes_count, p.status,
       p.is_featured, p.is_boosted
     FROM provider_services ps
     JOIN providers p ON p.id = ps.provider_id
     LEFT JOIN cities c ON c.id = p.city_id
     LEFT JOIN areas a ON a.id = p.area_id
     WHERE ps.provider_id = $1 AND ps.is_available = true`,
    [providerId],
  )

  for (const doc of rows) {
    await fetch(`${searchUrl}/v1/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: doc.service_id,
        document: {
          provider_id:   providerId,
          provider_name: doc.provider_name,
          service_id:    doc.service_id,
          service_title: doc.service_title,
          category_slug: doc.category_slug,
          address:       doc.address,
          city_name:     doc.city_name,
          area_name:     doc.area_name,
          price_paise:   doc.price_paise,
          duration_mins: doc.duration_mins,
          likes_count:   doc.likes_count,
          status:        doc.status,
          is_featured:   doc.is_featured,
          is_boosted:    doc.is_boosted,
          updated_at:    new Date().toISOString(),
        },
      }),
    })
  }
}
