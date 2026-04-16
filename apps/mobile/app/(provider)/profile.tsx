import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
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

  // Razorpay payout account
  const [rzpLoading,  setRzpLoading]  = useState(false)
  const [rzpError,    setRzpError]    = useState<string | null>(null)
  const [confirmDelete,    setConfirmDelete]    = useState(false)
  const [deleting,         setDeleting]         = useState(false)

  const rzpStatus    = providerProfile?.razorpay_kyc_status ?? 'not_connected'
  const rzpAccountId = providerProfile?.razorpay_account_id ?? null

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

  async function handleDeleteAccount() {
    if (Platform.OS === 'web') {
      setConfirmDelete(true)
      return
    }
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and deactivate all services. KYC records are retained per legal obligation. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDeleteAccount },
      ],
    )
  }

  async function doDeleteAccount() {
    setConfirmDelete(false)
    setDeleting(true)
    try {
      await ProviderPortalAPI.deleteMe()
      await logout()
      router.replace('/(provider-auth)/login')
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete account')
    } finally {
      setDeleting(false)
    }
  }

  async function handleRazorpayOnboard() {
    setRzpLoading(true)
    setRzpError(null)
    try {
      const res = await ProviderPortalAPI.razorpayOnboard()
      await refreshProfile()
      if (res.onboarding_url) {
        Linking.openURL(res.onboarding_url)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start onboarding'
      setRzpError(msg)
    } finally {
      setRzpLoading(false)
    }
  }

  async function handleRefreshRzpStatus() {
    setRzpLoading(true)
    setRzpError(null)
    try {
      await ProviderPortalAPI.razorpayStatus()
      await refreshProfile()
    } catch {
      // silently fail — status stays as cached
    } finally {
      setRzpLoading(false)
    }
  }

  const hasChanges =
    name.trim() !== (providerProfile?.name ?? '') ||
    phone.trim() !== (providerProfile?.phone ?? '') ||
    address.trim() !== (providerProfile?.address ?? '')

  const firstName = providerProfile?.name
    ? providerProfile.name.split(' ')[0]
    : (providerUser?.email ?? 'Provider').split('@')[0]

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.inner}>

        {/* ── Hero Header (matches dashboard) ── */}
        <View style={styles.heroCard}>
          {/* Top bar: logo + back */}
          <View style={styles.heroTop}>
            <Pressable onPress={() => router.push('/(provider)/dashboard')}>
              <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.backPill}>
              <Text style={styles.backArrow}>←</Text>
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          </View>

          {/* Greeting row with avatar */}
          <View style={styles.greetingRow}>
            <Pressable onPress={pickAndUploadPhoto} style={styles.avatarTouchable}>
              {profileImg ? (
                <Image source={{ uri: profileImg }} style={styles.avatarImg} />
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
            <View style={styles.greetingInfo}>
              <Text style={styles.greetingText}>{greeting},</Text>
              <Text style={styles.greetingName}>{firstName} 👋</Text>
            </View>
          </View>

          {providerProfile?.address && (
            <Text style={styles.addressText}>📍 {providerProfile.address}</Text>
          )}

          {/* Status badge */}
          <View style={styles.statusRow}>
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: providerProfile?.status === 'active' ? '#059669' : '#EF4444' }]} />
              <Text style={styles.statusText}>{providerProfile?.status ?? 'unknown'}</Text>
            </View>
            <Text style={styles.emailHint}>{email}</Text>
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

          {/* Payout Account — Razorpay Route */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>💳 Payout Account</Text>
            <Text style={styles.formSub}>
              Payouts are handled securely by Razorpay. Your bank details and KYC documents are submitted directly to Razorpay — we never see or store them.
            </Text>

            {/* Status badge */}
            <View style={[styles.rzpStatusBadge, rzpStatusStyle(rzpStatus)]}>
              <Text style={styles.rzpStatusIcon}>{rzpStatusIcon(rzpStatus)}</Text>
              <View>
                <Text style={[styles.rzpStatusLabel, { color: rzpStatusColor(rzpStatus) }]}>{rzpStatusLabel(rzpStatus)}</Text>
                <Text style={styles.rzpStatusHint}>{rzpStatusHint(rzpStatus)}</Text>
              </View>
            </View>

            {rzpError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{rzpError}</Text>
              </View>
            )}

            {rzpStatus === 'not_connected' && (
              <Pressable
                style={[styles.saveBtn, rzpLoading && styles.saveBtnDisabled]}
                onPress={handleRazorpayOnboard}
                disabled={rzpLoading}
              >
                {rzpLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveBtnText}>Connect Payout Account</Text>}
              </Pressable>
            )}

            {(rzpStatus === 'pending' || rzpStatus === 'under_review') && (
              <Pressable
                style={[styles.rzpRefreshBtn, rzpLoading && { opacity: 0.5 }]}
                onPress={handleRefreshRzpStatus}
                disabled={rzpLoading}
              >
                {rzpLoading
                  ? <ActivityIndicator size="small" color={ACCENT} />
                  : <Text style={styles.rzpRefreshText}>↻ Refresh Status</Text>}
              </Pressable>
            )}

            {rzpStatus === 'activated' && rzpAccountId && (
              <View style={styles.rzpConnectedInfo}>
                <Text style={styles.rzpConnectedId}>Account: {rzpAccountId.slice(0, 8)}…{rzpAccountId.slice(-4)}</Text>
              </View>
            )}
          </View>

          {/* Danger zone */}
          <View style={styles.dangerCard}>
            <Text style={styles.dangerTitle}>Account</Text>
            <Pressable style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutIcon}>🚪</Text>
              <Text style={styles.logoutText}>Sign Out</Text>
            </Pressable>

            <Pressable style={styles.deleteBtn} onPress={handleDeleteAccount} disabled={deleting}>
              {deleting
                ? <ActivityIndicator color="#DC2626" size="small" />
                : <>
                    <Text style={styles.logoutIcon}>🗑️</Text>
                    <Text style={styles.deleteText}>Delete My Account</Text>
                  </>}
            </Pressable>
          </View>

          {/* Web inline confirm — delete */}
          {confirmDelete && (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmText}>
                This will permanently delete your account and deactivate all services. KYC records are retained per legal obligation. This cannot be undone.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setConfirmDelete(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.confirmDeleteBtn} onPress={doDeleteAccount}>
                  <Text style={styles.confirmDeleteBtnText}>Delete Account</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Legal links */}
          <View style={styles.legalLinks}>
            <Pressable onPress={() => router.push('/(legal)/provider-terms')}>
              <Text style={styles.legalLink}>Partner Agreement</Text>
            </Pressable>
            <Text style={styles.legalDot}>·</Text>
            <Pressable onPress={() => router.push('/(legal)/provider-privacy')}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </Pressable>
            <Text style={styles.legalDot}>·</Text>
            <Pressable onPress={() => router.push('/(legal)/refund')}>
              <Text style={styles.legalLink}>Refund Policy</Text>
            </Pressable>
          </View>

          <View style={{ height: 40 }} />
        </View>
    </ScrollView>
  )
}

/* ── Razorpay status helpers ── */
function rzpStatusLabel(s: string) {
  switch (s) {
    case 'not_connected': return 'Not Connected'
    case 'pending':       return 'Pending Verification'
    case 'under_review':  return 'Under Review'
    case 'activated':     return 'Verified & Active'
    case 'suspended':     return 'Suspended'
    case 'rejected':      return 'Rejected'
    default:              return 'Unknown'
  }
}
function rzpStatusHint(s: string) {
  switch (s) {
    case 'not_connected': return 'Connect your account to receive payouts'
    case 'pending':       return 'Complete KYC on Razorpay to get verified'
    case 'under_review':  return 'Razorpay is reviewing your documents'
    case 'activated':     return 'You can receive payouts'
    case 'suspended':     return 'Contact support for assistance'
    case 'rejected':      return 'Re-submit your details on Razorpay'
    default:              return ''
  }
}
function rzpStatusIcon(s: string) {
  switch (s) {
    case 'not_connected': return '🔗'
    case 'pending':       return '⏳'
    case 'under_review':  return '🔍'
    case 'activated':     return '✅'
    case 'suspended':     return '⚠️'
    case 'rejected':      return '❌'
    default:              return '❓'
  }
}
function rzpStatusColor(s: string) {
  switch (s) {
    case 'not_connected': return '#6B7280'
    case 'pending':       return '#D97706'
    case 'under_review':  return '#2563EB'
    case 'activated':     return '#059669'
    case 'suspended':     return '#DC2626'
    case 'rejected':      return '#DC2626'
    default:              return '#6B7280'
  }
}
function rzpStatusStyle(s: string) {
  switch (s) {
    case 'activated':  return { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }
    case 'pending':    return { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }
    case 'under_review': return { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }
    case 'suspended':
    case 'rejected':   return { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }
    default:           return { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' }
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },

  // ── Layout (matches dashboard) ──
  scrollContent: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  inner: { width: '100%', maxWidth: 560 },

  // ── Hero header ──
  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: BORDER,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoImg: { width: 80, height: 30 },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  backArrow: { fontSize: 20, color: ACCENT, fontWeight: '700' },
  backText: { fontSize: 14, color: ACCENT, fontWeight: '700' },

  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
  },
  avatarTouchable: {
    position: 'relative',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  avatarLetter: { color: '#fff', fontWeight: '900', fontSize: 20 },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  cameraOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  cameraIcon: { fontSize: 10 },
  greetingInfo: {},
  greetingText: { fontSize: 13, color: GREY, fontWeight: '500' },
  greetingName: { fontSize: 22, fontWeight: '900', color: DARK, marginTop: 2 },
  addressText: { fontSize: 12, color: GREY, marginTop: 6 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
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
  emailHint: { fontSize: 12, color: '#9CA3AF' },

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

  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: { color: '#DC2626', fontSize: 13, fontWeight: '700' },
  inputError: {
    borderColor: '#DC2626',
    borderWidth: 1.5,
  },
  fieldError: {
    color: '#DC2626',
    fontSize: 12,
    marginTop: -4,
    marginBottom: 8,
    marginLeft: 4,
  },

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

  // Razorpay payout card
  rzpStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  rzpStatusIcon:  { fontSize: 22 },
  rzpStatusLabel: { fontSize: 14, fontWeight: '800' },
  rzpStatusHint:  { fontSize: 12, color: '#6B7280', marginTop: 2 },
  rzpRefreshBtn: {
    borderWidth: 1, borderColor: ACCENT, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginTop: 4,
  },
  rzpRefreshText: { color: ACCENT, fontWeight: '700', fontSize: 14 },
  rzpConnectedInfo: { marginTop: 4 },
  rzpConnectedId: { fontSize: 12, color: '#6B7280', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

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

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 10,
  },
  deleteText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },

  confirmBox: {
    backgroundColor: '#FEF2F2', borderRadius: 14, padding: 16, marginTop: 12,
    borderWidth: 1, borderColor: '#FECACA',
  },
  confirmText:  { fontSize: 13, color: '#374151', lineHeight: 20, marginBottom: 12 },
  confirmActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1, borderColor: BORDER,
  },
  cancelBtnText: { color: GREY, fontWeight: '700', fontSize: 14 },
  confirmDeleteBtn: {
    flex: 1, backgroundColor: '#DC2626', borderRadius: 10, paddingVertical: 12,
    alignItems: 'center',
  },
  confirmDeleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  legalLinks: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 6, marginBottom: 10,
  },
  legalLink: { color: GREY, fontSize: 12, textDecorationLine: 'underline' },
  legalDot:  { color: '#D1D5DB', fontSize: 12 },
})
