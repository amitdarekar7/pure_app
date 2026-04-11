import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useProviderAuth } from '../../lib/provider-auth-context'
import { ProviderPortalAPI, type ProviderBooking } from '../../lib/api'
import { useEventStream, type BookingRequestedEvent } from '../../lib/use-event-stream'

const LOGO = require('../../assets/images/logo_pure.png')

const STATUS_FILTERS = ['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'] as const

const STATUS_META: Record<string, { color: string; bg: string; icon: string }> = {
  pending:     { color: '#D97706', bg: '#FFFBEB', icon: '⏳' },
  confirmed:   { color: '#059669', bg: '#ECFDF5', icon: '✅' },
  in_progress: { color: '#2563EB', bg: '#EFF6FF', icon: '🔄' },
  completed:   { color: '#6B7280', bg: '#F3F4F6', icon: '✓' },
  cancelled:   { color: '#DC2626', bg: '#FEF2F2', icon: '✕' },
  no_show:     { color: '#9333EA', bg: '#F5F3FF', icon: '👻' },
}

function fmt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDateOnly(iso: string) {
  const d = new Date(iso)
  const day = d.getDate()
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function fmtTimeOnly(iso: string) {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatPrice(paise: number) {
  return `₹${Math.round(paise / 100)}`
}

function isUpcoming(iso: string) {
  return new Date(iso) > new Date()
}

// ─── Reschedule date/time helpers ─────────────────────────────────────────────

function buildDateOptions(): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = []
  const today = new Date()
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`
    options.push({ label, value: d.toISOString().slice(0, 10) })
  }
  return options
}

function buildTimeOptions(): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = []
  for (let h = 8; h <= 21; h++) {
    for (let m = 0; m < 60; m += 30) {
      const ampm = h >= 12 ? 'PM' : 'AM'
      const h12 = h % 12 === 0 ? 12 : h % 12
      const label = `${h12}:${String(m).padStart(2, '0')} ${ampm}`
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      options.push({ label, value })
    }
  }
  return options
}

const DATE_OPTIONS = buildDateOptions()
const TIME_OPTIONS = buildTimeOptions()

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProviderBookingsScreen() {
  const { providerUser, providerProfile } = useProviderAuth()
  const params = useLocalSearchParams<{ status?: string }>()
  const router = useRouter()

  const [filter, setFilter]               = useState<string>(params.status ?? 'pending')
  const [bookings, setBookings]           = useState<ProviderBooking[]>([])
  const [loading, setLoading]             = useState(true)
  const [refreshing, setRefreshing]       = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [newBookingBanner, setNewBookingBanner] = useState<string | null>(null)

  // SSE real-time
  const { lastEvent } = useEventStream('provider')
  useEffect(() => {
    if (!lastEvent || lastEvent.event_type !== 'booking.requested') return
    const ev = lastEvent as BookingRequestedEvent
    setNewBookingBanner(`New booking from ${ev.data.user_name ?? 'a user'} for ${ev.data.service_title}`)
    load(filter)
    const t = setTimeout(() => setNewBookingBanner(null), 6_000)
    return () => clearTimeout(t)
  }, [lastEvent])

  // Reschedule state
  const [rescheduleId, setRescheduleId]       = useState<string | null>(null)
  const [rescheduleDate, setRescheduleDate]   = useState(DATE_OPTIONS[0].value)
  const [rescheduleTime, setRescheduleTime]   = useState('10:00')
  const [rescheduleStep, setRescheduleStep]   = useState<'date' | 'time'>('date')

  const load = useCallback(async (f: string) => {
    try {
      const { bookings: b } = await ProviderPortalAPI.bookings(f === 'all' ? undefined : f)
      setBookings(b)
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { setLoading(true); load(filter) }, [filter, load])

  async function act(id: string, action: 'confirm' | 'reject') {
    setActionLoading(id + action)
    try {
      await ProviderPortalAPI.updateBooking(id, action)
      await load(filter)
    } catch { /* ignore */ }
    finally { setActionLoading(null) }
  }

  function openReschedule(b: ProviderBooking) {
    setRescheduleId(b.id)
    setRescheduleStep('date')
    setRescheduleDate(DATE_OPTIONS[0].value)
    setRescheduleTime('10:00')
  }

  async function confirmReschedule() {
    if (!rescheduleId) return
    setActionLoading(rescheduleId + 'reschedule')
    try {
      const iso = new Date(`${rescheduleDate}T${rescheduleTime}:00`).toISOString()
      await ProviderPortalAPI.updateBooking(rescheduleId, 'reschedule', iso)
      setRescheduleId(null)
      await load(filter)
    } catch { /* ignore */ }
    finally { setActionLoading(null) }
  }

  const firstName = providerProfile?.name
    ? providerProfile.name.split(' ')[0]
    : (providerUser?.email ?? '').split('@')[0]

  const filteredCount = bookings.length

  return (
    <View style={styles.root}>
      <View style={styles.centerWrap}>

        {/* ═══════════════════════════════════════════════════════════════════
            HEADER
         ═══════════════════════════════════════════════════════════════════ */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Pressable onPress={() => router.push('/(provider)/dashboard')}>
              <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
            </Pressable>
            <Pressable style={styles.avatarPill} onPress={() => router.push('/(provider)/profile')}>
              {providerProfile?.profile_image_url ? (
                <Image source={{ uri: providerProfile.profile_image_url }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarLetter}>
                    {(providerProfile?.name ?? providerUser?.email ?? 'P')[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.avatarName} numberOfLines={1}>{providerProfile?.name ?? firstName}</Text>
            </Pressable>
          </View>
          <Text style={styles.headerTitle}>Bookings</Text>
          <Text style={styles.headerHint}>
            Manage your customer bookings. Accept, reschedule, or reject requests.
          </Text>
        </View>

        {/* ── New booking banner ── */}
        {newBookingBanner && (
          <View style={styles.bannerCard}>
            <Text style={styles.bannerIcon}>🔔</Text>
            <Text style={styles.bannerText} numberOfLines={2}>{newBookingBanner}</Text>
            <Pressable onPress={() => setNewBookingBanner(null)}>
              <Text style={styles.bannerClose}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* ── Filter chips ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
          style={styles.filtersBar}
        >
          {STATUS_FILTERS.map(s => {
            const active = filter === s
            const meta = s !== 'all' ? STATUS_META[s] : null
            return (
              <Pressable
                key={s}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setFilter(s)}
              >
                {meta && <Text style={styles.chipIcon}>{meta.icon}</Text>}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {s === 'all' ? 'All' : s.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {/* ── Count ── */}
        {!loading && (
          <View style={styles.countRow}>
            <Text style={styles.countText}>
              {filteredCount} booking{filteredCount !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            BOOKING LIST
         ═══════════════════════════════════════════════════════════════════ */}
        {loading ? (
          <View style={styles.centerFlex}>
            <ActivityIndicator size="large" color={ACCENT} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); load(filter) }}
                tintColor={ACCENT}
              />
            }
          >
            {bookings.length === 0 && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>📭</Text>
                <Text style={styles.emptyTitle}>
                  No {filter === 'all' ? '' : filter.replace('_', ' ')} bookings
                </Text>
                <Text style={styles.emptySub}>
                  When customers book your services, they'll appear here.
                </Text>
              </View>
            )}

            {bookings.map(b => {
              const meta = STATUS_META[b.status] ?? STATUS_META.pending
              const upcoming = isUpcoming(b.scheduled_at)
              return (
                <View key={b.id} style={styles.card}>
                  {/* Status strip on top */}
                  <View style={[styles.cardStrip, { backgroundColor: meta.color }]} />

                  <View style={styles.cardBody}>
                    {/* Top: customer + status */}
                    <View style={styles.cardTop}>
                      <View style={styles.customerBlock}>
                        <View style={styles.customerAvatar}>
                          <Text style={styles.customerAvatarText}>
                            {(b.user_name ?? b.user_email ?? '?')[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.customerName}>{b.user_name ?? b.user_email}</Text>
                          {b.user_phone && <Text style={styles.customerPhone}>📞 {b.user_phone}</Text>}
                        </View>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                        <Text style={styles.statusIcon}>{meta.icon}</Text>
                        <Text style={[styles.statusText, { color: meta.color }]}>
                          {b.status.replace('_', ' ')}
                        </Text>
                      </View>
                    </View>

                    {/* Service info */}
                    <View style={styles.serviceRow}>
                      <View style={styles.serviceInfoBlock}>
                        <Text style={styles.serviceLabel}>Service</Text>
                        <Text style={styles.serviceName}>{b.service_title}</Text>
                      </View>
                      <View style={styles.priceBlock}>
                        <Text style={styles.priceLabel}>Amount</Text>
                        <Text style={styles.priceValue}>{formatPrice(b.price_paise)}</Text>
                      </View>
                    </View>

                    {/* Date/time row */}
                    <View style={styles.dateTimeRow}>
                      <View style={styles.dateChip}>
                        <Text style={styles.dateChipIcon}>📅</Text>
                        <Text style={styles.dateChipText}>{fmtDateOnly(b.scheduled_at)}</Text>
                      </View>
                      <View style={styles.dateChip}>
                        <Text style={styles.dateChipIcon}>🕐</Text>
                        <Text style={styles.dateChipText}>{fmtTimeOnly(b.scheduled_at)}</Text>
                      </View>
                      {upcoming && (
                        <View style={[styles.dateChip, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                          <Text style={[styles.dateChipText, { color: '#059669' }]}>Upcoming</Text>
                        </View>
                      )}
                    </View>

                    {/* Notes */}
                    {b.notes ? (
                      <View style={styles.notesRow}>
                        <Text style={styles.notesIcon}>💬</Text>
                        <Text style={styles.notesText}>"{b.notes}"</Text>
                      </View>
                    ) : null}

                    {/* Payment mode */}
                    {b.payment_mode && (
                      <View style={styles.payModeBadge}>
                        <Text style={styles.payModeText}>
                          {b.payment_mode === 'prepaid' ? '📱 Paid via App' : '💳 Pay at Venue'}
                        </Text>
                      </View>
                    )}

                    {/* Action buttons */}
                    {(b.status === 'pending' || b.status === 'confirmed') && (
                      <View style={styles.actions}>
                        {b.status === 'pending' && (
                          <Pressable
                            style={[styles.actionBtn, styles.acceptBtn]}
                            onPress={() => act(b.id, 'confirm')}
                            disabled={!!actionLoading}
                          >
                            {actionLoading === b.id + 'confirm'
                              ? <ActivityIndicator size="small" color="#fff" />
                              : <Text style={styles.actionBtnText}>✓ Accept</Text>}
                          </Pressable>
                        )}
                        <Pressable
                          style={[styles.actionBtn, styles.rescheduleBtn]}
                          onPress={() => openReschedule(b)}
                          disabled={!!actionLoading}
                        >
                          <Text style={styles.actionBtnText}>📅 Reschedule</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.actionBtn, styles.rejectBtn]}
                          onPress={() => act(b.id, 'reject')}
                          disabled={!!actionLoading}
                        >
                          {actionLoading === b.id + 'reject'
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.actionBtnText}>✕ Reject</Text>}
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              )
            })}
            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </View>

      {/* ═══════════════════════════════════════════════════════════════════
          RESCHEDULE MODAL — web-compatible with date + time selection
       ═══════════════════════════════════════════════════════════════════ */}
      {rescheduleId !== null && (
        <Modal transparent animationType="fade" visible>
          <Pressable style={styles.modalOverlay} onPress={() => setRescheduleId(null)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>📅 Reschedule Booking</Text>
                <Text style={styles.modalSub}>Pick a new date and time</Text>
              </View>

              {rescheduleStep === 'date' ? (
                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalSectionLabel}>Select Date</Text>
                  {DATE_OPTIONS.map(opt => {
                    const sel = opt.value === rescheduleDate
                    return (
                      <Pressable
                        key={opt.value}
                        style={[styles.modalOption, sel && styles.modalOptionSel]}
                        onPress={() => { setRescheduleDate(opt.value); setRescheduleStep('time') }}
                      >
                        <Text style={[styles.modalOptionText, sel && styles.modalOptionTextSel]}>
                          {opt.label}
                        </Text>
                        <Text style={styles.modalOptionArrow}>→</Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              ) : (
                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  <Pressable style={styles.backRow} onPress={() => setRescheduleStep('date')}>
                    <Text style={styles.backArrow}>←</Text>
                    <Text style={styles.backText}>Back to dates</Text>
                  </Pressable>
                  <Text style={styles.modalSectionLabel}>Select Time</Text>
                  <View style={styles.timeGrid}>
                    {TIME_OPTIONS.map(opt => {
                      const sel = opt.value === rescheduleTime
                      return (
                        <Pressable
                          key={opt.value}
                          style={[styles.timeGridItem, sel && styles.timeGridItemSel]}
                          onPress={() => setRescheduleTime(opt.value)}
                        >
                          <Text style={[styles.timeGridText, sel && styles.timeGridTextSel]}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </ScrollView>
              )}

              <View style={styles.modalFooter}>
                <Pressable style={styles.modalCancelBtn} onPress={() => setRescheduleId(null)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                {rescheduleStep === 'time' && (
                  <Pressable
                    style={[styles.modalConfirmBtn, !!actionLoading && { opacity: 0.6 }]}
                    onPress={confirmReschedule}
                    disabled={!!actionLoading}
                  >
                    {actionLoading?.endsWith('reschedule')
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.modalConfirmText}>Confirm</Text>}
                  </Pressable>
                )}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
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
  centerWrap: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  centerFlex: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Header ──
  headerCard: {
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    marginBottom: 2,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoImg: { width: 80, height: 30 },
  avatarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 24,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '900', fontSize: 14 },
  avatarImg: { width: 32, height: 32, borderRadius: 16 },
  avatarName: { color: DARK, fontWeight: '800', fontSize: 12, maxWidth: 100 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: DARK, letterSpacing: -0.5, marginBottom: 4 },
  headerHint: { fontSize: 13, color: GREY, lineHeight: 18 },

  // ── Banner ──
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: ACCENT,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  bannerIcon: { fontSize: 18 },
  bannerText: { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 },
  bannerClose: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '700', padding: 4 },

  // ── Filters ──
  filtersBar: {
    maxHeight: 54,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  filtersRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipIcon: { fontSize: 12 },
  chipText: { color: GREY, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '800' },

  countRow: { paddingHorizontal: 16, paddingVertical: 8 },
  countText: { fontSize: 12, fontWeight: '700', color: GREY },

  // ── List ──
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },

  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    marginTop: 20,
  },
  emptyEmoji: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: DARK, marginBottom: 4 },
  emptySub: { fontSize: 13, color: GREY, textAlign: 'center', lineHeight: 19 },

  // ── Booking card ──
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardStrip: { height: 4 },
  cardBody: { padding: 16 },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  customerBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  customerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  customerAvatarText: { fontSize: 15, fontWeight: '800', color: DARK },
  customerName: { fontSize: 15, fontWeight: '800', color: DARK },
  customerPhone: { fontSize: 11, color: GREY, marginTop: 2 },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusIcon: { fontSize: 12 },
  statusText: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },

  // ── Service info ──
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  serviceInfoBlock: {},
  serviceLabel: { fontSize: 10, fontWeight: '600', color: GREY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  serviceName: { fontSize: 15, fontWeight: '800', color: DARK },
  priceBlock: { alignItems: 'flex-end' },
  priceLabel: { fontSize: 10, fontWeight: '600', color: GREY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  priceValue: { fontSize: 18, fontWeight: '900', color: ACCENT },

  // ── Date/time chips ──
  dateTimeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateChipIcon: { fontSize: 12 },
  dateChipText: { fontSize: 12, fontWeight: '600', color: DARK },

  // ── Notes ──
  notesRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 10 },
  notesIcon: { fontSize: 14, marginTop: 1 },
  notesText: { fontSize: 12, color: GREY, fontStyle: 'italic', flex: 1, lineHeight: 17 },

  payModeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: ACCENT_BG,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FFDAC8',
  },
  payModeText: { fontSize: 11, fontWeight: '700', color: ACCENT },

  // ── Actions ──
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  acceptBtn: { backgroundColor: '#059669' },
  rescheduleBtn: { backgroundColor: '#2563EB' },
  rejectBtn: { backgroundColor: '#DC2626' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // ── Reschedule Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: 520,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  modalHeader: {
    padding: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: DARK },
  modalSub: { fontSize: 13, color: GREY, marginTop: 2 },
  modalScroll: { maxHeight: 340, padding: 12 },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: GREY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },

  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  modalOptionSel: { backgroundColor: ACCENT_BG },
  modalOptionText: { fontSize: 15, fontWeight: '600', color: DARK },
  modalOptionTextSel: { color: ACCENT, fontWeight: '800' },
  modalOptionArrow: { fontSize: 16, color: '#D1D5DB' },

  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingLeft: 4,
  },
  backArrow: { fontSize: 18, color: ACCENT, fontWeight: '700' },
  backText: { fontSize: 13, fontWeight: '700', color: ACCENT },

  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeGridItem: {
    width: '30%',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  timeGridItemSel: {
    borderColor: ACCENT,
    borderWidth: 2,
    backgroundColor: ACCENT_BG,
  },
  timeGridText: { fontSize: 13, fontWeight: '600', color: DARK },
  timeGridTextSel: { color: ACCENT, fontWeight: '800' },

  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalCancelText: { color: GREY, fontWeight: '700', fontSize: 14 },
  modalConfirmBtn: {
    flex: 2,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  modalConfirmText: { color: '#fff', fontWeight: '800', fontSize: 14 },
})
