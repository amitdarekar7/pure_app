import { Pool } from 'pg'

/**
 * Subscription enforcement logic.
 *
 * Rules:
 * - Provider gets 1 year free from created_at
 * - After 1 year, subscription becomes required
 * - 7-day grace period after requirement triggers
 * - If no active subscription after grace, provider is "lapsed"
 * - Lapsed providers are hidden from search and cannot receive new bookings
 */

const FREE_PERIOD_MS   = 365 * 24 * 60 * 60 * 1000   // 1 year
const GRACE_PERIOD_MS  = 7   * 24 * 60 * 60 * 1000    // 7 days
const QUARTERLY_PAISE  = 14900                          // ₹149
const QUARTERLY_DAYS   = 90

export interface SubscriptionStatus {
  /** Whether this provider has passed the 1-year free period */
  subscriptionRequired: boolean
  /** If required, is there an active (non-expired) subscription? */
  hasActiveSubscription: boolean
  /** Grace period end (null if not in grace or not required) */
  graceUntil: string | null
  /** Is provider currently in grace period? */
  inGracePeriod: boolean
  /** Is the provider fully lapsed (no subscription, grace expired)? */
  isLapsed: boolean
  /** Active subscription details, if any */
  activeSubscription: {
    id: string
    plan: string
    starts_at: string
    expires_at: string
    auto_renew: boolean
  } | null
  /** Days remaining in free tier (0 if expired) */
  freeDaysRemaining: number
}

/**
 * Compute the full subscription status for a provider.
 */
export async function getSubscriptionStatus(
  db: Pool,
  providerId: string,
): Promise<SubscriptionStatus> {
  // Get provider creation date and subscription flags
  const { rows: pRows } = await db.query<{
    created_at: string
    subscription_required: boolean
    subscription_grace_until: string | null
  }>(
    `SELECT created_at, subscription_required, subscription_grace_until
       FROM providers WHERE id = $1`,
    [providerId],
  )

  if (!pRows[0]) {
    return {
      subscriptionRequired: false,
      hasActiveSubscription: false,
      graceUntil: null,
      inGracePeriod: false,
      isLapsed: false,
      activeSubscription: null,
      freeDaysRemaining: 0,
    }
  }

  const createdAt = new Date(pRows[0].created_at)
  const now = new Date()
  const freeUntil = new Date(createdAt.getTime() + FREE_PERIOD_MS)
  const freeDaysRemaining = Math.max(0, Math.ceil((freeUntil.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
  const subscriptionRequired = now >= freeUntil

  // If not required yet, no need to check further
  if (!subscriptionRequired) {
    return {
      subscriptionRequired: false,
      hasActiveSubscription: false,
      graceUntil: null,
      inGracePeriod: false,
      isLapsed: false,
      activeSubscription: null,
      freeDaysRemaining,
    }
  }

  // Check for active subscription
  const { rows: subRows } = await db.query<{
    id: string
    plan: string
    starts_at: string
    expires_at: string
    auto_renew: boolean
  }>(
    `SELECT id, plan, starts_at, expires_at, auto_renew
       FROM provider_subscriptions
      WHERE provider_id = $1
        AND status = 'active'
        AND expires_at > NOW()
      ORDER BY expires_at DESC
      LIMIT 1`,
    [providerId],
  )

  const activeSubscription = subRows[0] ?? null
  const hasActiveSubscription = !!activeSubscription

  // Compute grace period
  let graceUntil = pRows[0].subscription_grace_until
  let inGracePeriod = false

  if (!hasActiveSubscription) {
    // If subscription_required flag not yet set on provider, set it + start grace
    if (!pRows[0].subscription_required) {
      const graceEnd = new Date(now.getTime() + GRACE_PERIOD_MS)
      await db.query(
        `UPDATE providers
            SET subscription_required = true,
                subscription_grace_until = $2
          WHERE id = $1`,
        [providerId, graceEnd.toISOString()],
      )
      graceUntil = graceEnd.toISOString()
    }

    if (graceUntil && new Date(graceUntil) > now) {
      inGracePeriod = true
    }
  }

  const isLapsed = subscriptionRequired && !hasActiveSubscription && !inGracePeriod

  return {
    subscriptionRequired,
    hasActiveSubscription,
    graceUntil,
    inGracePeriod,
    isLapsed,
    activeSubscription,
    freeDaysRemaining,
  }
}

/**
 * Quick check: is provider lapsed? (for use in search filter and booking block)
 */
export async function isProviderLapsed(db: Pool, providerId: string): Promise<boolean> {
  const status = await getSubscriptionStatus(db, providerId)
  return status.isLapsed
}

export { QUARTERLY_PAISE, QUARTERLY_DAYS }
