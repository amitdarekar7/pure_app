/**
 * Centralised API client.
 * - Typed wrappers for every backend endpoint
 * - Firebase ID tokens for authentication (auto-refreshed by Firebase SDK)
 */
import { Platform } from 'react-native'
import { firebaseAuth } from './firebase'

/**
 * On Android emulators, `localhost` resolves to the emulator itself — not the
 * host machine. `10.0.2.2` is the standard loopback alias to reach the host.
 * iOS simulators and web share the host's network, so `localhost` works fine.
 * For physical devices set EXPO_PUBLIC_*_URL in .env.local to your LAN IP.
 */
function localUrl(envVal: string | undefined, port: number): string {
  if (envVal) return envVal
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost'
  return `http://${host}:${port}`
}

const CORE    = localUrl(process.env.EXPO_PUBLIC_API_URL,    3000)
const SEARCH  = localUrl(process.env.EXPO_PUBLIC_SEARCH_URL, 3001)
const PAYMENT = localUrl(process.env.EXPO_PUBLIC_PAY_URL,    3002)
const AI      = localUrl(process.env.EXPO_PUBLIC_AI_URL,     3003)

/** Build the full SSE URL for /v1/events/stream with auth token + role */
export function buildEventStreamUrl(token: string, role: 'user' | 'provider'): string {
  return `${CORE}/v1/events/stream?token=${encodeURIComponent(token)}&role=${role}`
}

// ─── Auth API ─────────────────────────────────────────────────────────────────
export const AuthAPI = {
  // Called after Firebase registration to provision the user record in our DB
  sync: (p: { displayName?: string }) =>
    _auth<{ userId: string }>('POST', `${CORE}/v1/auth/sync`, p),
}

// ─── Public Auth API (no token required) ──────────────────────────────────────
export const PublicAuthAPI = {
  // Look up masked email by phone number — for "Forgot Email" flow
  lookupEmail: (phone: string) =>
    _post<{ maskedEmail: string }>(`${CORE}/v1/auth/lookup-email`, { phone }),
}

// ─── Users API (authenticated) ────────────────────────────────────────────────
export const UsersAPI = {
  me:       ()                              => _auth<User>('GET',   `${CORE}/v1/users/me`),
  updateMe: (p: Partial<UpdatePayload>)     => _auth<void>('PATCH', `${CORE}/v1/users/me`, p),
  devices:  ()                              => _auth<{ devices: Device[] }>('GET', `${CORE}/v1/users/me/devices`),
}

// ─── Search API ───────────────────────────────────────────────────────────────
export const SearchAPI = {
  query: (q: string) => _get<SearchResponse>(`${SEARCH}/v1/search?q=${encodeURIComponent(q)}`),
}

// ─── Payment API ──────────────────────────────────────────────────────────────
export const PaymentAPI = {
  createIntent: (p: CreateIntentPayload) =>
    _post<PaymentIntent>(`${PAYMENT}/v1/payments/intent`, p),
}
// ─── Location API (public — no token required) ────────────────────────────────
export const LocationAPI = {
  cities: () =>
    _get<{ cities: City[] }>(`${CORE}/v1/locations/cities`),
  areas: (cityId: string) =>
    _get<{ areas: Area[] }>(`${CORE}/v1/locations/cities/${encodeURIComponent(cityId)}/areas`),
}

// ─── Providers API ────────────────────────────────────────────────────────────
export const ProvidersAPI = {
  list: (cityId: string, category: string) =>
    _authOrGet<{ providers: Provider[] }>(
      `${CORE}/v1/providers?cityId=${encodeURIComponent(cityId)}&category=${encodeURIComponent(category)}`,
    ),
  get: (id: string, serviceId?: string) =>
    _authOrGet<{ provider: ProviderDetail }>(
      `${CORE}/v1/providers/${encodeURIComponent(id)}${serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : ''}`,
    ),
  like: (id: string) =>
    _auth<{ likes_count: number }>('POST', `${CORE}/v1/providers/${encodeURIComponent(id)}/like`, {}),
  unlike: (id: string) =>
    _auth<{ likes_count: number }>('POST', `${CORE}/v1/providers/${encodeURIComponent(id)}/unlike`, {}),
}

// ─── Bookings API ─────────────────────────────────────────────────────────────
export const BookingsAPI = {
  create: (p: { providerServiceId: string; scheduledAt: string; notes?: string }) =>
    _auth<{ booking: Booking }>('POST', `${CORE}/v1/bookings`, p),
  my: () =>
    _auth<{ bookings: BookingSummary[] }>('GET', `${CORE}/v1/bookings/my`),
}

// ─── Provider Portal API (provider-authenticated) ────────────────────────────
export const ProviderPortalAPI = {
  register: (p: {
    providerName: string
    address?:     string
    cityId:       string
    phone?:       string
    displayName?: string
  }) => _auth<{ userId: string; providerId: string }>('POST', `${CORE}/v1/provider/register`, p),

  me: () =>
    _auth<{ provider: ProviderProfile; services: ProviderService[]; stats: ProviderStats }>(
      'GET', `${CORE}/v1/provider/me`,
    ),

  bookings: (status?: string) =>
    _auth<{ bookings: ProviderBooking[] }>(
      'GET',
      `${CORE}/v1/provider/bookings${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),

  updateBooking: (id: string, action: 'confirm' | 'reject' | 'reschedule', scheduledAt?: string) =>
    _auth<{ booking: Booking }>('PATCH', `${CORE}/v1/provider/bookings/${encodeURIComponent(id)}`, {
      action,
      scheduledAt,
    }),

  availability: () =>
    _auth<{ availability: AvailabilitySlot[] }>('GET', `${CORE}/v1/provider/availability`),

  setAvailability: (schedule: AvailabilitySlot[]) =>
    _auth<{ ok: boolean }>('PUT', `${CORE}/v1/provider/availability`, { schedule }),

  getServiceImages: (serviceId: string) =>
    _auth<{ images: ServiceImage[] }>(
      'GET',
      `${CORE}/v1/provider/services/${encodeURIComponent(serviceId)}/images`,
    ),

  addServiceImage: (serviceId: string, imageUrl: string, sortOrder?: number) =>
    _auth<{ image: ServiceImage }>(
      'POST',
      `${CORE}/v1/provider/services/${encodeURIComponent(serviceId)}/images`,
      { imageUrl, sortOrder },
    ),

  deleteServiceImage: (serviceId: string, imageId: string) =>
    _auth<{ ok: boolean }>(
      'DELETE',
      `${CORE}/v1/provider/services/${encodeURIComponent(serviceId)}/images/${encodeURIComponent(imageId)}`,
    ),

  toggleService: (serviceId: string, isAvailable: boolean) =>
    _auth<{ ok: boolean }>(
      'PATCH',
      `${CORE}/v1/provider/services/${encodeURIComponent(serviceId)}`,
      { isAvailable },
    ),

  createService: (p: { categorySlug: string; title: string; pricePaise: number; durationMins: number }) =>
    _auth<{ service: ProviderService }>(
      'POST',
      `${CORE}/v1/provider/services`,
      p,
    ),
}

// ─── AI API ───────────────────────────────────────────────────────────────────
export const AIAPI = {
  recommendations: (userId: string, context = 'home', limit = 10) =>
    _post<{ items: RecommendedItem[] }>(`${AI}/v1/recommendations`, { user_id: userId, context, limit }),
  similar: (itemId: string, limit = 5) =>
    _post<{ items: RecommendedItem[] }>(`${AI}/v1/similar`, { item_id: itemId, limit }),
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface User {
  id:           string
  email:        string
  display_name: string | null
  bio:          string | null
  locale:       string
  timezone:     string | null
  status:       string
  created_at:   string
}

export interface UpdatePayload {
  displayName: string
  bio:         string
  locale:      string
  timezone:    string
}

export interface Device {
  id:         string
  name:       string | null
  created_at: string
}

export interface SearchHit {
  _id:     string
  _score:  number
  _source: {
    title?:       string
    description?: string
    price_cents?: number
    tags?:        string[]
    category?:    string
  }
  highlight?: { title?: string[]; description?: string[] }
}

export interface SearchResponse {
  hits: { hits: SearchHit[]; total: { value: number } }
}

export interface RecommendedItem {
  item_id: string
  score:   number
}

export interface CreateIntentPayload {
  user_id:         string
  amount_cents:    number
  currency:        string
  idempotency_key: string
}

export interface PaymentIntent {
  payment_intent_id: string
  status:            string
  amount_cents:      number
  currency:          string
}

export interface City {
  id:       string
  name:     string
  state:    string
  is_rural: boolean
}

export interface Area {
  id:       string
  city_id:  string
  name:     string
  pincode:  string | null
}

export interface Provider {
  id:            string
  name:          string
  address:       string | null
  area_name:     string | null
  service_id:    string
  service_title: string
  price_paise:   number
  duration_mins: number
  likes_count:   number
  is_liked:      boolean
}

export interface ProviderDetail extends Provider {
  phone:         string | null
  city_name:     string | null
  category_slug: string
}

export interface Booking {
  id:           string
  status:       string
  scheduled_at: string
}

export interface BookingSummary {
  id:            string
  provider_name: string
  service_title: string
  scheduled_at:  string
  status:        string
  price_paise:   number
}

export interface ProviderProfile {
  id:      string
  name:    string
  address: string | null
  phone:   string | null
  status:  string
}

export interface ProviderService {
  id:            string
  category_slug: string
  title:         string
  price_paise:   number
  duration_mins: number
  is_available:  boolean
}

export interface ProviderStats {
  pending:   string
  confirmed: string
  today:     string
}

export interface ProviderBooking {
  id:            string
  user_name:     string | null
  user_email:    string
  user_phone:    string | null
  service_title: string
  scheduled_at:  string
  status:        string
  price_paise:   number
  notes:         string | null
  created_at:    string
}

export interface AvailabilitySlot {
  dayOfWeek:  number
  openTime:   string
  closeTime:  string
  isClosed:   boolean
}

export interface ServiceImage {
  id:         string
  image_url:  string
  sort_order: number
  created_at: string
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function getIdToken(forceRefresh = false): Promise<string> {
  const user = firebaseAuth.currentUser
  if (!user) throw Object.assign(new Error('Not authenticated'), { status: 401 })
  return user.getIdToken(forceRefresh)
}

function makeHeaders(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

async function _get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw await _apiError(res)
  return res.json() as Promise<T>
}

/**
 * GET with optional auth. Sends the Firebase token if the user is logged in,
 * falls back to an unauthenticated request if not. The server returns is_liked
 * per row when a token is present.
 */
async function _authOrGet<T>(url: string): Promise<T> {
  let token: string | null = null
  try { token = await getIdToken() } catch { /* not logged in */ }
  const res = await fetch(url, { headers: makeHeaders(token) })
  if (!res.ok) throw await _apiError(res)
  return res.json() as Promise<T>
}

async function _post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method:  'POST',
    headers: makeHeaders(),
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw await _apiError(res)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** Authenticated fetch. Firebase auto-manages token refresh; force-refresh on 401. */
async function _auth<T>(method: string, url: string, body?: unknown): Promise<T> {
  const doFetch = (token: string) =>
    fetch(url, {
      method,
      headers: makeHeaders(token),
      body:    body != null ? JSON.stringify(body) : undefined,
    })

  let res = await doFetch(await getIdToken())

  if (res.status === 401) {
    // Token may have just expired; force a refresh and retry once
    res = await doFetch(await getIdToken(true))
  }

  if (!res.ok) throw await _apiError(res)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function _apiError(res: Response): Promise<Error & { status: number }> {
  try {
    const b = await res.json() as { error?: string; message?: string }
    return Object.assign(new Error(b.error ?? b.message ?? res.statusText), { status: res.status })
  } catch {
    return Object.assign(new Error(res.statusText), { status: res.status })
  }
}
