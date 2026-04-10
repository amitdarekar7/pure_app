/**
 * Kafka topic name constants.
 * All services must reference topics from this file — never hardcode strings.
 */
export const TOPICS = {
  BOOKING_REQUESTED: 'booking.requested',
  BOOKING_RESPONDED: 'booking.responded',
  PAYMENT_COMPLETED: 'payment.completed',
} as const

export type Topic = (typeof TOPICS)[keyof typeof TOPICS]
