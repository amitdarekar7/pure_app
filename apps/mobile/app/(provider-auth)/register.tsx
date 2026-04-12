import {
  ActivityIndicator,
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
import { useProviderAuth } from '../../lib/provider-auth-context'
import { LocationAPI, type City, type Area } from '../../lib/api'
import { useEffect } from 'react'
import { Ionicons } from '@expo/vector-icons'

export default function ProviderRegisterScreen() {
  const { register } = useProviderAuth()
  const router       = useRouter()

  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [confirmPass,  setConfirmPass]  = useState('')
  const [displayName,  setDisplayName]  = useState('')
  const [providerName, setProviderName] = useState('')
  const [phone,        setPhone]        = useState('')
  const [cities,       setCities]       = useState<City[]>([])
  const [selectedCity, setSelectedCity] = useState<City | null>(null)
  const [citySearch,   setCitySearch]   = useState('')
  const [showCities,   setShowCities]   = useState(false)
  const [areas,        setAreas]        = useState<Area[]>([])
  const [selectedArea, setSelectedArea] = useState<Area | null>(null)
  const [areaSearch,   setAreaSearch]   = useState('')
  const [showAreas,    setShowAreas]    = useState(false)
  const [areasLoading, setAreasLoading] = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    LocationAPI.cities().then(({ cities: c }) => setCities(c)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedCity) { setAreas([]); setSelectedArea(null); return }
    setAreasLoading(true)
    setSelectedArea(null)
    LocationAPI.areas(selectedCity.id)
      .then(({ areas: a }) => setAreas(a))
      .catch(() => setAreas([]))
      .finally(() => setAreasLoading(false))
  }, [selectedCity])

  const filteredCities = cities.filter(c =>
    c.name.toLowerCase().includes(citySearch.toLowerCase()),
  )

  const filteredAreas = areas.filter(a =>
    a.name.toLowerCase().includes(areaSearch.toLowerCase()),
  )

  async function handleRegister() {
    setError(null)
    const e = email.trim()
    if (!e || !password || !displayName.trim() || !providerName.trim() || !selectedCity) {
      setError('Please fill in all required fields and select a city.')
      return
    }
    if (password !== confirmPass) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    try {
      await register({
        email:        e,
        password,
        displayName:  displayName.trim(),
        providerName: providerName.trim(),
        address:      selectedArea?.name || undefined,
        cityId:       selectedCity.id,
        phone:        phone.trim() || undefined,
      })
      router.replace('/(provider)/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
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
            <View style={styles.iconWrap}>
              <Ionicons name="storefront-outline" size={36} color="#7c6af7" />
            </View>
            <Text style={styles.heading}>Register Your Business</Text>
            <Text style={styles.tagline}>Create a provider account to manage bookings</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionTitle}>Account Details</Text>

          <Text style={styles.label}>Your Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Your full name"
            placeholderTextColor="#bbb"
            value={displayName}
            onChangeText={setDisplayName}
          />

          <Text style={styles.label}>Email *</Text>
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

          <Text style={styles.label}>Password *</Text>
          <TextInput
            style={styles.input}
            placeholder="Min 6 characters"
            placeholderTextColor="#bbb"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm Password *</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter password"
            placeholderTextColor="#bbb"
            value={confirmPass}
            onChangeText={setConfirmPass}
            secureTextEntry
          />

          <Text style={styles.sectionTitle}>Business Details</Text>

          <Text style={styles.label}>Business / Salon Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Glamour Studio"
            placeholderTextColor="#bbb"
            value={providerName}
            onChangeText={setProviderName}
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 98765 43210"
            placeholderTextColor="#bbb"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>City *</Text>
          <Pressable
            style={[styles.input, styles.selectBox]}
            onPress={() => { setShowCities(!showCities); setShowAreas(false) }}
          >
            <Text style={selectedCity ? styles.selectText : styles.placeholderText}>
              {selectedCity ? selectedCity.name : 'Select a city'}
            </Text>
          </Pressable>

          {showCities && (
            <View style={styles.dropdown}>
              <TextInput
                style={styles.dropdownSearch}
                placeholder="Search city…"
                placeholderTextColor="#bbb"
                value={citySearch}
                onChangeText={setCitySearch}
                autoFocus
              />
              <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                {filteredCities.map(c => (
                  <Pressable
                    key={c.id}
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSelectedCity(c)
                      setShowCities(false)
                      setCitySearch('')
                    }}
                  >
                    <Text style={styles.dropdownItemText}>{c.name}, {c.state}</Text>
                  </Pressable>
                ))}
                {filteredCities.length === 0 && (
                  <Text style={styles.noResults}>No cities found</Text>
                )}
              </ScrollView>
            </View>
          )}

          <Text style={styles.label}>Area *</Text>
          <Pressable
            style={[styles.input, styles.selectBox, !selectedCity && styles.inputDisabled]}
            onPress={() => { if (selectedCity) { setShowAreas(!showAreas); setShowCities(false) } }}
            disabled={!selectedCity}
          >
            <Text style={selectedArea ? styles.selectText : styles.placeholderText}>
              {areasLoading ? 'Loading areas…' : selectedArea ? selectedArea.name : selectedCity ? 'Select an area' : 'Select city first'}
            </Text>
          </Pressable>

          {showAreas && (
            <View style={styles.dropdown}>
              <TextInput
                style={styles.dropdownSearch}
                placeholder="Search area…"
                placeholderTextColor="#bbb"
                value={areaSearch}
                onChangeText={setAreaSearch}
                autoFocus
              />
              <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                {filteredAreas.map(a => (
                  <Pressable
                    key={a.id}
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSelectedArea(a)
                      setShowAreas(false)
                      setAreaSearch('')
                    }}
                  >
                    <Text style={styles.dropdownItemText}>{a.name}{a.pincode ? ` — ${a.pincode}` : ''}</Text>
                  </Pressable>
                ))}
                {filteredAreas.length === 0 && (
                  <Text style={styles.noResults}>No areas found</Text>
                )}
              </ScrollView>
            </View>
          )}

          <Pressable
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Create Provider Account</Text>}
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
            <Link href="/(provider-auth)/login" asChild>
              <Pressable>
                <Text style={styles.link}>Sign in</Text>
              </Pressable>
            </Link>
          </View>

          {/* Back to user login */}
          <Link href="/(auth)/login" asChild>
            <Pressable style={styles.userLink}>
              <Text style={styles.userLinkText}>← Back to user login</Text>
            </Pressable>
          </Link>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f5f7' },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20, paddingTop: 48 },

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

  brand:     { alignItems: 'center', marginBottom: 24 },
  iconWrap:  { width: 64, height: 64, borderRadius: 32, backgroundColor: '#f0eeff', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heading:   { color: '#0f0f23', fontSize: 22, fontWeight: '800', marginBottom: 4, textAlign: 'center' },
  tagline:   { color: '#999', fontSize: 13, textAlign: 'center' },

  error: { color: '#e53935', fontSize: 13, marginBottom: 10, textAlign: 'center', backgroundColor: '#fef2f2', borderRadius: 8, padding: 10 },

  sectionTitle: {
    color:            '#7c6af7',
    fontSize:         12,
    fontWeight:       '700',
    marginTop:        20,
    marginBottom:     4,
    textTransform:    'uppercase',
    letterSpacing:    1,
  },

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
    marginBottom:      10,
  },

  selectBox:        { justifyContent: 'center' },
  inputDisabled:    { opacity: 0.5 },
  selectText:       { color: '#0f0f23', fontSize: 15 },
  placeholderText:  { color: '#bbb', fontSize: 15 },

  dropdown: {
    backgroundColor: '#ffffff',
    borderRadius:    10,
    marginTop:       4,
    marginBottom:    8,
    borderWidth:     1,
    borderColor:     '#ebebf5',
    overflow:        'hidden',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    8,
    elevation:       4,
  },
  dropdownSearch:   { color: '#0f0f23', padding: 10, borderBottomWidth: 1, borderBottomColor: '#ebebf5', fontSize: 14 },
  dropdownItem:     { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f5' },
  dropdownItemText: { color: '#0f0f23', fontSize: 14 },
  noResults:        { color: '#999', padding: 12, fontSize: 14 },

  btn: {
    backgroundColor: '#0f0f23',
    borderRadius:    12,
    paddingVertical: 15,
    alignItems:      'center',
    marginTop:       24,
  },
  btnDisabled: { opacity: 0.5 },
  btnText:     { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },

  divider:     { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#ebebf5' },
  dividerText: { color: '#bbb', fontSize: 12 },

  footer:     { flexDirection: 'row', justifyContent: 'center' },
  footerText: { color: '#999', fontSize: 14 },
  link:       { color: '#7c6af7', fontSize: 14, fontWeight: '700' },

  userLink:     { alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#ebebf5' },
  userLinkText: { color: '#7c6af7', fontSize: 13 },
})
