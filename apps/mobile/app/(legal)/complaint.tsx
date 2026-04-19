import { useState, useEffect } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { PlatformAPI, Complaint } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

const CATEGORIES = [
  { value: 'service_quality', label: 'Service Quality' },
  { value: 'payment',         label: 'Payment Issue' },
  { value: 'cancellation',    label: 'Cancellation / Refund' },
  { value: 'content',         label: 'Inappropriate Content' },
  { value: 'privacy',         label: 'Privacy Concern' },
  { value: 'other',           label: 'Other' },
] as const

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  received:    { text: 'Received',    color: '#F59E0B' },
  in_progress: { text: 'In Progress', color: '#3B82F6' },
  resolved:    { text: 'Resolved',    color: '#16A34A' },
  rejected:    { text: 'Rejected',    color: '#DC2626' },
}

export default function ComplaintScreen() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const maxW = width >= 1024 ? 760 : width >= 600 ? 640 : Math.min(width, 520)

  const [tab, setTab] = useState<'file' | 'history'>('file')

  // ── File complaint state ──
  const [category,    setCategory]    = useState('')
  const [description, setDescription] = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // ── History state ──
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    if (tab === 'history') {
      setLoadingHistory(true)
      PlatformAPI.myComplaints()
        .then(data => setComplaints(data.complaints))
        .catch(() => {})
        .finally(() => setLoadingHistory(false))
    }
  }, [tab])

  async function handleSubmit() {
    if (!category) { setError('Please select a category'); return }
    if (description.trim().length < 10) { setError('Please describe your issue in at least 10 characters'); return }

    setSubmitting(true)
    setError(null)
    try {
      await PlatformAPI.fileComplaint({ category, description: description.trim() })
      setSubmitted(true)
      setCategory('')
      setDescription('')
    } catch (e: any) {
      setError(e?.message ?? 'Failed to submit complaint')
    } finally {
      setSubmitting(false)
    }
  }

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

        {/* Tabs */}
        <View style={s.tabs}>
          <Pressable style={[s.tab, tab === 'file' && s.tabActive]} onPress={() => { setTab('file'); setSubmitted(false) }}>
            <Text style={[s.tabText, tab === 'file' && s.tabTextActive]}>File Complaint</Text>
          </Pressable>
          <Pressable style={[s.tab, tab === 'history' && s.tabActive]} onPress={() => setTab('history')}>
            <Text style={[s.tabText, tab === 'history' && s.tabTextActive]}>My Complaints</Text>
          </Pressable>
        </View>

        {tab === 'file' ? (
          <View style={s.card}>
            {submitted ? (
              <View style={s.successBox}>
                <Text style={s.successIcon}>✅</Text>
                <Text style={s.successTitle}>Complaint Submitted</Text>
                <Text style={s.successBody}>
                  Your complaint has been received. We will acknowledge it within 48 hours and aim to resolve it within 1 month.
                </Text>
                <Pressable style={s.submitBtn} onPress={() => setSubmitted(false)}>
                  <Text style={s.submitBtnText}>File Another</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={s.title}>Grievance Redressal</Text>
                <Text style={s.subtitle}>
                  As per the Consumer Protection (E-Commerce) Rules, 2020, you have the right to file a complaint. We will acknowledge within 48 hours.
                </Text>

                <Text style={s.label}>Category</Text>
                <View style={s.categoryGrid}>
                  {CATEGORIES.map(c => (
                    <Pressable
                      key={c.value}
                      style={[s.categoryChip, category === c.value && s.categoryChipActive]}
                      onPress={() => setCategory(c.value)}
                    >
                      <Text style={[s.categoryText, category === c.value && s.categoryTextActive]}>
                        {c.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={s.label}>Description</Text>
                <TextInput
                  style={s.textArea}
                  multiline
                  numberOfLines={5}
                  placeholder="Describe your issue in detail..."
                  placeholderTextColor="#9CA3AF"
                  value={description}
                  onChangeText={setDescription}
                  textAlignVertical="top"
                />

                {error && <Text style={s.error}>{error}</Text>}

                <Pressable style={[s.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
                  {submitting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.submitBtnText}>Submit Complaint</Text>}
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <View style={s.card}>
            <Text style={s.title}>My Complaints</Text>
            {loadingHistory ? (
              <ActivityIndicator color="#E8590C" style={{ marginTop: 20 }} />
            ) : complaints.length === 0 ? (
              <Text style={s.emptyText}>No complaints filed yet.</Text>
            ) : (
              complaints.map(c => {
                const st = STATUS_LABEL[c.status] ?? { text: c.status, color: '#6B7280' }
                return (
                  <View key={c.id} style={s.complaintItem}>
                    <View style={s.complaintHeader}>
                      <Text style={s.complaintCategory}>
                        {CATEGORIES.find(cat => cat.value === c.category)?.label ?? c.category}
                      </Text>
                      <View style={[s.statusBadge, { backgroundColor: st.color + '18' }]}>
                        <Text style={[s.statusText, { color: st.color }]}>{st.text}</Text>
                      </View>
                    </View>
                    <Text style={s.complaintDesc} numberOfLines={3}>{c.description}</Text>
                    {c.resolution && (
                      <Text style={s.complaintResolution}>Resolution: {c.resolution}</Text>
                    )}
                    <Text style={s.complaintDate}>
                      {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                )
              })
            )}
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { alignItems: 'center', padding: 16, paddingBottom: 40 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12, paddingVertical: 8,
  },
  backBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { color: '#E8590C', fontWeight: '700', fontSize: 14 },
  logo:     { width: 80, height: 30 },

  tabs: {
    flexDirection: 'row', marginBottom: 16, borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#F3F4F6', overflow: 'hidden',
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#E8590C',
  },
  tabText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  tabTextActive: { color: '#fff' },

  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  title:    { fontSize: 20, fontWeight: '800', color: '#1B1B1B', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#6B7280', lineHeight: 20, marginBottom: 20 },

  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 4 },

  categoryGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16,
  },
  categoryChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },
  categoryChipActive: {
    backgroundColor: '#FFF4ED', borderColor: '#E8590C',
  },
  categoryText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  categoryTextActive: { color: '#E8590C' },

  textArea: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    padding: 14, fontSize: 14, color: '#1B1B1B', minHeight: 120,
    backgroundColor: '#FAFAFA', marginBottom: 16,
  },

  error: { color: '#DC2626', fontSize: 13, marginBottom: 12, textAlign: 'center' },

  submitBtn: {
    backgroundColor: '#E8590C', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // Success
  successBox:   { alignItems: 'center', paddingVertical: 20 },
  successIcon:  { fontSize: 40, marginBottom: 12 },
  successTitle: { fontSize: 18, fontWeight: '800', color: '#1B1B1B', marginBottom: 8 },
  successBody:  { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 20, paddingHorizontal: 10 },

  // History
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 20, marginBottom: 10 },
  complaintItem: {
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingVertical: 14,
  },
  complaintHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  complaintCategory: { fontSize: 14, fontWeight: '700', color: '#1B1B1B' },
  statusBadge: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  complaintDesc: { fontSize: 13, color: '#374151', lineHeight: 20 },
  complaintResolution: { fontSize: 12, color: '#16A34A', marginTop: 6, fontStyle: 'italic' },
  complaintDate: { fontSize: 11, color: '#9CA3AF', marginTop: 6 },
})
