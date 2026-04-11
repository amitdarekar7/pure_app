import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useProviderAuth } from '../../lib/provider-auth-context'
import { ProviderPortalAPI, type ProviderStats, type ProviderService } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(paise: number) {
  return `₹${Math.round(paise / 100)}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProviderDashboard() {
  const { providerUser, providerProfile, logout } = useProviderAuth()
  const router = useRouter()

  const [stats, setStats]         = useState<ProviderStats | null>(null)
  const [services, setServices]   = useState<ProviderService[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)

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

  const firstName = providerProfile?.name
    ? providerProfile.name.split(' ')[0]
    : (providerUser?.email ?? 'Provider').split('@')[0]

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load() }}
          tintColor={ACCENT}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.inner}>

        {/* ═══════════════════════════════════════════════════════════════════
            HERO HEADER
         ═══════════════════════════════════════════════════════════════════ */}
        <View style={styles.heroCard}>
          {/* Top bar: logo + avatar */}
          <View style={styles.heroTop}>
            <Pressable onPress={() => router.push('/(provider)/dashboard')}>
              <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
            </Pressable>
            <Pressable style={styles.heroRight} onPress={() => router.push('/(provider)/profile')}>
              {providerProfile?.profile_image_url ? (
                <Image source={{ uri: providerProfile.profile_image_url }} style={styles.avatarImgSm} />
              ) : (
                <View style={styles.avatarCircleSm}>
                  <Text style={styles.avatarLetterSm}>{firstName[0].toUpperCase()}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Greeting */}
          <View style={styles.greetingRow}>
            {providerProfile?.profile_image_url ? (
              <Image source={{ uri: providerProfile.profile_image_url }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarLetter}>
                  {firstName[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.greetingInfo}>
              <Text style={styles.greetingText}>{greeting},</Text>
              <Text style={styles.greetingName}>{firstName} 👋</Text>
            </View>
          </View>

          {providerProfile?.address && (
            <Text style={styles.addressText}>📍 {providerProfile.address}</Text>
          )}
        </View>

        {/* ═══════════════════════════════════════════════════════════════════
            STATS CARDS
         ═══════════════════════════════════════════════════════════════════ */}
        {stats && (
          <View style={styles.statsRow}>
            <Pressable
              style={[styles.statCard, styles.statPending]}
              onPress={() => router.push('/(provider)/bookings?status=pending')}
            >
              <View style={styles.statIconWrap}>
                <Text style={styles.statIcon}>⏳</Text>
              </View>
              <Text style={styles.statNum}>{stats.pending}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </Pressable>

            <Pressable
              style={[styles.statCard, styles.statConfirmed]}
              onPress={() => router.push('/(provider)/bookings?status=confirmed')}
            >
              <View style={[styles.statIconWrap, { backgroundColor: '#D1FAE5' }]}>
                <Text style={styles.statIcon}>✅</Text>
              </View>
              <Text style={styles.statNum}>{stats.confirmed}</Text>
              <Text style={styles.statLabel}>Confirmed</Text>
            </Pressable>

            <View style={[styles.statCard, styles.statToday]}>
              <View style={[styles.statIconWrap, { backgroundColor: '#FFF4ED' }]}>
                <Text style={styles.statIcon}>📅</Text>
              </View>
              <Text style={styles.statNum}>{stats.today}</Text>
              <Text style={styles.statLabel}>Today</Text>
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            QUICK ACTIONS
         ═══════════════════════════════════════════════════════════════════ */}
        <Text style={styles.sectionLabel}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionCard} onPress={() => router.push('/(provider)/bookings')}>
            <View style={[styles.actionIcon, { backgroundColor: '#EDE9FE' }]}>
              <Text style={styles.actionEmoji}>📋</Text>
            </View>
            <Text style={styles.actionTitle}>Requests</Text>
            <Text style={styles.actionSub}>Manage bookings</Text>
          </Pressable>

          <Pressable style={styles.actionCard} onPress={() => router.push('/(provider)/availability')}>
            <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
              <Text style={styles.actionEmoji}>🕐</Text>
            </View>
            <Text style={styles.actionTitle}>Hours</Text>
            <Text style={styles.actionSub}>Business hours</Text>
          </Pressable>

          <Pressable style={styles.actionCard} onPress={() => router.push('/(provider)/images')}>
            <View style={[styles.actionIcon, { backgroundColor: '#FCE7F3' }]}>
              <Text style={styles.actionEmoji}>📸</Text>
            </View>
            <Text style={styles.actionTitle}>Images</Text>
            <Text style={styles.actionSub}>Service photos</Text>
          </Pressable>
        </View>

        {/* ═══════════════════════════════════════════════════════════════════
            MY SERVICES
         ═══════════════════════════════════════════════════════════════════ */}
        <View style={styles.servicesSectionHeader}>
          <Text style={styles.sectionLabel}>My Services</Text>
          <Text style={styles.serviceCount}>{services.length} total</Text>
        </View>

        {services.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🏪</Text>
            <Text style={styles.emptyTitle}>No services yet</Text>
            <Text style={styles.emptySub}>Add your first service to start receiving bookings.</Text>
          </View>
        ) : (
          services.map((svc, idx) => {
            const hasDiscount = svc.discount_pct > 0
            const discountedPrice = hasDiscount
              ? Math.round(svc.price_paise * (1 - svc.discount_pct / 100))
              : null
            return (
              <View key={svc.id} style={styles.serviceCard}>
                <View style={styles.serviceTop}>
                  <View style={styles.serviceMainInfo}>
                    <View style={styles.serviceNameRow}>
                      <Text style={styles.serviceName}>{svc.title}</Text>
                      {hasDiscount && (
                        <View style={styles.discountBadge}>
                          <Text style={styles.discountBadgeText}>{svc.discount_pct}% OFF</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.serviceMetaRow}>
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipText}>⏱ {svc.duration_mins} min</Text>
                      </View>
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipText}>{svc.category_slug}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.servicePriceBlock}>
                    {hasDiscount ? (
                      <>
                        <Text style={styles.priceStrike}>{formatPrice(svc.price_paise)}</Text>
                        <Text style={styles.priceMain}>{formatPrice(discountedPrice!)}</Text>
                      </>
                    ) : (
                      <Text style={styles.priceMain}>{formatPrice(svc.price_paise)}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.serviceBottom}>
                  <Text style={styles.availLabel}>
                    {svc.is_available ? '🟢 Available' : '🔴 Unavailable'}
                  </Text>
                  <Switch
                    value={svc.is_available}
                    onValueChange={() => toggleService(svc.id, svc.is_available)}
                    trackColor={{ false: '#E5E7EB', true: '#86EFAC' }}
                    thumbColor={svc.is_available ? '#22C55E' : '#9CA3AF'}
                    style={Platform.OS === 'web' ? { height: 28 } : undefined}
                  />
                </View>
              </View>
            )
          })
        )}

        <View style={{ height: 30 }} />
      </View>
    </ScrollView>
  )
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const ACCENT    = '#E8590C'
const ACCENT_BG = '#FFF4ED'
const DARK      = '#1B1B1B'
const GREY      = '#6B7280'
const BORDER    = '#F3F4F6'

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContent: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  inner: { width: '100%', maxWidth: 560 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },

  // ── Hero header ──
  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: BORDER,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoImg: { width: 80, height: 30 },
  heroRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarCircleSm: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',
  },
  avatarLetterSm: { color: '#fff', fontWeight: '900', fontSize: 14 },
  avatarImgSm: { width: 34, height: 34, borderRadius: 17 },
  logoutPill: {
    backgroundColor: '#FEE2E2',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  logoutText: { fontSize: 12, fontWeight: '700', color: '#DC2626' },

  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  avatarLetter: { color: '#fff', fontWeight: '900', fontSize: 20 },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  greetingInfo: {},
  greetingText: { fontSize: 13, color: GREY, fontWeight: '500' },
  greetingName: { fontSize: 22, fontWeight: '900', color: DARK, marginTop: 2 },
  addressText: { fontSize: 12, color: GREY, marginTop: 6 },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statConfirmed: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statToday: {
    backgroundColor: '#FFF4ED',
    borderColor: '#FFDAC8',
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statIcon: { fontSize: 18 },
  statNum: { fontSize: 28, fontWeight: '900', color: DARK },
  statLabel: { fontSize: 11, color: GREY, fontWeight: '600', marginTop: 2 },

  // ── Quick actions ──
  sectionLabel: {
    fontSize: 18,
    fontWeight: '900',
    color: DARK,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    gap: 4,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionEmoji: { fontSize: 22 },
  actionTitle: { fontSize: 13, fontWeight: '800', color: DARK },
  actionSub: { fontSize: 10, color: GREY, textAlign: 'center' },

  // ── Services ──
  servicesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceCount: {
    fontSize: 12,
    fontWeight: '700',
    color: GREY,
    backgroundColor: BORDER,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },

  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyEmoji: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: DARK, marginBottom: 4 },
  emptySub: { fontSize: 13, color: GREY, textAlign: 'center', lineHeight: 19 },

  serviceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  serviceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 14,
    paddingBottom: 10,
  },
  serviceMainInfo: { flex: 1, marginRight: 12 },
  serviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  serviceName: { fontSize: 15, fontWeight: '800', color: DARK },
  discountBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  discountBadgeText: { fontSize: 10, fontWeight: '800', color: '#16A34A' },
  serviceMetaRow: {
    flexDirection: 'row',
    gap: 6,
  },
  metaChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaChipText: { fontSize: 11, fontWeight: '600', color: GREY },
  servicePriceBlock: { alignItems: 'flex-end' },
  priceStrike: { fontSize: 12, color: '#9CA3AF', textDecorationLine: 'line-through', marginBottom: 2 },
  priceMain: { fontSize: 18, fontWeight: '900', color: DARK },

  serviceBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: '#FAFAFA',
  },
  availLabel: { fontSize: 12, fontWeight: '700', color: GREY },
})
