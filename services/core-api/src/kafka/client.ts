import { Kafka, logLevel } from 'kafkajs'

const brokers = (process.env.KAFKA_BROKERS ?? 'kafka:29092').split(',')

/**
 * Shared Kafka client. One instance per process.
 * Brokers are configured via KAFKA_BROKERS env var (default: kafka:29092).
 */
export const kafka = new Kafka({
  clientId: 'core-api',
  brokers,
  logLevel: process.env.NODE_ENV === 'production' ? logLevel.WARN : logLevel.ERROR,
  retry: {
    initialRetryTime: 300,
    retries:          8,
  },
})
