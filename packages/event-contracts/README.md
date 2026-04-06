# Event Contracts

Canonical JSON Schema definitions for all Kafka domain events. Every service **must** validate incoming events against these schemas before processing.

## Kafka Topics

| Topic | Schema | Producer | Consumers |
|-------|--------|----------|-----------|
| `user.registered` | [user-registered.json](./schemas/user-registered.json) | `core-api` | `ai-service`, `search-service` |
| `order.placed` | [order-placed.json](./schemas/order-placed.json) | `core-api` | `payment-service`, `ai-service` |
| `payment.intent.created` | [payment-intent-created.json](./schemas/payment-intent-created.json) | `payment-service` | `core-api` |
| `payment.completed` | [payment-completed.json](./schemas/payment-completed.json) | `payment-service` | `core-api`, `ai-service` |
| `search.query.logged` | [search-query-logged.json](./schemas/search-query-logged.json) | `search-service` | `ai-service` |
| `recommendation.served` | [recommendation-served.json](./schemas/recommendation-served.json) | `ai-service` | analytics |

## Envelope (all events)

```json
{
  "event_id":       "<uuid v4>",
  "event_type":     "<dot.separated.name>",
  "schema_version": "1.0.0",
  "timestamp":      "<ISO 8601>",
  "aggregate_id":   "<uuid of the root entity>",
  "data":           { ... }
}
```

## Rules

1. **Immutable envelope** — `event_id`, `event_type`, `schema_version`, `timestamp`, and `aggregate_id` are always required.
2. **Schema versioning** — Breaking changes bump the `$id` version path (e.g. `/v2`). New optional fields are non-breaking.
3. **Outbox Pattern** — Producers write to their `outbox_events` table in the **same DB transaction** as the business write. A separate relay process polls and publishes to Kafka.
4. **No PII in events** — Never emit passwords, raw card numbers, full SSNs, or auth tokens.
5. **Idempotent consumers** — Consumers must handle duplicate delivery. Use `event_id` as a deduplication key.
