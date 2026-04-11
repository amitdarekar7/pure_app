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
import { useLocalSearchParams } from 'expo-router'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { useProviderAuth } from '../../lib/provider-auth-context'
import { ProviderPortalAPI, type ProviderBooking } from '../../lib/api'
import { useEventStream, type BookingRequestedEvent } from '../../lib/use-event-stream'

const LOGO = require('../../assets/images/logo_pure.png')

const STATUS_FILTERS = ['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'] as const

const STATUS_COLOR: Record<string, string> = {
  pending:     '#d97706',
  confirmed:   '#059669',
  in_progress: '#2563eb',
  completed:   '#6b7280',
  cancelled:   '#dc2626',
}

function fmt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ProviderBookingsScreen() {
  const { providerUser, providerProfile } = useProviderAuth()
  const params = useLocalSearchParams<{ status?: string }>()

  const [filter,      setFilter]      = useState<string>(params.status ?? 'pending')
  const [bookings,    setBookings]    = useState<ProviderBooking[]>([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [newBookingBanner, setNewBookingBanner] = useState<string | null>(null)

  // Real-time SSE: fires when a user places a booking with this provider
  const { lastEvent } = useEventStream('provider')
  useEffect(() => {
    if (!lastEvent || lastEvent.event_type !== 'booking.requested') return
    const ev = lastEvent as BookingRequestedEvent
    setNewBookingBanner(`New booking from ${ev.data.user_name ?? 'a user'} for ${ev.data.service_title}`)
    // Reload the list so the new booking appears immediately
    load(filter)
    // Auto-dismiss banner after 6 s
    const t = setTimeout(() => setNewBookingBanner(null), 6_000)
    return () => clearTimeout(t)
  }, [lastEvent])

  // Reschedule modal state
  const [rescheduleId,  setRescheduleId]  = useState<string | null>(null)
  const [rescheduleDate,setRescheduleDate]= useState(new Date())
  const [showPicker,    setShowPicker]    = useState(false)

  const load = useCallback(async (f: string) => {
    try {
      const { bookings: b } = await ProviderPortalAPI.bookings(f === 'all' ? undefined : f)
      setBookings(b)
    } catch { /* ignore */ }
    finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    load(filter)
  }, [filter, load])

  async function act(id: string, action: 'confirm' | 'reject') {
    setActionLoading(id + action)
    try {
      await ProviderPortalAPI.updateBooking(id, action)
      await load(filter)
    } catch { /* ignore */ }
    finally { setActionLoading(null) }
  }

  async function confirmReschedule() {
    if (!rescheduleId) return
    setActionLoading(rescheduleId + 'reschedule')
    try {
      await ProviderPortalAPI.updateBooking(rescheduleId, 'reschedule', rescheduleDate.toISOString())
      setRescheduleId(null)
      await load(filter)
    } catch { /* ignore */ }
    finally { setActionLoading(null) }
  }

  return (
    <View style={styles.root}>
      <View style={styles.centerWrap}>
      {/* Logo + user header */}
      <View style={styles.pageHeader}>
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
        </View>
      </View>
      {/* ── New booking banner ───────────────────────────────────── */}
      {newBookingBanner ? (
        <View style={styles.newBookingBanner}>
          <Ionicons name="notifications" size={16} color="#fff" />
          <Text style={styles.newBookingBannerText} numberOfLines={2}>{newBookingBanner}</Text>
        </View>
      ) : null}
      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersRow}
        style={styles.filtersBar}
      >
        {STATUS_FILTERS.map(s => (
          <Pressable
            key={s}
            style={[styles.chip, filter === s && styles.chipActive]}
            onPress={() => setFilter(s)}
          >
            <Text style={[styles.chipText, filter === s && styles.chipTextActive]}>
              {s.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Booking list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7c6af7" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(filter) }}
              tintColor="#7c6af7"
            />
          }
        >
          {bookings.length === 0 && (
            <Text style={styles.empty}>No {filter === 'all' ? '' : filter} bookings.</Text>
          )}
          {bookings.map(b => (
            <View key={b.id} style={styles.card}>
              {/* Top row */}
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName}>{b.user_name ?? b.user_email}</Text>
                  {b.user_phone ? (
                    <Text style={styles.customerSub}>{b.user_phone}</Text>
                  ) : null}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[b.status] + '33' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[b.status] }]}>
                    {b.status.replace('_', ' ')}
                  </Text>
                </View>
              </View>

              {/* Service */}
              <Text style={styles.serviceTitle}>{b.service_title}</Text>
              <Text style={styles.scheduledAt}>
                <Ionicons name="calendar-outline" size={13} color="#aaa" /> {fmt(b.scheduled_at)}
              </Text>
              <Text style={styles.price}>₹{(b.price_paise / 100).toFixed(0)}</Text>
              {b.notes ? <Text style={styles.notes}>"{b.notes}"</Text> : null}

              {/* Action buttons — only for pending/confirmed */}
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
                        : <Text style={styles.actionText}>Accept</Text>}
                    </Pressable>
                  )}
                  <Pressable
                    style={[styles.actionBtn, styles.rescheduleBtn]}
                    onPress={() => { setRescheduleId(b.id); setRescheduleDate(new Date(b.scheduled_at)); setShowPicker(true) }}
                    disabled={!!actionLoading}
                  >
                    <Text style={styles.actionText}>Reschedule</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={() => act(b.id, 'reject')}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === b.id + 'reject'
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.actionText}>Reject</Text>}
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}
      </View>

      {/* Reschedule modal */}
      <Modal
        visible={rescheduleId !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setRescheduleId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Reschedule Booking</Text>
            <Text style={styles.modalSub}>Pick a new date & time for the customer</Text>

            {(Platform.OS === 'ios' || showPicker) && (
              <DateTimePicker
                value={rescheduleDate}
                mode="datetime"
                minimumDate={new Date()}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant="light"
                onChange={(_e: DateTimePickerEvent, d?: Date) => {
                  if (d) setRescheduleDate(d)
                  if (Platform.OS === 'android') setShowPicker(false)
                }}
              />
            )}
            {Platform.OS === 'android' && !showPicker && (
              <Pressable style={styles.dateDisplay} onPress={() => setShowPicker(true)}>
                <Ionicons name="calendar" size={16} color="#7c6af7" />
                <Text style={styles.dateText}>{fmt(rescheduleDate.toISOString())}</Text>
              </Pressable>
            )}

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setRescheduleId(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirm, !!actionLoading && styles.btnDisabled]}
                onPress={confirmReschedule}
                disabled={!!actionLoading}
              >
                {actionLoading?.endsWith('reschedule')
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalConfirmText}>Confirm Reschedule</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#f8f8f8' },
  centerWrap:  { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' },

  newBookingBanner: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    backgroundColor: '#7c6af7',
    marginHorizontal: 16,
    marginBottom:   8,
    borderRadius:   12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  newBookingBannerText: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 },
  pageHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f5',
    backgroundColor: '#fff',
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
  filtersBar: { maxHeight: 56, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f5' },
  filtersRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  chip: {
    backgroundColor:   '#fafafa',
    borderRadius:      20,
    paddingHorizontal: 14,
    paddingVertical:   7,
    borderWidth:       1,
    borderColor:       '#e5e7eb',
  },
  chipActive:      { backgroundColor: '#7c6af7', borderColor: '#7c6af7' },
  chipText:        { color: '#888', fontSize: 13 },
  chipTextActive:  { color: '#fff', fontWeight: '700' },
  center:          { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f8f8' },
  list:            { padding: 16, paddingBottom: 40, gap: 12 },
  empty:           { color: '#bbb', textAlign: 'center', marginTop: 40, fontSize: 15 },
  card: {
    backgroundColor: '#fff',
    borderRadius:    14,
    padding:         16,
    borderWidth:     1,
    borderColor:     '#ebebf5',
    shadowColor:     '#7c6af7',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    8,
    elevation:       2,
  },
  cardTop:         { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  customerName:    { color: '#0f0f23', fontSize: 16, fontWeight: '700' },
  customerSub:     { color: '#888',    fontSize: 12, marginTop: 2 },
  statusBadge:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:      { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  serviceTitle:    { color: '#555', fontSize: 14, marginBottom: 4 },
  scheduledAt:     { color: '#888', fontSize: 13, marginBottom: 4 },
  price:           { color: '#7c6af7', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  notes:           { color: '#999', fontSize: 13, fontStyle: 'italic', marginBottom: 4 },
  actions:         { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn:       { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  acceptBtn:       { backgroundColor: '#059669' },
  rescheduleBtn:   { backgroundColor: '#2563eb' },
  rejectBtn:       { backgroundColor: '#dc2626' },
  actionText:      { color: '#fff', fontWeight: '600', fontSize: 13 },
  modalOverlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modal: {
    backgroundColor:      '#fff',
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    padding:              24,
    paddingBottom:        40,
    borderWidth:          1,
    borderColor:          '#f0f0f5',
  },
  modalTitle:      { color: '#0f0f23', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  modalSub:        { color: '#888',    fontSize: 14, marginBottom: 20 },
  dateDisplay: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    backgroundColor: '#f4f0ff',
    borderRadius:    10,
    padding:         14,
    marginBottom:    16,
    borderWidth:     1,
    borderColor:     '#c4b5fd',
  },
  dateText:        { color: '#0f0f23', fontSize: 15, fontWeight: '600' },
  modalActions:    { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancel: {
    flex:            1,
    backgroundColor: '#f3f4f6',
    borderRadius:    12,
    padding:         15,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     '#e5e7eb',
  },
  modalCancelText:  { color: '#666', fontWeight: '600' },
  modalConfirm:     { flex: 2, backgroundColor: '#7c6af7', borderRadius: 12, padding: 15, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontWeight: '700' },
  btnDisabled:      { opacity: 0.6 },
})
