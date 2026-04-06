from __future__ import annotations

from typing import Any

import numpy as np


class Recommender:
    """
    Lightweight collaborative-filtering recommender using cosine similarity over
    pre-trained SVD embeddings.

    In production:
    - Load user/item embeddings from object storage (S3/GCS) on startup.
    - Re-load on a schedule or via a /reload endpoint after each training job.
    - Replace scikit-learn SVD with a torch.jit or ONNX model for GPU inference.
    """

    MODEL_VERSION = "0.1.0-baseline"

    def __init__(self) -> None:
        # Populated by load_model() or an external training pipeline
        self._user_embeddings: dict[str, np.ndarray] = {}
        self._item_embeddings: np.ndarray | None = None
        self._item_ids: list[str] = []
        self._event_buffer: list[dict[str, Any]] = []

    # ── Public API ────────────────────────────────────────────────────────────

    def get_recommendations(
        self,
        user_id: str,
        context: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        """Return ranked item recommendations for a user."""
        if self._item_embeddings is None or user_id not in self._user_embeddings:
            return self._trending_fallback(limit)

        user_vec = self._user_embeddings[user_id]
        scores = self._item_embeddings @ user_vec  # cosine similarity (assumes unit vectors)
        top_indices = np.argsort(scores)[::-1][:limit]

        return [
            {"item_id": self._item_ids[i], "score": float(scores[i])}
            for i in top_indices
        ]

    def get_similar_items(self, item_id: str, limit: int) -> list[dict[str, Any]]:
        """Return items similar to the given item using embedding proximity."""
        if self._item_embeddings is None or item_id not in self._item_ids:
            return []

        idx = self._item_ids.index(item_id)
        item_vec = self._item_embeddings[idx]
        scores = self._item_embeddings @ item_vec
        scores[idx] = -1.0  # exclude self

        top_indices = np.argsort(scores)[::-1][:limit]
        return [
            {"item_id": self._item_ids[i], "score": float(scores[i])}
            for i in top_indices
        ]

    def ingest_event(self, event: dict[str, Any]) -> None:
        """Buffer an incoming domain event for periodic retraining."""
        self._event_buffer.append(event)
        if len(self._event_buffer) >= 10_000:
            self._trigger_retrain()

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _trending_fallback(self, limit: int) -> list[dict[str, Any]]:
        """Cold-start fallback: return placeholder trending items."""
        return [
            {"item_id": f"trending_{i}", "score": round(1.0 - i * 0.05, 2)}
            for i in range(limit)
        ]

    def _trigger_retrain(self) -> None:
        """
        In production, enqueue an async training job (e.g., submit a SageMaker job,
        Vertex AI custom job, or publish a `model.retrain.requested` Kafka event).
        """
        self._event_buffer.clear()
