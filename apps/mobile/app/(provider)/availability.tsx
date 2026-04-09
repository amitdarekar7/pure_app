import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { useProviderAuth } from '../../lib/provider-auth-context'
import { ProviderPortalAPI, type AvailabilitySlot } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const DEFAULT_SCHEDULE: AvailabilitySlot[] = DAY_LABELS.map((_, i) => ({
  dayOfWeek: i,
  openTime:  '09:00',
  closeTime: '22:00',
  isClosed:  i === 0,
}))

function parseTime(t: string): Date {
  const [h, m] = t.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`
}

function toTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function AvailabilityScreen() {
  const { providerUser, providerProfile } = useProviderAuth()
  const [schedule,  setSchedule]  = useState<AvailabilitySlot[]>(DEFAULT_SCHEDULE)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)

  // Picker state
  const [picker, setPicker] = useState<{
    dayIndex: number
    field:    'openTime' | 'closeTime'
  } | null>(null)

  const load = useCallback(async () => {
    try {
      const { availability } = await ProviderPortalAPI.availability()
      if (availability.length > 0) {
        // Server returns snake_case; normalise to camelCase for local state
        setSchedule(
          availability.map((s: any) => ({
            dayOfWeek: s.day_of_week ?? s.dayOfWeek,
            openTime:  (s.open_time  ?? s.openTime  ?? '09:00').slice(0, 5),
            closeTime: (s.close_time ?? s.closeTime ?? '22:00').slice(0, 5),
            isClosed:  s.is_closed   ?? s.isClosed  ?? false,
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
        <ActivityIndicator size="large" color="#7c6af7" />
      </View>
    )
  }

  const selectedSlot = picker !== null ? schedule[picker.dayIndex] : null

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.inner}>
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
        <Text style={styles.hint}>
          Set your opening and closing hours for each day. Toggle the switch to mark a day as closed.
        </Text>

        {schedule.map((slot, i) => (
          <View key={i} style={[styles.dayCard, slot.isClosed && styles.dayCardClosed]}>
            <View style={styles.dayHeader}>
              <Text style={[styles.dayName, slot.isClosed && styles.dayNameClosed]}>
                {DAY_LABELS[slot.dayOfWeek]}
              </Text>
              <View style={styles.closedRow}>
                <Text style={styles.closedLabel}>Closed</Text>
                <Switch
                  value={slot.isClosed}
                  onValueChange={(v: boolean) => updateSlot(i, { isClosed: v })}
                  trackColor={{ false: '#e5e7eb', true: '#7c6af7' }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {!slot.isClosed && (
              <View style={styles.timesRow}>
                <Pressable
                  style={styles.timeBtn}
                  onPress={() => setPicker({ dayIndex: i, field: 'openTime' })}
                >
                  <Ionicons name="sunny-outline" size={14} color="#7c6af7" />
                  <Text style={styles.timeLabel}>Opens</Text>
                  <Text style={styles.timeValue}>{fmtTime(slot.openTime)}</Text>
                </Pressable>

                <Text style={styles.timeSep}>→</Text>

                <Pressable
                  style={styles.timeBtn}
                  onPress={() => setPicker({ dayIndex: i, field: 'closeTime' })}
                >
                  <Ionicons name="moon-outline" size={14} color="#7c6af7" />
                  <Text style={styles.timeLabel}>Closes</Text>
                  <Text style={styles.timeValue}>{fmtTime(slot.closeTime)}</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}

        {/* iOS inline picker */}
        {Platform.OS === 'ios' && picker !== null && selectedSlot && (
          <View style={styles.inlinePicker}>
            <Text style={styles.pickerTitle}>
              {DAY_LABELS[picker.dayIndex]} — {picker.field === 'openTime' ? 'Opening' : 'Closing'} time
            </Text>
            <DateTimePicker
              value={parseTime(
                picker.field === 'openTime' ? selectedSlot.openTime : selectedSlot.closeTime,
              )}
              mode="time"
              display="spinner"
              themeVariant="light"
              minuteInterval={15}
              onChange={(_e: DateTimePickerEvent, d?: Date) => {
                if (d && picker) {
                  updateSlot(picker.dayIndex, { [picker.field]: toTimeString(d) })
                }
              }}
            />
            <Pressable style={styles.pickerDone} onPress={() => setPicker(null)}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={[styles.saveBtn, saving && styles.btnDisabled]}
          onPress={save}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>{saved ? '✓ Saved' : 'Save Schedule'}</Text>}
        </Pressable>
        </View>
      </ScrollView>

      {/* Android picker pops natively */}
      {Platform.OS === 'android' && picker !== null && selectedSlot && (
        <DateTimePicker
          value={parseTime(
            picker.field === 'openTime' ? selectedSlot.openTime : selectedSlot.closeTime,
          )}
          mode="time"
          is24Hour={false}
          minuteInterval={15}
          onChange={(_e: DateTimePickerEvent, d?: Date) => {
            if (d && picker) {
              updateSlot(picker.dayIndex, { [picker.field]: toTimeString(d) })
            }
            setPicker(null)
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#f8f8f8' },
  content: { alignItems: 'center', padding: 16, paddingBottom: 40 },
  inner:      { width: '100%', maxWidth: 520 },
  pageHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingVertical: 14,
    marginBottom:   12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f5',
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
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f8f8' },

  hint: { color: '#888', fontSize: 13, marginBottom: 16, lineHeight: 18 },

  dayCard: {
    backgroundColor: '#fff',
    borderRadius:    14,
    padding:         16,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     '#ebebf5',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.04,
    shadowRadius:    4,
    elevation:       1,
  },
  dayCardClosed:  { opacity: 0.55 },
  dayHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayName:        { color: '#0f0f23', fontSize: 16, fontWeight: '700' },
  dayNameClosed:  { color: '#ccc' },
  closedRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  closedLabel:    { color: '#888', fontSize: 13 },

  timesRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 8 },
  timeBtn: {
    flex:            1,
    backgroundColor: '#f4f0ff',
    borderRadius:    10,
    padding:         12,
    alignItems:      'center',
    gap:             4,
    borderWidth:     1,
    borderColor:     '#e0d9ff',
  },
  timeLabel: { color: '#888',    fontSize: 11 },
  timeValue: { color: '#0f0f23', fontSize: 16, fontWeight: '800' },
  timeSep:   { color: '#ccc',    fontSize: 18 },

  inlinePicker: {
    backgroundColor: '#fff',
    borderRadius:    14,
    padding:         16,
    marginBottom:    16,
    borderWidth:     1,
    borderColor:     '#ebebf5',
  },
  pickerTitle:    { color: '#0f0f23', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  pickerDone:     { alignItems: 'center', marginTop: 8 },
  pickerDoneText: { color: '#7c6af7', fontWeight: '700', fontSize: 15 },

  saveBtn:     { backgroundColor: '#7c6af7', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
