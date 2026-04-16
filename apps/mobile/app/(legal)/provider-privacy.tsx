import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

const LOGO = require('../../assets/images/logo_pure.png')
const EFFECTIVE_DATE = '15 June 2025'
const COMPANY = 'Pure App'

export default function ProviderPrivacyScreen() {
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
          <Text style={s.meta}>Effective: {EFFECTIVE_DATE} | DPDPA 2023 Compliant</Text>

          <Section title="1. Data We Collect">
            <Text style={s.body}>
              <B>Account data:</B> name, email address, phone number, business name, business address.{'\n'}
              <B>KYC data:</B> PAN number, bank account number, IFSC code, account holder name, last 4 digits of Aadhaar, GST number (if applicable).{'\n'}
              <B>Business data:</B> service listings, pricing, availability schedule, profile images.{'\n'}
              <B>Transaction data:</B> booking details, payout history, commission records.{'\n'}
              <B>Usage data:</B> device information, IP address, app analytics, login activity.
            </Text>
          </Section>

          <Section title="2. Purpose of Processing">
            We process your data for: identity verification (KYC), payout processing to your bank account, booking management, tax compliance (TDS, GST), fraud prevention, content moderation, customer dispute resolution, and platform improvement.
          </Section>

          <Section title="3. Lawful Basis (DPDPA)">
            We collect and process personal data based on your consent provided at registration. KYC data is also collected under legal obligation (RBI guidelines, Income Tax Act). You may withdraw consent by deleting your account, though certain data must be retained for legal compliance.
          </Section>

          <Section title="4. Data Sharing">
            <Text style={s.body}>
              We share your data with:{'\n'}
              {'\u2022'} <B>Customers:</B> your business name, address, service listings, ratings, and profile photo are visible to users.{'\n'}
              {'\u2022'} <B>Payment processors:</B> bank details shared with our payout partner for processing payouts.{'\n'}
              {'\u2022'} <B>Tax authorities:</B> PAN, GST, and transaction data as required for TDS compliance.{'\n'}
              {'\u2022'} <B>Cloud hosting:</B> AWS for data storage and processing.{'\n'}
              {'\u2022'} <B>Law enforcement:</B> when legally required.{'\n\n'}
              We do not sell your personal data.
            </Text>
          </Section>

          <Section title="5. Data Retention">
            <Text style={s.body}>
              {'\u2022'} <B>Account data:</B> retained while your account is active.{'\n'}
              {'\u2022'} <B>KYC & financial records:</B> retained for 7 years after account closure as required by Indian tax law.{'\n'}
              {'\u2022'} <B>After deletion:</B> non-financial personal data is anonymised within 30 days.
            </Text>
          </Section>

          <Section title="6. Your Rights (DPDPA Section 11-14)">
            <Text style={s.body}>
              {'\u2022'} <B>Right to access</B> your personal data{'\n'}
              {'\u2022'} <B>Right to correction</B> of inaccurate data (update via your profile){'\n'}
              {'\u2022'} <B>Right to erasure</B> — request account deletion (KYC records retained per legal obligation){'\n'}
              {'\u2022'} <B>Right to grievance redressal</B> — contact our Grievance Officer{'\n'}
              {'\u2022'} <B>Right to nominate</B> — nominate a person to exercise rights in case of death or incapacity
            </Text>
          </Section>

          <Section title="7. KYC Data Security">
            KYC data (PAN, bank account) is encrypted at rest and in transit. Access is restricted to authorised personnel only. We store only the last 4 digits of Aadhaar — never the full number. Bank account numbers are masked in the UI after entry.
          </Section>

          <Section title="8. Data Security">
            We use HTTPS encryption, hashed passwords, restricted access controls, database encryption, and regular security audits to protect your data.
          </Section>

          <Section title="9. Cookies & Analytics">
            The web version may use essential cookies for authentication. We use anonymised analytics to improve the platform. No third-party advertising trackers are used.
          </Section>

          <Section title="10. Cross-Border Transfers">
            Your data may be stored on AWS servers located outside India. We ensure adequate safeguards as required by DPDPA.
          </Section>

          <Section title="11. Data Protection Officer">
            For any data privacy concerns:{'\n'}Email: privacy@pureapp.in{'\n'}Response time: within 72 hours.
          </Section>

          <Section title="12. Grievance Officer">
            Name: Grievance Officer, {COMPANY}{'\n'}Email: grievance@pureapp.in{'\n'}Response time: within 48 hours as per IT Act 2000.
          </Section>

          <Section title="13. Changes">
            We will notify you of material changes to this policy via email or in-app notification with at least 15 days' notice. Continued use after changes constitutes acceptance.
          </Section>
        </View>
      </View>
    </ScrollView>
  )
}

function B({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontWeight: '700' }}>{children}</Text>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.h2}>{title}</Text>
      {typeof children === 'string' ? <Text style={s.body}>{children}</Text> : children}
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
