import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../lib/auth-context'
import { PaymentAPI } from '../../lib/api'
import type { PaymentIntent } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

type PayMethod = 'upi' | 'card'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR']

/** RFC-4122 v4 UUID without external dependencies */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function formatCardNumber(raw: string) {
  return raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
}

function formatExpiry(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return digits
}

function StatusChip({ status }: { status: string }) {
  const color =
    status === 'pending'   ? '#f0a500' :
    status === 'completed' ? '#51cf66' :
    status === 'failed'    ? '#ff6b6b' : '#aaa'
  return (
    <View style={[styles.chip, { borderColor: color }]}>
      <Text style={[styles.chipText, { color }]}>{status.toUpperCase()}</Text>
    </View>
  )
}

function IntentCard({ intent }: { intent: PaymentIntent }) {
  return (
    <View style={styles.intentCard}>
      <View style={styles.intentRow}>
        <Text style={styles.intentLabel}>Intent ID</Text>
        <Text style={styles.intentId} numberOfLines={1}>{intent.payment_intent_id}</Text>
      </View>
      <View style={styles.intentRow}>
        <Text style={styles.intentLabel}>Amount</Text>
        <Text style={styles.intentAmount}>
          {(intent.amount_cents / 100).toFixed(2)} {intent.currency}
        </Text>
      </View>
      <View style={styles.intentRow}>
        <Text style={styles.intentLabel}>Status</Text>
        <StatusChip status={intent.status} />
      </View>
    </View>
  )
}

export default function PaymentsScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const maxW = width >= 1024 ? 760 : width >= 600 ? 640 : Math.min(width, 520)

  const [method,   setMethod]   = useState<PayMethod>('upi')
  const [amount,   setAmount]   = useState('')
  const [upiId,    setUpiId]    = useState('')
  const [cardNum,  setCardNum]  = useState('')
  const [expiry,   setExpiry]   = useState('')
  const [cvv,      setCvv]      = useState('')
  const [cardName, setCardName] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [intent,   setIntent]   = useState<PaymentIntent | null>(null)

  function validate(): string | null {
    const amountNum = parseFloat(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0) return 'Enter a valid amount.'
    if (!user) return 'Not authenticated.'
    if (method === 'upi') {
      if (!upiId.trim()) return 'Enter your UPI ID.'
      if (!/^[\w.\-]+@[\w]+$/.test(upiId.trim())) return 'UPI ID format should be like name@upi'
    }
    if (method === 'card') {
      if (cardNum.replace(/\s/g, '').length < 16) return 'Enter a valid 16-digit card number.'
      if (expiry.replace(/\D/g, '').length < 4)   return 'Enter a valid expiry date (MM/YY).'
      if (cvv.length < 3)                          return 'Enter a valid CVV.'
      if (!cardName.trim())                        return 'Enter the name on card.'
    }
    return null
  }

  async function handlePay() {
    const err = validate()
    if (err) { setError(err); return }
    setError(null)
    setLoading(true)
    try {
      const result = await PaymentAPI.createIntent({
        user_id:         user!.id,
        amount_cents:    Math.round(parseFloat(amount) * 100),
        currency:        'INR',
        idempotency_key: uuid(),
      })
      setIntent(result)
      setAmount('')
      setUpiId('')
      setCardNum('')
      setExpiry('')
      setCvv('')
      setCardName('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Payment failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ── */}
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.navigate('/(tabs)/home')} hitSlop={8}>
          <Image source={LOGO} style={styles.logoImage} resizeMode="contain" />
        </Pressable>
        <Text style={styles.pageTitle}>Pay</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: maxW, alignSelf: 'center' }}>

        {/* ── Success state ── */}
        {intent && (
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
            <Text style={styles.successTitle}>Payment Initiated!</Text>
            <Text style={styles.successSub}>
              ₹{(intent.amount_cents / 100).toFixed(2)} via {method === 'upi' ? 'UPI' : 'Card'}
            </Text>
            <Text style={styles.successRef}>Ref: {intent.payment_intent_id}</Text>
            <Pressable style={styles.newPayBtn} onPress={() => setIntent(null)}>
              <Text style={styles.newPayBtnText}>Make Another Payment</Text>
            </Pressable>
          </View>
        )}

        {!intent && (
          <>
            {/* ── Amount ── */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Amount (₹)</Text>
              <View style={styles.amountRow}>
                <Text style={styles.rupeeSign}>₹</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor="#bbb"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* ── Method selector ── */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Payment Method</Text>
              <View style={styles.methodRow}>
                <Pressable
                  style={[styles.methodBtn, method === 'upi' && styles.methodBtnActive]}
                  onPress={() => { setMethod('upi'); setError(null) }}
                >
                  <Ionicons name="phone-portrait-outline" size={20} color={method === 'upi' ? '#7c6af7' : '#888'} />
                  <Text style={[styles.methodText, method === 'upi' && styles.methodTextActive]}>UPI</Text>
                </Pressable>
                <Pressable
                  style={[styles.methodBtn, method === 'card' && styles.methodBtnActive]}
                  onPress={() => { setMethod('card'); setError(null) }}
                >
                  <Ionicons name="card-outline" size={20} color={method === 'card' ? '#7c6af7' : '#888'} />
                  <Text style={[styles.methodText, method === 'card' && styles.methodTextActive]}>Debit / Credit Card</Text>
                </Pressable>
              </View>
            </View>

            {/* ── UPI form ── */}
            {method === 'upi' && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>UPI ID</Text>
                <TextInput
                  style={styles.input}
                  placeholder="yourname@upi"
                  placeholderTextColor="#bbb"
                  value={upiId}
                  onChangeText={setUpiId}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <Text style={styles.fieldHint}>e.g. name@paytm · name@ybl · name@okaxis</Text>
              </View>
            )}

            {/* ── Card form ── */}
            {method === 'card' && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>Name on Card</Text>
                <TextInput
                  style={styles.input}
                  placeholder="As printed on card"
                  placeholderTextColor="#bbb"
                  value={cardName}
                  onChangeText={setCardName}
                  autoCapitalize="words"
                />

                <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Card Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0000 0000 0000 0000"
                  placeholderTextColor="#bbb"
                  value={cardNum}
                  onChangeText={(t) => setCardNum(formatCardNumber(t))}
                  keyboardType="number-pad"
                />

                <View style={styles.cardRow2}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.sectionLabel}>Expiry (MM/YY)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="MM/YY"
                      placeholderTextColor="#bbb"
                      value={expiry}
                      onChangeText={(t) => setExpiry(formatExpiry(t))}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionLabel}>CVV</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="•••"
                      placeholderTextColor="#bbb"
                      value={cvv}
                      onChangeText={(t) => setCvv(t.replace(/\D/g, '').slice(0, 4))}
                      keyboardType="number-pad"
                      secureTextEntry
                    />
                  </View>
                </View>
              </View>
            )}

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.payBtn, loading && { opacity: 0.6 }]}
              onPress={handlePay}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Ionicons name="lock-closed" size={16} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.payBtnText}>
                      Pay {amount ? `₹${amount}` : ''} Securely
                    </Text>
                  </>}
            </Pressable>

            <Text style={styles.secureNote}>
              🔒 All transactions are encrypted and secure
            </Text>
          </>
        )}

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f5f7' },
  scroll: { padding: 16, paddingBottom: 40 },

  headerBar: {
    backgroundColor:   '#fff',
    paddingHorizontal: 20,
    paddingTop:        Platform.OS === 'ios' ? 52 : Platform.OS === 'android' ? 28 : 16,
    paddingBottom:     14,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f8',
  },
  logoImage: { width: 130, height: 44 },
  pageTitle: { fontSize: 16, fontWeight: '800', color: '#0f0f23' },

  card: {
    backgroundColor:  '#fff',
    borderRadius:     16,
    padding:          18,
    marginBottom:     14,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 2 },
    shadowOpacity:    0.06,
    shadowRadius:     8,
    elevation:        2,
  },

  sectionLabel: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  amountRow:   { flexDirection: 'row', alignItems: 'center' },
  rupeeSign:   { fontSize: 28, fontWeight: '800', color: '#0f0f23', marginRight: 6 },
  amountInput: { flex: 1, fontSize: 32, fontWeight: '800', color: '#0f0f23' },

  methodRow: { flexDirection: 'row', gap: 10 },
  methodBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    borderWidth:     1.5,
    borderColor:     '#e5e7eb',
    borderRadius:    12,
    paddingVertical: 14,
    backgroundColor: '#fafafa',
  },
  methodBtnActive:   { borderColor: '#7c6af7', backgroundColor: '#f5f3ff' },
  methodText:        { color: '#888', fontWeight: '700', fontSize: 13 },
  methodTextActive:  { color: '#7c6af7' },

  input: {
    borderWidth:       1,
    borderColor:       '#e5e7eb',
    borderRadius:      10,
    paddingHorizontal: 14,
    paddingVertical:   12,
    fontSize:          15,
    color:             '#0f0f23',
    backgroundColor:   '#fafafa',
  },
  fieldHint: { color: '#aaa', fontSize: 12, marginTop: 6 },
  cardRow2:  { flexDirection: 'row', marginTop: 14 },

  beneficiaryCard: {
    backgroundColor: '#fff',
    borderRadius:    16,
    padding:         18,
    marginBottom:    14,
    borderWidth:     1,
    borderColor:     '#ede9fe',
    shadowColor:     '#7c6af7',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    6,
    elevation:       1,
  },
  beneficiaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  beneficiaryTitle:  { color: '#7c6af7', fontWeight: '700', fontSize: 13 },
  beneficiaryRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f3ff' },
  beneficiaryLabel:  { color: '#aaa', fontSize: 13 },
  beneficiaryValue:  { color: '#0f0f23', fontSize: 13, fontWeight: '600' },

  errorBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#dc2626', fontSize: 13, flex: 1 },

  payBtn:     { backgroundColor: '#7c6af7', borderRadius: 14, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  payBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  secureNote: { textAlign: 'center', color: '#aaa', fontSize: 12, marginBottom: 8 },

  successCard:   { backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center', marginTop: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  successTitle:  { fontSize: 22, fontWeight: '900', color: '#0f0f23', marginTop: 14 },
  successSub:    { fontSize: 15, color: '#555', marginTop: 6 },
  successRef:    { fontSize: 11, color: '#aaa', marginTop: 8, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  newPayBtn:     { marginTop: 24, backgroundColor: '#f5f3ff', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  newPayBtnText: { color: '#7c6af7', fontWeight: '700', fontSize: 14 },

  // legacy refs kept to avoid TS errors on unused vars
  chip:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '700' },
  intentCard:   { backgroundColor: '#f8f8fc', borderRadius: 12, padding: 16 },
  intentRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  intentLabel:  { color: '#888', fontSize: 13 },
  intentId:     { color: '#555', fontSize: 12, flex: 1, textAlign: 'right' },
  intentAmount: { color: '#0f0f23', fontSize: 15, fontWeight: '700' },
})
