import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useProviderAuth } from '../../lib/provider-auth-context'
import { ProviderPortalAPI, type ProviderStats, type ProviderService } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

export default function ProviderDashboard() {
  const { providerUser, providerProfile, logout } = useProviderAuth()
  const router = useRouter()

  const [stats,     setStats]     = useState<ProviderStats | null>(null)
  const [services,  setServices]  = useState<ProviderService[]>([])
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing]= useState(false)

  const load = useCallback(async () => {
    try {
      const { stats: s, services: svc } = await ProviderPortalAPI.me()
      setStats(s)
      setServices(svc)
    } catch { /* ignore */ }
    finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleService(id: string, current: boolean) {
    try {
      await ProviderPortalAPI.toggleService(id, !current)
      setServices(prev => prev.map(s => s.id === id ? { ...s, is_available: !current } : s))
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7c6af7" />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#7c6af7" />}
    >
      <View style={styles.inner}>
      {/* Header */}
      <View style={styles.header}>
        <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
        <View style={styles.avatarRow}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>
              {(providerProfile?.name ?? providerUser?.email ?? 'P')[0].toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.avatarName} numberOfLines={1}>
              {providerProfile?.name
                ? providerProfile.name.split(' ')[0]
                : (providerUser?.email ?? '').split('@')[0]}
            </Text>
            <Text style={styles.avatarSub}>{providerUser?.email ?? 'Provider'}</Text>
          </View>
          <Pressable onPress={logout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={20} color="#aaa" />
          </Pressable>
        </View>
      </View>

      {/* Stats */}
      {stats && (
        <View style={styles.statsRow}>
          <Pressable
            style={[styles.statCard, styles.statPending]}
            onPress={() => router.push('/(provider)/bookings?status=pending')}
          >
            <Text style={styles.statNum}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </Pressable>
          <Pressable
            style={[styles.statCard, styles.statConfirmed]}
            onPress={() => router.push('/(provider)/bookings?status=confirmed')}
          >
            <Text style={styles.statNum}>{stats.confirmed}</Text>
            <Text style={styles.statLabel}>Confirmed</Text>
          </Pressable>
          <View style={[styles.statCard, styles.statToday]}>
            <Text style={styles.statNum}>{stats.today}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
        </View>
      )}

      {/* Quick actions */}
      <View style={styles.quickRow}>
        <Pressable style={styles.quickBtn} onPress={() => router.push('/(provider)/bookings')}>
          <Ionicons name="calendar" size={22} color="#7c6af7" />
          <Text style={styles.quickLabel}>Requests</Text>
        </Pressable>
        <Pressable style={styles.quickBtn} onPress={() => router.push('/(provider)/availability')}>
          <Ionicons name="time" size={22} color="#7c6af7" />
          <Text style={styles.quickLabel}>Hours</Text>
        </Pressable>
        <Pressable style={styles.quickBtn} onPress={() => router.push('/(provider)/services')}>
          <Ionicons name="images" size={22} color="#7c6af7" />
          <Text style={styles.quickLabel}>Images</Text>
        </Pressable>
      </View>

      {/* Services toggle */}
      <Text style={styles.sectionTitle}>My Services</Text>
      {services.length === 0 ? (
        <Text style={styles.empty}>No services added yet.</Text>
      ) : (
        services.map(svc => (
          <View key={svc.id} style={styles.serviceRow}>
            <View style={styles.serviceInfo}>
              <Text style={styles.serviceTitle}>{svc.title}</Text>
              <Text style={styles.serviceSub}>
                ₹{(svc.price_paise / 100).toFixed(0)} · {svc.duration_mins} min
              </Text>
            </View>
            <Pressable
              style={[styles.toggleBtn, svc.is_available ? styles.toggleOn : styles.toggleOff]}
              onPress={() => toggleService(svc.id, svc.is_available)}
            >
              <Text style={[styles.toggleText, !svc.is_available && styles.toggleTextOff]}>
                {svc.is_available ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
          </View>
        ))
      )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#f8f8f8' },
  content: { alignItems: 'center', padding: 16, paddingBottom: 40 },
  inner:   { width: '100%', maxWidth: 520 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f8f8' },

  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   24,
    backgroundColor: '#fff',
    borderRadius:   16,
    padding:        16,
    borderWidth:    1,
    borderColor:    '#ebebf5',
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 2 },
    shadowOpacity:  0.05,
    shadowRadius:   8,
    elevation:      2,
  },
  logoImg:  { width: 100, height: 36 },
  avatarRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    backgroundColor: '#f8f8fc',
    borderRadius:    22,
    paddingVertical:  6,
    paddingLeft:      6,
    paddingRight:    12,
  },
  avatarCircle: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: '#0f0f23',
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarLetter: { color: '#7c6af7', fontWeight: '900', fontSize: 15 },
  avatarName:   { color: '#0f0f23', fontWeight: '800', fontSize: 13, maxWidth: 90 },
  avatarSub:    { color: '#aaa', fontSize: 10, marginTop: 1 },
  logoutBtn:    { padding: 4, marginLeft: 4 },
  greeting:     { color: '#aaa', fontSize: 13 },
  providerName: { color: '#0f0f23', fontSize: 22, fontWeight: '800', marginTop: 2 },
  address:      { color: '#888', fontSize: 12, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard:  { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1 },
  statPending:   { backgroundColor: '#fff8e1', borderColor: '#fde68a' },
  statConfirmed: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  statToday:     { backgroundColor: '#ede9fe', borderColor: '#c4b5fd' },
  statNum:   { color: '#0f0f23', fontSize: 26, fontWeight: '800' },
  statLabel: { color: '#888',    fontSize: 12, marginTop: 2 },

  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  quickBtn: {
    flex:            1,
    backgroundColor: '#fff',
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
    gap:             6,
    borderWidth:     1,
    borderColor:     '#ebebf5',
    shadowColor:     '#7c6af7',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    8,
    elevation:       2,
  },
  quickLabel: { color: '#555', fontSize: 12, fontWeight: '600' },

  sectionTitle: { color: '#0f0f23', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  empty:        { color: '#bbb', fontSize: 14, textAlign: 'center', marginTop: 20 },

  serviceRow: {
    backgroundColor: '#fff',
    borderRadius:    12,
    flexDirection:   'row',
    alignItems:      'center',
    padding:         14,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     '#ebebf5',
    shadowColor:     '#7c6af7',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.04,
    shadowRadius:    6,
    elevation:       1,
  },
  serviceInfo:  { flex: 1 },
  serviceTitle: { color: '#0f0f23', fontSize: 15, fontWeight: '700' },
  serviceSub:   { color: '#888',    fontSize: 13, marginTop: 2 },

  toggleBtn:     { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  toggleOn:      { backgroundColor: '#7c6af7' },
  toggleOff:     { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  toggleText:    { color: '#fff', fontWeight: '700', fontSize: 13 },
  toggleTextOff: { color: '#888' },
})
