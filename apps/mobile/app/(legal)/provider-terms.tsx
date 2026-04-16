import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

const LOGO = require('../../assets/images/logo_pure.png')
const EFFECTIVE_DATE = '15 June 2025'
const COMPANY = 'Pure App'

export default function ProviderTermsScreen() {
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

          <Section title="1. Acceptance">
            By registering as a Provider on {COMPANY}, you agree to this Provider Partner Agreement in addition to the general Terms of Service. If you do not agree, do not register.
          </Section>

          <Section title="2. Eligibility">
            You must be at least 18 years old, hold a valid business identity (GST registration if applicable), and possess all licences required for the services you offer under Indian law.
          </Section>

          <Section title="3. Registration & KYC">
            You must provide accurate business and identity information during registration. This includes your PAN number, bank account details (for payouts), IFSC code, and optionally your GST number and last 4 digits of Aadhaar. Failure to provide valid KYC information may result in payout delays or account suspension.
          </Section>

          <Section title="4. Services & Listings">
            You are solely responsible for the accuracy of your service listings, prices, availability, and descriptions. You must keep your availability calendar up to date. Misleading listings may be removed without notice.
          </Section>

          <Section title="5. Bookings & Fulfilment">
            When you accept a booking, you are obligated to provide the service at the agreed time and price. Repeated cancellations or no-shows may lead to penalties or account suspension.
          </Section>

          <Section title="6. Payments & Payouts">
            Users pay through the platform. Payouts to your registered bank account are processed after service completion, minus the platform commission. You are responsible for all taxes applicable to your earnings, including GST (18%) and TDS (1% u/s 194-O).
          </Section>

          <Section title="7. Platform Commission">
            {COMPANY} charges a commission on each completed booking. The current commission rate is displayed in your provider dashboard. We may update commission rates with 30 days' prior notice.
          </Section>

          <Section title="8. Subscription">
            Access to the provider portal may require an active subscription. Subscription fees are non-refundable. Lapsed subscriptions will make your listing inactive until renewed.
          </Section>

          <Section title="9. Content & Images">
            All images and text you upload are subject to content moderation. Inappropriate, misleading, or copyrighted content will be removed. Repeated violations lead to account suspension.
          </Section>

          <Section title="10. Customer Disputes">
            You agree to work with {COMPANY} in good faith to resolve customer complaints. We may issue refunds to customers at our discretion if a service was not delivered as described.
          </Section>

          <Section title="11. Data & Privacy">
            You will receive customer names and booking details necessary to fulfil appointments. You must not use customer data for any purpose other than providing the booked service. Misuse of customer data is grounds for immediate termination.
          </Section>

          <Section title="12. Prohibited Conduct">
            You must not: take bookings outside the platform to avoid commission; solicit customer contact details for off-platform transactions; post fake reviews; discriminate against customers; offer illegal services.
          </Section>

          <Section title="13. Limitation of Liability">
            {COMPANY} is a marketplace and is not liable for any injury, loss, or damage arising from services you provide. You agree to indemnify {COMPANY} against any claims from customers.
          </Section>

          <Section title="14. Termination">
            Either party may terminate this agreement at any time. {COMPANY} may suspend or terminate your account for violation of these terms. Outstanding payouts will be processed upon termination, minus any pending disputes.
          </Section>

          <Section title="15. Governing Law">
            This agreement is governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Bengaluru, Karnataka.
          </Section>

          <Section title="16. Grievance Officer">
            For complaints, contact our Grievance Officer:{'\n'}Email: grievance@pureapp.in{'\n'}Response time: within 48 hours.
          </Section>

          <Section title="17. Changes">
            We may update this agreement. Material changes will be communicated via email or in-app notification with at least 15 days' notice.
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
