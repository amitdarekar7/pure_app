import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { useProviderAuth } from '../../lib/provider-auth-context'
import { ProviderPortalAPI, type ProviderService, type ServiceImage } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

// ─── Theme ────────────────────────────────────────────────────────────────────
const ACCENT    = '#E8590C'
const ACCENT_BG = '#FFF4ED'
const DARK      = '#1B1B1B'
const GREY      = '#6B7280'
const BORDER    = '#F3F4F6'
const GREEN     = '#059669'
const GREEN_BG  = '#ECFDF5'

// ── Category options ────────────────────────────────────────────────────────
const CATEGORIES = [
  { slug: 'haircut',       label: 'Hair Cut',        icon: '💇' },
  { slug: 'facial',        label: 'Facial',          icon: '🧖' },
  { slug: 'manicure',      label: 'Manicure',        icon: '💅' },
  { slug: 'pedicure',      label: 'Pedicure',        icon: '🦶' },
  { slug: 'haircolor',     label: 'Hair Color',      icon: '🎨' },
  { slug: 'threading',     label: 'Threading',       icon: '🧵' },
  { slug: 'hairstyling',   label: 'Hair Styling',    icon: '💆' },
  { slug: 'waxing',        label: 'Waxing',          icon: '✨' },
  { slug: 'bridalmakeup',  label: 'Bridal Makeup',   icon: '👰' },
  { slug: 'partymakeup',   label: 'Party Makeup',    icon: '🎉' },
  { slug: 'straightening', label: 'Straightening',   icon: '🪮' },
  { slug: 'nailext',       label: 'Nail Extensions', icon: '💎' },
  { slug: 'hairspa',       label: 'Hair Spa',        icon: '🧴' },
  { slug: 'groommakeup',   label: 'Groom Makeup',    icon: '🤵' },
  { slug: 'beard',         label: 'Beard',           icon: '🧔' },
  { slug: 'sidermakeup',   label: 'Sider Makeup',    icon: '👩‍👩‍👧' },
]

const IMAGE_SLOTS = 3
const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20, 30, 50]

// ─── Separate DiscountChips: web uses <button>, native uses Pressable ────────
function DiscountChips({ currentPct, isSaving, onSelect }: {
  currentPct: number; isSaving: boolean; onSelect: (pct: number) => void
}) {
  if (Platform.OS === 'web') {
    return (
      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {DISCOUNT_OPTIONS.map(pct => {
          const active = currentPct === pct
          return (
            <button
              key={pct}
              type="button"
              disabled={active || isSaving}
              onClick={() => onSelect(pct)}
              style={{
                paddingLeft: 14, paddingRight: 14, paddingTop: 8, paddingBottom: 8,
                borderRadius: 20, minWidth: 48, cursor: active ? 'default' : 'pointer',
                border: `2px solid ${active ? GREEN : '#E5E7EB'}`,
                backgroundColor: active ? GREEN : '#fff',
                color: active ? '#fff' : GREY,
                fontSize: 13, fontWeight: active ? 800 : 600,
                fontFamily: 'inherit', transition: 'all 0.15s ease',
              }}
            >
              {pct === 0 ? 'None' : `${pct}%`}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <View style={dcStyles.row}>
      {DISCOUNT_OPTIONS.map(pct => {
        const active = currentPct === pct
        return (
          <Pressable
            key={pct}
            style={[dcStyles.chip, active && dcStyles.chipActive]}
            onPress={() => { if (!active && !isSaving) onSelect(pct) }}
          >
            <Text style={[dcStyles.text, active && dcStyles.textActive]}>
              {pct === 0 ? 'None' : `${pct}%`}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const dcStyles = StyleSheet.create({
  row:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 2, borderColor: '#E5E7EB', minWidth: 48, alignItems: 'center' },
  chipActive: { backgroundColor: GREEN, borderColor: GREEN },
  text:       { color: GREY, fontSize: 13, fontWeight: '600' },
  textActive: { color: '#fff', fontWeight: '800' },
})

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProviderServicesScreen() {
  const { providerUser, providerProfile } = useProviderAuth()
  const router = useRouter()
  const [services,   setServices]   = useState<ProviderService[]>([])
  const [images,     setImages]     = useState<Record<string, ServiceImage[]>>({})
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [uploading,  setUploading]  = useState<string | null>(null)
  const [toggling,   setToggling]   = useState<string | null>(null)
  const [savingDiscount, setSavingDiscount] = useState<string | null>(null)

  // ── Add service modal state ─────────────────────────────────────────────
  const [showAdd,      setShowAdd]      = useState(false)
  const [addCategory,  setAddCategory]  = useState(CATEGORIES[0].slug)
  const [addPrice,     setAddPrice]     = useState('')
  const [addDuration,  setAddDuration]  = useState('')
  const [addLoading,   setAddLoading]   = useState(false)
  const [addError,     setAddError]     = useState<string | null>(null)

  // ── Expanded cards (collapsible) ────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { services: svc } = await ProviderPortalAPI.me()
      setServices(svc)
      const results = await Promise.allSettled(
        svc.map(s => ProviderPortalAPI.getServiceImages(s.id)),
      )
      const map: Record<string, ServiceImage[]> = {}
      svc.forEach((s, i) => {
        const r = results[i]
        map[s.id] = r.status === 'fulfilled' ? r.value.images : []
      })
      setImages(map)
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Toggle service availability ─────────────────────────────────────────
  async function toggleService(svc: ProviderService) {
    setToggling(svc.id)
    try {
      await ProviderPortalAPI.toggleService(svc.id, !svc.is_available)
      setServices(prev =>
        prev.map(s => s.id === svc.id ? { ...s, is_available: !s.is_available } : s),
      )
    } catch {
      Alert.alert('Error', 'Could not update service status.')
    } finally {
      setToggling(null)
    }
  }

  // ── Set discount on a service ─────────────────────────────────────────
  async function updateDiscount(serviceId: string, pct: number) {
    const prev = services.find(s => s.id === serviceId)?.discount_pct
    setSavingDiscount(serviceId)
    setServices(cur =>
      cur.map(s => s.id === serviceId ? { ...s, discount_pct: pct } : s),
    )
    try {
      await ProviderPortalAPI.setDiscount(serviceId, pct)
    } catch {
      setServices(cur =>
        cur.map(s => s.id === serviceId ? { ...s, discount_pct: prev ?? 0 } : s),
      )
      if (Platform.OS === 'web') window.alert('Could not update discount.')
      else Alert.alert('Error', 'Could not update discount.')
    } finally {
      setSavingDiscount(null)
    }
  }

  // ── Image pick & upload ─────────────────────────────────────────────────
  async function pickAndUpload(serviceId: string) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission required', 'Please allow access to your photo library.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    })
    if (result.canceled) return
    const asset = result.assets[0]
    if (!asset?.uri) return

    setUploading(serviceId)
    const sortOrder = images[serviceId]?.length ?? 0
    const tempId = `temp-${Date.now()}`
    const tempImage: ServiceImage = {
      id: tempId,
      image_url: asset.uri,
      sort_order: sortOrder,
      created_at: new Date().toISOString(),
    }
    setImages(prev => ({
      ...prev,
      [serviceId]: [...(prev[serviceId] ?? []), tempImage],
    }))

    try {
      const { image } = await ProviderPortalAPI.addServiceImage(
        serviceId,
        asset.uri,
        sortOrder,
      )
      setImages(prev => ({
        ...prev,
        [serviceId]: (prev[serviceId] ?? []).map(img =>
          img.id === tempId ? image : img,
        ),
      }))
    } catch {
      // Keep showing local image
    } finally {
      setUploading(null)
    }
  }

  async function deleteImage(serviceId: string, imageId: string) {
    Alert.alert('Delete image', 'Remove this image?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await ProviderPortalAPI.deleteServiceImage(serviceId, imageId)
            setImages(prev => ({
              ...prev,
              [serviceId]: (prev[serviceId] ?? []).filter(img => img.id !== imageId),
            }))
          } catch { /* ignore */ }
        },
      },
    ])
  }

  // ── Create service ──────────────────────────────────────────────────────
  async function handleAddService() {
    setAddError(null)
    const title = CATEGORIES.find(c => c.slug === addCategory)?.label ?? addCategory
    const price = parseInt(addPrice, 10)
    if (isNaN(price) || price < 0) { setAddError('Enter a valid price in ₹.'); return }
    const duration = parseInt(addDuration, 10)
    if (isNaN(duration) || duration < 1) { setAddError('Enter duration in minutes.'); return }

    setAddLoading(true)
    try {
      const { service } = await ProviderPortalAPI.createService({
        categorySlug:  addCategory,
        title,
        pricePaise:    price * 100,
        durationMins:  duration,
      })
      setServices(prev => [...prev, service])
      setImages(prev => ({ ...prev, [service.id]: [] }))
      setShowAdd(false)
      setAddPrice(''); setAddDuration('')
      setAddCategory(CATEGORIES[0].slug)
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to add service.')
    } finally {
      setAddLoading(false)
    }
  }

  const firstName = providerProfile?.name
    ? providerProfile.name.split(' ')[0]
    : (providerUser?.email ?? '').split('@')[0]

  const activeCount = services.filter(s => s.is_available).length
  const totalRevenue = services.reduce((sum, s) => sum + s.price_paise, 0)

  if (loading) {
    return (
      <View style={styles.centerFlex}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.centerWrap}>

        {/* ═══════════════════════════════════════════════════════════════════
            HEADER
         ═══════════════════════════════════════════════════════════════════ */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Pressable onPress={() => router.push('/(provider)/dashboard')}>
              <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
            </Pressable>
            <Pressable style={styles.avatarPill} onPress={() => router.push('/(provider)/profile')}>
              {providerProfile?.profile_image_url ? (
                <Image source={{ uri: providerProfile.profile_image_url }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarLetter}>
                    {(providerProfile?.name ?? providerUser?.email ?? 'P')[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.avatarName} numberOfLines={1}>{providerProfile?.name ?? firstName}</Text>
            </Pressable>
          </View>

          <View style={styles.headerTitleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Services</Text>
              <Text style={styles.headerHint}>Manage your services, pricing &amp; discounts</Text>
            </View>
            <Pressable style={styles.addBtn} onPress={() => setShowAdd(true)}>
              <Text style={styles.addBtnIcon}>+</Text>
              <Text style={styles.addBtnText}>Add Service</Text>
            </Pressable>
          </View>

          {/* Quick stats */}
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Text style={styles.statEmoji}>📋</Text>
              <Text style={styles.statValue}>{services.length}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statEmoji}>✅</Text>
              <Text style={styles.statValue}>{activeCount}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statEmoji}>⏸️</Text>
              <Text style={styles.statValue}>{services.length - activeCount}</Text>
              <Text style={styles.statLabel}>Hidden</Text>
            </View>
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════════════
            SERVICE LIST
         ═══════════════════════════════════════════════════════════════════ */}
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load() }}
              tintColor={ACCENT}
            />
          }
        >
          {services.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>✂️</Text>
              <Text style={styles.emptyTitle}>No services yet</Text>
              <Text style={styles.emptySub}>Tap "Add Service" to create your first service and start accepting bookings.</Text>
              <Pressable style={styles.emptyBtn} onPress={() => setShowAdd(true)}>
                <Text style={styles.emptyBtnText}>+ Add Your First Service</Text>
              </Pressable>
            </View>
          )}

          {services.map(svc => {
            const svcImages   = images[svc.id] ?? []
            const isToggling  = toggling === svc.id
            const isUploading = uploading === svc.id
            const isExpanded  = expandedId === svc.id
            const cat = CATEGORIES.find(c => c.slug === svc.category_slug)
            const discountPct = Number(svc.discount_pct)
            const discountedPrice = Math.round(svc.price_paise * (1 - discountPct / 100) / 100)
            const originalPrice = Math.round(svc.price_paise / 100)

            const slots = [
              ...svcImages,
              ...Array(Math.max(0, IMAGE_SLOTS - svcImages.length)).fill(null),
            ]

            return (
              <Pressable
                key={svc.id}
                style={[styles.card, !svc.is_available && styles.cardDisabled]}
                onPress={() => setExpandedId(isExpanded ? null : svc.id)}
              >
                {/* Accent strip */}
                <View style={[styles.cardStrip, { backgroundColor: svc.is_available ? ACCENT : '#D1D5DB' }]} />

                <View style={styles.cardBody}>
                  {/* ── Card header: name, category, price, toggle ── */}
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.cardTitleRow}>
                        <Text style={styles.cardEmoji}>{cat?.icon ?? '✂️'}</Text>
                        <Text style={styles.cardTitle} numberOfLines={1}>{cat?.label ?? svc.title}</Text>
                      </View>
                      <View style={styles.metaRow}>
                        <View style={styles.durationChip}>
                          <Text style={styles.durationChipText}>🕐 {svc.duration_mins} min</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.cardRight}>
                      {/* Price block */}
                      <View style={styles.priceBlock}>
                        {discountPct > 0 ? (
                          <>
                            <Text style={styles.priceOriginal}>₹{originalPrice}</Text>
                            <Text style={styles.priceFinal}>₹{discountedPrice}</Text>
                          </>
                        ) : (
                          <Text style={styles.priceFinal}>₹{originalPrice}</Text>
                        )}
                      </View>

                      {/* Toggle */}
                      <View style={styles.toggleBlock}>
                        <Text style={[styles.toggleLabel, svc.is_available ? styles.toggleOn : styles.toggleOff]}>
                          {svc.is_available ? 'Active' : 'Hidden'}
                        </Text>
                        {isToggling ? (
                          <ActivityIndicator size="small" color={ACCENT} />
                        ) : (
                          <Switch
                            value={svc.is_available}
                            onValueChange={() => toggleService(svc)}
                            trackColor={{ false: '#E5E7EB', true: ACCENT }}
                            thumbColor={svc.is_available ? '#fff' : '#D1D5DB'}
                          />
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Expand hint */}
                  <View style={styles.expandHintRow}>
                    <Text style={styles.expandHint}>
                      {isExpanded ? '▲ Tap to collapse' : '▼ Tap to expand — discount'}
                    </Text>
                    {discountPct > 0 && !isExpanded && (
                      <View style={styles.discountMiniTag}>
                        <Text style={styles.discountMiniText}>{discountPct}% OFF</Text>
                      </View>
                    )}
                  </View>

                  {/* ── Expanded section ── */}
                  {isExpanded && (
                    <View style={styles.expandedSection}>
                      {/* ── Discount control ── */}
                      <View style={styles.discountCard}>
                        <View style={styles.discountHeader}>
                          <View style={styles.discountLabelRow}>
                            <Text style={styles.discountIcon}>🏷️</Text>
                            <Text style={styles.discountLabel}>Discount</Text>
                          </View>
                          {discountPct > 0 ? (
                            <View style={styles.discountBadge}>
                              <Text style={styles.discountBadgeText}>
                                {discountPct}% OFF · ₹{discountedPrice}
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.noDiscountText}>No discount</Text>
                          )}
                        </View>
                        <DiscountChips
                          currentPct={discountPct}
                          isSaving={savingDiscount === svc.id}
                          onSelect={(pct) => updateDiscount(svc.id, pct)}
                        />
                      </View>
                    </View>
                  )}
                </View>
              </Pressable>
            )
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* ═══════════════════════════════════════════════════════════════════
          ADD SERVICE MODAL
       ═══════════════════════════════════════════════════════════════════ */}
      <Modal visible={showAdd} animationType="fade" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAdd(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>✨ Add New Service</Text>
            <Text style={styles.modalSub}>Create a new service for your customers</Text>

            {addError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️ {addError}</Text>
              </View>
            ) : null}

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              {/* Category */}
              <Text style={styles.fieldLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {CATEGORIES.map(cat => {
                    const active = addCategory === cat.slug
                    return (
                      <Pressable
                        key={cat.slug}
                        style={[styles.catChip, active && styles.catChipActive]}
                        onPress={() => setAddCategory(cat.slug)}
                      >
                        <Text style={styles.catChipEmoji}>{cat.icon}</Text>
                        <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                          {cat.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </ScrollView>

              {/* Price + Duration */}
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Price (₹) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="500"
                    placeholderTextColor="#9CA3AF"
                    value={addPrice}
                    onChangeText={setAddPrice}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Duration (min) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="45"
                    placeholderTextColor="#9CA3AF"
                    value={addDuration}
                    onChangeText={setAddDuration}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            </ScrollView>

            {/* Footer buttons */}
            <View style={styles.modalFooter}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowAdd(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveBtn, addLoading && { opacity: 0.6 }]}
                onPress={handleAddService}
                disabled={addLoading}
              >
                {addLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalSaveText}>Save Service</Text>
                }
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  centerWrap: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  centerFlex: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },

  // ── Header ──
  headerCard: {
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    marginBottom: 2,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoImg: { width: 80, height: 30 },
  avatarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 24,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '900', fontSize: 14 },
  avatarImg: { width: 32, height: 32, borderRadius: 16 },
  avatarName: { color: DARK, fontWeight: '800', fontSize: 12, maxWidth: 100 },

  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: DARK, letterSpacing: -0.5 },
  headerHint: { fontSize: 13, color: GREY, marginTop: 2 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  addBtnIcon: { color: '#fff', fontSize: 18, fontWeight: '600', marginTop: -1 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  // ── Stats ──
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statEmoji: { fontSize: 16 },
  statValue: { fontSize: 16, fontWeight: '900', color: DARK },
  statLabel: { fontSize: 11, color: GREY, fontWeight: '600' },

  // ── List ──
  list: { paddingTop: 12, paddingBottom: 40 },

  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    marginTop: 20,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: DARK, marginBottom: 4 },
  emptySub: { fontSize: 13, color: GREY, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  emptyBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // ── Service card ──
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardDisabled: { opacity: 0.55 },
  cardStrip: { height: 4 },
  cardBody: { padding: 16 },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardEmoji: { fontSize: 20 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: DARK, flexShrink: 1 },

  metaRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  categoryChip: {
    backgroundColor: ACCENT_BG,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FFDAC8',
  },
  categoryChipText: { color: ACCENT, fontSize: 11, fontWeight: '700' },
  durationChip: {
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  durationChipText: { fontSize: 11, color: GREY, fontWeight: '600' },

  cardRight: { alignItems: 'flex-end', gap: 8, marginLeft: 12 },
  priceBlock: { alignItems: 'flex-end' },
  priceOriginal: {
    fontSize: 12,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  priceFinal: { fontSize: 20, fontWeight: '900', color: ACCENT },

  toggleBlock: { alignItems: 'flex-end', gap: 2 },
  toggleLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  toggleOn: { color: GREEN },
  toggleOff: { color: '#EF4444' },

  // ── Expand hint ──
  expandHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  expandHint: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', flex: 1 },
  discountMiniTag: {
    backgroundColor: GREEN_BG,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  discountMiniText: { color: GREEN, fontSize: 10, fontWeight: '800' },
  photoCountTag: {
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  photoCountText: { fontSize: 10, fontWeight: '700', color: GREY },

  // ── Expanded section ──
  expandedSection: { marginTop: 14 },

  discountCard: {
    backgroundColor: GREEN_BG,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  discountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  discountLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  discountIcon: { fontSize: 16 },
  discountLabel: { fontSize: 13, fontWeight: '800', color: '#166534' },
  discountBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  discountBadgeText: { color: GREEN, fontSize: 12, fontWeight: '800' },
  noDiscountText: { color: '#9CA3AF', fontSize: 12, fontWeight: '600' },

  // ── Photos ──
  photosSectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: DARK,
    marginBottom: 10,
  },
  photosScroll: { gap: 10, paddingBottom: 4 },
  photoCard: {
    width: 130,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    marginRight: 10,
  },
  photoImage: { width: '100%', height: '100%' },
  photoDeleteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDeleteText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  photoPlaceholder: {
    width: 130,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
    marginRight: 10,
  },
  photoPlaceholderIcon: { fontSize: 22, marginBottom: 4 },
  photoPlaceholderText: { color: '#9CA3AF', fontSize: 10, fontWeight: '600' },

  photoAddMore: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: ACCENT,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT_BG,
  },
  photoAddMoreIcon: { fontSize: 24, color: ACCENT, fontWeight: '600' },
  photoAddMoreText: { color: ACCENT, fontSize: 10, fontWeight: '700', marginTop: 2 },

  // ── Add Service Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    overflow: 'hidden',
    padding: 20,
    paddingBottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: DARK },
  modalSub: { fontSize: 13, color: GREY, marginTop: 2, marginBottom: 16 },
  modalScroll: { marginBottom: 12 },

  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: { color: '#DC2626', fontSize: 13, fontWeight: '600' },

  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: GREY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
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

  twoCol: { flexDirection: 'row', gap: 12 },

  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  catChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  catChipEmoji: { fontSize: 14 },
  catChipText: { color: GREY, fontSize: 12, fontWeight: '600' },
  catChipTextActive: { color: '#fff', fontWeight: '800' },

  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalCancelText: { color: GREY, fontWeight: '700', fontSize: 14 },
  modalSaveBtn: {
    flex: 2,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  modalSaveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
})
