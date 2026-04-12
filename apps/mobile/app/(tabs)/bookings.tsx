import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../lib/auth-context'
import { BookingsAPI, BookingSummary } from '../../lib/api'
import { useEventStream, type BookingRespondedEvent } from '../../lib/use-event-stream'

// ─── helpers ──────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const ACCENT = '#E8590C'
const LOGO = require('../../assets/images/logo_pure.png')

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
    case 'pending':    return { label: 'Awaiting Confirmation', color: '#92400e', bg: '#fef3c7', icon: 'time-outline' }
    case 'cancelled':  return { label: 'Cancelled',  color: '#991b1b', bg: '#fee2e2', icon: 'close-circle' }
    case 'rejected':   return { label: 'Rejected',   color: '#991b1b', bg: '#fee2e2', icon: 'close-circle' }
    case 'completed':  return { label: 'Completed',  color: '#1e3a5f', bg: '#dbeafe', icon: 'ribbon-outline' }
    case 'in_progress': return { label: 'In Progress', color: '#7c3aed', bg: '#ede9fe', icon: 'play-circle' }
    case 'no_show':    return { label: 'No Show',    color: '#6b7280', bg: '#f3f4f6', icon: 'alert-circle-outline' }
    default:           return { label: status,       color: '#374151', bg: '#f3f4f6', icon: 'ellipse-outline' }
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function BookingsScreen() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const maxW = width >= 1024 ? 760 : width >= 600 ? 640 : Math.min(width, 520)

  // Redirect to login if not signed in
  useEffect(() => {
    if (!authLoading && !user) router.replace('/(auth)/login?returnTo=/(tabs)/bookings')
  }, [authLoading, user])

  const [bookings,   setBookings]   = useState<BookingSummary[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Badge map: bookingId → true means it just got updated (highlight ring)
  const [updatedIds, setUpdatedIds] = useState<Set<string>>(new Set())
  const [payingId,   setPayingId]   = useState<string | null>(null)

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
      ? `${ev.data.provider_name} confirmed your booking for ${ev.data.service_title ?? 'your service'}.\n\nPlease complete payment to secure your slot.`
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

  // ── Razorpay web checkout state ─────────────────────────────────────────
  const [rzpWebView, setRzpWebView]     = useState<{ html: string; bookingId: string } | null>(null)
  const rzpScriptLoaded = useRef(false)

  // Load Razorpay checkout.js on web once
  useEffect(() => {
    if (Platform.OS !== 'web' || rzpScriptLoaded.current) return
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => { rzpScriptLoaded.current = true }
    document.head.appendChild(script)
  }, [])

  // ── pay for a confirmed prepaid booking (Razorpay) ──────────────────────
  async function handlePay(bookingId: string) {
    setPayingId(bookingId)
    try {
      // Step 1: Create Razorpay order via backend
      const order = await BookingsAPI.pay(bookingId)

      if (Platform.OS === 'web') {
        // Web: use Razorpay checkout.js
        openRazorpayWeb(order, bookingId)
      } else {
        // Native: use WebView-based checkout
        openRazorpayNative(order, bookingId)
      }
    } catch (e: any) {
      Alert.alert('Payment Failed', e?.message ?? 'Could not create payment order')
      setPayingId(null)
    }
  }

  function openRazorpayWeb(
    order: { razorpay_order_id: string; razorpay_key_id: string; amount_paise: number; currency: string },
    bookingId: string,
  ) {
    const Razorpay = (window as any).Razorpay
    if (!Razorpay) {
      Alert.alert('Error', 'Payment gateway not loaded. Please refresh and try again.')
      setPayingId(null)
      return
    }

    const options = {
      key: order.razorpay_key_id,
      amount: order.amount_paise,
      currency: order.currency,
      name: 'Pure',
      description: 'Salon Booking Payment',
      order_id: order.razorpay_order_id,
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        // Verify payment on backend
        try {
          await BookingsAPI.verifyPayment(bookingId, {
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature:  response.razorpay_signature,
          })
          Alert.alert('✅ Payment Successful', 'Your booking is now paid. See you at the salon!')
          fetchBookings(true)
        } catch (e: any) {
          Alert.alert('Verification Failed', e?.message ?? 'Payment could not be verified')
        } finally {
          setPayingId(null)
        }
      },
      modal: {
        ondismiss: () => { setPayingId(null) },
      },
      prefill: {
        email: user?.email ?? '',
      },
      theme: { color: ACCENT },
    }

    const rzp = new Razorpay(options)
    rzp.on('payment.failed', (resp: any) => {
      Alert.alert('Payment Failed', resp?.error?.description ?? 'Payment was not completed')
      setPayingId(null)
    })
    rzp.open()
  }

  function openRazorpayNative(
    order: { razorpay_order_id: string; razorpay_key_id: string; amount_paise: number; currency: string },
    bookingId: string,
  ) {
    // Build an HTML page that loads Razorpay checkout in a WebView
    const html = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<script src="https://checkout.razorpay.com/v1/checkout.js"><\/script>
</head><body>
<script>
var options = {
  key: "${order.razorpay_key_id}",
  amount: ${order.amount_paise},
  currency: "${order.currency}",
  name: "Pure",
  description: "Salon Booking Payment",
  order_id: "${order.razorpay_order_id}",
  handler: function(resp) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "success",
      razorpay_order_id: resp.razorpay_order_id,
      razorpay_payment_id: resp.razorpay_payment_id,
      razorpay_signature: resp.razorpay_signature
    }));
  },
  modal: { ondismiss: function() {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "dismiss" }));
  }},
  theme: { color: "#E8590C" }
};
var rzp = new Razorpay(options);
rzp.on("payment.failed", function(resp) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: "failed",
    error: resp.error.description || "Payment failed"
  }));
});
rzp.open();
<\/script></body></html>`

    setRzpWebView({ html, bookingId })
  }

  async function handleRzpWebViewMessage(data: string, bookingId: string) {
    try {
      const msg = JSON.parse(data)
      if (msg.type === 'success') {
        setRzpWebView(null)
        try {
          await BookingsAPI.verifyPayment(bookingId, {
            razorpay_order_id:   msg.razorpay_order_id,
            razorpay_payment_id: msg.razorpay_payment_id,
            razorpay_signature:  msg.razorpay_signature,
          })
          Alert.alert('✅ Payment Successful', 'Your booking is now paid. See you at the salon!')
          fetchBookings(true)
        } catch (e: any) {
          Alert.alert('Verification Failed', e?.message ?? 'Payment could not be verified')
        }
      } else if (msg.type === 'failed') {
        setRzpWebView(null)
        Alert.alert('Payment Failed', msg.error ?? 'Payment was not completed')
      } else if (msg.type === 'dismiss') {
        setRzpWebView(null)
      }
    } catch { /* ignore parse errors */ }
    setPayingId(null)
  }

  // ── choose pay-at-venue instead of online ───────────────────────────────
  async function handleChooseVenue(bookingId: string) {
    setPayingId(bookingId)
    try {
      await BookingsAPI.chooseVenue(bookingId)
      fetchBookings(true)
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong')
    } finally {
      setPayingId(null)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  const content = !user ? (
    <View style={styles.center}>
      <Ionicons name="lock-closed-outline" size={48} color="#aaa" />
      <Text style={styles.emptyText}>Sign in to view your bookings</Text>
    </View>
  ) : loading ? (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#7c6af7" />
    </View>
  ) : bookings.length === 0 ? (
    <ScrollView
      contentContainerStyle={styles.center}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c6af7" />}
    >
      <Ionicons name="calendar-outline" size={56} color="#ccc" />
      <Text style={styles.emptyTitle}>No bookings yet</Text>
      <Text style={styles.emptyText}>Your booking history will appear here.</Text>
    </ScrollView>
  ) : (
    <ScrollView
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c6af7" />}
    >
      {bookings.map(b => {
        const meta      = statusMeta(b.status)
        const highlight = updatedIds.has(b.id)
        const needsPay  = b.status === 'confirmed' && b.payment_mode === 'prepaid' && b.payment_status === 'unpaid'
        const isPaid    = b.payment_mode === 'prepaid' && b.payment_status === 'paid'
        const isVenue   = b.payment_mode === 'pay_at_venue'
        return (
          <View key={b.id} style={[styles.card, highlight && styles.cardHighlight]}>
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

            {/* ── Contextual message strip ── */}
            {b.status === 'pending' && (
              <View style={styles.msgStrip}>
                <Ionicons name="hourglass-outline" size={14} color="#92400e" />
                <Text style={styles.msgStripText}>Waiting for the salon to confirm your appointment</Text>
              </View>
            )}

            {b.status === 'confirmed' && needsPay && (
              <View style={[styles.msgStrip, { backgroundColor: '#fff7ed' }]}>
                <Ionicons name="card-outline" size={14} color={ACCENT} />
                <Text style={[styles.msgStripText, { color: ACCENT }]}>Confirmed! How would you like to pay?</Text>
              </View>
            )}

            {b.status === 'confirmed' && isPaid && (
              <View style={[styles.msgStrip, { backgroundColor: '#ecfdf5' }]}>
                <Ionicons name="checkmark-done" size={14} color="#065f46" />
                <Text style={[styles.msgStripText, { color: '#065f46' }]}>All set! Payment received — see you at the salon</Text>
              </View>
            )}

            {b.status === 'confirmed' && isVenue && (
              <View style={[styles.msgStrip, { backgroundColor: '#ecfdf5' }]}>
                <Ionicons name="wallet-outline" size={14} color="#065f46" />
                <Text style={[styles.msgStripText, { color: '#065f46' }]}>Confirmed! Pay at the venue when you arrive</Text>
              </View>
            )}

            {b.status === 'no_show' && (
              <View style={[styles.msgStrip, { backgroundColor: '#f3f4f6' }]}>
                <Ionicons name="alert-circle-outline" size={14} color="#6b7280" />
                <Text style={[styles.msgStripText, { color: '#6b7280' }]}>You didn't show up for this appointment</Text>
              </View>
            )}

            {/* ── Check-in OTP (visible until end of scheduled date) ── */}
            {b.checkin_otp && !b.checked_in_at && ['pending', 'confirmed', 'in_progress'].includes(b.status) && (() => { const s = new Date(b.scheduled_at); s.setHours(23,59,59,999); return s >= new Date(); })() && (
              <View style={styles.otpStrip}>
                <View style={styles.otpLeft}>
                  <Ionicons name="key-outline" size={16} color="#7c6af7" />
                  <View>
                    <Text style={styles.otpStripLabel}>Check-in OTP</Text>
                    <Text style={styles.otpStripHint}>Share with the provider on arrival</Text>
                  </View>
                </View>
                <Text style={styles.otpStripCode}>{b.checkin_otp}</Text>
              </View>
            )}

            {/* Two payment options after confirmation */}
            {needsPay && (
              <View style={styles.payChoiceRow}>
                <Pressable
                  style={styles.payOnlineBtn}
                  onPress={() => handlePay(b.id)}
                  disabled={payingId === b.id}
                >
                  {payingId === b.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                        <Ionicons name="phone-portrait-outline" size={16} color="#fff" />
                        <Text style={styles.payOnlineText}>Pay Online · {formatRupees(b.price_paise)}</Text>
                      </>
                  }
                </Pressable>
                <Pressable
                  style={styles.payVenueBtn}
                  onPress={() => handleChooseVenue(b.id)}
                  disabled={payingId === b.id}
                >
                  <Ionicons name="storefront-outline" size={16} color={ACCENT} />
                  <Text style={styles.payVenueBtnText}>Pay at Venue</Text>
                </Pressable>
              </View>
            )}
          </View>
        )
      })}
    </ScrollView>
  )

  return (
    <View style={styles.root}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.headerBar}>
        <View style={[styles.headerInner, { maxWidth: maxW }]}>
          <Pressable onPress={() => router.navigate('/(tabs)/home')} hitSlop={8}>
            <Image source={LOGO} style={styles.logoImage} resizeMode="contain" />
          </Pressable>
          <Text style={styles.pageTitle}>My Bookings</Text>
        </View>
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: maxW }}>
          {content}
        </View>
      </View>

      {/* ── Razorpay WebView Modal (native only) ── */}
      {Platform.OS !== 'web' && rzpWebView && (
        <Modal visible animationType="slide" onRequestClose={() => { setRzpWebView(null); setPayingId(null) }}>
          <View style={{ flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>Complete Payment</Text>
              <Pressable onPress={() => { setRzpWebView(null); setPayingId(null) }}>
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>
            <RazorpayWebView html={rzpWebView.html} bookingId={rzpWebView.bookingId} onMessage={handleRzpWebViewMessage} />
          </View>
        </Modal>
      )}
    </View>
  )
}

// ── Razorpay WebView for native platforms ─────────────────────────────────────
function RazorpayWebView({ html, bookingId, onMessage }: {
  html: string
  bookingId: string
  onMessage: (data: string, bookingId: string) => void
}) {
  if (Platform.OS === 'web') return null
  // Lazy-require to avoid web bundling issues
  const { WebView } = require('react-native-webview')
  return (
    <WebView
      source={{ html }}
      style={{ flex: 1 }}
      javaScriptEnabled
      onMessage={(event: any) => onMessage(event.nativeEvent.data, bookingId)}
    />
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f5f7' },
  list:   { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },

  headerBar: {
    backgroundColor:  '#fff',
    paddingTop:        Platform.OS === 'ios' ? 52 : Platform.OS === 'android' ? 28 : 16,
    paddingBottom:     14,
    alignItems:       'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f8',
  },
  headerInner: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    width:            '100%',
    paddingHorizontal: 20,
  },
  logoImage: { width: 130, height: 44 },
  pageTitle: { fontSize: 16, fontWeight: '800', color: '#0f0f23' },

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

  msgStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fef9ee',
  },
  msgStripText: { fontSize: 12, color: '#92400e', flex: 1, lineHeight: 17 },

  payChoiceRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  payOnlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 12,
  },
  payOnlineText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  payVenueBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: ACCENT,
  },
  payVenueBtnText: { color: ACCENT, fontSize: 13, fontWeight: '700' },

  otpStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#e0dbff',
    borderStyle: 'dashed',
  },
  otpLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  otpStripLabel: { fontSize: 11, fontWeight: '700', color: '#7c6af7', letterSpacing: 0.4, textTransform: 'uppercase' },
  otpStripHint:  { fontSize: 10, color: '#9ca3af', marginTop: 1 },
  otpStripCode:  { fontSize: 22, fontWeight: '900', color: '#0f0f23', letterSpacing: 6 },
})
