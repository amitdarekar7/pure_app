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

export default function ProviderLoginScreen() {
  const { login }  = useProviderAuth()
  const router     = useRouter()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleLogin() {
    setError(null)
    const e = email.trim()
    if (!e || !password) {
      setError('Email and password are required.')
      return
    }
    setLoading(true)
    try {
      await login(e, password)
      router.replace('/(provider)/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
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
          <Text style={styles.heading}>Provider Login</Text>
          <Text style={styles.sub}>Manage your salon / studio</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.label}>Email</Text>
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

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#777"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Pressable style={[styles.btn, loading && styles.btnDisabled]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign In</Text>}
          </Pressable>

          <Link href="/(provider-auth)/register" asChild>
            <Pressable style={styles.linkRow}>
              <Text style={styles.linkText}>New provider? Register your business</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#0f0f23' },
  scroll:     { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card:       { backgroundColor: '#1a1a2e', borderRadius: 16, padding: 24 },
  heading:    { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 4 },
  sub:        { color: '#aaa', fontSize: 14, marginBottom: 24 },
  error:      { backgroundColor: '#4a1a2e', color: '#ff7c7c', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 13 },
  label:      { color: '#ccc', fontSize: 13, marginBottom: 6, marginTop: 12 },
  input:      { backgroundColor: '#2a2a4a', color: '#fff', borderRadius: 10, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#3a3a5a' },
  btn:        { backgroundColor: '#7c6af7', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  btnDisabled:{ opacity: 0.6 },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  linkRow:    { alignItems: 'center', marginTop: 16 },
  linkText:   { color: '#7c6af7', fontSize: 14 },
})
