import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useState } from 'react'
import { useAuth } from '../../lib/auth-context'
import { PaymentAPI } from '../../lib/api'
import type { PaymentIntent } from '../../lib/api'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR']

/** RFC-4122 v4 UUID without external dependencies */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
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

  const [amount,   setAmount]   = useState('')
  const [currency, setCurrency] = useState('USD')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [intent,   setIntent]   = useState<PaymentIntent | null>(null)

  async function handleCreateIntent() {
    setError(null)
    const amountNum = parseFloat(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError('Enter a valid amount greater than 0.')
      return
    }
    if (!user) {
      setError('Not authenticated.')
      return
    }

    setLoading(true)
    try {
      const result = await PaymentAPI.createIntent({
        user_id:         user.id,
        amount_cents:    Math.round(amountNum * 100),
        currency,
        idempotency_key: uuid(),
      })
      setIntent(result)
      setAmount('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create payment intent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Create intent form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>New Payment Intent</Text>
          <Text style={styles.cardDesc}>
            Create a payment intent via the Rust payment service. Funds are not charged until confirmed.
          </Text>

          <Text style={styles.label}>Amount</Text>
          <View style={styles.amountRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="0.00"
              placeholderTextColor="#555"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={styles.label}>Currency</Text>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((c) => (
              <Pressable
                key={c}
                style={[styles.currencyBtn, currency === c && styles.currencyBtnActive]}
                onPress={() => setCurrency(c)}
              >
                <Text style={[styles.currencyText, currency === c && styles.currencyTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.payBtn, loading && styles.payBtnDisabled]}
            onPress={handleCreateIntent}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.payBtnText}>Create Intent →</Text>}
          </Pressable>
        </View>

        {/* Latest intent result */}
        {intent && (
          <View style={styles.resultSection}>
            <Text style={styles.resultTitle}>Payment Intent Created</Text>
            <IntentCard intent={intent} />
            <Text style={styles.hint}>
              This intent is pending. In production, a frontend SDK would collect card details and confirm the intent.
            </Text>
          </View>
        )}

        {/* Info box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>How it works</Text>
          <Text style={styles.infoText}>
            1. Create intent → Rust service records it in an append-only ledger{'\n'}
            2. Frontend collects payment method (card/wallet){'\n'}
            3. Confirm intent → funds captured, outbox event fires{'\n'}
            4. Idempotency key prevents duplicate charges
          </Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0f0f23' },
  scroll: { padding: 16, paddingBottom: 40 },

  card: {
    backgroundColor: '#1a1a2e',
    borderRadius:    14,
    padding:         20,
    marginBottom:    20,
  },
  cardTitle: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 6 },
  cardDesc:  { color: '#666', fontSize: 13, marginBottom: 20, lineHeight: 18 },

  label:    { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor:   '#0f0f23',
    borderWidth:       1,
    borderColor:       '#2d2d4e',
    borderRadius:      8,
    paddingHorizontal: 14,
    paddingVertical:   12,
    color:             '#fff',
    fontSize:          20,
    fontWeight:        '700',
    marginBottom:      16,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center' },

  currencyRow:       { flexDirection: 'row', gap: 8, marginBottom: 20 },
  currencyBtn:       { borderWidth: 1, borderColor: '#2d2d4e', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  currencyBtnActive: { borderColor: '#7c6af7', backgroundColor: '#2d1a4e' },
  currencyText:      { color: '#555', fontWeight: '600' },
  currencyTextActive:{ color: '#7c6af7' },

  error: { color: '#ff6b6b', fontSize: 13, marginBottom: 12, textAlign: 'center' },

  payBtn:         { backgroundColor: '#7c6af7', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },

  resultSection: { marginBottom: 20 },
  resultTitle:   { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 10 },

  intentCard: {
    backgroundColor: '#1a1a2e',
    borderRadius:    12,
    padding:         16,
    borderWidth:     1,
    borderColor:     '#51cf6633',
  },
  intentRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2d2d4e' },
  intentLabel:  { color: '#888', fontSize: 13 },
  intentId:     { color: '#aaa', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', flex: 1, textAlign: 'right' },
  intentAmount: { color: '#fff', fontSize: 15, fontWeight: '700' },

  chip:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '700' },

  hint: { color: '#555', fontSize: 12, marginTop: 10, lineHeight: 17 },

  infoBox:   { backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16 },
  infoTitle: { color: '#7c6af7', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  infoText:  { color: '#666', fontSize: 13, lineHeight: 20 },
})
