/**
 * Centralised API client.
 * - Typed wrappers for every backend endpoint
 * - Automatic token refresh on 401
 * - AsyncStorage-backed token persistence
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

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

// ─── Token storage ────────────────────────────────────────────────────────────
export const TokenStore = {
  getAccess:  ()                       => AsyncStorage.getItem('access_token'),
  getRefresh: ()                       => AsyncStorage.getItem('refresh_token'),
  setTokens:  (a: string, r: string)   =>
    AsyncStorage.multiSet([['access_token', a], ['refresh_token', r]]),
  setAccess:  (a: string)              => AsyncStorage.setItem('access_token', a),
  clear:      ()                       => AsyncStorage.multiRemove(['access_token', 'refresh_token']),
}

// ─── Auth API ─────────────────────────────────────────────────────────────────
export const AuthAPI = {
  register: (email: string, password: string, displayName: string) =>
    _post<{ accessToken: string; refreshToken: string; userId: string }>(
      `${CORE}/v1/auth/register`, { email, password, displayName },
    ),
  login: (email: string, password: string) =>
    _post<{ accessToken: string; refreshToken: string }>(
      `${CORE}/v1/auth/login`, { email, password },
    ),
  refresh: (refreshToken: string) =>
    _post<{ accessToken: string }>(`${CORE}/v1/auth/refresh`, { refreshToken }),
  logout: (refreshToken: string) =>
    _post<void>(`${CORE}/v1/auth/logout`, { refreshToken }),
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

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
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

/** Authenticated fetch + auto-refresh on 401 */
async function _auth<T>(method: string, url: string, body?: unknown): Promise<T> {
  const doFetch = (token: string | null) =>
    fetch(url, {
      method,
      headers: makeHeaders(token),
      body:    body != null ? JSON.stringify(body) : undefined,
    })

  let res = await doFetch(await TokenStore.getAccess())

  if (res.status === 401) {
    const rt = await TokenStore.getRefresh()
    if (!rt) throw Object.assign(new Error('Not authenticated'), { status: 401 })
    try {
      const { accessToken } = await AuthAPI.refresh(rt)
      await TokenStore.setAccess(accessToken)
      res = await doFetch(accessToken)
    } catch {
      await TokenStore.clear()
      throw Object.assign(new Error('Session expired. Please log in again.'), { status: 401 })
    }
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
