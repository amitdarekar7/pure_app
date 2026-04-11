import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../lib/auth-context'
import { UsersAPI } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

export default function RegisterScreen() {
  const { register, refreshUser } = useAuth()
  const router       = useRouter()

  const [name,        setName]        = useState('')
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [address,     setAddress]     = useState('')
  const [locLoading,  setLocLoading]  = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

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

  async function handleRegister() {
    setError(null)
    const n = name.trim()
    const e = email.trim()
    const p = password

    if (!n || !e || !p) {
      setError('Name, email and password are required.')
      return
    }
    if (p.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      await register(e, p, n)
      // Save address (optional — only if the user filled it in)
      if (address.trim()) {
        await UsersAPI.updateMe({ address: address.trim() })
        await refreshUser()
      }
      router.replace('/(tabs)/home')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>

          {/* Brand */}
          <View style={styles.brand}>
            <Image source={LOGO} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.tagline}>Create your account</Text>
          </View>

          {/* Fields */}
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Jane Doe"
            placeholderTextColor="#bbb"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#bbb"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Min. 8 characters"
            placeholderTextColor="#bbb"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />

          {/* ── Address (optional) ── */}
          <View style={styles.labelRow}>
            <Text style={styles.label}>Address <Text style={styles.optional}>(optional)</Text></Text>
          </View>
          <View style={styles.addressBox}>
            <TextInput
              style={[styles.input, styles.addressInput]}
              placeholder="Your home or delivery address"
              placeholderTextColor="#bbb"
              value={address}
              onChangeText={setAddress}
              multiline
              autoCapitalize="sentences"
            />
            <Pressable
              style={[styles.locBtn, locLoading && { opacity: 0.6 }]}
              onPress={detectLocation}
              disabled={locLoading}
            >
              {locLoading
                ? <ActivityIndicator size="small" color="#7c6af7" />
                : <Ionicons name="locate" size={18} color="#7c6af7" />}
              <Text style={styles.locBtnText}>{locLoading ? 'Detecting…' : 'Use my location'}</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Create Account</Text>}
          </Pressable>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <Pressable>
                <Text style={styles.link}>Log In</Text>
              </Pressable>
            </Link>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f5f7' },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },

  card: {
    width:            '100%',
    maxWidth:         420,
    backgroundColor:  '#ffffff',
    borderRadius:     20,
    padding:          28,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 4 },
    shadowOpacity:    0.08,
    shadowRadius:     16,
    elevation:        6,
  },

  brand:         { alignItems: 'center', marginBottom: 24 },
  logoImage:   { width: 160, height: 64, marginBottom: 8 },
  tagline:     { color: '#999',    fontSize: 14 },

  label: { color: '#444', fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor:   '#f8f8fc',
    borderWidth:       1,
    borderColor:       '#ebebf5',
    borderRadius:      10,
    paddingHorizontal: 14,
    paddingVertical:   13,
    color:             '#0f0f23',
    fontSize:          15,
    marginBottom:      14,
  },
  error: { color: '#e53935', fontSize: 13, marginBottom: 10, textAlign: 'center' },

  btn: {
    backgroundColor: '#0f0f23',
    borderRadius:    12,
    paddingVertical: 15,
    alignItems:      'center',
    marginTop:       4,
  },
  btnDisabled: { opacity: 0.5 },
  btnText:     { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },

  labelRow:    { flexDirection: 'row', alignItems: 'baseline', marginBottom: 6, marginTop: 4 },
  optional:    { color: '#bbb', fontWeight: '400', fontSize: 12 },

  addressBox:  { marginBottom: 14 },
  addressInput: { marginBottom: 8, minHeight: 56, textAlignVertical: 'top' },

  locBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    borderWidth:    1,
    borderColor:    '#e0daff',
    borderRadius:   10,
    paddingVertical:   10,
    paddingHorizontal: 14,
    backgroundColor:   '#f5f3ff',
  },
  locBtnText: { color: '#7c6af7', fontSize: 13, fontWeight: '700' },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#ebebf5' },
  dividerText: { color: '#bbb', fontSize: 12 },

  footer:     { flexDirection: 'row', justifyContent: 'center' },
  footerText: { color: '#999', fontSize: 14 },
  link:       { color: '#7c6af7', fontSize: 14, fontWeight: '700' },
})
