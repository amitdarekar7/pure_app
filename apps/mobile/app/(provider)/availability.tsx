import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'expo-router'
import { useProviderAuth } from '../../lib/provider-auth-context'
import { ProviderPortalAPI, type AvailabilitySlot } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_EMOJI  = ['🌙', '💼', '💼', '💼', '💼', '💼', '🌤️']

const DEFAULT_SCHEDULE: AvailabilitySlot[] = DAY_LABELS.map((_, i) => ({
  dayOfWeek: i,
  openTime:  '09:00',
  closeTime: '22:00',
  isClosed:  i === 0,
}))

// ─── Time helpers ─────────────────────────────────────────────────────────────

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtTimeShort(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  if (m === 0) return `${hh} ${ampm}`
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`
}

// Build time options in 15-min intervals
function buildTimeOptions(): string[] {
  const options: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return options
}

const TIME_OPTIONS = buildTimeOptions()

function computeHours(open: string, close: string): string {
  const openMin = parseTimeToMinutes(open)
  const closeMin = parseTimeToMinutes(close)
  const diff = closeMin - openMin
  if (diff <= 0) return ''
  const h = Math.floor(diff / 60)
  const m = diff % 60
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AvailabilityScreen() {
  const { providerUser, providerProfile } = useProviderAuth()
  const router = useRouter()
  const [schedule, setSchedule] = useState<AvailabilitySlot[]>(DEFAULT_SCHEDULE)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [expandedDay, setExpandedDay] = useState<number | null>(null)

  // Time picker modal state
  const [picker, setPicker] = useState<{
    dayIndex: number
    field: 'openTime' | 'closeTime'
  } | null>(null)

  const scrollRef = useRef<ScrollView>(null)

  const load = useCallback(async () => {
    try {
      const { availability } = await ProviderPortalAPI.availability()
      if (availability.length > 0) {
        setSchedule(
          availability.map((s: any) => ({
            dayOfWeek: s.day_of_week ?? s.dayOfWeek,
            openTime:  (s.open_time ?? s.openTime ?? '09:00').slice(0, 5),
            closeTime: (s.close_time ?? s.closeTime ?? '22:00').slice(0, 5),
            isClosed:  s.is_closed ?? s.isClosed ?? false,
          })),
        )
      }
    } catch { /* use defaults */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function updateSlot(dayIndex: number, patch: Partial<AvailabilitySlot>) {
    setSchedule(prev => prev.map((s, i) => i === dayIndex ? { ...s, ...patch } : s))
    setSaved(false)
  }

  function openPicker(dayIndex: number, field: 'openTime' | 'closeTime') {
    setPicker({ dayIndex, field })
  }

  function selectTime(time: string) {
    if (!picker) return
    updateSlot(picker.dayIndex, { [picker.field]: time })
    setPicker(null)
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      await ProviderPortalAPI.setAvailability(schedule)
      setSaved(true)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    )
  }

  const openDays = schedule.filter(s => !s.isClosed).length
  const currentPickerValue = picker
    ? schedule[picker.dayIndex][picker.field]
    : null

  return (
    <View style={styles.root}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          {/* ─── Header ─── */}
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
                <Text style={styles.avatarName} numberOfLines={1}>
                  {providerProfile?.name
                    ? providerProfile.name.split(' ')[0]
                    : (providerUser?.email ?? '').split('@')[0]}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.headerTitle}>Business Hours</Text>
            <Text style={styles.headerHint}>
              Configure when your salon is open for bookings. Tap a time to change it.
            </Text>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statBadge}>
                <Text style={styles.statNum}>{openDays}</Text>
                <Text style={styles.statLabel}>Open days</Text>
              </View>
              <View style={styles.statBadge}>
                <Text style={styles.statNum}>{7 - openDays}</Text>
                <Text style={styles.statLabel}>Closed</Text>
              </View>
            </View>
          </View>

          {/* ─── Day Cards ─── */}
          {schedule.map((slot, i) => {
            const isExpanded = expandedDay === i
            const hours = computeHours(slot.openTime, slot.closeTime)
            return (
              <Pressable
                key={i}
                style={[styles.dayCard, slot.isClosed && styles.dayCardClosed]}
                onPress={() => setExpandedDay(isExpanded ? null : i)}
              >
                {/* Day header row */}
                <View style={styles.dayHeaderRow}>
                  <View style={styles.dayLabelBlock}>
                    <Text style={styles.dayEmoji}>{DAY_EMOJI[slot.dayOfWeek]}</Text>
                    <View>
                      <Text style={[styles.dayName, slot.isClosed && styles.dayNameClosed]}>
                        {DAY_LABELS[slot.dayOfWeek]}
                      </Text>
                      {!slot.isClosed && (
                        <Text style={styles.dayHours}>
                          {fmtTimeShort(slot.openTime)} – {fmtTimeShort(slot.closeTime)}
                          {hours ? `  ·  ${hours}` : ''}
                        </Text>
                      )}
                      {slot.isClosed && (
                        <Text style={styles.dayClosedText}>Closed all day</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.dayActions}>
                    <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                </View>

                {/* Expanded content */}
                {isExpanded && (
                  <View style={styles.dayExpanded}>
                    {/* Closed toggle */}
                    <View style={styles.closedToggleRow}>
                      <Text style={styles.closedToggleLabel}>Mark as closed</Text>
                      <Switch
                        value={slot.isClosed}
                        onValueChange={(v: boolean) => updateSlot(i, { isClosed: v })}
                        trackColor={{ false: '#E5E7EB', true: ACCENT }}
                        thumbColor="#fff"
                        style={Platform.OS === 'web' ? { height: 28 } : undefined}
                      />
                    </View>

                    {!slot.isClosed && (
                      <View style={styles.timePickerRow}>
                        {/* Open time */}
                        <Pressable
                          style={styles.timeCard}
                          onPress={(e) => { e.stopPropagation(); openPicker(i, 'openTime') }}
                        >
                          <View style={styles.timeCardIcon}>
                            <Text style={styles.timeCardIconText}>☀️</Text>
                          </View>
                          <Text style={styles.timeCardLabel}>Opens at</Text>
                          <Text style={styles.timeCardValue}>{fmtTime(slot.openTime)}</Text>
                          <Text style={styles.timeCardTap}>tap to change</Text>
                        </Pressable>

                        <View style={styles.timeArrow}>
                          <Text style={styles.timeArrowText}>→</Text>
                        </View>

                        {/* Close time */}
                        <Pressable
                          style={styles.timeCard}
                          onPress={(e) => { e.stopPropagation(); openPicker(i, 'closeTime') }}
                        >
                          <View style={[styles.timeCardIcon, { backgroundColor: '#EDE9FE' }]}>
                            <Text style={styles.timeCardIconText}>🌙</Text>
                          </View>
                          <Text style={styles.timeCardLabel}>Closes at</Text>
                          <Text style={styles.timeCardValue}>{fmtTime(slot.closeTime)}</Text>
                          <Text style={styles.timeCardTap}>tap to change</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            )
          })}

          {/* ─── Save button ─── */}
          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>
                {saved ? '✓  Schedule Saved' : 'Save Schedule'}
              </Text>
            )}
          </Pressable>

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>

      {/* ─── Time Picker Modal ─── */}
      {picker !== null && (
        <Modal transparent animationType="fade" visible>
          <Pressable style={styles.modalOverlay} onPress={() => setPicker(null)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {picker.field === 'openTime' ? '☀️ Opening Time' : '🌙 Closing Time'}
                </Text>
                <Text style={styles.modalSub}>
                  {DAY_LABELS[picker.dayIndex]}
                </Text>
              </View>

              <ScrollView
                style={styles.modalScroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalScrollContent}
              >
                {TIME_OPTIONS.map(t => {
                  const selected = t === currentPickerValue
                  return (
                    <Pressable
                      key={t}
                      style={[styles.timeOption, selected && styles.timeOptionSel]}
                      onPress={() => selectTime(t)}
                    >
                      <Text style={[styles.timeOptionText, selected && styles.timeOptionTextSel]}>
                        {fmtTime(t)}
                      </Text>
                      {selected && <Text style={styles.timeOptionCheck}>✓</Text>}
                    </Pressable>
                  )
                })}
              </ScrollView>

              <Pressable style={styles.modalCancel} onPress={() => setPicker(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  )
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const ACCENT     = '#E8590C'
const ACCENT_BG  = '#FFF4ED'
const DARK       = '#1B1B1B'
const GREY       = '#6B7280'
const BORDER     = '#F3F4F6'
const CARD_BG    = '#FFFFFF'

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContent: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  inner: { width: '100%', maxWidth: 560 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },

  // ── Header card ──
  headerCard: {
    backgroundColor: CARD_BG,
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
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '900', fontSize: 14 },
  avatarImg: { width: 34, height: 34, borderRadius: 17 },
  avatarName: { color: DARK, fontWeight: '800', fontSize: 13, maxWidth: 100 },

  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: DARK,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  headerHint: {
    fontSize: 13,
    color: GREY,
    lineHeight: 19,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ACCENT_BG,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#FFDAC8',
  },
  statNum: { fontSize: 18, fontWeight: '900', color: ACCENT },
  statLabel: { fontSize: 12, fontWeight: '600', color: GREY },

  // ── Day cards ──
  dayCard: {
    backgroundColor: CARD_BG,
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
  dayCardClosed: {
    borderColor: '#FEE2E2',
    backgroundColor: '#FFFBFB',
  },
  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  dayLabelBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  dayEmoji: { fontSize: 22 },
  dayName: { fontSize: 16, fontWeight: '800', color: DARK },
  dayNameClosed: { color: '#D1D5DB' },
  dayHours: { fontSize: 12, color: GREY, marginTop: 2, fontWeight: '500' },
  dayClosedText: { fontSize: 12, color: '#EF4444', marginTop: 2, fontWeight: '600' },
  dayActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expandIcon: { fontSize: 10, color: '#9CA3AF' },

  // ── Expanded content ──
  dayExpanded: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 14,
  },
  closedToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  closedToggleLabel: { fontSize: 14, fontWeight: '600', color: DARK },

  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    gap: 4,
  },
  timeCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ACCENT_BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  timeCardIconText: { fontSize: 18 },
  timeCardLabel: { fontSize: 11, fontWeight: '600', color: GREY },
  timeCardValue: { fontSize: 20, fontWeight: '900', color: DARK },
  timeCardTap: { fontSize: 10, color: ACCENT, fontWeight: '600', marginTop: 2 },

  timeArrow: {
    width: 28,
    alignItems: 'center',
  },
  timeArrowText: { fontSize: 18, color: '#D1D5DB' },

  // ── Save button ──
  saveBtn: {
    backgroundColor: ACCENT,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 14,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },

  // ── Time picker modal ──
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
    maxWidth: 360,
    maxHeight: 480,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  modalHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: DARK },
  modalSub: { fontSize: 13, color: GREY, marginTop: 2 },
  modalScroll: { maxHeight: 340 },
  modalScrollContent: { padding: 8 },
  timeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 2,
  },
  timeOptionSel: {
    backgroundColor: ACCENT_BG,
  },
  timeOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: DARK,
  },
  timeOptionTextSel: {
    color: ACCENT,
    fontWeight: '800',
  },
  timeOptionCheck: {
    fontSize: 16,
    fontWeight: '900',
    color: ACCENT,
  },
  modalCancel: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: GREY,
  },
})
