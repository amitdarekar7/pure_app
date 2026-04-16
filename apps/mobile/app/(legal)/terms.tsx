import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

const LOGO = require('../../assets/images/logo_pure.png')
const EFFECTIVE_DATE = '15 June 2025'
const COMPANY = 'Pure App'

export default function TermsScreen() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const maxW = width >= 1024 ? 760 : width >= 600 ? 640 : Math.min(width, 520)

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={{ maxWidth: maxW, width: '100%', alignSelf: 'center' }}>

        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color="#E8590C" />
            <Text style={s.backText}>Back</Text>
          </Pressable>
          <Image source={LOGO} style={s.logo} resizeMode="contain" />
        </View>

        {/* Content card */}
        <View style={s.card}>
          <Text style={s.meta}>Effective: {EFFECTIVE_DATE}</Text>

          <Section title="1. Acceptance">
            By creating an account or using {COMPANY}, you agree to these Terms. If you do not agree, do not use the platform.
          </Section>

          <Section title="2. Eligibility">
            You must be at least 18 years old. By using {COMPANY}, you represent that you meet this age requirement.
          </Section>

          <Section title="3. Accounts">
            You are responsible for maintaining the confidentiality of your login credentials. You must provide accurate information during registration and keep it up to date.
          </Section>

          <Section title="4. Platform">
            {COMPANY} connects you with beauty & wellness service providers ("Providers"). We facilitate discovery, booking, and payments but are not responsible for the quality or outcome of services rendered by Providers.
          </Section>

          <Section title="5. Bookings & Payments">
            Confirmed bookings are binding. Payments are processed through our payment partner. You may choose to prepay or pay at the venue. Cancellation and refund terms are set out in the Refund & Cancellation Policy.
          </Section>

          <Section title="6. Your Content">
            Any reviews, photos, or text you upload are checked for inappropriate content. Violations may result in content removal or account suspension.
          </Section>

          <Section title="7. Prohibited Conduct">
            You must not: post false or misleading information; harass other users or providers; attempt to bypass security measures; use the platform for any unlawful purpose.
          </Section>

          <Section title="8. Intellectual Property">
            All {COMPANY} trademarks, logos, and software are our property. User-generated content remains yours, but you grant us a licence to display it on the platform.
          </Section>

          <Section title="9. Limitation of Liability">
            To the maximum extent permitted by law, {COMPANY} shall not be liable for any indirect, incidental, or consequential damages arising from use of the platform. We do not guarantee the quality, safety, or legality of services provided by Providers.
          </Section>

          <Section title="10. Termination">
            We may suspend or terminate accounts that violate these Terms. You may delete your account at any time from your profile settings.
          </Section>

          <Section title="11. Governing Law">
            These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Bengaluru, Karnataka.
          </Section>

          <Section title="12. Grievance Officer">
            For complaints, contact our Grievance Officer:{'\n'}Email: grievance@pureapp.in{'\n'}Response time: within 48 hours.
          </Section>

          <Section title="13. Changes">
            We may update these Terms from time to time. Continued use after changes constitutes acceptance.
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
