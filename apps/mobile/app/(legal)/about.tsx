import { useEffect, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { PlatformAPI, PlatformInfo } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

export default function AboutScreen() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const maxW = width >= 1024 ? 760 : width >= 600 ? 640 : Math.min(width, 520)

  const [info, setInfo] = useState<PlatformInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    PlatformAPI.info()
      .then((data) => setInfo(data.info))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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

        {loading ? (
          <ActivityIndicator size="large" color="#E8590C" style={{ marginTop: 40 }} />
        ) : (
          <View style={s.card}>
            <Text style={s.title}>About Us</Text>

            <InfoRow label="Company Name" value={info?.platform_legal_name} />
            <InfoRow label="CIN" value={info?.platform_cin} />
            <InfoRow label="GSTIN" value={info?.platform_gstin} />
            <InfoRow label="Registered Address" value={info?.platform_address} />
            <InfoRow label="Email" value={info?.platform_email} />
            <InfoRow label="Phone" value={info?.platform_phone} />

            <View style={s.divider} />

            <Text style={s.sectionTitle}>Grievance Officer</Text>
            <Text style={s.body}>
              As per the Consumer Protection (E-Commerce) Rules, 2020 and the Information
              Technology (Intermediary Guidelines) Rules, 2021:
            </Text>
            <InfoRow label="Name" value={info?.grievance_officer} />
            <InfoRow label="Email" value={info?.grievance_email} />
            <Text style={s.response}>Complaints will be acknowledged within 48 hours and resolved within 1 month.</Text>

            <View style={s.divider} />

            <Text style={s.sectionTitle}>Nodal Contact Person</Text>
            <Text style={s.body}>
              For law enforcement and government agency queries:
            </Text>
            <InfoRow label="Name" value={info?.nodal_officer} />
            <InfoRow label="Email" value={info?.nodal_email} />
          </View>
        )}
      </View>
    </ScrollView>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
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
  title: {
    fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: '800', color: '#1B1B1B', marginBottom: 8,
  },
  body: {
    fontSize: 13, color: '#6B7280', lineHeight: 20, marginBottom: 12,
  },
  response: {
    fontSize: 12, color: '#9CA3AF', marginTop: 8, fontStyle: 'italic',
  },
  divider: {
    height: 1, backgroundColor: '#E5E7EB', marginVertical: 20,
  },
  infoRow: {
    flexDirection: 'row', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    width: 130, fontSize: 13, color: '#6B7280', fontWeight: '600',
  },
  infoValue: {
    flex: 1, fontSize: 13, color: '#374151',
  },
})
