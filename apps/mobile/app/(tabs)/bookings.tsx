import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useState, useEffect, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../lib/auth-context'
import { BookingsAPI, BookingSummary } from '../../lib/api'
import { useEventStream, type BookingRespondedEvent } from '../../lib/use-event-stream'

// ─── helpers ──────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${DAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} · ${
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }`
}

function formatRupees(paise: number) {
  return `₹${Math.round(paise / 100)}`
}

type Status = 'pending' | 'confirmed' | 'cancelled' | 'rejected' | 'completed' | string

function statusMeta(status: Status): { label: string; color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>['name'] } {
  switch (status) {
    case 'confirmed':  return { label: 'Confirmed',  color: '#065f46', bg: '#d1fae5', icon: 'checkmark-circle' }
    case 'pending':    return { label: 'Pending',    color: '#92400e', bg: '#fef3c7', icon: 'time-outline' }
    case 'cancelled':  return { label: 'Cancelled',  color: '#991b1b', bg: '#fee2e2', icon: 'close-circle' }
    case 'rejected':   return { label: 'Rejected',   color: '#991b1b', bg: '#fee2e2', icon: 'close-circle' }
    case 'completed':  return { label: 'Completed',  color: '#1e3a5f', bg: '#dbeafe', icon: 'ribbon-outline' }
    default:           return { label: status,       color: '#374151', bg: '#f3f4f6', icon: 'ellipse-outline' }
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function BookingsScreen() {
  const { user } = useAuth()
  const [bookings,   setBookings]   = useState<BookingSummary[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Badge map: bookingId → true means it just got updated (highlight ring)
  const [updatedIds, setUpdatedIds] = useState<Set<string>>(new Set())

  const { lastEvent } = useEventStream('user')

  // ── fetch bookings ──────────────────────────────────────────────────────
  const fetchBookings = useCallback(async (silent = false) => {
    if (!user) return
    if (!silent) setLoading(true)
    try {
      const { bookings: data } = await BookingsAPI.my()
      setBookings(data)
    } catch {
      // silently swallow — already visible to user if they pull to refresh
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user])

  // Reload whenever the tab comes into focus
  useFocusEffect(
    useCallback(() => { fetchBookings() }, [fetchBookings]),
  )

  // ── real-time SSE events ────────────────────────────────────────────────
  useEffect(() => {
    if (!lastEvent || lastEvent.event_type !== 'booking.responded') return
    const ev = lastEvent as BookingRespondedEvent
    const ok = ev.data.action === 'confirm'

    // ① Native alert for immediate attention
    const title   = ok ? '🎉 Booking Confirmed!' : ev.data.action === 'reschedule' ? '📅 Booking Rescheduled' : '❌ Booking Cancelled'
    const message = ok
      ? `${ev.data.provider_name} confirmed your booking for ${ev.data.service_title ?? 'your service'}.`
      : ev.data.action === 'reschedule'
        ? `${ev.data.provider_name} rescheduled your booking for ${ev.data.service_title ?? 'your service'}.`
        : `${ev.data.provider_name} cancelled your booking for ${ev.data.service_title ?? 'your service'}.`

    Alert.alert(title, message, [{ text: 'OK', style: 'default' }])

    // ② Highlight the updated booking card for 5 s
    setUpdatedIds(prev => new Set([...prev, ev.data.booking_id]))
    setTimeout(() => {
      setUpdatedIds(prev => {
        const next = new Set(prev)
        next.delete(ev.data.booking_id)
        return next
      })
    }, 5_000)

    // ③ Refresh the list to reflect the new status
    fetchBookings(true)
  }, [lastEvent, fetchBookings])

  // ── pull to refresh ─────────────────────────────────────────────────────
  function onRefresh() {
    setRefreshing(true)
    fetchBookings()
  }

  // ── unauthenticated ─────────────────────────────────────────────────────
  if (!user) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color="#aaa" />
        <Text style={styles.emptyText}>Sign in to view your bookings</Text>
      </View>
    )
  }

  // ── loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7c6af7" />
      </View>
    )
  }

  // ── empty ────────────────────────────────────────────────────────────────
  if (bookings.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.center}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c6af7" />}
      >
        <Ionicons name="calendar-outline" size={56} color="#ccc" />
        <Text style={styles.emptyTitle}>No bookings yet</Text>
        <Text style={styles.emptyText}>Your booking history will appear here.</Text>
      </ScrollView>
    )
  }

  // ── list ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c6af7" />}
    >
      {bookings.map(b => {
        const meta      = statusMeta(b.status)
        const highlight = updatedIds.has(b.id)
        return (
          <View key={b.id} style={[styles.card, highlight && styles.cardHighlight]}>
            {/* highlight pulse border on newly updated card */}
            {highlight && <View style={styles.highlightBar} />}

            <View style={styles.cardRow}>
              <View style={styles.cardInfo}>
                <Text style={styles.providerName} numberOfLines={1}>{b.provider_name}</Text>
                <Text style={styles.serviceTitle} numberOfLines={1}>{b.service_title}</Text>
                <Text style={styles.dateText}>{formatDate(b.scheduled_at)}</Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.price}>{formatRupees(b.price_paise)}</Text>
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  <Ionicons name={meta.icon} size={12} color={meta.color} />
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f8f8f8' },
  list:   { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },

  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 8 },
  emptyText:  { fontSize: 14, color: '#9ca3af', textAlign: 'center' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  cardHighlight: {
    borderWidth: 2,
    borderColor: '#7c6af7',
  },
  highlightBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
    backgroundColor: '#7c6af7',
  },

  cardRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardInfo:     { flex: 1 },
  cardRight:    { alignItems: 'flex-end', gap: 6 },

  providerName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  serviceTitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  dateText:     { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  price:        { fontSize: 15, fontWeight: '700', color: '#7c6af7' },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
})
