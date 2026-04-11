import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'
import { useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../lib/auth-context'
import { UsersAPI } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

function Avatar({
  name,
  uri,
  uploading,
  onPress,
}: {
  name:      string | null
  uri?:      string | null
  uploading?: boolean
  onPress?:  () => void
}) {
  const initials = (name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  return (
    <Pressable onPress={onPress} style={styles.avatarWrapper}>
      <View style={styles.avatar}>
        {uri
          ? <Image source={{ uri }} style={styles.avatarImage} />
          : <Text style={styles.avatarText}>{initials}</Text>}
      </View>
      <View style={styles.avatarEdit}>
        {uploading
          ? <ActivityIndicator size={12} color="#fff" />
          : <Ionicons name="camera" size={13} color="#fff" />}
      </View>
    </Pressable>
  )
}

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const maxW = width >= 1024 ? 760 : width >= 600 ? 640 : Math.min(width, 520)

  const [editing,       setEditing]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [success,       setSuccess]       = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  const [name,            setName]            = useState(user?.display_name ?? '')
  const [phone,           setPhone]           = useState(user?.phone ?? '')
  const [bio,             setBio]             = useState(user?.bio      ?? '')
  const [address,         setAddress]         = useState(user?.address  ?? '')
  const [locale,          setLocale]          = useState(user?.locale   ?? 'en-US')
  const [timezone,        setTimezone]        = useState(user?.timezone ?? '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [locLoading,      setLocLoading]      = useState(false)

  async function pickAvatar() {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photo library.')
        return
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.35,
      base64: true,
    })
    if (result.canceled || !result.assets?.[0]?.base64) return
    const dataUri = `data:image/jpeg;base64,${result.assets[0].base64}`
    setUploadingAvatar(true)
    setError(null)
    try {
      await UsersAPI.updateMe({ avatarUrl: dataUri })
      await refreshUser()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save photo')
    } finally {
      setUploadingAvatar(false)
    }
  }

  function startEditing() {
    setName(user?.display_name ?? '')
    setPhone(user?.phone ?? '')
    setBio(user?.bio      ?? '')
    setAddress(user?.address ?? '')
    setLocale(user?.locale ?? 'en-US')
    setTimezone(user?.timezone ?? '')
    setError(null)
    setSuccess(false)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setError(null)
  }

  async function saveProfile() {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await UsersAPI.updateMe({
        displayName: name.trim(),
        phone:       phone.trim(),
        bio:         bio.trim(),
        address:     address.trim(),
        locale:      locale.trim(),
        timezone:    timezone.trim(),
      })
      await refreshUser()
      setEditing(false)
      setSuccess(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  async function detectLocation() {
    setLocLoading(true)
    setError(null)
    try {
      let lat: number | null = null
      let lon: number | null = null
      let approximate = false

      // ── Stage 1: Try browser / device GPS (with individual try-catch) ──
      if (Platform.OS === 'web') {
        const geo = (globalThis as { navigator?: { geolocation?: Geolocation } }).navigator?.geolocation
        if (geo) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              geo.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 8000,
                maximumAge: 600000,
              })
            })
            lat = pos.coords.latitude
            lon = pos.coords.longitude
          } catch { /* browser geo failed – fall through */ }
        }
      } else {
        // Native: try expo-location
        try {
          const { status } = await Location.requestForegroundPermissionsAsync()
          if (status === 'granted') {
            const last = await Location.getLastKnownPositionAsync()
            if (last) {
              lat = last.coords.latitude
              lon = last.coords.longitude
            }
            if (lat === null || lon === null) {
              const coords = await Promise.race<Location.LocationObject>([
                Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error('gps_timeout')), 10000),
                ),
              ])
              lat = coords.coords.latitude
              lon = coords.coords.longitude
            }
          }
        } catch { /* native GPS failed – fall through */ }
      }

      // ── Stage 2: IP-based fallback (always works) ──
      if (lat === null || lon === null) {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 8000)
        try {
          const res = await fetch('https://ipwho.is/', { signal: ctrl.signal })
          if (res.ok) {
            const data = await res.json()
            if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
              lat = data.latitude
              lon = data.longitude
              approximate = true
            }
          }
        } catch { /* IP lookup failed */ } finally {
          clearTimeout(t)
        }
      }

      // ── Stage 3: If we still have no coordinates, build from IP city/region ──
      if (lat === null || lon === null) {
        try {
          const res = await fetch('https://ipwho.is/')
          if (res.ok) {
            const data = await res.json()
            const approx = [data.city, data.region, data.country].filter(Boolean).join(', ')
            if (approx) {
              setAddress(approx)
              setError('Using approximate network location. You can edit the address if needed.')
              return
            }
          }
        } catch { /* nothing left to try */ }
        setError('Location unavailable. Please type your address manually.')
        return
      }

      // ── Stage 4: Reverse-geocode the coordinates ──
      let resolved = ''

      // 4a – Nominatim (works on web and native)
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 10000)
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
          { signal: ctrl.signal },
        )
        clearTimeout(t)
        if (res.ok) {
          const data = await res.json()
          if (typeof data.display_name === 'string' && data.display_name.trim()) {
            resolved = data.display_name.trim()
          }
        }
      } catch { /* reverse geocode failed */ }

      // 4b – Expo reverse geocode fallback (native)
      if (!resolved && Platform.OS !== 'web') {
        try {
          const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon })
          const first = geo?.[0]
          if (first) {
            const parts = [first.name, first.street, first.district, first.city, first.region, first.postalCode, first.country].filter(Boolean)
            resolved = parts.join(', ')
          }
        } catch { /* expo reverse geocode failed */ }
      }

      if (resolved) {
        setAddress(resolved)
        if (approximate) {
          setError('Using approximate network location. You can edit the address if needed.')
        }
      } else {
        setAddress(`${lat.toFixed(6)}, ${lon.toFixed(6)}`)
        setError('Address lookup failed. Coordinates were filled; you can edit them.')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('denied')) {
        setError('Location permission denied. Please type your address manually.')
      } else {
        setError('Location unavailable. Please type your address manually.')
      }
    } finally {
      setLocLoading(false)
    }
  }

  async function handleLogout() {
    if (Platform.OS === 'web') {
      setConfirmLogout(true)
    } else {
      Alert.alert('Log Out', 'Are you sure you want to log out?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await logout()
            router.replace('/(auth)/login')
          },
        },
      ])
    }
  }

  async function doLogout() {
    setConfirmLogout(false)
    await logout()
    router.replace('/(auth)/login')
  }

  if (!user) return null

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="always">
        <View style={{ width: '100%', maxWidth: maxW, alignSelf: 'center' }}>

        {/* ── Logo + back row (same structure as home header) ──────────── */}
        <View style={styles.topBar}>
          <Pressable onPress={() => router.replace('/(tabs)/home')} style={styles.topBarBack}>
            <Ionicons name="arrow-back" size={20} color="#7c6af7" />
          </Pressable>
          <Pressable onPress={() => router.navigate('/(tabs)/home')} hitSlop={8}>
            <Image source={LOGO} style={styles.topBarLogo} resizeMode="contain" />
          </Pressable>
          <View style={styles.topBarSpacer} />
        </View>

        {/* Header card */}
        <View style={styles.headerCard}>
          <Avatar
            name={user.display_name}
            uri={user.avatar_url}
            uploading={uploadingAvatar}
            onPress={pickAvatar}
          />
          <Text style={styles.displayName}>{user.display_name ?? 'No name set'}</Text>
          <Text style={styles.email}>{user.email}</Text>
          {user.phone
            ? <Text style={styles.phone}>{user.phone}</Text>
            : null}
          <View style={[styles.statusBadge, user.status === 'active' && styles.statusActive]}>
            <Text style={styles.statusText}>{user.status}</Text>
          </View>
        </View>

        {/* Success banner */}
        {success && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>✓ Profile updated</Text>
          </View>
        )}

        {/* Profile fields */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Profile</Text>
            {!editing && (
              <Pressable onPress={startEditing} style={styles.editBtn}>
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            )}
          </View>

          <Field label="Display Name">
            {editing
              ? <TextInput style={styles.fieldInput} value={name} onChangeText={setName} placeholderTextColor="#bbb" />
              : <Text style={styles.fieldValue}>{user.display_name || '—'}</Text>}
          </Field>

          <Field label="Email">
            <Text style={styles.fieldValue}>{user.email}</Text>
          </Field>

          <Field label="Mobile Number">
            {editing
              ? <TextInput
                  style={styles.fieldInput}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="e.g. +91 98765 43210"
                  placeholderTextColor="#bbb"
                />
              : <Text style={styles.fieldValue}>{user.phone || '—'}</Text>}
          </Field>
          <Field label="Address">
            {editing
              ? <>
                  <TextInput
                    style={[styles.fieldInput, { minHeight: 54, textAlignVertical: 'top', marginBottom: 8 }]}
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Your address (optional)"
                    placeholderTextColor="#bbb"
                    multiline
                  />
                  <Pressable
                    style={[styles.locBtn, locLoading && { opacity: 0.6 }]}
                    onPress={detectLocation}
                    disabled={locLoading}
                  >
                    {locLoading
                      ? <ActivityIndicator size="small" color="#7c6af7" />
                      : <Ionicons name="locate" size={15} color="#7c6af7" />}
                    <Text style={styles.locBtnText}>{locLoading ? 'Detecting\u2026' : 'Use my location'}</Text>
                  </Pressable>
                </>
              : <Text style={styles.fieldValue}>{user.address || '\u2014'}</Text>}
          </Field>
          <Field label="Member since">
            <Text style={styles.fieldValue}>
              {new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </Text>
          </Field>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Edit action buttons */}
        {editing && (
          <View style={styles.editActions}>
            <Pressable style={styles.cancelBtn} onPress={cancelEditing} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveProfile} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </Pressable>
          </View>
        )}

        {/* Logout */}
        {!editing && !confirmLogout && (
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={styles.logoutBtnText}>Log Out</Text>
          </TouchableOpacity>
        )}

        {/* Web inline confirm (replaces Alert.alert) */}
        {confirmLogout && (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmText}>Are you sure you want to log out?</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmLogout(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#ff6b6b' }]} onPress={doLogout}>
                <Text style={styles.saveBtnText}>Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f5f7' },
  scroll: { padding: 16, paddingBottom: 40 },

  // ── Logo + back row (inside scroll, same as home header) ────────────
  topBar: {
    flexDirection:     'row',
    alignItems:        'center',
    width:             '100%',
    marginBottom:      20,
  },
  topBarBack:   { padding: 4 },
  topBarLogo:   { flex: 1, height: 48, marginHorizontal: 8 },
  topBarSpacer: { width: 28 },

  headerCard: {
    width:           '100%',
    backgroundColor: '#ffffff',
    borderRadius:     20,
    padding:          28,
    alignItems:       'center',
    marginBottom:     16,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 4 },
    shadowOpacity:    0.08,
    shadowRadius:     16,
    elevation:        6,
  },
  avatarWrapper: { position: 'relative', marginBottom: 12 },
  avatar:        { width: 76, height: 76, borderRadius: 38, backgroundColor: '#0f0f23', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage:   { position: 'absolute', top: 0, left: 0, width: 76, height: 76, borderRadius: 38 },
  avatarText:    { color: '#7c6af7', fontSize: 26, fontWeight: '900' },
  avatarEdit:    { position: 'absolute', bottom: 0, right: -2, backgroundColor: '#7c6af7', borderRadius: 12, padding: 5, borderWidth: 2, borderColor: '#fff' },
  displayName: { color: '#0f0f23', fontSize: 20, fontWeight: '800' },
  email:       { color: '#888',    fontSize: 14, marginTop: 4 },
  phone:       { color: '#888',    fontSize: 14, marginTop: 2 },
  statusBadge: { backgroundColor: '#f0f0f8', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginTop: 10 },
  statusActive:{ backgroundColor: '#e8f5e9' },
  statusText:  { color: '#2e7d32', fontSize: 12, fontWeight: '700' },

  successBox:  { width: '100%', backgroundColor: '#e8f5e9', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12 },
  successText: { color: '#2e7d32', fontWeight: '700' },

  section:       { width: '100%', backgroundColor: '#ffffff', borderRadius: 20, overflow: 'hidden', marginBottom: 16,
                   shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f8' },
  sectionTitle:  { color: '#0f0f23', fontSize: 15, fontWeight: '800' },
  editBtn:       { backgroundColor: '#f0f0f8', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  editBtnText:   { color: '#7c6af7', fontSize: 13, fontWeight: '700' },

  field:       { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f8' },
  fieldLabel:  { color: '#aaa', fontSize: 12, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue:  { color: '#0f0f23', fontSize: 15 },
  fieldInput:  { color: '#0f0f23', fontSize: 15, backgroundColor: '#f8f8fc', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#ebebf5' },
  locBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#e0daff', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f5f3ff', alignSelf: 'flex-start' },
  locBtnText:  { color: '#7c6af7', fontSize: 13, fontWeight: '700' },
  textArea:    { height: 80, textAlignVertical: 'top' },

  error: { color: '#e53935', textAlign: 'center', marginBottom: 12, fontSize: 13, width: '100%' },

  editActions:  { flexDirection: 'row', gap: 10, marginBottom: 16, width: '100%' },
  cancelBtn:    { flex: 1, backgroundColor: '#f0f0f8', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText:{ color: '#666', fontWeight: '700' },
  saveBtn:      { flex: 2, backgroundColor: '#0f0f23', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText:  { color: '#fff', fontWeight: '800', fontSize: 15 },

  logoutBtn:      { width: '100%', borderWidth: 1.5, borderColor: '#ffcdd2', borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: '#fff5f5' },
  logoutBtnText:  { color: '#e53935', fontWeight: '700', fontSize: 15 },

  confirmBox:     { width: '100%', backgroundColor: '#ffffff', borderRadius: 16, padding: 20, marginTop: 8,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  confirmText:    { color: '#0f0f23', fontSize: 15, textAlign: 'center', marginBottom: 16 },
  confirmActions: { flexDirection: 'row', gap: 10 },
})
