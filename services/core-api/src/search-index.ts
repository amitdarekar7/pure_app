/**
 * search-index.ts
 *
 * Thin helper to push provider+service documents into the search service
 * (OpenSearch `providers` index) via its REST API.
 *
 * Each document in the index has the ID = `${service_id}` (unique per service
 * of a provider) so upserts are idempotent and updates simply overwrite.
 */

const SEARCH_URL = process.env.SEARCH_SERVICE_URL ?? 'http://search-service:3001'

export interface ProviderDoc {
  provider_id:   string
  provider_name: string
  service_id:    string
  service_title: string
  category_slug: string
  address:       string | null
  city_name:     string
  area_name:     string | null
  price_paise:   number
  duration_mins: number
  likes_count:   number
  status:        string
  updated_at:    string
  discount_pct?:          number
  discounted_price_paise?: number
  is_featured?:  boolean
  is_boosted?:   boolean
}

/**
 * Upsert a single provider-service document into the search index.
 * Fire-and-forget: failures are only logged so they never break the main flow.
 */
export async function indexProviderService(doc: ProviderDoc): Promise<void> {
  try {
    const res = await fetch(`${SEARCH_URL}/v1/index`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: doc.service_id, document: doc }),
      signal:  AbortSignal.timeout(4_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[search-index] index failed for service ${doc.service_id}: HTTP ${res.status} ${text}`)
    }
  } catch (err) {
    console.warn(`[search-index] index error for service ${doc.service_id}:`, (err as Error).message)
  }
}

/**
 * Remove a provider-service document from the search index when the service
 * is deleted or marked unavailable.
 */
export async function removeFromIndex(serviceId: string): Promise<void> {
  try {
    const res = await fetch(`${SEARCH_URL}/v1/index/${encodeURIComponent(serviceId)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(4_000),
    })
    if (!res.ok && res.status !== 404) {
      console.warn(`[search-index] delete failed for service ${serviceId}: HTTP ${res.status}`)
    }
  } catch (err) {
    console.warn(`[search-index] delete error for service ${serviceId}:`, (err as Error).message)
  }
}
