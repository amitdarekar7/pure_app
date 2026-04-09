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
import { useAuth } from '../../lib/auth-context'

const LOGO = require('../../assets/images/logo_pure.png')

export default function RegisterScreen() {
  const { register } = useAuth()
  const router       = useRouter()

  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleRegister() {
    setError(null)
    const n = name.trim()
    const e = email.trim()
    const p = password

    if (!n || !e || !p) {
      setError('All fields are required.')
      return
    }
    if (p.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      await register(e, p, n)
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

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#ebebf5' },
  dividerText: { color: '#bbb', fontSize: 12 },

  footer:     { flexDirection: 'row', justifyContent: 'center' },
  footerText: { color: '#999', fontSize: 14 },
  link:       { color: '#7c6af7', fontSize: 14, fontWeight: '700' },
})
