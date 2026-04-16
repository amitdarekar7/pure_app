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
import { useState, useEffect } from 'react'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../lib/auth-context'
import { UsersAPI } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

export default function ProfileScreen() {
  const { user, logout, refreshUser, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const maxW = width >= 1024 ? 760 : width >= 600 ? 640 : Math.min(width, 520)

  // Redirect to login if not signed in
  useEffect(() => {
    if (!authLoading && !user) router.replace('/(auth)/login?returnTo=/(tabs)/profile')
  }, [authLoading, user])

  const [editing,       setEditing]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [success,       setSuccess]       = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]      = useState(false)

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

  async function handleDeleteAccount() {
    if (Platform.OS === 'web') {
      setConfirmDelete(true)
    } else {
      Alert.alert(
        'Delete Account',
        'This will permanently delete your account and anonymise all your data. This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: doDeleteAccount,
          },
        ],
      )
    }
  }

  async function doDeleteAccount() {
    setConfirmDelete(false)
    setDeleting(true)
    try {
      await UsersAPI.deleteMe()
      await logout()
      router.replace('/(auth)/login')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete account')
      setDeleting(false)
    }
  }

  const firstName = user?.display_name
    ? user.display_name.split(' ')[0]
    : (user?.email ?? 'User').split('@')[0]

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  if (!user) return null

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: maxW, alignSelf: 'center' }}>

        {/* ── Hero Header (dashboard style) ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Pressable onPress={() => router.navigate('/(tabs)/home')} hitSlop={8}>
              <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
            </Pressable>
            <Pressable onPress={pickAvatar}>
              {user.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatarImgSm} />
              ) : (
                <View style={styles.avatarCircleSm}>
                  <Text style={styles.avatarLetterSm}>
                    {firstName[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          <View style={styles.greetingRow}>
            <Pressable onPress={pickAvatar} style={styles.avatarTouchable}>
              {user.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarLetter}>
                    {firstName[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.cameraOverlay}>
                {uploadingAvatar
                  ? <ActivityIndicator size={10} color="#fff" />
                  : <Ionicons name="camera" size={11} color="#fff" />}
              </View>
            </Pressable>
            <View style={styles.greetingInfo}>
              <Text style={styles.greetingText}>{greeting},</Text>
              <Text style={styles.greetingName}>{firstName} 👋</Text>
            </View>
          </View>

          {user.address ? (
            <Text style={styles.addressText}>📍 {user.address}</Text>
          ) : null}

          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, user.status === 'active' && styles.statusActive]}>
              <View style={[styles.statusDot, { backgroundColor: user.status === 'active' ? '#059669' : '#EF4444' }]} />
              <Text style={styles.statusLabel}>{user.status}</Text>
            </View>
            <Text style={styles.emailHint}>{user.email}</Text>
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
                      ? <ActivityIndicator size="small" color={ACCENT} />
                      : <Ionicons name="locate" size={15} color={ACCENT} />}
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

        {/* Delete Account */}
        {!editing && !confirmLogout && !confirmDelete && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.7} disabled={deleting}>
            {deleting
              ? <ActivityIndicator color="#DC2626" size="small" />
              : <Text style={styles.deleteBtnText}>Delete My Account</Text>}
          </TouchableOpacity>
        )}

        {/* Web inline confirm — delete */}
        {confirmDelete && (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmText}>
              This will permanently delete your account and anonymise all your data. This action cannot be undone.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmDelete(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#DC2626' }]} onPress={doDeleteAccount}>
                <Text style={styles.saveBtnText}>Delete Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Legal links */}
        <View style={styles.legalLinks}>
          <Pressable onPress={() => router.push('/(legal)/terms')}>
            <Text style={styles.legalLink}>Terms of Service</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={() => router.push('/(legal)/privacy')}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={() => router.push('/(legal)/refund')}>
            <Text style={styles.legalLink}>Refund Policy</Text>
          </Pressable>
        </View>

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

const ACCENT = '#E8590C'
const DARK   = '#1B1B1B'
const GREY   = '#6B7280'
const BORDER = '#F3F4F6'

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },

  // ── Hero header (dashboard style) ──
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
    width: '100%',
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoImg: { width: 80, height: 30 },
  avatarCircleSm: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',
  },
  avatarLetterSm: { color: '#fff', fontWeight: '900', fontSize: 14 },
  avatarImgSm: { width: 34, height: 34, borderRadius: 17 },

  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
  },
  avatarTouchable: { position: 'relative' },
  avatarCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3,
  },
  avatarLetter: { color: '#fff', fontWeight: '900', fontSize: 20 },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  cameraOverlay: {
    position: 'absolute', bottom: -2, right: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  greetingInfo: {},
  greetingText: { fontSize: 13, color: GREY, fontWeight: '500' },
  greetingName: { fontSize: 22, fontWeight: '900', color: DARK, marginTop: 2 },
  addressText: { fontSize: 12, color: GREY, marginTop: 6 },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F9FAFB', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: BORDER,
  },
  statusActive: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 12, fontWeight: '700', color: GREY, textTransform: 'capitalize' },
  emailHint: { fontSize: 12, color: '#9CA3AF' },

  // ── Success ──
  successBox:  { width: '100%', backgroundColor: '#ECFDF5', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#A7F3D0' },
  successText: { color: '#059669', fontWeight: '700', fontSize: 13 },

  // ── Profile section ──
  section: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: BORDER,
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: DARK },
  editBtn: { backgroundColor: '#FFF4ED', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  editBtnText: { color: ACCENT, fontSize: 13, fontWeight: '700' },

  field:      { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  fieldLabel: { color: GREY, fontSize: 11, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue: { color: DARK, fontSize: 15 },
  fieldInput: {
    color: DARK, fontSize: 15, backgroundColor: '#F9FAFB', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  locBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#FFDAC8', borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#FFF4ED', alignSelf: 'flex-start',
  },
  locBtnText: { color: ACCENT, fontSize: 13, fontWeight: '700' },

  error: { color: '#EF4444', textAlign: 'center', marginBottom: 12, fontSize: 13, width: '100%' },

  // ── Edit actions ──
  editActions:   { flexDirection: 'row', gap: 10, marginBottom: 16, width: '100%' },
  cancelBtn:     { flex: 1, backgroundColor: BORDER, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { color: GREY, fontWeight: '700' },
  saveBtn:       {
    flex: 2, backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // ── Logout ──
  logoutBtn:     {
    width: '100%', backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', borderWidth: 1, borderColor: '#FECACA',
  },
  logoutBtnText: { color: '#DC2626', fontWeight: '700', fontSize: 15 },

  confirmBox:     {
    width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 20, marginTop: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
    borderWidth: 1, borderColor: BORDER,
  },
  confirmText:    { color: DARK, fontSize: 15, textAlign: 'center', marginBottom: 16 },
  confirmActions: { flexDirection: 'row', gap: 10 },

  deleteBtn: {
    width: '100%', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', borderWidth: 1, borderColor: '#FECACA', marginTop: 10,
  },
  deleteBtnText: { color: '#DC2626', fontWeight: '700', fontSize: 14 },

  legalLinks: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 6, marginTop: 20, marginBottom: 10,
  },
  legalLink: { color: GREY, fontSize: 12, textDecorationLine: 'underline' },
  legalDot:  { color: '#D1D5DB', fontSize: 12 },
})
