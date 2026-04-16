import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

const LOGO = require('../../assets/images/logo_pure.png')
const EFFECTIVE_DATE = '15 June 2025'

export default function RefundScreen() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const maxW = width >= 1024 ? 760 : width >= 600 ? 640 : Math.min(width, 520)

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={{ maxWidth: maxW, width: '100%', alignSelf: 'center' }}>

        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color="#E8590C" />
            <Text style={s.backText}>Back</Text>
          </Pressable>
          <Image source={LOGO} style={s.logo} resizeMode="contain" />
        </View>

        <View style={s.card}>
          <Text style={s.meta}>Effective: {EFFECTIVE_DATE}</Text>

          <Section title="1. User Cancellations">
            Users may cancel a booking up to 4 hours before the scheduled appointment time for a full refund. Cancellations within 4 hours may attract a cancellation fee of up to 25% of the booking amount.
          </Section>

          <Section title="2. Provider Cancellations">
            If a Provider cancels a confirmed booking, the User receives a full refund. Repeated cancellations by a Provider may lead to account suspension.
          </Section>

          <Section title="3. No-Show">
            If a User does not show up for a confirmed appointment without prior cancellation, no refund will be issued. If a Provider is unavailable at the booked time, the User is entitled to a full refund.
          </Section>

          <Section title="4. Refund Processing">
            Refunds for prepaid bookings are processed within 5–7 business days to the original payment method. For "pay at venue" bookings, no refund processing is needed for user cancellations.
          </Section>

          <Section title="5. Service Quality Disputes">
            If you are unsatisfied with the quality of a service, please raise a complaint within 24 hours of the appointment. We will mediate between the User and Provider to reach a fair resolution. Partial or full refunds may be issued at our discretion.
          </Section>

          <Section title="6. Non-Refundable Items">
            Subscription fees, platform service charges, and completed bookings (where the service was delivered as described) are non-refundable.
          </Section>

          <Section title="7. How to Request a Refund">
            To request a refund:{'\n'}{'\u2022'} Cancel the booking from the "My Bookings" screen, or{'\n'}{'\u2022'} Email support@pureapp.in with your booking ID and reason.{'\n'}We aim to respond within 48 hours.
          </Section>

          <Section title="8. Contact">
            For refund queries:{'\n'}Email: support@pureapp.in{'\n'}Grievance Officer: grievance@pureapp.in
          </Section>
        </View>
      </View>
    </ScrollView>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.h2}>{title}</Text>
      <Text style={s.body}>{children}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F9FAFB' },
  scroll:  { alignItems: 'center', padding: 16, paddingBottom: 40 },
  header:  {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12, paddingVertical: 8,
  },
  backBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { color: '#E8590C', fontWeight: '700', fontSize: 14 },
  logo:     { width: 80, height: 30 },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  meta:    { fontSize: 13, color: '#6B7280', marginBottom: 20 },
  section: { marginBottom: 18 },
  h2:      { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 6 },
  body:    { fontSize: 14, color: '#374151', lineHeight: 22 },
})
