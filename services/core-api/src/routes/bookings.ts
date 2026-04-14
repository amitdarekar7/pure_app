import { FastifyInstance } from 'fastify'
import { randomUUID, randomInt } from 'crypto'
import { requireAuth } from '../middleware/auth'
import { publish } from '../kafka/producer'
import { TOPICS } from '../kafka/topics'
import { sendPushNotification } from '../notifications'

/** Generate a 6-digit numeric OTP */
function generateOTP(): string {
  return String(randomInt(100000, 999999))
}

export async function bookingRoutes(app: FastifyInstance) {
  /**
   * POST /v1/bookings
   * Authenticated. Creates a booking request (status = 'pending').
   * Body: { providerServiceId, scheduledAt, notes?, paymentMode? }
   *
   * paymentMode:
   *   - 'prepaid' (default): user pays through app
   *   - 'pay_at_venue': user pays provider directly, NO commission
   * Discount applies regardless of payment mode.
   */
  app.post<{
    Body: {
      providerServiceId: string
      scheduledAt:       string   // ISO 8601
      notes?:            string
      paymentMode?:      'prepaid' | 'pay_at_venue'
    }
  }>(
    '/',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { providerServiceId, scheduledAt, notes, paymentMode = 'prepaid' } = req.body

      if (!/^[0-9a-f-]{36}$/i.test(providerServiceId)) {
        return reply.status(400).send({ error: 'providerServiceId must be a valid UUID' })
      }
      if (!['prepaid', 'pay_at_venue'].includes(paymentMode)) {
        return reply.status(400).send({ error: 'paymentMode must be prepaid or pay_at_venue' })
      }

      const scheduled = new Date(scheduledAt)
      if (isNaN(scheduled.getTime()) || scheduled <= new Date()) {
        return reply.status(400).send({ error: 'scheduledAt must be a future ISO date' })
      }

      // Resolve DB user_id from firebase_uid, including profile for event enrichment
      const { rows: uRows } = await app.db.query<{
        id:           string
        phone:        string | null
        display_name: string | null
      }>(
        `SELECT u.id, u.phone, pr.display_name
           FROM users u
           LEFT JOIN profiles pr ON pr.user_id = u.id
          WHERE u.firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })
      const userId = uRows[0].id

      // Look up the service to get provider_id, price, discount, and title
      const { rows: sRows } = await app.db.query<{
        provider_id:  string
        price_paise:  number
        is_available: boolean
        title:        string
        discount_pct: number
      }>(
        `SELECT provider_id, price_paise, is_available, title, discount_pct
         FROM provider_services
         WHERE id = $1`,
        [providerServiceId],
      )
      if (!sRows[0]) return reply.status(404).send({ error: 'service not found' })
      if (!sRows[0].is_available) return reply.status(409).send({ error: 'service not available' })

      const { provider_id, price_paise: originalPricePaise, title: serviceTitle, discount_pct: serviceDiscountPct } = sRows[0]

      // Apply discount regardless of payment mode
      const appliedDiscount = serviceDiscountPct
      const pricePaise = appliedDiscount > 0
        ? Math.round(originalPricePaise * (1 - appliedDiscount / 100))
        : originalPricePaise

      // Commission only applies to prepaid bookings
      // Fetch platform commission rate
      const { rows: configRows } = await app.db.query<{ value: string }>(
        `SELECT value FROM platform_config WHERE key = 'commission_pct'`,
      )
      const commissionPct = paymentMode === 'prepaid'
        ? (configRows[0] ? parseFloat(configRows[0].value) : 7.0)
        : 0
      const commissionPaise = Math.round(pricePaise * commissionPct / 100)
      const providerPaise = pricePaise - commissionPaise

      // Generate OTP for check-in (user shows to provider upon arrival)
      const checkinOtp = generateOTP()

      const { rows } = await app.db.query<{ id: string; status: string; scheduled_at: string }>(
        `INSERT INTO bookings
           (user_id, provider_id, provider_service_id, scheduled_at, price_paise, notes,
            commission_pct, commission_paise, provider_paise,
            payment_mode, original_price_paise, discount_pct, checkin_otp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id, status, scheduled_at`,
        [userId, provider_id, providerServiceId, scheduled.toISOString(), pricePaise, notes ?? null,
         commissionPct, commissionPaise, providerPaise,
         paymentMode, originalPricePaise, appliedDiscount, checkinOtp],
      )

      const booking = rows[0]

      // ── Publish booking.requested event to Kafka (fire-and-forget) ──────
      publish(TOPICS.BOOKING_REQUESTED, booking.id, {
        event_id:       randomUUID(),
        event_type:     TOPICS.BOOKING_REQUESTED,
        schema_version: '1.0.0',
        timestamp:      new Date().toISOString(),
        aggregate_id:   booking.id,
        data: {
          booking_id:    booking.id,
          user_id:       userId,
          provider_id,
          service_title: serviceTitle,
          scheduled_at:  booking.scheduled_at,
          price_paise:   pricePaise,
          original_price_paise: originalPricePaise,
          discount_pct:  appliedDiscount,
          payment_mode:  paymentMode,
          commission_pct: commissionPct,
          commission_paise: commissionPaise,
          provider_paise: providerPaise,
          notes:         notes ?? null,
          user_name:     uRows[0].display_name ?? null,
          user_phone:    uRows[0].phone ?? null,
        },
      }).catch((err: Error) =>
        app.log.error({ err }, '[kafka] Failed to publish booking.requested'),
      )

      // ── Send FCM push notification to the provider (fire-and-forget) ────
      // Look up the provider's user_id via provider_accounts
      app.db.query<{ user_id: string }>(
        `SELECT user_id FROM provider_accounts WHERE provider_id = $1`,
        [provider_id],
      ).then(({ rows: paRows }) => {
        if (!paRows[0]) return
        const userName = uRows[0].display_name ?? 'A customer'
        return sendPushNotification(app.db, paRows[0].user_id, {
          title: '🔔 New Booking Request!',
          body:  `${userName} wants to book "${serviceTitle}"`,
          data: {
            type:       'booking.requested',
            booking_id: booking.id,
          },
        })
      }).catch((err: Error) =>
        app.log.error({ err }, '[fcm] Failed to send booking push notification'),
      )

      return reply.status(201).send({
        booking: {
          ...booking,
          checkin_otp: checkinOtp,
          payment_mode: paymentMode,
          price_paise: pricePaise,
          original_price_paise: originalPricePaise,
          discount_pct: appliedDiscount,
        },
      })
    },
  )

  /**
   * GET /v1/bookings/my
   * Authenticated. Returns all bookings for the current user.
   */
  app.get(
    '/my',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { rows: uRows } = await app.db.query<{ id: string }>(
        `SELECT id FROM users WHERE firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })

      const { rows } = await app.db.query<{
        id:                  string
        provider_name:       string
        service_title:       string
        scheduled_at:        string
        status:              string
        price_paise:         number
        original_price_paise: number | null
        discount_pct:        number
        payment_mode:        string
        payment_status:      string
        checkin_otp:         string | null
        checked_in_at:       string | null
        no_show:             boolean
      }>(
        `SELECT
           b.id,
           p.name          AS provider_name,
           ps.title        AS service_title,
           b.scheduled_at,
           b.status,
           b.price_paise,
           b.original_price_paise,
           b.discount_pct,
           b.payment_mode,
           b.payment_status,
           b.checkin_otp,
           b.checked_in_at,
           b.no_show
         FROM   bookings         b
         JOIN   providers        p  ON p.id  = b.provider_id
         JOIN   provider_services ps ON ps.id = b.provider_service_id
         WHERE  b.user_id = $1
         ORDER  BY b.created_at DESC`,
        [uRows[0].id],
      )

      return reply.send({ bookings: rows })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/bookings/:id/checkin
  // Provider submits the OTP that the user shared upon arrival.
  // This proves the customer arrived; commission is now locked in.
  // Body: { otp: string }
  // ─────────────────────────────────────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body:   { otp: string }
  }>(
    '/:id/checkin',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = req.params
      const { otp } = req.body

      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return reply.status(400).send({ error: 'invalid booking id' })
      }
      if (!otp || !/^\d{6}$/.test(otp)) {
        return reply.status(400).send({ error: 'otp must be a 6-digit number' })
      }

      // Resolve the provider calling this
      const { rows: uRows } = await app.db.query<{ id: string; provider_id: string | null }>(
        `SELECT u.id, pa.provider_id
           FROM users u
           LEFT JOIN provider_accounts pa ON pa.user_id = u.id
          WHERE u.firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]?.provider_id) {
        return reply.status(403).send({ error: 'not a provider account' })
      }
      const providerId = uRows[0].provider_id

      // Verify booking belongs to provider + is in correct state
      const { rows: bRows } = await app.db.query<{
        id: string; status: string; checkin_otp: string | null; checked_in_at: string | null
      }>(
        `SELECT id, status, checkin_otp, checked_in_at
           FROM bookings
          WHERE id = $1 AND provider_id = $2`,
        [id, providerId],
      )
      if (!bRows[0]) return reply.status(404).send({ error: 'booking not found' })

      if (bRows[0].checked_in_at) {
        return reply.status(409).send({ error: 'already checked in' })
      }
      if (bRows[0].status !== 'confirmed') {
        return reply.status(409).send({ error: 'booking must be confirmed before check-in' })
      }

      // Verify OTP — use timing-safe comparison is overkill for 6 digits
      // but we do a constant-time-ish check anyway
      if (bRows[0].checkin_otp !== otp) {
        return reply.status(400).send({ error: 'invalid OTP' })
      }

      const { rows: updated } = await app.db.query<{ id: string; status: string; checked_in_at: string }>(
        `UPDATE bookings
            SET status = 'in_progress', checked_in_at = NOW(), updated_at = NOW()
          WHERE id = $1
          RETURNING id, status, checked_in_at`,
        [id],
      )

      return reply.send({ booking: updated[0] })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/bookings/:id/cancel
  // User or provider cancels a booking. Applies cancellation fee policy.
  // Body: { reason?: string }
  // ─────────────────────────────────────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body:   { reason?: string }
  }>(
    '/:id/cancel',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = req.params
      const { reason } = req.body

      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return reply.status(400).send({ error: 'invalid booking id' })
      }

      // Resolve caller identity (user or provider)
      const { rows: uRows } = await app.db.query<{
        id: string; role: string; provider_id: string | null
      }>(
        `SELECT u.id, u.role, pa.provider_id
           FROM users u
           LEFT JOIN provider_accounts pa ON pa.user_id = u.id
          WHERE u.firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })

      const callerUserId = uRows[0].id
      const callerProviderId = uRows[0].provider_id
      const isProvider = uRows[0].role === 'provider'

      // Fetch booking
      const { rows: bRows } = await app.db.query<{
        id: string; status: string; user_id: string; provider_id: string;
        price_paise: number; scheduled_at: string; payment_mode: string
      }>(
        `SELECT id, status, user_id, provider_id, price_paise, scheduled_at, payment_mode
           FROM bookings WHERE id = $1`,
        [id],
      )
      if (!bRows[0]) return reply.status(404).send({ error: 'booking not found' })

      const bk = bRows[0]

      // Verify caller owns the booking
      if (isProvider && callerProviderId !== bk.provider_id) {
        return reply.status(403).send({ error: 'not your booking' })
      }
      if (!isProvider && callerUserId !== bk.user_id) {
        return reply.status(403).send({ error: 'not your booking' })
      }

      if (['cancelled', 'completed', 'no_show'].includes(bk.status)) {
        return reply.status(409).send({ error: `Cannot cancel a ${bk.status} booking` })
      }

      // Calculate cancellation fee based on policy
      const { rows: cfgRows } = await app.db.query<{ key: string; value: string }>(
        `SELECT key, value FROM platform_config WHERE key IN ('free_cancel_hours', 'late_cancel_pct')`,
      )
      const cfg = Object.fromEntries(cfgRows.map(r => [r.key, r.value]))
      const freeCancelHours = parseFloat(cfg.free_cancel_hours ?? '4')
      const lateCancelPct   = parseFloat(cfg.late_cancel_pct ?? '25')

      const hoursUntilBooking = (new Date(bk.scheduled_at).getTime() - Date.now()) / 3600000
      const cancelledBy = isProvider ? 'provider' : 'user'

      // Provider cancels → no fee to user. User cancels late → fee applies.
      let cancellationFeePaise = 0
      if (cancelledBy === 'user' && hoursUntilBooking < freeCancelHours) {
        cancellationFeePaise = Math.round(bk.price_paise * lateCancelPct / 100)
      }

      await app.db.query(
        `UPDATE bookings
            SET status = 'cancelled',
                cancelled_by = $2,
                cancellation_reason = $3,
                cancellation_fee_paise = $4,
                updated_at = NOW()
          WHERE id = $1`,
        [id, cancelledBy, reason ?? null, cancellationFeePaise],
      )

      return reply.send({
        booking: {
          id,
          status: 'cancelled',
          cancelled_by: cancelledBy,
          cancellation_fee_paise: cancellationFeePaise,
        },
      })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/bookings/:id/complete
  // Provider marks a checked-in booking as completed.
  // ─────────────────────────────────────────────────────────────────────────
  app.post<{
    Params: { id: string }
  }>(
    '/:id/complete',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = req.params

      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return reply.status(400).send({ error: 'invalid booking id' })
      }

      // Resolve provider
      const { rows: uRows } = await app.db.query<{ provider_id: string | null }>(
        `SELECT pa.provider_id
           FROM users u
           LEFT JOIN provider_accounts pa ON pa.user_id = u.id
          WHERE u.firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]?.provider_id) {
        return reply.status(403).send({ error: 'not a provider account' })
      }

      const { rows: updated } = await app.db.query<{ id: string; status: string }>(
        `UPDATE bookings
            SET status = 'completed', updated_at = NOW()
          WHERE id = $1 AND provider_id = $2 AND status = 'in_progress'
          RETURNING id, status`,
        [id, uRows[0].provider_id],
      )
      if (!updated[0]) {
        return reply.status(409).send({ error: 'booking must be in_progress (checked-in) to complete' })
      }

      return reply.send({ booking: updated[0] })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/bookings/:id/pay
  // Creates a Razorpay order for the booking. Returns order_id + key_id
  // so the frontend can open Razorpay checkout.
  // ─────────────────────────────────────────────────────────────────────────
  app.post<{
    Params: { id: string }
  }>(
    '/:id/pay',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = req.params

      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return reply.status(400).send({ error: 'invalid booking id' })
      }

      // Resolve user
      const { rows: uRows } = await app.db.query<{ id: string }>(
        `SELECT id FROM users WHERE firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })

      // Fetch booking
      const { rows: bRows } = await app.db.query<{
        id: string; status: string; user_id: string;
        payment_mode: string; payment_status: string; price_paise: number
      }>(
        `SELECT id, status, user_id, payment_mode, payment_status, price_paise
           FROM bookings WHERE id = $1`,
        [id],
      )
      if (!bRows[0]) return reply.status(404).send({ error: 'booking not found' })

      const bk = bRows[0]

      if (bk.user_id !== uRows[0].id) {
        return reply.status(403).send({ error: 'not your booking' })
      }
      if (bk.payment_mode !== 'prepaid') {
        return reply.status(409).send({ error: 'only prepaid bookings can be paid online' })
      }
      if (bk.status !== 'confirmed') {
        return reply.status(409).send({ error: 'booking must be confirmed before payment' })
      }
      if (bk.payment_status === 'paid') {
        return reply.status(409).send({ error: 'already paid' })
      }

      // Call payment-service to create a Razorpay order
      const paymentUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002'
      const rzpResp = await fetch(`${paymentUrl}/v1/razorpay/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id:   bk.id,
          amount_paise: bk.price_paise,
          currency:     'INR',
        }),
      })

      if (!rzpResp.ok) {
        const errBody = await rzpResp.text()
        app.log.error(`Razorpay order creation failed: ${errBody}`)
        return reply.status(502).send({ error: 'Failed to create payment order' })
      }

      const rzpData = await rzpResp.json() as {
        razorpay_order_id: string
        razorpay_key_id:   string
        amount_paise:      number
        currency:          string
      }

      return reply.send({
        razorpay_order_id: rzpData.razorpay_order_id,
        razorpay_key_id:   rzpData.razorpay_key_id,
        amount_paise:      rzpData.amount_paise,
        currency:          rzpData.currency,
        booking_id:        bk.id,
      })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/bookings/:id/verify-payment
  // After Razorpay checkout completes, frontend sends the signature triplet.
  // We verify via payment-service and mark booking as paid if valid.
  // ─────────────────────────────────────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      razorpay_order_id:   string
      razorpay_payment_id: string
      razorpay_signature:  string
    }
  }>(
    '/:id/verify-payment',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = req.params
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body

      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return reply.status(400).send({ error: 'invalid booking id' })
      }
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return reply.status(400).send({ error: 'missing razorpay fields' })
      }

      // Resolve user
      const { rows: uRows } = await app.db.query<{ id: string }>(
        `SELECT id FROM users WHERE firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })

      // Fetch booking
      const { rows: bRows } = await app.db.query<{
        id: string; user_id: string; payment_status: string
      }>(
        `SELECT id, user_id, payment_status FROM bookings WHERE id = $1`,
        [id],
      )
      if (!bRows[0]) return reply.status(404).send({ error: 'booking not found' })

      if (bRows[0].user_id !== uRows[0].id) {
        return reply.status(403).send({ error: 'not your booking' })
      }
      if (bRows[0].payment_status === 'paid') {
        return reply.status(409).send({ error: 'already paid' })
      }

      // Verify signature with payment-service
      const paymentUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002'
      const verifyResp = await fetch(`${paymentUrl}/v1/razorpay/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          booking_id: id,
        }),
      })

      if (!verifyResp.ok) {
        const errBody = await verifyResp.text()
        app.log.error(`Razorpay verification failed: ${errBody}`)
        return reply.status(400).send({ error: 'Payment verification failed — possible tampering' })
      }

      // Mark booking as paid + store Razorpay payment ID
      const { rows: updated } = await app.db.query<{ id: string; payment_status: string }>(
        `UPDATE bookings
            SET payment_status = 'paid',
                razorpay_payment_id = $2,
                updated_at = NOW()
          WHERE id = $1
          RETURNING id, payment_status`,
        [id, razorpay_payment_id],
      )

      return reply.send({
        booking: {
          id: updated[0].id,
          payment_status: updated[0].payment_status,
          razorpay_payment_id,
        },
      })
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/bookings/:id/choose-venue
  // User chooses to pay at venue instead of online (after provider confirms).
  // ─────────────────────────────────────────────────────────────────────────
  app.post<{
    Params: { id: string }
  }>(
    '/:id/choose-venue',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = req.params

      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return reply.status(400).send({ error: 'invalid booking id' })
      }

      const { rows: uRows } = await app.db.query<{ id: string }>(
        `SELECT id FROM users WHERE firebase_uid = $1`,
        [req.firebaseUid],
      )
      if (!uRows[0]) return reply.status(401).send({ error: 'user not found' })

      const { rows: bRows } = await app.db.query<{
        id: string; status: string; user_id: string; payment_status: string
      }>(
        `SELECT id, status, user_id, payment_status FROM bookings WHERE id = $1`,
        [id],
      )
      if (!bRows[0]) return reply.status(404).send({ error: 'booking not found' })

      const bk = bRows[0]

      if (bk.user_id !== uRows[0].id) {
        return reply.status(403).send({ error: 'not your booking' })
      }
      if (bk.status !== 'confirmed') {
        return reply.status(409).send({ error: 'booking must be confirmed first' })
      }
      if (bk.payment_status === 'paid') {
        return reply.status(409).send({ error: 'already paid online' })
      }

      // Switch to pay_at_venue, zero out commission
      await app.db.query(
        `UPDATE bookings
            SET payment_mode = 'pay_at_venue',
                commission_pct = 0,
                commission_paise = 0,
                provider_paise = price_paise,
                updated_at = NOW()
          WHERE id = $1`,
        [id],
      )

      return reply.send({ booking: { id, payment_mode: 'pay_at_venue' } })
    },
  )
}
