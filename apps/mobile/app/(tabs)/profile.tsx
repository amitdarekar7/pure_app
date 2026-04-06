import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { useAuth } from '../../lib/auth-context'
import { UsersAPI } from '../../lib/api'

function Avatar({ name }: { name: string | null }) {
  const initials = (name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  )
}

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth()
  const router = useRouter()

  const [editing,       setEditing]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [success,       setSuccess]       = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  const [name,     setName]     = useState(user?.display_name ?? '')
  const [bio,      setBio]      = useState(user?.bio      ?? '')
  const [locale,   setLocale]   = useState(user?.locale   ?? 'en-US')
  const [timezone, setTimezone] = useState(user?.timezone ?? '')

  function startEditing() {
    setName(user?.display_name ?? '')
    setBio(user?.bio      ?? '')
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
        bio:         bio.trim(),
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

  if (!user) return null

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="always">

        {/* Back to Home */}
        <Pressable style={styles.backBar} onPress={() => router.replace('/(tabs)/home')}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>Back to Home</Text>
        </Pressable>

        {/* Header */}
        <View style={styles.headerCard}>
          <Avatar name={user.display_name} />
          <Text style={styles.displayName}>{user.display_name ?? 'No name set'}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <View style={[styles.statusBadge, user.status === 'active' && styles.statusActive]}>
            <Text style={styles.statusText}>{user.status}</Text>
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

          <Field label="Bio">
            {editing
              ? <TextInput
                  style={[styles.fieldInput, styles.textArea]}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  numberOfLines={3}
                  placeholderTextColor="#bbb"
                />
              : <Text style={styles.fieldValue}>{user.bio || '—'}</Text>}
          </Field>

          <Field label="Locale">
            {editing
              ? <TextInput style={styles.fieldInput} value={locale} onChangeText={setLocale} autoCapitalize="none" placeholderTextColor="#bbb" />
              : <Text style={styles.fieldValue}>{user.locale}</Text>}
          </Field>

          <Field label="Timezone">
            {editing
              ? <TextInput style={styles.fieldInput} value={timezone} onChangeText={setTimezone} autoCapitalize="none" placeholder="e.g. Asia/Kolkata" placeholderTextColor="#bbb" />
              : <Text style={styles.fieldValue}>{user.timezone || '—'}</Text>}
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

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f5f7' },
  scroll: { padding: 16, paddingBottom: 40, alignItems: 'center' },

  backBar: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             6,
    alignSelf:       'flex-start',
    backgroundColor: '#f0f0f8',
    borderRadius:    22,
    paddingVertical:  9,
    paddingLeft:     10,
    paddingRight:    16,
    marginBottom:    14,
  },
  backArrow: { color: '#7c6af7', fontSize: 22, lineHeight: 22, fontWeight: '700', marginTop: -2 },
  backLabel: { color: '#7c6af7', fontSize: 14, fontWeight: '700' },

  headerCard: {
    width:           '100%',
    maxWidth:         520,
    backgroundColor: '#ffffff',
    borderRadius:     20,
    padding:          28,
    alignItems:       'center',
    marginBottom:     16,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 4 },
    shadowOpacity:    0.08,
    shadowRadius:     16,
    elevation:        6,
  },
  avatar:      { width: 76, height: 76, borderRadius: 38, backgroundColor: '#0f0f23', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText:  { color: '#7c6af7', fontSize: 26, fontWeight: '900' },
  displayName: { color: '#0f0f23', fontSize: 20, fontWeight: '800' },
  email:       { color: '#888',    fontSize: 14, marginTop: 4 },
  statusBadge: { backgroundColor: '#f0f0f8', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginTop: 10 },
  statusActive:{ backgroundColor: '#e8f5e9' },
  statusText:  { color: '#2e7d32', fontSize: 12, fontWeight: '700' },

  successBox:  { width: '100%', maxWidth: 520, backgroundColor: '#e8f5e9', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12 },
  successText: { color: '#2e7d32', fontWeight: '700' },

  section:       { width: '100%', maxWidth: 520, backgroundColor: '#ffffff', borderRadius: 20, overflow: 'hidden', marginBottom: 16,
                   shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f8' },
  sectionTitle:  { color: '#0f0f23', fontSize: 15, fontWeight: '800' },
  editBtn:       { backgroundColor: '#f0f0f8', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  editBtnText:   { color: '#7c6af7', fontSize: 13, fontWeight: '700' },

  field:       { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f8' },
  fieldLabel:  { color: '#aaa', fontSize: 12, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue:  { color: '#0f0f23', fontSize: 15 },
  fieldInput:  { color: '#0f0f23', fontSize: 15, backgroundColor: '#f8f8fc', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#ebebf5' },
  textArea:    { height: 80, textAlignVertical: 'top' },

  error: { color: '#e53935', textAlign: 'center', marginBottom: 12, fontSize: 13, width: '100%', maxWidth: 520 },

  editActions:  { flexDirection: 'row', gap: 10, marginBottom: 16, width: '100%', maxWidth: 520 },
  cancelBtn:    { flex: 1, backgroundColor: '#f0f0f8', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText:{ color: '#666', fontWeight: '700' },
  saveBtn:      { flex: 2, backgroundColor: '#0f0f23', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText:  { color: '#fff', fontWeight: '800', fontSize: 15 },

  logoutBtn:      { width: '100%', maxWidth: 520, borderWidth: 1.5, borderColor: '#ffcdd2', borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: '#fff5f5' },
  logoutBtnText:  { color: '#e53935', fontWeight: '700', fontSize: 15 },

  confirmBox:     { width: '100%', maxWidth: 520, backgroundColor: '#ffffff', borderRadius: 16, padding: 20, marginTop: 8,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  confirmText:    { color: '#0f0f23', fontSize: 15, textAlign: 'center', marginBottom: 16 },
  confirmActions: { flexDirection: 'row', gap: 10 },
})
