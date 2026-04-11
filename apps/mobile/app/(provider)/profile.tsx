import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useProviderAuth } from '../../lib/provider-auth-context'
import { ProviderPortalAPI } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

const ACCENT    = '#E8590C'
const ACCENT_BG = '#FFF4ED'
const DARK      = '#1B1B1B'
const GREY      = '#6B7280'
const BORDER    = '#F3F4F6'

export default function ProviderProfileScreen() {
  const { providerUser, providerProfile, logout, refreshProfile } = useProviderAuth()
  const router = useRouter()

  const [name,    setName]    = useState(providerProfile?.name ?? '')
  const [phone,   setPhone]   = useState(providerProfile?.phone ?? '')
  const [address, setAddress] = useState(providerProfile?.address ?? '')
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [localImage, setLocalImage] = useState<string | null>(null)

  const email = providerUser?.email ?? ''
  const initial = (providerProfile?.name ?? email ?? 'P')[0].toUpperCase()
  const profileImg = localImage ?? providerProfile?.profile_image_url

  async function pickAndUploadPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission required', 'Please allow photo library access.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    })
    if (result.canceled) return
    const asset = result.assets[0]
    if (!asset) return

    // Show local preview immediately
    setLocalImage(asset.uri)
    setUploading(true)
    try {
      let dataUri: string
      if (asset.base64) {
        // expo-image-picker returns base64 when requested
        const mime = asset.mimeType ?? (asset.uri.endsWith('.png') ? 'image/png' : 'image/jpeg')
        dataUri = `data:${mime};base64,${asset.base64}`
      } else {
        // Fallback: fetch blob and convert (works on web)
        const resp = await fetch(asset.uri)
        const blob = await resp.blob()
        dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
      }
      await ProviderPortalAPI.updateProfile({ profileImageUrl: dataUri })
      await refreshProfile()
    } catch {
      // keep showing local image even if upload fails
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await ProviderPortalAPI.updateProfile({
        name:    name.trim(),
        phone:   phone.trim(),
        address: address.trim(),
      })
      await refreshProfile()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile'
      if (Platform.OS === 'web') window.alert(msg)
      else Alert.alert('Error', msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    await logout()
    router.replace('/(provider-auth)/login')
  }

  const hasChanges =
    name.trim() !== (providerProfile?.name ?? '') ||
    phone.trim() !== (providerProfile?.phone ?? '') ||
    address.trim() !== (providerProfile?.address ?? '')

  return (
    <View style={styles.root}>
      <View style={styles.centerWrap}>
        {/* Header */}
        <View style={styles.headerBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Avatar card */}
          <View style={styles.avatarCard}>
            <Pressable onPress={pickAndUploadPhoto} style={styles.avatarTouchable}>
              {profileImg ? (
                <Image source={{ uri: profileImg }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarLetter}>{initial}</Text>
                </View>
              )}
              <View style={styles.cameraOverlay}>
                {uploading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.cameraIcon}>📷</Text>
                }
              </View>
            </Pressable>
            <Text style={styles.photoHint}>Tap to change photo</Text>
            <Text style={styles.avatarName}>{providerProfile?.name ?? 'Provider'}</Text>
            <Text style={styles.avatarEmail}>{email}</Text>
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: providerProfile?.status === 'active' ? '#059669' : '#EF4444' }]} />
              <Text style={styles.statusText}>{providerProfile?.status ?? 'unknown'}</Text>
            </View>
          </View>

          {/* Edit form */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>✏️ Edit Profile</Text>
            <Text style={styles.formSub}>Update your business information</Text>

            <Text style={styles.fieldLabel}>Business Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your business name"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.fieldLabel}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. +91 98765 43210"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLabel}>Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={address}
              onChangeText={setAddress}
              placeholder="Your salon/parlour address"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
            />

            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>{email}</Text>
              <Text style={styles.readOnlyHint}>Cannot be changed</Text>
            </View>

            {/* Save button */}
            {saved && (
              <View style={styles.successBanner}>
                <Text style={styles.successText}>✅ Profile updated successfully!</Text>
              </View>
            )}

            <Pressable
              style={[styles.saveBtn, (!hasChanges || saving) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!hasChanges || saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>Save Changes</Text>
              }
            </Pressable>
          </View>

          {/* Danger zone */}
          <View style={styles.dangerCard}>
            <Text style={styles.dangerTitle}>Account</Text>
            <Pressable style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutIcon}>🚪</Text>
              <Text style={styles.logoutText}>Sign Out</Text>
            </Pressable>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  centerWrap: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },

  // Header
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingRight: 12,
  },
  backArrow: { fontSize: 20, color: ACCENT, fontWeight: '700' },
  backText: { fontSize: 14, color: ACCENT, fontWeight: '700' },
  logoImg: { width: 80, height: 30 },

  content: { paddingHorizontal: 16, paddingTop: 16 },

  // Avatar card
  avatarCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarTouchable: {
    position: 'relative',
    marginBottom: 6,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  cameraIcon: { fontSize: 14 },
  photoHint: { fontSize: 11, color: '#9CA3AF', marginBottom: 8 },
  avatarLetter: { color: '#fff', fontSize: 28, fontWeight: '900' },
  avatarName: { fontSize: 20, fontWeight: '900', color: DARK, marginBottom: 4 },
  avatarEmail: { fontSize: 13, color: GREY, marginBottom: 10 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700', color: GREY, textTransform: 'capitalize' },

  // Form card
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  formTitle: { fontSize: 18, fontWeight: '900', color: DARK, marginBottom: 2 },
  formSub: { fontSize: 13, color: GREY, marginBottom: 18 },

  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: GREY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    color: DARK,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  readOnlyField: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  readOnlyText: { fontSize: 14, color: GREY },
  readOnlyHint: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },

  successBanner: {
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  successText: { color: '#059669', fontSize: 13, fontWeight: '700' },

  saveBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // Danger zone
  dangerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
  },
  dangerTitle: { fontSize: 14, fontWeight: '800', color: GREY, marginBottom: 12 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutIcon: { fontSize: 18 },
  logoutText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
})
