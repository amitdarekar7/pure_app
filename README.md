# PureApp — Polyglot Microservices Monorepo

A production-ready scaffold for a mobile + TV app with specialized backend services.

## Stack

| Layer | Technology |
|-------|------------|
| Mobile (iOS / Android) | React Native + Expo |
| TV (Smart TV browser shell) | React Native for Web |
| Core API | Node.js + TypeScript + Fastify |
| Search | Go + OpenSearch |
| Payments | Rust + Axum + PostgreSQL (append-only ledger) |
| AI / Recommendations | Python + FastAPI + scikit-learn |
| Event Bus | Apache Kafka |
| Cache / Sessions | Redis |

## Monorepo Structure

```
pure_app/
├── apps/
│   └── mobile/              # Expo app (iOS + Android + Web/TV)
├── packages/
│   └── event-contracts/     # JSON Schema event definitions (Kafka contracts)
├── services/
│   ├── core-api/            # Node.js TypeScript — users, auth, orchestration
│   ├── search-service/      # Go — full-text search on OpenSearch
│   ├── payment-service/     # Rust — payments, ledger, refunds
│   └── ai-service/          # Python — recommendations, embeddings
└── docker-compose.yml       # Full local dev stack (all infra + services)
```

## Quick Start

**Prerequisites:** Docker Desktop, Node 20+, Go 1.22+, Rust 1.77+, Python 3.11+

```bash
# 1. Start all infrastructure + services
npm run docker:up

# 2. Install JS/TS dependencies
npm install

# 3. Start the mobile app (dev client)
cd apps/mobile && npx expo start

# 4. Start core-api in watch mode (outside Docker for fast iteration)
cd services/core-api && npm run dev
```

## Service Ports (Local)

| Service | Port |
|---------|------|
| core-api | 3000 |
| search-service | 3001 |
| payment-service | 3002 |
| ai-service | 3003 |
| PostgreSQL (core) | 5432 |
| PostgreSQL (payments) | 5433 |
| Redis | 6379 |
| OpenSearch | 9200 |
| Kafka | 9092 |
| Zookeeper | 2181 |

## Database Ownership

Each service owns its database exclusively. Cross-service data access happens only through HTTP APIs or Kafka events — never via direct SQL into another service's tables.

| Service | Database | Owned Tables |
|---------|----------|--------------|
| core-api | PostgreSQL `core_db` | users, profiles, devices, auth_sessions, feature_flags |
| search-service | OpenSearch `products` index | search documents, ranking data |
| payment-service | PostgreSQL `payments_db` | wallets, payment_intents, ledger_entries, refunds |
| ai-service | Redis (online) + object storage (offline) | user_features, item_features, embeddings |

## Kafka Event Flow

```
User registers  → core-api        → [user.registered]     → ai-service (cold-start profile)
Order placed    → core-api        → [order.placed]         → payment-service, ai-service
Payment done    → payment-service → [payment.completed]    → core-api, ai-service
Search query    → search-service  → [search.query.logged]  → ai-service (signal)
Recommendation  → ai-service      → [recommendation.served]→ analytics
```

All event schemas are defined in `packages/event-contracts/schemas/`.

## Security Baseline

- Payments: raw card data **never** stored; processor tokens only (Stripe/Braintree)
- Ledger: append-only enforced at DB level (no UPDATE/DELETE rules)
- Auth: short-lived JWTs (15 min) + long-lived rotating refresh tokens
- Secrets: environment variables only, never hardcoded
- Network: payment-service isolated in its own network segment (see docker-compose)
