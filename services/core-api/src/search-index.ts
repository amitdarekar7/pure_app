/**
 * search-index.ts
 *
 * Refreshes the `provider_search` materialized view in PostgreSQL.
 * Called after provider/service mutations so search results stay current.
 *
 * Uses REFRESH MATERIALIZED VIEW CONCURRENTLY — this requires the unique
 * index on service_id and does NOT lock reads while refreshing.
 */

import { Pool } from 'pg'

// Singleton pool reference — set once by init()
let _pool: Pool | null = null

export function initSearchIndex(pool: Pool) {
  _pool = pool
}

// Debounce: coalesce rapid mutations into a single refresh.
let _timer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 2_000 // wait 2 s after last mutation before refreshing

/**
 * Schedule a refresh of the search materialized view.
 * Fire-and-forget: failures are only logged so they never break the main flow.
 */
export function refreshSearchIndex(): void {
  if (!_pool) return
  if (_timer) clearTimeout(_timer)
  _timer = setTimeout(async () => {
    try {
      await _pool!.query('REFRESH MATERIALIZED VIEW CONCURRENTLY provider_search')
    } catch (err) {
      console.warn('[search-index] refresh failed:', (err as Error).message)
    }
  }, DEBOUNCE_MS)
}

// ── Backward-compatible aliases so callers need minimal changes ─────────────

/** @deprecated — kept for call-site compat; just triggers a view refresh */
export interface ProviderDoc {
  provider_id:   string
  [key: string]: unknown
}

export function indexProviderService(_doc: ProviderDoc): void {
  refreshSearchIndex()
}

export function removeFromIndex(_serviceId: string): void {
  refreshSearchIndex()
}
