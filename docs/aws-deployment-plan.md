# Pure App — AWS Elastic Deployment Plan

> **One architecture, any scale.** Start at **~$35/mo** (Phase 0), graduate to fully-managed elastic infra that auto-scales from 10 users to 1M+ — pay only for what you use.

---

## 0. Phase 0 — Bootstrap (0 users, ~$35/mo)

**Goal:** Get live in production at the lowest possible cost. No managed services yet — one EC2 runs everything via Docker Compose (your existing `docker-compose.prod.yml` is already built for this).

### Architecture

```
          Route 53 (pureapp.io)
               │
          CloudFront (free tier: 1TB/mo)
               │
    ┌──────────▼──────────┐
    │   t3.small EC2      │  ← $15/mo (1yr Reserved) or Free Tier t3.micro
    │   (2 vCPU, 2GB RAM) │
    │                     │
    │  ┌─ docker-compose ─┐│
    │  │ core-api    :3000││
    │  │ search-svc  :3001││
    │  │ payment-svc :3002││
    │  │ ai-service  :3003││
    │  │ postgres ×2      ││
    │  │ redis            ││
    │  │ opensearch       ││
    │  │ nginx (TLS)      ││
    │  └──────────────────┘│
    └──────────────────────┘
          │
    S3 bucket (static web + uploads)
```

### What you get

| Component | How | Cost |
|-----------|-----|------|
| **EC2** | `t3.small` with 1yr RI (or Free Tier `t3.micro`) | **$15/mo** (RI) or **$0** (free tier 12 months) |
| **EBS** | 30 GB gp3 | **$2.40/mo** |
| **Elastic IP** | 1 (free while attached to running instance) | **$0** |
| **S3** | Expo static build + uploads (< 5GB) | **$0.12/mo** |
| **CloudFront** | 1TB free tier | **$0** |
| **Route 53** | 1 hosted zone | **$0.50/mo** |
| **ACM** | TLS certificate | **$0** |
| **Total** | | **~$18/mo** (free tier) or **~$35/mo** (RI) |

### Setup Steps

```bash
# 1. Launch EC2
- AMI: Amazon Linux 2023 (ARM/Graviton for t4g = even cheaper)
- Instance: t3.small (or t3.micro free tier)
- Security Group: 22 (your IP), 80, 443 from 0.0.0.0/0
- 30GB gp3 EBS
- Elastic IP attached
- IAM Role: S3 access for backups

# 2. Install Docker + Docker Compose
sudo dnf install docker -y
sudo systemctl enable docker && sudo systemctl start docker
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# 3. Clone repo & deploy
git clone <your-repo> /opt/pure_app
cd /opt/pure_app
# Copy .env.production with real values
docker compose -f docker-compose.prod.yml up -d

# 4. Nginx reverse proxy (TLS via Let's Encrypt)
sudo dnf install certbot python3-certbot-nginx nginx -y
# Configure nginx to proxy /api → :3000, /search → :3001, etc.
sudo certbot --nginx -d api.pureapp.io -d app.pureapp.io

# 5. Automated DB backups to S3
# Cron: pg_dump → gzip → aws s3 cp
echo "0 3 * * * docker exec postgres-core pg_dumpall -U core | gzip | aws s3 cp - s3://pure-backups/core-$(date +\%Y\%m\%d).sql.gz" | crontab -
```

### Security (still solid)

- **TLS everywhere** via Let's Encrypt (auto-renew)
- **Security Group** — only ports 22 (your IP), 80, 443 open
- **Docker network isolation** — DB/Redis not exposed to host
- **SSH key-only** access (no passwords)
- **Unattended upgrades** enabled
- **fail2ban** for SSH brute-force protection
- **S3 backups** — daily automated DB dumps

### Capacity

This handles **0 to ~5,000 concurrent users** comfortably:
- Go + Rust services use almost no memory
- PostgreSQL with 13 tables is tiny
- Redis + OpenSearch fit in 2GB with the services
- If memory gets tight, the first thing to offload is OpenSearch (use Postgres `tsvector` full-text search instead — zero extra memory)

### When to upgrade to Phase 1

Move to managed services when **any** of these hit:
- CPU consistently > 70% for 1 week
- You need >1 instance for availability (can't afford downtime during deploys)
- DB size exceeds 20GB
- You're getting real revenue and need Multi-AZ for data safety

The migration path is clean because your Docker images are already built for ECS.

---

## 1. Architecture Overview — Elastic by Default

> **Design principle:** Every component auto-scales. No capacity planning.
> When traffic is low, costs drop automatically. When traffic spikes, capacity grows automatically.

```
                        ┌──────────────┐
                        │  Route 53    │
                        │  DNS         │
                        └──────┬───────┘
                               │
                        ┌──────▼───────┐
                        │  CloudFront  │  ← Static web app (S3 origin)
                        │  CDN         │  ← User uploads (S3 origin)
                        └──────┬───────┘     ← API proxy (ALB origin)
                               │
                        ┌──────▼───────┐
                        │  AWS WAF     │  ← Rate limiting, OWASP rules
                        └──────┬───────┘
                               │
                        ┌──────▼───────┐
                        │  ALB         │  ← TLS termination, path routing
                        │  (public)    │
                        └──┬──┬──┬──┬──┘
                           │  │  │  │
            ┌──────────────┘  │  │  └──────────────┐
            │                 │  │                  │
     ┌──────▼──────┐  ┌──────▼──┐  ┌───▼──────┐  ┌─▼──────────┐
     │  core-api   │  │ search  │  │ payment  │  │ ai-service │
     │  (Fargate)  │  │ service │  │ service  │  │ (Fargate)  │
     │  1→20 tasks │  │(Fargate)│  │(Fargate) │  │ 1→10 tasks │
     │  AUTO-SCALE │  │ 1→10   │  │ 1→8     │  │ AUTO-SCALE │
     └──┬──┬──┬────┘  └────┬───┘  └──┬───────┘  └──┬─────────┘
        │  │  │             │         │              │
        │  │  └─────────────┼─────────┼──────────────┘
        │  │                │         │
        │  │    ┌───────────▼─────────▼──────────────┐
        │  │    │     ElastiCache Serverless          │
        │  │    │     (Redis — auto-scales ECPU)      │
        │  │    └─────────────────────────────────────┘
        │  │
        │  └──────► MSK Serverless (Kafka — auto-scales throughput)
        │
   ┌────▼──────────────────────────────┐
   │  Aurora Serverless v2             │
   │  (PostgreSQL 16)                  │
   │  ┌──────────┐  ┌───────────────┐  │
   │  │ core_db  │  │ payments_db   │  │ ← Same cluster, separate DBs
   │  └──────────┘  └───────────────┘  │
   │  0.5 ACU → 128 ACU auto-scale    │
   │  + read replicas (auto-add)       │
   └───────────────────────────────────┘

   ┌───────────────┐  ┌───────────────┐
   │ OpenSearch     │  │ S3 Buckets    │
   │ Serverless     │  │ web / uploads │
   │ (auto-scale    │  │ / ML models   │
   │  OCU)          │  │ / backups     │
   └───────────────┘  └───────────────┘
```

### What auto-scales automatically (zero intervention)

| Component | Low Traffic | High Traffic | How |
|-----------|------------|--------------|-----|
| **Fargate tasks** | 1 per service | 10-50 per service | ECS Target Tracking (CPU/request count) |
| **Aurora** | 0.5 ACU (~1 vCPU, 1 GB) | 128 ACU per instance | Built-in ACU auto-scaling |
| **ElastiCache** | Baseline ECPU | Thousands of ECPU | Built-in serverless scaling |
| **OpenSearch** | 2 OCU | 20+ OCU | Built-in serverless scaling |
| **MSK** | Minimal throughput | GB/s throughput | Built-in serverless scaling |
| **CloudFront** | Free tier | Tbytes | Global edge network |

---

## 2. Compute — ECS Fargate (Elastic Containers)

**Why Fargate:**
- No cluster management, no EC2 instances to maintain
- Pay-per-second billing — only what your tasks use
- Auto-scales from **1 task** to dozens per service
- Same Docker images you already have
- Fargate Spot for 70% savings on non-critical services

### Service Sizing — Starts Small, Grows Automatically

| Service | **Min Tasks** | **Max Tasks** | vCPU | Memory | Scale Trigger |
|---------|:------------:|:------------:|------|--------|---------------|
| **core-api** | **1** | 20 | 0.25 | 512 MB | 60% CPU or 500 req/min |
| **search-service** | **1** | 10 | 0.25 | 512 MB | 70% CPU |
| **payment-service** | **1** | 8 | 0.25 | 512 MB | 60% CPU |
| **ai-service** | **1** | 10 | 0.5 | 1 GB | 70% CPU |

> **At 10 users:** 4 total tasks running (1 per service) = ~**$29/mo**
> **At 1M users:** 30-50 tasks auto-scaled = ~**$500-800/mo**

### Auto-Scaling Policy
```
Target tracking:
  - ECSServiceAverageCPUUtilization → 60%
  - ALBRequestCountPerTarget → 500
Scale-in cooldown: 300s  (wait 5 min before removing tasks)
Scale-out cooldown: 60s   (add tasks within 1 min)
Min capacity: 1            ← KEY: never pay for idle capacity
```

### Cost Saver: Fargate Spot
- **ai-service** and **search-service** on Fargate Spot = **70% cheaper**
- These services are non-critical (recommendations + search can tolerate restarts)
- payment-service and core-api stay on regular Fargate for reliability

---

## 3. Networking — VPC Design

```
VPC: 10.0.0.0/16

Public Subnets (ALB, NAT Gateway):
  10.0.1.0/24  — ap-south-1a
  10.0.2.0/24  — ap-south-1b
  10.0.3.0/24  — ap-south-1c

Private Subnets (Fargate tasks):
  10.0.10.0/24 — ap-south-1a
  10.0.11.0/24 — ap-south-1b
  10.0.12.0/24 — ap-south-1c

Database Subnets (RDS, ElastiCache, OpenSearch):
  10.0.20.0/24 — ap-south-1a
  10.0.21.0/24 — ap-south-1b
  10.0.22.0/24 — ap-south-1c
```

### Security Groups

| SG Name | Inbound | Outbound |
|---------|---------|----------|
| `sg-alb` | 443 from 0.0.0.0/0 | → sg-fargate:3000-3003 |
| `sg-fargate` | 3000-3003 from sg-alb | → sg-db, sg-cache, sg-search, 443 (internet) |
| `sg-db-core` | 5432 from sg-fargate | — |
| `sg-db-payments` | 5432 from sg-fargate (payment-service only) | — |
| `sg-cache` | 6379 from sg-fargate | — |
| `sg-search` | 443 from sg-fargate | — |
| `sg-kafka` | 9092 from sg-fargate | — |

### Cost Optimization: VPC Endpoints
Save NAT Gateway data costs ($0.045/GB) with Interface Endpoints:
- `com.amazonaws.ap-south-1.s3` (Gateway — free)
- `com.amazonaws.ap-south-1.ecr.api`
- `com.amazonaws.ap-south-1.ecr.dkr`
- `com.amazonaws.ap-south-1.secretsmanager`
- `com.amazonaws.ap-south-1.logs`

---

## 4. Database — Aurora Serverless v2 (Auto-Scaling PostgreSQL)

**Why Aurora Serverless v2 over fixed RDS:**
- **Auto-scales compute** from 0.5 ACU → 128 ACU per instance (no manual resizing)
- **Same PostgreSQL 16** — zero code changes, same queries, same schema
- **One cluster, two databases** — share the engine, isolate data (saves ~$43/mo vs two clusters)
- **Multi-AZ built-in** — instant failover, no data loss
- **Pay-per-ACU** — 0.5 ACU (~$43/mo) at 10 users, scales to 128 ACU at 1M+ users

> 1 ACU = ~2 GB RAM, ~1 vCPU equivalent

### Cluster Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Engine | Aurora PostgreSQL 16 (Serverless v2) | Same as your Docker PostgreSQL |
| **Min ACU** | **0.5** | Absolute minimum cost at idle |
| **Max ACU** | **64** (increase to 128 when needed) | Handles millions of queries/day |
| Multi-AZ | **Yes** (auto) | Zero-downtime failover |
| Read Replicas | **0** initially, add via console when needed | Replicas also auto-scale ACU |
| Backup | 7-day automated + manual pre-deploy | Point-in-time recovery |
| Encryption | AES-256 (KMS) | At-rest encryption |
| SSL | **Required** (`rds.force_ssl = 1`) | In-transit encryption |
| Delete Protection | **Enabled** | Prevent accidental deletion |

### Two Databases, One Cluster

```sql
-- Both databases live in the same Aurora cluster (one bill)
CREATE DATABASE core_db;      -- providers, users, bookings, locations
CREATE DATABASE payments_db;  -- ledger, payment intents (append-only)
```

- **Saves ~$43/mo** vs running two separate clusters
- Each database has its own credentials in Secrets Manager
- payments_db uses a restricted IAM role (payment-service only)

### Cost at Different Scales

| Users | Aurora ACU | Est. Monthly Cost |
|-------|-----------|-------------------|
| 10 | 0.5 ACU | **$43** |
| 1,000 | 1-2 ACU | **$87-174** |
| 100,000 | 8-16 ACU | **$700-1,400** |
| 1,000,000+ | 32-64 ACU + read replicas | **$2,800-5,600** |

### Read Replicas (Add When Needed — No Downtime)

When read traffic grows (>100K users), add Aurora read replicas:
- Each replica also auto-scales ACU independently
- core-api read queries (provider lists, search) → replica
- Write queries (bookings, payments) → writer instance
- **Zero code changes** — use Aurora Reader endpoint in DATABASE_URL_READ env var

---

## 5. Caching — ElastiCache Serverless (Redis)

**Why Serverless over fixed nodes:**
- **Auto-scales** compute (ECPU) and memory with demand
- **No capacity planning** — handles 10 or 10M requests/sec
- **Pay-per-use** — ECPU consumed + data stored
- Same Redis 7.x API — zero code changes

| Setting | Value |
|---------|-------|
| Engine | Redis 7.x (OSS) — ElastiCache Serverless |
| Auth | Redis AUTH token via Secrets Manager |
| Encryption | In-transit (TLS) + At-rest (KMS) |
| VPC | Private subnets only |

### Cache Strategy (same as now)
```
AI recommendations    → TTL: 5 min   (already implemented)
City/area lists       → TTL: 1 hour  (rarely changes)
Provider details      → TTL: 5 min   (likes_count updates)
Session tokens        → TTL: 24 hrs
SSE pub/sub channels  → No TTL (real-time events)
```

### Cost at Different Scales

| Users | Data Stored | Est. Monthly Cost |
|-------|------------|-------------------|
| 10 | < 100 MB | **~$7** (ECPU-based minimum) |
| 1,000 | < 500 MB | **~$15** |
| 100,000 | 1-5 GB | **~$90-200** |
| 1,000,000+ | 10-50 GB | **~$400-1,000** |

> **ElastiCache Serverless** has no fixed minimum charge — you pay only for ECPU consumed and data stored. At 10 users, cache is barely used.

---

## 6. Search — Amazon OpenSearch Serverless

**Why Serverless over Managed:**
- Auto-scales OCU (OpenSearch Compute Units) based on query load
- No capacity planning — pay for actual usage
- Minimum cost when idle

| Setting | Value |
|---------|-------|
| Collection type | Search |
| Index | `providers` (existing mapping) |
| Encryption | KMS-managed |
| Access | VPC endpoint (sg-search) |
| Indexing OCU | 2 (min) → 10 (max) |
| Search OCU | 2 (min) → 20 (max) |

### Cost
- ~$350/mo minimum (2+2 OCU × $0.24/hr)
- Scales automatically during peak search traffic
- Alternative: Use managed domain (t3.small.search) at **~$40/mo** for early stage, migrate to Serverless at scale

**Recommendation:** Start with **managed domain (t3.medium.search × 2 AZ)** at ~$80/mo, switch to Serverless when index size > 10GB or queries > 500/min.

---

## 7. Event Streaming — Amazon MSK Serverless

**Why MSK Serverless:**
- No broker management
- Auto-scales throughput
- Pay only for data in/out
- Compatible with existing kafkajs/kafka-python clients

| Setting | Value |
|---------|-------|
| Cluster | MSK Serverless |
| Topics | 8 (as per event contracts) |
| Auth | IAM (no credentials to manage) |
| Encryption | TLS in-transit, KMS at-rest |
| VPC | Private subnets only |

### Cost
- $0.10/hr cluster + $0.10/GB data
- At 1M users: ~$50-100/mo (events are small JSON payloads)

---

## 8. CDN & Static Hosting — CloudFront + S3

### Distribution 1: Web App (`app.pureapp.io`)

| Setting | Value |
|---------|-------|
| Origin | S3 bucket (`pure-app-web`) |
| SSL | ACM certificate (*.pureapp.io) |
| Cache Policy | CachingOptimized (TTL 24hr) |
| Viewer Protocol | HTTPS only |
| Price Class | **PriceClass_200** (excludes expensive regions) |
| Compression | Gzip + Brotli |

### Distribution 2: API (`api.pureapp.io`)

| Setting | Value |
|---------|-------|
| Origin | ALB |
| Cache Policy | CachingDisabled (API passthrough) |
| Origin Request | AllViewer (forward all headers) |
| WAF | Attached |

### Distribution 3: Media (`media.pureapp.io`)

| Setting | Value |
|---------|-------|
| Origin | S3 bucket (`pure-app-uploads`) |
| Cache Policy | CachingOptimized (TTL 7 days) |
| Signed URLs | Yes (private user content) |
| Image Optimization | Lambda@Edge for resize on-the-fly |

### S3 Buckets

| Bucket | Purpose | Lifecycle |
|--------|---------|-----------|
| `pure-app-web` | Expo static build | Versioned, old versions expire 30d |
| `pure-app-uploads` | Avatars, provider images | S3 Intelligent-Tiering |
| `pure-app-ml-models` | AI model artifacts | Versioned |
| `pure-app-backups` | DB exports, logs | Glacier after 90d |

---

## 9. Security — Defense in Depth

### Layer 1: Edge (WAF + CloudFront)

```
AWS WAF Rules:
├── AWS Managed Rules
│   ├── AWSManagedRulesCommonRuleSet (OWASP Top 10)
│   ├── AWSManagedRulesSQLiRuleSet (SQL injection)
│   ├── AWSManagedRulesKnownBadInputsRuleSet
│   └── AWSManagedRulesBotControlRuleSet
├── Rate Limiting
│   ├── 2000 req/5min per IP (general)
│   ├── 50 req/5min per IP on /auth/* (brute force)
│   └── 10 req/5min per IP on /payments/* (abuse)
├── Geo-Restriction
│   └── Allow: IN (India) — block all others initially
└── Custom Rules
    └── Block requests with suspicious headers/payload sizes
```

### Layer 2: Network
- All services in **private subnets** — no public IPs
- **NAT Gateway** for outbound (Firebase, Stripe calls)
- **Security Groups** — micro-segmented (see §3)
- **NACLs** — stateless firewall on subnets

### Layer 3: Application
- **Firebase Auth** — ID token verification on every request
- **JWT validation** in core-api middleware (already implemented)
- **CORS** — allow only `app.pureapp.io` and mobile app origins
- **Helmet** headers via Fastify (CSP, HSTS, X-Frame-Options)
- **Input validation** — Fastify JSON schema on all routes
- **Body size limit** — 10 MB (already set)

### Layer 4: Data
- **RDS encryption** — AES-256 at rest (KMS)
- **SSL/TLS enforced** on all DB connections
- **Redis AUTH** + TLS
- **S3 SSE-S3** default encryption
- **No raw card data** — only processor tokens stored
- **Append-only ledger** — UPDATE/DELETE blocked at DB level

### Layer 5: Secrets & IAM
- **AWS Secrets Manager** for all credentials:
  - `pure/core-api/db` — DATABASE_URL_CORE
  - `pure/payments/db` — DATABASE_URL_PAYMENTS
  - `pure/redis` — REDIS_URL
  - `pure/firebase` — FIREBASE_SERVICE_ACCOUNT_BASE64
  - `pure/opensearch` — OPENSEARCH credentials
- **IAM Roles** (no access keys):
  - `ecsTaskRole-core-api` — S3, Secrets Manager, MSK
  - `ecsTaskRole-payment` — Secrets Manager only (isolated)
  - `ecsTaskRole-ai` — S3 (models), Secrets Manager, MSK
  - `ecsTaskRole-search` — Secrets Manager only
- **Least-privilege** policies per service
- **MFA required** for AWS Console access

### Layer 6: Monitoring & Audit
- **CloudTrail** — all API calls logged
- **VPC Flow Logs** → S3 (analyze with Athena)
- **GuardDuty** — threat detection
- **Config Rules** — compliance checks

---

## 10. CI/CD Pipeline — GitHub Actions + ECR + ECS

```
Push to main
    │
    ▼
GitHub Actions
    ├── Run tests (unit + integration)
    ├── Build Docker images (4 services)
    ├── Push to ECR (tagged with git SHA)
    ├── Run DB migrations (RDS)
    ├── Update ECS task definitions
    └── Rolling deployment (zero downtime)
         ├── core-api: min 50% healthy
         ├── payment-service: min 50% healthy
         ├── search-service: min 50% healthy
         └── ai-service: min 50% healthy
```

### Blue/Green Deployment (for payment-service)
- Financial service gets **CodeDeploy Blue/Green** for instant rollback
- Traffic shifts: 10% → 50% → 100% over 10 minutes
- Auto-rollback on CloudWatch alarm (5xx > 1%)

---

## 11. Observability

### CloudWatch

| Resource | Metrics | Alarms |
|----------|---------|--------|
| ECS Tasks | CPU, Memory, Running count | CPU > 80% for 5 min |
| ALB | 5xx count, latency p99 | 5xx > 10/min, p99 > 2s |
| RDS | CPU, connections, IOPS, replication lag | CPU > 75%, connections > 80% |
| ElastiCache | Memory, evictions, connections | Memory > 80%, evictions > 0 |
| MSK | Messages in, consumer lag | Consumer lag > 1000 |

### Application Logging
```
ECS Tasks → CloudWatch Logs (awslogs driver)
  ├── /ecs/pure/core-api
  ├── /ecs/pure/search-service
  ├── /ecs/pure/payment-service
  └── /ecs/pure/ai-service

Log retention: 30 days (archive to S3 after)
```

### Distributed Tracing
- **AWS X-Ray** — trace requests across all 4 services
- Trace Kafka events end-to-end
- Identify bottlenecks in booking flow

---

## 12. Cost Estimate — Sliding Scale (Auto)

> **No phases to manage.** The same infrastructure auto-adjusts cost with your traffic.

### Phase 0: Bootstrap (0-100 users) ← YOU ARE HERE

Same EC2 docker-compose from §0 above: **~$18-35/mo**
When any upgrade trigger hits (§0), migrate to the elastic architecture below.

### Elastic Architecture Cost — Scales Automatically

| Resource | 10 Users | 1K Users | 100K Users | 1M+ Users |
|----------|---------|---------|-----------|----------|
| **ECS Fargate** (4 services) | $29 (1 task each) | $45 (1-2 tasks) | $200 (5-15 tasks) | $800 (30-50 tasks) |
| **Aurora Serverless v2** | $43 (0.5 ACU) | $87 (1 ACU) | $700 (8 ACU) | $2,800 (32 ACU + replicas) |
| **ElastiCache Serverless** | $7 | $15 | $100 | $400 |
| **OpenSearch** | $40 (t3.small managed) | $40 | $350 (Serverless) | $700 (Serverless high OCU) |
| **MSK Serverless** | $50 | $55 | $100 | $300 |
| **ALB** | $16 | $18 | $40 | $80 |
| **NAT Gateway** (1 AZ) | $32 | $35 | $65 (2 AZ) | $100 (3 AZ) |
| **CloudFront + S3** | $1 | $5 | $50 | $400 |
| **WAF** | $25 | $25 | $35 | $50 |
| **Route 53 + ACM** | $1 | $1 | $1 | $5 |
| **Secrets + Logs** | $15 | $20 | $40 | $80 |
| | | | | |
| **TOTAL** | **~$259/mo** | **~$346/mo** | **~$1,681/mo** | **~$5,715/mo** |

### Cost Per User (decreases as you scale)

| Users | Monthly Cost | Cost Per User |
|-------|-------------|---------------|
| 10 | ~$259 | $25.90 |
| 100 | ~$270 | $2.70 |
| 1,000 | ~$346 | $0.35 |
| 10,000 | ~$600 | $0.06 |
| 100,000 | ~$1,681 | $0.017 |
| 1,000,000 | ~$5,715 | $0.006 |

> **Economics:** Once you have 1,000+ users paying even ₹50/mo each, revenue (~$600/mo) covers infrastructure.
> At 10,000 users at ₹200/mo, revenue (~$24,000/mo) dwarfs infra costs.

### Phase 0 → Elastic Migration (Zero Downtime)

The migration is **NOT** an architectural change — it's just swapping environment variables:

```bash
# Phase 0 (EC2 docker-compose)
DATABASE_URL=postgresql://core:pass@localhost:5432/core_db
REDIS_URL=redis://localhost:6379

# Elastic Architecture (managed services)
DATABASE_URL=postgresql://core:pass@pure-cluster.cluster-xxx.ap-south-1.rds.amazonaws.com:5432/core_db
REDIS_URL=rediss://pure-cache-xxx.serverless.aps1.cache.amazonaws.com:6379
```

Same Docker images. Same code. Just different connection strings.

---

## 13. Cost Optimization Playbook

| Strategy | Savings | When |
|----------|---------|------|
| **Graviton (ARM) Fargate** | 20-30% | Day 1 — all services run on Alpine/musl |
| **Fargate Spot** for ai/search | 70% on compute | Day 1 — non-critical services |
| **Aurora Serverless v2 min ACU** | Keep at 0.5 | Day 1 — auto-scales up only when needed |
| **Single Aurora cluster** | ~$43/mo | Day 1 — core_db + payments_db in one cluster |
| **S3 Intelligent-Tiering** | Auto-optimize | Day 1 |
| **CloudFront Price Class 200** | Skip expensive regions | Day 1 |
| **Single NAT Gateway** (1 AZ) | $65/mo saved | Until you need multi-AZ HA |
| **VPC Endpoints** | Reduce NAT data costs 60% | Day 1 — free for S3, cheap for ECR/Secrets |
| **Fargate Savings Plans** | 20% commit | After 6 months of usage data |
| **OpenSearch: start managed** | ~$310/mo saved | Use t3.small.search, switch to Serverless at >10K providers |
| **Right-sizing** (monthly review) | 10-30% | Ongoing — use Compute Optimizer |

---

## 14. Deployment Order

```
Week 1: Foundation
  ├── VPC, subnets, security groups, NAT (1 AZ)
  ├── VPC Endpoints (S3, ECR, Secrets Manager, CloudWatch)
  ├── ECR repos (4 services)
  ├── Secrets Manager secrets
  ├── S3 buckets
  └── Route 53 hosted zone + ACM certificates

Week 2: Data Layer
  ├── Aurora Serverless v2 cluster (0.5 min ACU)
  │   ├── CREATE DATABASE core_db   (run schema.sql + migrations)
  │   └── CREATE DATABASE payments_db (Rust service auto-migrates)
  ├── ElastiCache Serverless (Redis)
  ├── OpenSearch managed domain (t3.small.search)
  └── MSK Serverless cluster

Week 3: Compute & Networking
  ├── ALB + target groups (4 services)
  ├── ECS cluster (Fargate)
  ├── Task definitions (4 services, min 1 task each)
  ├── ECS services with auto-scaling policies
  ├── WAF rules on ALB
  └── Verify auto-scaling works (load test)

Week 4: Edge & Monitoring
  ├── CloudFront distributions (web, API, media)
  ├── Expo static build → S3
  ├── CloudWatch dashboards + alarms
  ├── CI/CD pipeline (GitHub Actions → ECR → ECS)
  └── Smoke tests + DNS cutover
```

---

## 15. Disaster Recovery

| Component | RPO | RTO | Strategy |
|-----------|-----|-----|----------|
| Aurora Serverless v2 | 5 min | < 30s | Multi-AZ auto-failover (built-in) |
| ElastiCache Serverless | 0 (replicated) | < 1 min | Multi-AZ automatic |
| OpenSearch | Near-zero | Minutes | Multi-AZ by default |
| ECS Fargate | N/A | < 2 min | Auto-restart + auto-scale |
| MSK Serverless | 0 | 0 | Replicated across AZs |
| S3 | 0 | 0 | 11 nines durability |
| Kafka (MSK) | 0 | Minutes | Multi-AZ replication |

### Cross-Region DR (future)
- RDS cross-region read replica in `ap-southeast-1` (Singapore)
- S3 cross-region replication for uploads
- Route 53 health-check failover
