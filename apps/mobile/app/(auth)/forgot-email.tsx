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
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { PublicAuthAPI } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

export default function ForgotEmailScreen() {
  const router = useRouter()

  const [phone,   setPhone]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [result,  setResult]  = useState<string | null>(null)

  async function handleLookup() {
    setError(null)
    const p = phone.trim()

    if (!p) {
      setError('Please enter your phone number.')
      return
    }

    setLoading(true)
    try {
      const data = await PublicAuthAPI.lookupEmail(p)
      setResult(data.maskedEmail)
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? ''
      if (msg.includes('No account')) {
        setError('No account found with that phone number.')
      } else {
        setError('Something went wrong. Please try again.')
      }
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
          </View>

          <Text style={styles.title}>Forgot Email?</Text>
          <Text style={styles.subtitle}>
            Enter the phone number linked to your account and we'll show your registered email.
          </Text>

          {result ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>Your registered email is</Text>
              <Text style={styles.resultEmail}>{result}</Text>
              <Text style={styles.resultHint}>
                Use this to log in or reset your password.
              </Text>
              <Pressable style={styles.btn} onPress={() => router.back()}>
                <Text style={styles.btnText}>Back to Log In</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="+91 98765 43210"
                placeholderTextColor="#bbb"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleLookup}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>Find My Email</Text>}
              </Pressable>
            </>
          )}

          {/* Back link */}
          {!result && (
            <Pressable style={styles.backRow} onPress={() => router.back()}>
              <Text style={styles.backText}>← Back to Log In</Text>
            </Pressable>
          )}

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f5f7' },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },

  card: {
    width:           '100%',
    maxWidth:         420,
    backgroundColor: '#ffffff',
    borderRadius:     20,
    padding:          28,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 4 },
    shadowOpacity:    0.08,
    shadowRadius:     16,
    elevation:        6,
  },

  brand:         { alignItems: 'center', marginBottom: 20 },
  logoImage:   { width: 160, height: 64, marginBottom: 4 },

  title:    { color: '#0f0f23', fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 16, marginBottom: 6 },
  subtitle: { color: '#888',    fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 22 },

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

  resultBox:    { alignItems: 'center', paddingVertical: 10 },
  resultLabel:  { color: '#888',    fontSize: 13, marginBottom: 8 },
  resultEmail:  { color: '#0f0f23', fontSize: 22, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  resultHint:   { color: '#999',    fontSize: 12, textAlign: 'center', marginBottom: 24 },

  backRow: { marginTop: 18, alignItems: 'center' },
  backText: { color: '#7c6af7', fontSize: 14, fontWeight: '700' },
})
