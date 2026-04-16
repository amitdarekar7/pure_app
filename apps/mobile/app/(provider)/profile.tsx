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

  // KYC fields
  const [panNumber,        setPanNumber]        = useState(providerProfile?.pan_number ?? '')
  const [bankAccountNumber,setBankAccountNumber]= useState(providerProfile?.bank_account_number ?? '')
  const [bankIfsc,         setBankIfsc]         = useState(providerProfile?.bank_ifsc ?? '')
  const [bankHolderName,   setBankHolderName]   = useState(providerProfile?.bank_holder_name ?? '')
  const [aadhaarLast4,     setAadhaarLast4]     = useState(providerProfile?.aadhaar_last4 ?? '')
  const [gstNumber,        setGstNumber]        = useState(providerProfile?.gst_number ?? '')
  const [kycSaving,        setKycSaving]        = useState(false)
  const [kycSaved,         setKycSaved]         = useState(false)
  const [kycError,         setKycError]         = useState<string | null>(null)
  const [kycTouched,       setKycTouched]       = useState<Record<string, boolean>>({})
  const [confirmDelete,    setConfirmDelete]    = useState(false)
  const [deleting,         setDeleting]         = useState(false)

  // ---------- KYC inline validation ----------
  const PAN_RE  = /^[A-Z]{5}[0-9]{4}[A-Z]$/
  const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
  const GST_RE  = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]$/
  const ACCT_RE = /^\d{9,18}$/
  const NAME_RE = /^[A-Za-z\s.'-]{2,}$/

  const kycErrors: Record<string, string | null> = {
    pan:    panNumber.trim()        ? (PAN_RE.test(panNumber.trim().toUpperCase())         ? null : 'Invalid PAN — format: ABCDE1234F')       : 'PAN is required',
    bank:   bankAccountNumber.trim()? (ACCT_RE.test(bankAccountNumber.trim())              ? null : 'Must be 9–18 digits')                    : 'Bank account is required',
    ifsc:   bankIfsc.trim()         ? (IFSC_RE.test(bankIfsc.trim().toUpperCase())         ? null : 'Invalid IFSC — format: SBIN0001234')     : 'IFSC is required',
    holder: bankHolderName.trim()   ? (NAME_RE.test(bankHolderName.trim())                 ? null : 'Letters, spaces, dots and hyphens only') : 'Holder name is required',
    aadhaar:aadhaarLast4.trim()     ? (/^\d{4}$/.test(aadhaarLast4.trim())                 ? null : 'Must be exactly 4 digits')               : null, // optional
    gst:    gstNumber.trim()        ? (GST_RE.test(gstNumber.trim().toUpperCase())         ? null : 'Invalid GST — format: 22AAAAA0000A1Z5')  : null, // optional
  }

  const kycHasErrors = Object.entries(kycErrors).some(([, v]) => v !== null)

  function touchField(field: string) {
    setKycTouched(prev => ({ ...prev, [field]: true }))
  }
  // ---------- end KYC validation ----------

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

  async function handleSaveKyc() {
    // Touch all fields so errors show
    setKycTouched({ pan: true, bank: true, ifsc: true, holder: true, aadhaar: true, gst: true })
    if (kycHasErrors) {
      setKycError('Please fix the highlighted fields before saving')
      return
    }
    setKycSaving(true)
    setKycSaved(false)
    setKycError(null)
    try {
      await ProviderPortalAPI.updateProfile({
        panNumber:        panNumber.trim() || undefined,
        bankAccountNumber:bankAccountNumber.trim() || undefined,
        bankIfsc:         bankIfsc.trim() || undefined,
        bankHolderName:   bankHolderName.trim() || undefined,
        aadhaarLast4:     aadhaarLast4.trim() || undefined,
        gstNumber:        gstNumber.trim() || undefined,
      })
      await refreshProfile()
      setKycSaved(true)
      setTimeout(() => setKycSaved(false), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save KYC details'
      setKycError(msg)
    } finally {
      setKycSaving(false)
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

          {/* KYC / Compliance Details */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>🏦 KYC & Bank Details</Text>
            <Text style={styles.formSub}>Required for payouts and compliance</Text>

            <Text style={styles.fieldLabel}>PAN Number *</Text>
            <TextInput
              style={[styles.input, kycTouched.pan && kycErrors.pan ? styles.inputError : null]}
              value={panNumber}
              onChangeText={v => { setPanNumber(v.toUpperCase()); touchField('pan') }}
              onBlur={() => touchField('pan')}
              placeholder="ABCDE1234F"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              maxLength={10}
            />
            {kycTouched.pan && kycErrors.pan && <Text style={styles.fieldError}>{kycErrors.pan}</Text>}

            <Text style={styles.fieldLabel}>Bank Account Number *</Text>
            <TextInput
              style={[styles.input, kycTouched.bank && kycErrors.bank ? styles.inputError : null]}
              value={bankAccountNumber}
              onChangeText={v => { setBankAccountNumber(v.replace(/\D/g, '')); touchField('bank') }}
              onBlur={() => touchField('bank')}
              placeholder="e.g. 1234567890123"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              maxLength={18}
            />
            {kycTouched.bank && kycErrors.bank && <Text style={styles.fieldError}>{kycErrors.bank}</Text>}

            <Text style={styles.fieldLabel}>Bank IFSC Code *</Text>
            <TextInput
              style={[styles.input, kycTouched.ifsc && kycErrors.ifsc ? styles.inputError : null]}
              value={bankIfsc}
              onChangeText={v => { setBankIfsc(v.toUpperCase()); touchField('ifsc') }}
              onBlur={() => touchField('ifsc')}
              placeholder="e.g. SBIN0001234"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              maxLength={11}
            />
            {kycTouched.ifsc && kycErrors.ifsc && <Text style={styles.fieldError}>{kycErrors.ifsc}</Text>}

            <Text style={styles.fieldLabel}>Account Holder Name *</Text>
            <TextInput
              style={[styles.input, kycTouched.holder && kycErrors.holder ? styles.inputError : null]}
              value={bankHolderName}
              onChangeText={v => { setBankHolderName(v); touchField('holder') }}
              onBlur={() => touchField('holder')}
              placeholder="Name as on bank account"
              placeholderTextColor="#9CA3AF"
            />
            {kycTouched.holder && kycErrors.holder && <Text style={styles.fieldError}>{kycErrors.holder}</Text>}

            <Text style={styles.fieldLabel}>Aadhaar Last 4 Digits</Text>
            <TextInput
              style={[styles.input, kycTouched.aadhaar && kycErrors.aadhaar ? styles.inputError : null]}
              value={aadhaarLast4}
              onChangeText={v => { setAadhaarLast4(v.replace(/\D/g, '')); touchField('aadhaar') }}
              onBlur={() => touchField('aadhaar')}
              placeholder="1234"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              maxLength={4}
            />
            {kycTouched.aadhaar && kycErrors.aadhaar && <Text style={styles.fieldError}>{kycErrors.aadhaar}</Text>}

            <Text style={styles.fieldLabel}>GST Number</Text>
            <TextInput
              style={[styles.input, kycTouched.gst && kycErrors.gst ? styles.inputError : null]}
              value={gstNumber}
              onChangeText={v => { setGstNumber(v.toUpperCase()); touchField('gst') }}
              onBlur={() => touchField('gst')}
              placeholder="22AAAAA0000A1Z5 (optional)"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              maxLength={15}
            />
            {kycTouched.gst && kycErrors.gst && <Text style={styles.fieldError}>{kycErrors.gst}</Text>}

            {kycError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{kycError}</Text>
              </View>
            )}

            {kycSaved && (
              <View style={styles.successBanner}>
                <Text style={styles.successText}>✅ KYC details saved!</Text>
              </View>
            )}

            <Pressable
              style={[styles.saveBtn, kycSaving && styles.saveBtnDisabled]}
              onPress={handleSaveKyc}
              disabled={kycSaving}
            >
              {kycSaving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>Save KYC Details</Text>
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
