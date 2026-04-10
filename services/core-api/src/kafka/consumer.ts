import { Consumer, EachMessagePayload } from 'kafkajs'
import { Redis } from 'ioredis'
import { kafka } from './client'
import { TOPICS } from './topics'

let consumer: Consumer | null = null

/**
 * Redis channel helpers.
 * All SSE clients subscribe to either provider:{id} or user:{id}.
 */
export const redisChannel = {
  provider: (providerId: string) => `provider:${providerId}`,
  user:     (userId:     string) => `user:${userId}`,
}

/** Parse a raw Kafka message value to JSON safely. */
function parseMessage(raw: Buffer | null): unknown | null {
  if (!raw) return null
  try   { return JSON.parse(raw.toString()) }
  catch { return null }
}

/**
 * Start the Kafka consumer.
 * Subscribes to all booking topics and publishes parsed events to the
 * appropriate Redis pub/sub channel so SSE connections pick them up.
 *
 * @param redisPublisher - A *dedicated* Redis client for pub/sub publishing
 *                         (separate from the request Redis instance).
 */
export async function startConsumer(redisPublisher: Redis): Promise<void> {
  consumer = kafka.consumer({ groupId: 'core-api-sse-fanout' })

  await consumer.connect()
  await consumer.subscribe({
    topics:    [TOPICS.BOOKING_REQUESTED, TOPICS.BOOKING_RESPONDED],
    fromBeginning: false,
  })

  await consumer.run({
    eachMessage: async ({ topic, message }: EachMessagePayload) => {
      const event = parseMessage(message.value)
      if (!event || typeof event !== 'object') return

      const ev = event as Record<string, unknown>
      const data = ev['data'] as Record<string, unknown> | undefined
      if (!data) return

      if (topic === TOPICS.BOOKING_REQUESTED) {
        // Fan out to the provider who owns the booking
        const providerId = data['provider_id'] as string | undefined
        if (providerId) {
          await redisPublisher.publish(
            redisChannel.provider(providerId),
            JSON.stringify({ event_type: 'booking.requested', ...ev }),
          )
        }
      } else if (topic === TOPICS.BOOKING_RESPONDED) {
        // Fan out to the user who placed the booking
        const userId = data['user_id'] as string | undefined
        if (userId) {
          await redisPublisher.publish(
            redisChannel.user(userId),
            JSON.stringify({ event_type: 'booking.responded', ...ev }),
          )
        }
      }
    },
  })
}

export async function stopConsumer(): Promise<void> {
  await consumer?.disconnect()
  consumer = null
}
