import json
import os

import redis.asyncio as aioredis
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from recommender import Recommender

load_dotenv()  # loads .env when present; no-op in production where env vars are injected

# Validate required environment variables at startup.
_REQUIRED_VARS = ["REDIS_URL"]
for _var in _REQUIRED_VARS:
    if not os.environ.get(_var):
        raise SystemExit(f"[startup] Required environment variable '{_var}' is not set.")

app = FastAPI(title="AI Recommendation Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

recommender = Recommender()

_redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            os.environ["REDIS_URL"],
            decode_responses=True,
        )
    return _redis_client


# ── Request / Response models ─────────────────────────────────────────────────

class RecommendationRequest(BaseModel):
    user_id: str
    context: str = Field(default="home", pattern="^(home|pdp|cart|search|tv_home)$")
    limit:   int = Field(default=10, ge=1, le=50)


class SimilarItemsRequest(BaseModel):
    item_id: str
    limit:   int = Field(default=8, ge=1, le=50)


class IngestEventRequest(BaseModel):
    event_type: str
    data:       dict


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/v1/recommendations")
async def get_recommendations(req: RecommendationRequest):
    redis = await get_redis()
    cache_key = f"rec:{req.user_id}:{req.context}:{req.limit}"

    cached = await redis.get(cache_key)
    if cached:
        return {"user_id": req.user_id, "items": json.loads(cached), "cached": True}

    items = recommender.get_recommendations(
        user_id=req.user_id,
        context=req.context,
        limit=req.limit,
    )

    # Cache for 5 minutes
    await redis.setex(cache_key, 300, json.dumps(items))

    return {"user_id": req.user_id, "items": items, "cached": False}


@app.post("/v1/similar")
async def get_similar_items(req: SimilarItemsRequest):
    items = recommender.get_similar_items(item_id=req.item_id, limit=req.limit)
    return {"item_id": req.item_id, "similar_items": items}


@app.post("/v1/features/ingest", status_code=202)
async def ingest_event(req: IngestEventRequest):
    recommender.ingest_event({"event_type": req.event_type, **req.data})
    return {"status": "accepted"}
