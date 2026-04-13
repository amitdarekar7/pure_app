import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useProviderAuth } from '../../lib/provider-auth-context'
import { ProviderPortalAPI, type SubscriptionStatus } from '../../lib/api'

const ACCENT = '#7C3AED'
const ORANGE = '#F97316'
const DARK   = '#1B1B1B'
const GREY   = '#6B7280'
const BORDER = '#F3F4F6'
const LOGO   = require('../../assets/images/logo_pure.png')

export default function SubscriptionScreen() {
  const { providerUser, providerProfile } = useProviderAuth()
  const router = useRouter()

  const [sub, setSub]           = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading]   = useState(true)
  const [paying, setPaying]     = useState(false)
  const [autoRenew, setAutoRenew] = useState(false)
  const [rzpWebView, setRzpWebView] = useState<{ html: string } | null>(null)
  const rzpScriptLoaded = useRef(false)

  const load = useCallback(async () => {
    try {
      const { subscription } = await ProviderPortalAPI.subscription()
      setSub(subscription)
      setAutoRenew(subscription.activeSubscription?.auto_renew ?? false)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Load Razorpay checkout.js on web
  useEffect(() => {
    if (Platform.OS !== 'web' || rzpScriptLoaded.current) return
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => { rzpScriptLoaded.current = true }
    document.head.appendChild(script)
  }, [])

  async function handleSubscribe() {
    setPaying(true)
    try {
      const order = await ProviderPortalAPI.subscriptionPurchase(autoRenew)

      if (Platform.OS === 'web') {
        openRazorpayWeb(order)
      } else {
        openRazorpayNative(order)
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not start payment')
      setPaying(false)
    }
  }

  function openRazorpayWeb(order: {
    subscription_id: string
    razorpay_order_id: string
    razorpay_key_id: string
    amount_paise: number
    currency: string
  }) {
    const Razorpay = (window as any).Razorpay
    if (!Razorpay) {
      Alert.alert('Error', 'Payment gateway not loaded. Please refresh and try again.')
      setPaying(false)
      return
    }

    const options = {
      key: order.razorpay_key_id,
      amount: order.amount_paise,
      currency: order.currency,
      name: 'Pure',
      description: 'Provider Subscription — 3 Months',
      order_id: order.razorpay_order_id,
      handler: async (response: {
        razorpay_order_id: string
        razorpay_payment_id: string
        razorpay_signature: string
      }) => {
        try {
          await ProviderPortalAPI.subscriptionVerify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            subscription_id: order.subscription_id,
          })
          Alert.alert('✅ Subscription Active!', 'Your 3-month subscription is now active. You are visible to customers.')
          load()
        } catch (e: any) {
          Alert.alert('Verification Failed', e?.message ?? 'Payment could not be verified')
        } finally { setPaying(false) }
      },
      modal: {
        ondismiss: () => { setPaying(false) },
      },
      prefill: {
        email: providerUser?.email ?? '',
      },
      theme: { color: ACCENT },
    }

    const rzp = new Razorpay(options)
    rzp.on('payment.failed', (resp: any) => {
      Alert.alert('Payment Failed', resp?.error?.description ?? 'Payment was not completed')
      setPaying(false)
    })
    rzp.open()
  }

  function openRazorpayNative(order: {
    subscription_id: string
    razorpay_order_id: string
    razorpay_key_id: string
    amount_paise: number
    currency: string
  }) {
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
  description: "Provider Subscription \u2014 3 Months",
  order_id: "${order.razorpay_order_id}",
  handler: function(resp) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "success",
      razorpay_order_id: resp.razorpay_order_id,
      razorpay_payment_id: resp.razorpay_payment_id,
      razorpay_signature: resp.razorpay_signature,
      subscription_id: "${order.subscription_id}"
    }));
  },
  modal: { ondismiss: function() {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "dismiss" }));
  }},
  theme: { color: "#7C3AED" }
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

    setRzpWebView({ html })
  }

  async function handleRzpWebViewMessage(data: string) {
    try {
      const msg = JSON.parse(data)
      if (msg.type === 'success') {
        setRzpWebView(null)
        try {
          await ProviderPortalAPI.subscriptionVerify({
            razorpay_order_id:   msg.razorpay_order_id,
            razorpay_payment_id: msg.razorpay_payment_id,
            razorpay_signature:  msg.razorpay_signature,
            subscription_id:     msg.subscription_id,
          })
          Alert.alert('\u2705 Subscription Active!', 'Your 3-month subscription is now active. You are visible to customers.')
          load()
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
    setPaying(false)
  }

  async function toggleAutoRenew(value: boolean) {
    setAutoRenew(value)
    if (sub?.hasActiveSubscription) {
      try {
        await ProviderPortalAPI.subscriptionAutoRenew(value)
      } catch {
        setAutoRenew(!value)
        Alert.alert('Error', 'Could not update auto-renew setting')
      }
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    )
  }

  return (
    <>
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <View style={styles.inner}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.push('/(provider)/dashboard')}>
              <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
            </Pressable>
            <Pressable style={styles.avatarPill} onPress={() => router.push('/(provider)/profile')}>
              {providerProfile?.profile_image_url ? (
                <Image source={{ uri: providerProfile.profile_image_url }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarLetter}>
                    {(providerProfile?.name ?? providerUser?.email ?? 'P')[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.avatarName} numberOfLines={1}>
                {providerProfile?.name
                  ? providerProfile.name.split(' ')[0]
                  : (providerUser?.email ?? '').split('@')[0]}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.headerTitle}>Subscription</Text>
          <Text style={styles.headerHint}>
            Manage your plan and billing.
          </Text>
        </View>

        {/* Current Status Card */}
        <View style={styles.statusCard}>
          {sub?.hasActiveSubscription && sub.activeSubscription ? (
            <>
              <View style={styles.statusBadgeActive}>
                <Ionicons name="checkmark-circle" size={18} color="#059669" />
                <Text style={styles.statusBadgeActiveText}>Active</Text>
              </View>
              <Text style={styles.statusPlan}>Quarterly Plan</Text>
              <Text style={styles.statusPrice}>₹149 <Text style={styles.statusPer}>/3 months</Text></Text>
              <View style={styles.statusDates}>
                <View style={styles.statusDateRow}>
                  <Text style={styles.statusDateLabel}>Started</Text>
                  <Text style={styles.statusDateValue}>
                    {new Date(sub.activeSubscription.starts_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <View style={styles.statusDateRow}>
                  <Text style={styles.statusDateLabel}>Expires</Text>
                  <Text style={styles.statusDateValue}>
                    {new Date(sub.activeSubscription.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              </View>
              <View style={styles.autoRenewRow}>
                <View>
                  <Text style={styles.autoRenewLabel}>Auto-Renew</Text>
                  <Text style={styles.autoRenewHint}>Automatically renew when plan expires</Text>
                </View>
                <Switch
                  value={autoRenew}
                  onValueChange={toggleAutoRenew}
                  trackColor={{ false: '#E5E7EB', true: '#D8B4FE' }}
                  thumbColor={autoRenew ? ACCENT : '#9CA3AF'}
                />
              </View>
            </>
          ) : sub?.isLapsed ? (
            <>
              <View style={styles.statusBadgeLapsed}>
                <Ionicons name="alert-circle" size={18} color="#DC2626" />
                <Text style={styles.statusBadgeLapsedText}>Expired</Text>
              </View>
              <Text style={styles.lapsedTitle}>Your subscription has expired</Text>
              <Text style={styles.lapsedText}>
                Your profile is hidden from search and you cannot receive new bookings.{'\n'}Subscribe now to get back online.
              </Text>
            </>
          ) : sub?.inGracePeriod ? (
            <>
              <View style={styles.statusBadgeGrace}>
                <Ionicons name="warning" size={18} color="#D97706" />
                <Text style={styles.statusBadgeGraceText}>Grace Period</Text>
              </View>
              <Text style={styles.graceTitle}>Free period ended</Text>
              <Text style={styles.graceText}>
                You have {sub.graceUntil ? Math.max(0, Math.ceil((new Date(sub.graceUntil).getTime() - Date.now()) / 86400000)) : 0} days left before your profile is hidden.
              </Text>
            </>
          ) : (
            <>
              <View style={styles.statusBadgeFree}>
                <Ionicons name="gift" size={18} color="#7C3AED" />
                <Text style={styles.statusBadgeFreeText}>Free Tier</Text>
              </View>
              <Text style={styles.freeTitle}>{sub?.freeDaysRemaining ?? 0} days remaining</Text>
              <Text style={styles.freeText}>
                You're on the free plan. No subscription needed yet.
              </Text>
            </>
          )}
        </View>

        {/* Subscribe / Renew CTA */}
        {(!sub?.hasActiveSubscription) && (
          <View style={styles.planCard}>
            <Text style={styles.planTitle}>Quarterly Plan</Text>
            <Text style={styles.planPrice}>₹149</Text>
            <Text style={styles.planDuration}>for 3 months</Text>

            <View style={styles.planPerks}>
              {['Visible to all customers', 'Receive new bookings', 'Priority support', 'Business analytics'].map((perk, i) => (
                <View key={i} style={styles.perkRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#059669" />
                  <Text style={styles.perkText}>{perk}</Text>
                </View>
              ))}
            </View>

            <View style={styles.autoRenewRow}>
              <View>
                <Text style={styles.autoRenewLabel}>Auto-Renew</Text>
                <Text style={styles.autoRenewHint}>Automatically renew when plan expires</Text>
              </View>
              <Switch
                value={autoRenew}
                onValueChange={setAutoRenew}
                trackColor={{ false: '#E5E7EB', true: '#D8B4FE' }}
                thumbColor={autoRenew ? ACCENT : '#9CA3AF'}
              />
            </View>

            <TouchableOpacity
              style={[styles.subscribeBtn, paying && styles.subscribeBtnDisabled]}
              onPress={handleSubscribe}
              disabled={paying}
              activeOpacity={0.7}
            >
              {paying
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.subscribeBtnText}>Subscribe Now · ₹149</Text>
              }
            </TouchableOpacity>
          </View>
        )}

      </View>
    </ScrollView>

    {/* ── Razorpay WebView Modal (native only) ── */}
    {Platform.OS !== 'web' && rzpWebView && (
      <Modal visible animationType="slide" onRequestClose={() => { setRzpWebView(null); setPaying(false) }}>
        <View style={{ flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>Complete Payment</Text>
            <Pressable onPress={() => { setRzpWebView(null); setPaying(false) }}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>
          <RzpWebView html={rzpWebView.html} onMessage={handleRzpWebViewMessage} />
        </View>
      </Modal>
    )}
  </>
  )
}

// ── Razorpay WebView for native platforms ─────────────────────────────────────
function RzpWebView({ html, onMessage }: {
  html: string
  onMessage: (data: string) => void
}) {
  if (Platform.OS === 'web') return null
  const { WebView } = require('react-native-webview')
  return (
    <WebView
      source={{ html }}
      style={{ flex: 1 }}
      javaScriptEnabled
      onMessage={(event: any) => onMessage(event.nativeEvent.data)}
    />
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#FAF5FF' },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 40 },
  inner:  { width: '100%', maxWidth: 520 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF5FF' },

  header: {
    backgroundColor: '#fff',
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  logoImg: { width: 80, height: 28 },
  avatarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FAF5FF',
    borderRadius: 20,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '900', fontSize: 14 },
  avatarImg: { width: 32, height: 32, borderRadius: 16 },
  avatarName: { color: DARK, fontWeight: '800', fontSize: 12, maxWidth: 100 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: DARK, letterSpacing: -0.5, marginBottom: 4 },
  headerHint: { fontSize: 13, color: GREY, lineHeight: 18 },

  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },

  statusBadgeActive:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D1FAE5', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12, alignSelf: 'flex-start', marginBottom: 12 },
  statusBadgeActiveText: { fontSize: 12, fontWeight: '700', color: '#059669' },
  statusBadgeLapsed:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEE2E2', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12, alignSelf: 'flex-start', marginBottom: 12 },
  statusBadgeLapsedText:  { fontSize: 12, fontWeight: '700', color: '#DC2626' },
  statusBadgeGrace:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12, alignSelf: 'flex-start', marginBottom: 12 },
  statusBadgeGraceText:   { fontSize: 12, fontWeight: '700', color: '#D97706' },
  statusBadgeFree:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FAF5FF', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12, alignSelf: 'flex-start', marginBottom: 12 },
  statusBadgeFreeText:    { fontSize: 12, fontWeight: '700', color: '#7C3AED' },

  statusPlan:  { fontSize: 14, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  statusPrice: { fontSize: 28, fontWeight: '900', color: '#1B1B1B' },
  statusPer:   { fontSize: 14, fontWeight: '500', color: '#9CA3AF' },
  statusDates: { marginTop: 16, gap: 8 },
  statusDateRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  statusDateLabel: { fontSize: 13, color: '#6B7280' },
  statusDateValue: { fontSize: 13, fontWeight: '700', color: '#111827' },

  lapsedTitle: { fontSize: 17, fontWeight: '800', color: '#991B1B', marginBottom: 6 },
  lapsedText:  { fontSize: 13, color: '#DC2626', lineHeight: 20 },
  graceTitle:  { fontSize: 17, fontWeight: '800', color: '#92400E', marginBottom: 6 },
  graceText:   { fontSize: 13, color: '#D97706', lineHeight: 20 },
  freeTitle:   { fontSize: 17, fontWeight: '800', color: '#1B1B1B', marginBottom: 6 },
  freeText:    { fontSize: 13, color: '#6B7280', lineHeight: 20 },

  autoRenewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  autoRenewLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  autoRenewHint:  { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  planCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    borderColor: ACCENT,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  planTitle:    { fontSize: 14, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  planPrice:    { fontSize: 42, fontWeight: '900', color: '#1B1B1B', marginTop: 4 },
  planDuration: { fontSize: 14, color: '#9CA3AF', marginBottom: 16 },
  planPerks:    { gap: 10, marginBottom: 8 },
  perkRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perkText:     { fontSize: 14, color: '#374151' },

  subscribeBtn: {
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    zIndex: 10,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
  },
  subscribeBtnDisabled: { opacity: 0.6 },
  subscribeBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
})
