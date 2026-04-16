import { FastifyInstance } from 'fastify'
import { createHmac } from 'crypto'

/**
 * POST /v1/webhooks/razorpay
 *
 * Razorpay sends webhook payloads signed with HMAC-SHA256 using the webhook secret.
 * We handle:
 *   - transfer.processed  → mark booking settlement_status = 'settled'
 *   - transfer.failed     → mark booking settlement_status = 'failed'
 */
export async function webhookRoutes(app: FastifyInstance) {

  // Accept raw body so we can verify the HMAC signature
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body)
  })

  app.post('/razorpay', async (req, reply) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
    if (!webhookSecret) {
      app.log.warn('RAZORPAY_WEBHOOK_SECRET not set — skipping webhook')
      return reply.status(200).send({ ok: true })
    }

    // ── Verify signature ──────────────────────────────────────────────────
    const signature = req.headers['x-razorpay-signature'] as string | undefined
    const rawBody   = req.body as string

    if (!signature) {
      return reply.status(400).send({ error: 'missing x-razorpay-signature' })
    }

    const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
    if (signature !== expected) {
      app.log.warn('Razorpay webhook signature mismatch')
      return reply.status(400).send({ error: 'invalid signature' })
    }

    // ── Parse and handle event ────────────────────────────────────────────
    let payload: {
      event: string
      payload: {
        transfer?: { entity: { id: string; status: string; notes?: { booking_id?: string } } }
        payment?:  { entity: { id: string } }
      }
    }

    try {
      payload = JSON.parse(rawBody)
    } catch {
      return reply.status(400).send({ error: 'invalid JSON' })
    }

    const event = payload.event
    app.log.info(`Razorpay webhook: ${event}`)

    if (event === 'transfer.processed') {
      const transfer  = payload.payload.transfer?.entity
      const bookingId = transfer?.notes?.booking_id
      if (bookingId && transfer) {
        await app.db.query(
          `UPDATE bookings
              SET settlement_status = 'settled',
                  updated_at = NOW()
            WHERE id = $1 AND razorpay_transfer_id = $2`,
          [bookingId, transfer.id],
        )
        app.log.info(`Booking ${bookingId} settlement → settled (transfer ${transfer.id})`)
      }
    }

    if (event === 'transfer.failed') {
      const transfer  = payload.payload.transfer?.entity
      const bookingId = transfer?.notes?.booking_id
      if (bookingId && transfer) {
        await app.db.query(
          `UPDATE bookings
              SET settlement_status = 'failed',
                  updated_at = NOW()
            WHERE id = $1 AND razorpay_transfer_id = $2`,
          [bookingId, transfer.id],
        )
        app.log.error(`Booking ${bookingId} settlement → failed (transfer ${transfer.id})`)
      }
    }

    // Always return 200 so Razorpay doesn't retry
    return reply.status(200).send({ ok: true })
  })
}
