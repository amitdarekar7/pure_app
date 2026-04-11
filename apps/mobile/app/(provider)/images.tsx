import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { useProviderAuth } from '../../lib/provider-auth-context'
import {
  ProviderPortalAPI,
  type ProviderService,
  type ServiceImage,
} from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.png')

// ─── Theme ────────────────────────────────────────────────────────────────────
const ACCENT    = '#E8590C'
const ACCENT_BG = '#FFF4ED'
const DARK      = '#1B1B1B'
const GREY      = '#6B7280'
const BORDER    = '#F3F4F6'

// ─── Category emoji map ───────────────────────────────────────────────────────
const CAT_EMOJI: Record<string, string> = {
  haircut: '💇', hair_color: '🎨', facial: '🧖', waxing: '🪒',
  manicure: '💅', pedicure: '🦶', massage: '💆', makeup: '💄',
  threading: '🧵', shaving: '🪮', spa: '🧴', bridal: '👰',
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ServiceWithImages {
  service:  ProviderService
  images:   ServiceImage[]
  loading:  boolean
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ImagesScreen() {
  const router = useRouter()
  const { providerUser, providerProfile } = useProviderAuth()

  const [services, setServices]   = useState<ServiceWithImages[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null) // serviceId being uploaded

  // ── Fetch services + their images ─────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const { services: svcs } = await ProviderPortalAPI.me()
      const withImages: ServiceWithImages[] = await Promise.all(
        svcs.map(async (s) => {
          try {
            const { images } = await ProviderPortalAPI.getServiceImages(s.id)
            return { service: s, images, loading: false }
          } catch {
            return { service: s, images: [], loading: false }
          }
        }),
      )
      setServices(withImages)
    } catch {
      Alert.alert('Error', 'Could not load services.')
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchAll().finally(() => setLoading(false))
  }, [fetchAll])

  async function onRefresh() {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }

  // ── Pick & upload image ───────────────────────────────────────────────────
  async function pickImage(serviceId: string) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission required', 'Please allow photo library access.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    })
    if (result.canceled) return
    const asset = result.assets[0]
    if (!asset) return

    setUploading(serviceId)
    try {
      let dataUri: string
      if (asset.base64) {
        const mime = asset.mimeType ?? (asset.uri.endsWith('.png') ? 'image/png' : 'image/jpeg')
        dataUri = `data:${mime};base64,${asset.base64}`
      } else {
        const resp = await fetch(asset.uri)
        const blob = await resp.blob()
        dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
      }
      await ProviderPortalAPI.addServiceImage(serviceId, dataUri)
      // Refresh just that service's images
      const { images } = await ProviderPortalAPI.getServiceImages(serviceId)
      setServices((prev) =>
        prev.map((s) => (s.service.id === serviceId ? { ...s, images } : s)),
      )
    } catch {
      Alert.alert('Error', 'Failed to upload image.')
    } finally {
      setUploading(null)
    }
  }

  // ── Delete image ──────────────────────────────────────────────────────────
  async function deleteImage(serviceId: string, imageId: string) {
    Alert.alert('Delete Photo', 'Remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await ProviderPortalAPI.deleteServiceImage(serviceId, imageId)
            setServices((prev) =>
              prev.map((s) =>
                s.service.id === serviceId
                  ? { ...s, images: s.images.filter((img) => img.id !== imageId) }
                  : s,
              ),
            )
          } catch {
            Alert.alert('Error', 'Failed to delete image.')
          }
        },
      },
    ])
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.centerWrap}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
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
              <Text style={styles.avatarName} numberOfLines={1}>
                {providerProfile?.name
                  ? providerProfile.name.split(' ')[0]
                  : (providerUser?.email ?? '').split('@')[0]}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.headerTitle}>Service Photos</Text>
          <Text style={styles.headerHint}>
            Upload photos for each service. Customers see these on your profile.
          </Text>
        </View>

        {/* ── Service cards ──────────────────────────────────────────────── */}
        {services.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📸</Text>
            <Text style={styles.emptyTitle}>No services yet</Text>
            <Text style={styles.emptyHint}>Add services first, then upload photos here.</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push('/(provider)/services')}>
              <Text style={styles.emptyBtnText}>Go to Services</Text>
            </Pressable>
          </View>
        ) : (
          services.map((item) => {
            const { service, images } = item
            const emoji = CAT_EMOJI[service.category_slug] ?? '✨'
            const isUploading = uploading === service.id
            return (
              <View key={service.id} style={styles.serviceCard}>
                {/* Service header */}
                <View style={styles.serviceHeader}>
                  <View style={styles.serviceLeft}>
                    <View style={styles.emojiCircle}>
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </View>
                    <View>
                      <Text style={styles.serviceName}>{service.title}</Text>
                      <Text style={styles.serviceMeta}>
                        {service.category_slug} · {images.length} photo{images.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    style={[styles.uploadBtn, isUploading && styles.uploadBtnDisabled]}
                    onPress={() => !isUploading && pickImage(service.id)}
                  >
                    {isUploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.uploadBtnText}>+ Add Photo</Text>
                    )}
                  </Pressable>
                </View>

                {/* Images grid */}
                {images.length > 0 ? (
                  <FlatList
                    data={images}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.imageList}
                    keyExtractor={(img) => img.id}
                    renderItem={({ item: img }) => (
                      <View style={styles.imageCard}>
                        <Image source={{ uri: img.image_url }} style={styles.imageThumb} />
                        <Pressable
                          style={styles.deleteBtn}
                          onPress={() => deleteImage(service.id, img.id)}
                        >
                          <Text style={styles.deleteBtnText}>✕</Text>
                        </Pressable>
                      </View>
                    )}
                  />
                ) : (
                  <View style={styles.noPhotos}>
                    <Text style={styles.noPhotosText}>No photos yet — tap "+ Add Photo" above</Text>
                  </View>
                )}
              </View>
            )
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      </View>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  centerWrap: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' as const },
  scroll: { paddingBottom: 30 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Header ──
  header: {
    backgroundColor: '#fff',
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  logoImg: { width: 80, height: 28 },
  avatarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
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
  headerTitle: { fontSize: 24, fontWeight: '900', color: DARK, letterSpacing: -0.5, marginBottom: 4 },
  headerHint: { fontSize: 13, color: GREY, lineHeight: 18 },

  // ── Empty ──
  emptyCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
  },
  emptyEmoji: { fontSize: 48, marginBottom: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: DARK, marginBottom: 6 },
  emptyHint: { fontSize: 13, color: GREY, textAlign: 'center', marginBottom: 16 },
  emptyBtn: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  // ── Service card ──
  serviceCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  serviceLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  emojiCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ACCENT_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 20 },
  serviceName: { fontSize: 15, fontWeight: '800', color: DARK },
  serviceMeta: { fontSize: 11, color: GREY, marginTop: 2 },
  uploadBtn: {
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 100,
    alignItems: 'center',
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  // ── Image list ──
  imageList: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  imageCard: { position: 'relative' },
  imageThumb: {
    width: 110,
    height: 110,
    borderRadius: 12,
    backgroundColor: '#f3f3f3',
  },
  deleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { color: '#fff', fontSize: 12, fontWeight: '900' },

  // ── No photos ──
  noPhotos: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  noPhotosText: { fontSize: 12, color: GREY, fontStyle: 'italic' },
})
