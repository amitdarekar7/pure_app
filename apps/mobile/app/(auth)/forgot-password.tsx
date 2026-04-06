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
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { firebaseAuth } from '../../lib/firebase'

export default function ForgotPasswordScreen() {
  const router = useRouter()

  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [sent,    setSent]    = useState(false)

  async function handleReset() {
    setError(null)
    const e = email.trim().toLowerCase()

    if (!e) {
      setError('Please enter your email address.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setError('Please enter a valid email address.')
      return
    }

    setLoading(true)
    try {
      await sendPasswordResetEmail(firebaseAuth, e)
      setSent(true)
    } catch (err: unknown) {
      // Firebase returns generic errors to avoid email enumeration — show friendly message
      const code = (err as { code?: string }).code ?? ''
      if (code === 'auth/user-not-found') {
        setError('No account found with that email address.')
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.')
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
            <View style={styles.logoDiamond}>
              <Text style={styles.logoDiamondText}>◆</Text>
            </View>
            <Text style={styles.logoWord}>PURE</Text>
            <Text style={styles.logoTagline}>BEAUTY & WELLNESS</Text>
          </View>

          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email and we'll send you a link to reset your password.
          </Text>

          {sent ? (
            <View style={styles.successBox}>
              <Text style={styles.successTitle}>Check your inbox</Text>
              <Text style={styles.successBody}>
                A password reset link has been sent to{'\n'}
                <Text style={styles.successEmail}>{email.trim()}</Text>
              </Text>
              <Pressable style={styles.btn} onPress={() => router.back()}>
                <Text style={styles.btnText}>Back to Log In</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Email Address</Text>
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

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleReset}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>Send Reset Link</Text>}
              </Pressable>
            </>
          )}

          {/* Back link */}
          {!sent && (
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
  logoDiamond: {
    width:           52,
    height:          52,
    borderRadius:    14,
    backgroundColor: '#0f0f23',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    10,
  },
  logoDiamondText: { color: '#7c6af7', fontSize: 26 },
  logoWord:    { color: '#0f0f23', fontSize: 26, fontWeight: '900', letterSpacing: 5 },
  logoTagline: { color: '#7c6af7', fontSize: 9,  fontWeight: '700', letterSpacing: 3, marginTop: 2 },

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

  successBox:   { alignItems: 'center', paddingVertical: 10 },
  successTitle: { color: '#0f0f23', fontSize: 18, fontWeight: '800', marginBottom: 10 },
  successBody:  { color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  successEmail: { color: '#0f0f23', fontWeight: '700' },

  backRow: { marginTop: 18, alignItems: 'center' },
  backText: { color: '#7c6af7', fontSize: 14, fontWeight: '700' },
})
