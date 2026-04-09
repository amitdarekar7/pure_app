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
import { LocationAPI, type City } from '../../lib/api'
import { useEffect } from 'react'

export default function ProviderRegisterScreen() {
  const { register } = useProviderAuth()
  const router       = useRouter()

  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [confirmPass,  setConfirmPass]  = useState('')
  const [displayName,  setDisplayName]  = useState('')
  const [providerName, setProviderName] = useState('')
  const [phone,        setPhone]        = useState('')
  const [address,      setAddress]      = useState('')
  const [cities,       setCities]       = useState<City[]>([])
  const [selectedCity, setSelectedCity] = useState<City | null>(null)
  const [citySearch,   setCitySearch]   = useState('')
  const [showCities,   setShowCities]   = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    LocationAPI.cities().then(({ cities: c }) => setCities(c)).catch(() => {})
  }, [])

  const filteredCities = cities.filter(c =>
    c.name.toLowerCase().includes(citySearch.toLowerCase()),
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
        address:      address.trim() || undefined,
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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.heading}>Register Your Business</Text>
          <Text style={styles.sub}>Create a provider account to manage bookings</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionTitle}>Account Details</Text>

          <Text style={styles.label}>Your Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Your full name"
            placeholderTextColor="#777"
            value={displayName}
            onChangeText={setDisplayName}
          />

          <Text style={styles.label}>Email *</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#777"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password *</Text>
          <TextInput
            style={styles.input}
            placeholder="Min 6 characters"
            placeholderTextColor="#777"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm Password *</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter password"
            placeholderTextColor="#777"
            value={confirmPass}
            onChangeText={setConfirmPass}
            secureTextEntry
          />

          <Text style={styles.sectionTitle}>Business Details</Text>

          <Text style={styles.label}>Business / Salon Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Glamour Studio"
            placeholderTextColor="#777"
            value={providerName}
            onChangeText={setProviderName}
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 98765 43210"
            placeholderTextColor="#777"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Street / area"
            placeholderTextColor="#777"
            value={address}
            onChangeText={setAddress}
          />

          <Text style={styles.label}>City *</Text>
          <Pressable
            style={[styles.input, styles.selectBox]}
            onPress={() => setShowCities(!showCities)}
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
                placeholderTextColor="#777"
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

          <Pressable
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Create Provider Account</Text>}
          </Pressable>

          <Link href="/(provider-auth)/login" asChild>
            <Pressable style={styles.linkRow}>
              <Text style={styles.linkText}>Already have an account? Sign in</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: '#0f0f23' },
  scroll:           { flexGrow: 1, padding: 24, paddingTop: 48 },
  card:             { backgroundColor: '#1a1a2e', borderRadius: 16, padding: 24 },
  heading:          { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 4 },
  sub:              { color: '#aaa', fontSize: 13, marginBottom: 20 },
  error:            { backgroundColor: '#4a1a2e', color: '#ff7c7c', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 13 },
  sectionTitle:     { color: '#7c6af7', fontSize: 13, fontWeight: '700', marginTop: 20, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  label:            { color: '#ccc', fontSize: 13, marginBottom: 5, marginTop: 10 },
  input:            { backgroundColor: '#2a2a4a', color: '#fff', borderRadius: 10, padding: 13, fontSize: 15, borderWidth: 1, borderColor: '#3a3a5a' },
  selectBox:        { justifyContent: 'center' },
  selectText:       { color: '#fff', fontSize: 15 },
  placeholderText:  { color: '#777', fontSize: 15 },
  dropdown:         { backgroundColor: '#2a2a4a', borderRadius: 10, marginTop: 4, borderWidth: 1, borderColor: '#3a3a5a', overflow: 'hidden' },
  dropdownSearch:   { color: '#fff', padding: 10, borderBottomWidth: 1, borderBottomColor: '#3a3a5a', fontSize: 14 },
  dropdownItem:     { padding: 12, borderBottomWidth: 1, borderBottomColor: '#3a3a5a' },
  dropdownItemText: { color: '#fff', fontSize: 14 },
  noResults:        { color: '#777', padding: 12, fontSize: 14 },
  btn:              { backgroundColor: '#7c6af7', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 28 },
  btnDisabled:      { opacity: 0.6 },
  btnText:          { color: '#fff', fontWeight: '700', fontSize: 16 },
  linkRow:          { alignItems: 'center', marginTop: 16 },
  linkText:         { color: '#7c6af7', fontSize: 14 },
})
