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
  deleteMe: ()                              => _auth<{ ok: boolean; message: string }>('DELETE', `${CORE}/v1/users/me`),
  devices:  ()                              => _auth<{ devices: Device[] }>('GET', `${CORE}/v1/users/me/devices`),
  registerPushToken: (token: string, platform: string) =>
    _auth<void>('PUT', `${CORE}/v1/users/me/push-token`, { token, platform }),
}

// ─── Search API (now served by core-api) ──────────────────────────────────────
export const SearchAPI = {
  query: (q: string) => _get<SearchResponse>(`${CORE}/v1/search?q=${encodeURIComponent(q)}`),
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
    _authOrGet<{ provider: ProviderDetail; services: ProviderServiceItem[]; images: ProviderImage[]; availability: ProviderAvailability[] }>(
      `${CORE}/v1/providers/${encodeURIComponent(id)}${serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : ''}`,
    ),
  like: (id: string) =>
    _auth<{ likes_count: number }>('POST', `${CORE}/v1/providers/${encodeURIComponent(id)}/like`, {}),
  unlike: (id: string) =>
    _auth<{ likes_count: number }>('POST', `${CORE}/v1/providers/${encodeURIComponent(id)}/unlike`, {}),
}

// ─── Bookings API ─────────────────────────────────────────────────────────────
export const BookingsAPI = {
  create: (p: {
    providerServiceId: string
    scheduledAt:       string
    notes?:            string
    paymentMode?:      'prepaid' | 'pay_at_venue'
  }) =>
    _auth<{ booking: Booking }>('POST', `${CORE}/v1/bookings`, p),
  my: () =>
    _auth<{ bookings: BookingSummary[] }>('GET', `${CORE}/v1/bookings/my`),
  checkin: (id: string, otp: string) =>
    _auth<{ booking: { id: string; status: string; checked_in_at: string } }>(
      'POST', `${CORE}/v1/bookings/${encodeURIComponent(id)}/checkin`, { otp },
    ),
  cancel: (id: string, reason?: string) =>
    _auth<{ booking: { id: string; status: string; cancelled_by: string; cancellation_fee_paise: number } }>(
      'POST', `${CORE}/v1/bookings/${encodeURIComponent(id)}/cancel`, { reason },
    ),
  complete: (id: string) =>
    _auth<{ booking: { id: string; status: string } }>(
      'POST', `${CORE}/v1/bookings/${encodeURIComponent(id)}/complete`, {},
    ),
  pay: (id: string) =>
    _auth<{
      razorpay_order_id: string
      razorpay_key_id:   string
      amount_paise:      number
      currency:          string
      booking_id:        string
    }>(
      'POST', `${CORE}/v1/bookings/${encodeURIComponent(id)}/pay`, {},
    ),
  verifyPayment: (id: string, body: {
    razorpay_order_id:   string
    razorpay_payment_id: string
    razorpay_signature:  string
  }) =>
    _auth<{ booking: { id: string; payment_status: string; razorpay_payment_id: string } }>(
      'POST', `${CORE}/v1/bookings/${encodeURIComponent(id)}/verify-payment`, body,
    ),
  chooseVenue: (id: string) =>
    _auth<{ booking: { id: string; payment_mode: string } }>(
      'POST', `${CORE}/v1/bookings/${encodeURIComponent(id)}/choose-venue`, {},
    ),
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

  setDiscount: (serviceId: string, discountPct: number) =>
    _auth<{ ok: boolean }>(
      'PATCH',
      `${CORE}/v1/provider/services/${encodeURIComponent(serviceId)}`,
      { discountPct },
    ),

  createService: (p: { categorySlug: string; title: string; pricePaise: number; durationMins: number }) =>
    _auth<{ service: ProviderService }>(
      'POST',
      `${CORE}/v1/provider/services`,
      p,
    ),

  updateProfile: (p: { name?: string; phone?: string; address?: string; profileImageUrl?: string; panNumber?: string; bankAccountNumber?: string; bankIfsc?: string; bankHolderName?: string; aadhaarLast4?: string; gstNumber?: string }) =>
    _auth<{ provider: ProviderProfile }>(
      'PATCH',
      `${CORE}/v1/provider/me`,
      p,
    ),

  deleteMe: () =>
    _auth<{ ok: boolean; message: string }>('DELETE', `${CORE}/v1/provider/me`),

  // ─── Subscription ───
  subscription: () =>
    _auth<{ subscription: SubscriptionStatus }>('GET', `${CORE}/v1/provider/subscription`),

  subscriptionPurchase: (autoRenew: boolean) =>
    _auth<{
      subscription_id: string
      razorpay_order_id: string
      razorpay_key_id: string
      amount_paise: number
      currency: string
    }>('POST', `${CORE}/v1/provider/subscription/purchase`, { autoRenew }),

  subscriptionVerify: (p: {
    subscription_id: string
    razorpay_order_id: string
    razorpay_payment_id: string
    razorpay_signature: string
  }) =>
    _auth<{ ok: boolean; subscription: any }>(
      'POST', `${CORE}/v1/provider/subscription/verify`, p,
    ),

  subscriptionAutoRenew: (autoRenew: boolean) =>
    _auth<{ ok: boolean }>(
      'PATCH', `${CORE}/v1/provider/subscription/auto-renew`, { autoRenew },
    ),
}

// ─── Promotions API ───────────────────────────────────────────────────────────
export const PromotionsAPI = {
  /** List available promotion products (featured, boost) */
  products: () =>
    _get<{ products: PromotionProduct[] }>(`${CORE}/v1/promotions/products`),

  /** Purchase a promotion (provider-authenticated) */
  purchase: (productSlug: string) =>
    _auth<{ promotion: PromotionRecord; payment_intent_id: string }>(
      'POST', `${CORE}/v1/promotions/purchase`, { productSlug },
    ),

  /** Get current provider's promotions (provider-authenticated) */
  my: () =>
    _auth<{ promotions: PromotionRecord[] }>('GET', `${CORE}/v1/promotions/my`),

  /** Get platform config (commission rate, promo prices) */
  config: () =>
    _get<{ config: Record<string, string> }>(`${CORE}/v1/promotions/config`),
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
  phone:        string | null
  display_name: string | null
  avatar_url:   string | null
  bio:          string | null
  address:      string | null
  locale:       string
  timezone:     string | null
  status:       string
  created_at:   string
}

export interface SubscriptionStatus {
  subscriptionRequired: boolean
  hasActiveSubscription: boolean
  graceUntil: string | null
  inGracePeriod: boolean
  isLapsed: boolean
  activeSubscription: {
    id: string
    plan: string
    starts_at: string
    expires_at: string
    auto_renew: boolean
  } | null
  freeDaysRemaining: number
}

export interface UpdatePayload {
  displayName: string
  avatarUrl:   string
  phone:       string
  bio:         string
  address:     string
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
    provider_id?:   string
    provider_name?: string
    service_id?:    string
    service_title?: string
    category_slug?: string
    address?:       string | null
    city_name?:     string
    area_name?:     string | null
    price_paise?:   number
    duration_mins?: number
    likes_count?:   number
    is_featured?:   boolean
    is_boosted?:    boolean
    discount_pct?:          number
    discounted_price_paise?: number
    status?:        string
  }
  highlight?: {
    provider_name?: string[]
    service_title?: string[]
    area_name?:     string[]
  }
}

export interface SearchResponse {
  hits: { hits: SearchHit[]; total: { value: number } }
}

export interface RecommendedItem {
  item_id: string
  score:   number
}

export interface CreateIntentPayload {
  user_id:          string
  amount_cents:     number
  currency:         string
  idempotency_key:  string
  commission_cents?: number
  provider_id?:     string
  intent_type?:     'booking' | 'promotion' | 'subscription'
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
  is_featured:   boolean
  is_boosted:    boolean
  discount_pct:          number
  discounted_price_paise: number | null
}

export interface ProviderDetail extends Provider {
  phone:         string | null
  city_name:     string | null
  category_slug: string
  lat:           number | null
  lng:           number | null
}

export interface ProviderServiceItem {
  id:                     string
  title:                  string
  category_slug:          string
  price_paise:            number
  duration_mins:          number
  discount_pct:           number
  is_available:           boolean
  discounted_price_paise: number | null
}

export interface ProviderImage {
  id:         string
  service_id: string
  image_url:  string
  sort_order: number
}

export interface ProviderAvailability {
  day_of_week: number
  open_time:   string
  close_time:  string
  is_closed:   boolean
}

export interface Booking {
  id:                    string
  status:                string
  scheduled_at:          string
  checkin_otp?:          string
  payment_mode?:         'prepaid' | 'pay_at_venue'
  price_paise?:          number
  original_price_paise?: number
  discount_pct?:         number
}

export interface BookingSummary {
  id:                    string
  provider_name:         string
  service_title:         string
  scheduled_at:          string
  status:                string
  price_paise:           number
  original_price_paise:  number | null
  discount_pct:          number
  payment_mode:          string
  payment_status:        string
  checkin_otp:           string | null
  checked_in_at:         string | null
  no_show:               boolean
}

export interface ProviderProfile {
  id:                string
  name:              string
  address:           string | null
  phone:             string | null
  status:            string
  profile_image_url: string | null
}

export interface ProviderService {
  id:            string
  category_slug: string
  title:         string
  price_paise:   number
  duration_mins: number
  is_available:  boolean
  discount_pct:  number
}

export interface ProviderStats {
  pending:   string
  confirmed: string
  today:     string
}

export interface ProviderBooking {
  id:             string
  user_name:      string | null
  user_email:     string
  user_phone:     string | null
  service_title:  string
  scheduled_at:   string
  status:         string
  price_paise:    number
  notes:          string | null
  created_at:     string
  payment_mode:   string
  payment_status: string
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

export interface PromotionProduct {
  id:             string
  slug:           string
  name:           string
  description:    string | null
  price_paise:    number
  duration_hours: number
  promotion_type: 'featured' | 'boost'
}

export interface PromotionRecord {
  id:             string
  promotion_type: 'featured' | 'boost'
  product_name:   string
  status:         'active' | 'expired' | 'cancelled'
  starts_at:      string
  expires_at:     string
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
