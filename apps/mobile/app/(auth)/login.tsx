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
import { useAuth } from '../../lib/auth-context'

export default function LoginScreen() {
  const { login }   = useAuth()
  const router      = useRouter()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleLogin() {
    setError(null)
    const e = email.trim()
    const p = password

    if (!e || !p) {
      setError('Email and password are required.')
      return
    }

    setLoading(true)
    try {
      await login(e, p)
      router.replace('/(tabs)/home')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.'
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
        {/* Brand */}
        <View style={styles.brand}>
          <Text style={styles.logo}>⚡ PureApp</Text>
          <Text style={styles.tagline}>Welcome back</Text>
        </View>

        {/* Form */}
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#555"
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
            placeholder="••••••••"
            placeholderTextColor="#555"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Log In</Text>}
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>{"Don't have an account? "}</Text>
          <Link href="/(auth)/register" asChild>
            <Pressable>
              <Text style={styles.link}>Register</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0f0f23' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  brand:   { alignItems: 'center', marginBottom: 40 },
  logo:    { fontSize: 32, fontWeight: '800', color: '#7c6af7', letterSpacing: 1 },
  tagline: { fontSize: 15, color: '#888', marginTop: 6 },

  card: {
    backgroundColor: '#1a1a2e',
    borderRadius:    14,
    padding:         24,
    elevation:       6,
  },
  label: { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor:   '#0f0f23',
    borderWidth:       1,
    borderColor:       '#2d2d4e',
    borderRadius:      8,
    paddingHorizontal: 14,
    paddingVertical:   12,
    color:             '#fff',
    fontSize:          15,
    marginBottom:      16,
  },
  error: { color: '#ff6b6b', fontSize: 13, marginBottom: 12, textAlign: 'center' },

  btn: {
    backgroundColor: '#7c6af7',
    borderRadius:    10,
    paddingVertical: 14,
    alignItems:      'center',
    marginTop:       4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  footerText: { color: '#666', fontSize: 14 },
  link:       { color: '#7c6af7', fontSize: 14, fontWeight: '600' },
})
