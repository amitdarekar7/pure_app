/**
 * useEventStream
 *
 * Opens a Server-Sent Events connection to core-api and delivers real-time
 * booking events to connected screens.
 *
 * Usage:
 *   const { lastEvent } = useEventStream('provider')   // in provider screens
 *   const { lastEvent } = useEventStream('user')        // in user screens
 *
 * The hook automatically:
 *   - Fetches a fresh Firebase ID token on mount
 *   - Reconnects with exponential back-off (max 30 s) on disconnect
 *   - Stops reconnecting when the component unmounts
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { firebaseAuth } from './firebase'
import { buildEventStreamUrl } from './api'

// ─── Event shape ─────────────────────────────────────────────────────────────

export interface BookingRequestedEvent {
  event_type:   'booking.requested'
  aggregate_id: string
  data: {
    booking_id:    string
    user_id:       string
    provider_id:   string
    service_title: string
    scheduled_at:  string
    price_paise:   number
    notes:         string | null
    user_name:     string | null
    user_phone:    string | null
  }
}

export interface BookingRespondedEvent {
  event_type:   'booking.responded'
  aggregate_id: string
  data: {
    booking_id:    string
    user_id:       string
    provider_id:   string
    provider_name: string
    action:        'confirm' | 'reject' | 'reschedule'
    new_status:    'confirmed' | 'cancelled' | 'pending'
    scheduled_at:  string | null
    service_title: string | null
  }
}

export type StreamEvent = BookingRequestedEvent | BookingRespondedEvent

// ─── Hook ─────────────────────────────────────────────────────────────────────

const INITIAL_RETRY_MS = 2_000
const MAX_RETRY_MS     = 30_000

export type StreamRole = 'user' | 'provider'

export function useEventStream(role: StreamRole) {
  const [lastEvent, setLastEvent]     = useState<StreamEvent | null>(null)
  const [connected, setConnected]     = useState(false)

  const retryDelay  = useRef(INITIAL_RETRY_MS)
  const unmounted   = useRef(false)
  const retryTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(async () => {
    if (unmounted.current) return

    // Get a fresh token — Firebase SDK handles caching/refresh
    let token: string
    try {
      const user = firebaseAuth.currentUser
      if (!user) return                         // not signed in yet — don't connect
      token = await user.getIdToken()
    } catch {
      return
    }

    const url = buildEventStreamUrl(token, role)

    // React Native / Expo doesn't ship the browser EventSource API.
    // We implement the same protocol manually with fetch's streaming body.
    let response: Response
    try {
      response = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
      })
    } catch {
      scheduleRetry()
      return
    }

    if (!response.ok || !response.body) {
      scheduleRetry()
      return
    }

    setConnected(true)
    retryDelay.current = INITIAL_RETRY_MS   // reset on successful connect

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const read = async () => {
      while (true) {
        if (unmounted.current) { reader.cancel(); return }

        let done: boolean, value: Uint8Array | undefined
        try {
          ;({ done, value } = await reader.read())
        } catch {
          break
        }

        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''           // keep incomplete last chunk

        for (const part of parts) {
          const line = part.trim()
          if (!line || line.startsWith(':')) continue  // heartbeat / comment

          const dataLine = line.split('\n').find(l => l.startsWith('data:'))
          if (!dataLine) continue

          const json = dataLine.replace(/^data:\s*/, '')
          try {
            const event = JSON.parse(json) as StreamEvent
            setLastEvent(event)
          } catch { /* malformed JSON — ignore */ }
        }
      }

      // Stream ended — reconnect
      setConnected(false)
      if (!unmounted.current) scheduleRetry()
    }

    read()
  }, [role])

  const scheduleRetry = useCallback(() => {
    if (unmounted.current) return
    const delay = retryDelay.current
    retryDelay.current = Math.min(delay * 2, MAX_RETRY_MS)
    retryTimer.current = setTimeout(connect, delay)
  }, [connect])

  useEffect(() => {
    unmounted.current = false
    connect()
    return () => {
      unmounted.current = true
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [connect])

  return { lastEvent, connected }
}
