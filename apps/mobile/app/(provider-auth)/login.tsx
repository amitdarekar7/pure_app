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
import { Ionicons } from '@expo/vector-icons'

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
            <Text style={styles.heading}>Provider Login</Text>
            <Text style={styles.tagline}>Manage your beauty business</Text>
          </View>

          {/* Fields */}
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
            placeholder="••••••••"
            placeholderTextColor="#bbb"
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
              : <Text style={styles.btnText}>Sign In</Text>}
          </Pressable>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>New provider? </Text>
            <Link href="/(provider-auth)/register" asChild>
              <Pressable>
                <Text style={styles.link}>Register your business</Text>
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

  brand:     { alignItems: 'center', marginBottom: 28 },
  iconWrap:  { width: 64, height: 64, borderRadius: 32, backgroundColor: '#f0eeff', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heading:   { color: '#0f0f23', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  tagline:   { color: '#999', fontSize: 14 },

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

  error: { color: '#e53935', fontSize: 13, marginBottom: 10, marginTop: 4, textAlign: 'center' },

  btn: {
    backgroundColor: '#0f0f23',
    borderRadius:    12,
    paddingVertical: 15,
    alignItems:      'center',
    marginTop:       4,
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
