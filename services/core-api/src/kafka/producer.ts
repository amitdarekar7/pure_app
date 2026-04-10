import { Producer } from 'kafkajs'
import { kafka } from './client'
import { Topic } from './topics'

let producer: Producer | null = null

/** Connect once on startup, reuse the connection. */
export async function connectProducer(): Promise<void> {
  producer = kafka.producer({
    allowAutoTopicCreation: true,
    idempotent:             true,         // exactly-once semantics
    maxInFlightRequests:    1,
  })
  await producer.connect()
}

export async function disconnectProducer(): Promise<void> {
  await producer?.disconnect()
  producer = null
}

/**
 * Publish a single strongly-typed event to a Kafka topic.
 *
 * @param topic    - Topic constant from `./topics`
 * @param key      - Partition key (use aggregate_id for ordering)
 * @param payload  - Serialisable event payload (will be JSON-stringified)
 */
export async function publish(topic: Topic, key: string, payload: unknown): Promise<void> {
  if (!producer) {
    throw new Error('[kafka/producer] Producer not connected. Call connectProducer() first.')
  }

  await producer.send({
    topic,
    messages: [{ key, value: JSON.stringify(payload) }],
  })
}
