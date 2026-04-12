import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
  Image,
  Modal,
  useWindowDimensions,
  FlatList,
  Linking,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ProvidersAPI,
  BookingsAPI,
  ProviderDetail,
  ProviderServiceItem,
  ProviderImage,
  ProviderAvailability,
} from '../../lib/api'
import { useAuth } from '../../lib/auth-context'

// ─── placeholder gallery images ──────────────────────────────────────────────
const PLACEHOLDER_IMAGES = [
  require('../../assets/images/salon1.jpeg'),
  require('../../assets/images/salon2.jpeg'),
]

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatRupees(paise: number) {
  return `₹${Math.round(paise / 100)}`
}

function addDays(date: Date, n: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_FULL  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

function dayLabel(d: Date) {
  return DAYS_FULL[d.getDay()]
}

function dateLabel(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function weekStart(d: Date): Date {
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  const m = new Date(d)
  m.setDate(m.getDate() + diff)
  m.setHours(0, 0, 0, 0)
  return m
}

function weekDates(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function buildTimeSlots(durationMins: number, openTime?: string, closeTime?: string): string[] {
  const slots: string[] = []
  const start = openTime ? parseTime(openTime) : 9 * 60
  const end   = closeTime ? parseTime(closeTime) : 21 * 60
  const step  = Math.max(durationMins, 30)
  for (let t = start; t + step <= end; t += step) {
    const h = Math.floor(t / 60)
    const m = t % 60
    const suffix = h < 12 ? 'AM' : 'PM'
    const h12 = h <= 12 ? h : h - 12
    slots.push(`${h12}:${m.toString().padStart(2, '0')} ${suffix}`)
  }
  return slots
}

function toISO(date: Date, timeSlot: string): string {
  const [timePart, suffix] = timeSlot.split(' ')
  let [h, m] = timePart.split(':').map(Number)
  if (suffix === 'PM' && h !== 12) h += 12
  if (suffix === 'AM' && h === 12) h = 0
  const d = new Date(date)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ProviderDetailPage() {
  const { id, sid, _date, _slot, _notes } = useLocalSearchParams<{
    id: string; sid: string
    _date?: string; _slot?: string; _notes?: string
  }>()
  const router = useRouter()
  const { isSignedIn, isLoading: authLoading } = useAuth()
  const { width: screenWidth } = useWindowDimensions()
  const MAX_CONTENT_W = 760
  const contentW = Math.min(screenWidth, MAX_CONTENT_W)
  const bannerRef = useRef<ScrollView>(null)

  const [provider, setProvider]       = useState<ProviderDetail | null>(null)
  const [services, setServices]       = useState<ProviderServiceItem[]>([])
  const [images, setImages]           = useState<ProviderImage[]>([])
  const [availability, setAvailability] = useState<ProviderAvailability[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [activeBanner, setActiveBanner] = useState(0)
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(sid ?? null)

  // date/time/booking state
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (_date) { const d = new Date(_date); if (!isNaN(d.getTime())) return d }
    return today
  })
  const [weekMonday, setWeekMonday] = useState<Date>(() => weekStart(selectedDate))
  const [selectedSlot, setSelectedSlot] = useState<string | null>(_slot ?? null)
  const [notes, setNotes] = useState(_notes ?? '')
  const [booking, setBooking]     = useState(false)
  const [booked, setBooked]       = useState(false)
  const [bookedISO, setBookedISO] = useState<string | null>(null)
  const [bookedOtp, setBookedOtp] = useState<string | null>(null)
  // payment mode chosen after provider confirms (on bookings screen)

  // ── lightbox state ──
  const [lightboxVisible, setLightboxVisible] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const lightboxRef = useRef<ScrollView>(null)
  const slotPickerRef = useRef<ScrollView>(null)
  const SLOT_ITEM_H = 40
  const SLOT_VISIBLE = 3

  // ── fetch ──
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ProvidersAPI.get(id, sid)
      .then((data) => {
        if (cancelled) return
        setProvider(data.provider)
        setServices(data.services ?? [])
        setImages(data.images ?? [])
        setAvailability(data.availability ?? [])
        if (!sid && data.services?.[0]) setSelectedServiceId(data.services[0].id)
      })
      .catch(() => { if (!cancelled) setError('Could not load provider.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, sid])

  useEffect(() => { setSelectedSlot(null) }, [selectedDate])

  const selectedService = services.find(s => s.id === selectedServiceId) ?? null
  const currentWeek = weekDates(weekMonday)
  const prevWeekDisabled = weekMonday <= today

  function goToPrevWeek() {
    const prev = addDays(weekMonday, -7)
    setWeekMonday(prev < today ? weekStart(today) : prev)
  }
  function goToNextWeek() { setWeekMonday(addDays(weekMonday, 7)) }

  const now = new Date()
  const isToday = selectedDate.toDateString() === now.toDateString()

  // day_of_week: 0=Sunday … 6=Saturday (matches JS getDay())
  const dayAvail = availability.find(a => a.day_of_week === selectedDate.getDay())
  const isDayClosed = dayAvail?.is_closed ?? false

  const timeSlots = selectedService && !isDayClosed
    ? buildTimeSlots(
        selectedService.duration_mins,
        dayAvail?.open_time,
        dayAvail?.close_time,
      ).filter(slot => {
        if (!isToday) return true
        const [timePart, suffix] = slot.split(' ')
        let [h, m] = timePart.split(':').map(Number)
        if (suffix === 'PM' && h !== 12) h += 12
        if (suffix === 'AM' && h === 12) h = 0
        const slotTime = new Date(selectedDate)
        slotTime.setHours(h, m, 0, 0)
        return slotTime > now
      })
    : []

  // ── banner auto-scroll ──
  const bannerImages = images.length > 0
    ? images.map(img => ({ uri: img.image_url }))
    : PLACEHOLDER_IMAGES
  const bannerCount = bannerImages.length
  const activeBannerRef = useRef(0)

  useEffect(() => {
    if (bannerCount <= 1) return
    const interval = setInterval(() => {
      const next = (activeBannerRef.current + 1) % bannerCount
      activeBannerRef.current = next
      setActiveBanner(next)
      try {
        bannerRef.current?.scrollTo({ x: next * contentW, animated: true })
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [bannerCount, contentW])

  // ── submit booking ──
  const handleBook = useCallback(async () => {
    if (!isSignedIn) {
      const returnTo = `/provider/${encodeURIComponent(id)}?sid=${encodeURIComponent(selectedServiceId ?? sid)}` +
        `&_date=${encodeURIComponent(selectedDate.toISOString())}` +
        (selectedSlot ? `&_slot=${encodeURIComponent(selectedSlot)}` : '') +
        (notes.trim() ? `&_notes=${encodeURIComponent(notes.trim())}` : '')
      router.push({ pathname: '/(auth)/login', params: { returnTo } } as any)
      return
    }
    if (!selectedService || !selectedSlot) return
    setBooking(true)
    try {
      const iso = toISO(selectedDate, selectedSlot)
      const { booking: bk } = await BookingsAPI.create({
        providerServiceId: selectedService.id,
        scheduledAt: iso,
        notes: notes.trim() || undefined,
        paymentMode: 'prepaid',
      })
      setBookedISO(iso)
      setBookedOtp(bk.checkin_otp ?? null)
      setBooked(true)
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Booking failed. Please try again.')
    } finally {
      setBooking(false)
    }
  }, [selectedService, selectedSlot, selectedDate, notes, isSignedIn])

  const canBook = !!selectedSlot && !!selectedService

  // ── loading ──
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ORANGE} />
      </View>
    )
  }

  // ── error ──
  if (error || !provider) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Provider not found.'}</Text>
        <Pressable style={styles.retryBtn} onPress={() => router.back()}>
          <Text style={styles.retryBtnText}>Go back</Text>
        </Pressable>
      </View>
    )
  }

  // ── success / confirmation ──
  if (booked && bookedISO) {
    const dt = new Date(bookedISO)
    return (
      <View style={styles.center}>
        <View style={styles.successCard}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>Booking Requested!</Text>
          <Text style={styles.successSub}>{provider.name}</Text>
          <Text style={styles.successDetail}>{selectedService?.title}</Text>
          <Text style={styles.successDetail}>
            {dayLabel(dt)}, {dateLabel(dt)} · {selectedSlot}
          </Text>
          <Text style={styles.successNote}>
            The provider will confirm your booking soon.
          </Text>
          {bookedOtp && (
            <View style={styles.otpCard}>
              <Text style={styles.otpLabel}>Your Check-in OTP</Text>
              <Text style={styles.otpCode}>{bookedOtp}</Text>
              <Text style={styles.otpHint}>Share this with the provider when you arrive</Text>
            </View>
          )}
          <Pressable style={styles.doneBtn} onPress={() => router.replace('/(tabs)/bookings' as any)}>
            <Text style={styles.doneBtnText}>View My Bookings</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const location = [provider.area_name, provider.city_name].filter(Boolean).join(', ')

  // ═══════════════════════════════════════════════════════════════════════════
  //  MAIN RENDER — Swiggy Dineout–inspired layout
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <View style={styles.root}>
      <View style={[styles.contentWrap, { maxWidth: MAX_CONTENT_W }]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ════════════════════════════════════════════════════════════════════
            1. HERO BANNER — Full-width sliding images with floating buttons
         ════════════════════════════════════════════════════════════════════ */}
        <View style={styles.bannerWrap}>
          <ScrollView
            ref={bannerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / contentW)
              activeBannerRef.current = idx
              setActiveBanner(idx)
            }}
          >
            {bannerImages.map((item, i) => (
              <Image
                key={i}
                source={typeof item === 'number' ? item : { uri: item.uri }}
                style={[styles.bannerImage, { width: contentW }]}
                resizeMode="cover"
              />
            ))}
          </ScrollView>

          {/* dot indicators */}
          {bannerCount > 1 && (
            <View style={styles.dotsRow} pointerEvents="none">
              {bannerImages.map((_, i) => (
                <View key={i} style={[styles.dot, i === activeBanner && styles.dotActive]} />
              ))}
            </View>
          )}
          {/* image counter badge */}
          {bannerCount > 1 && (
            <View style={styles.imgCountBadge} pointerEvents="none">
              <Text style={styles.imgCountText}>📷 {activeBanner + 1}/{bannerCount}</Text>
            </View>
          )}
        </View>

        {/* Floating back button — outside bannerWrap so web doesn't block clicks */}
        <Pressable style={styles.floatBack} onPress={() => router.back()}>
          <Text style={styles.floatBackText}>←</Text>
        </Pressable>

        {/* Floating call button */}
        {provider.phone && (
          <Pressable
            style={styles.floatCall}
            onPress={() => Linking.openURL(`tel:${provider.phone}`)}
          >
            <Text style={styles.floatCallText}>📞</Text>
          </Pressable>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            2. PROVIDER INFO CARD — overlaps the banner bottom
         ════════════════════════════════════════════════════════════════════ */}
        <View style={styles.infoCard}>
          <Text style={styles.providerName}>{provider.name}</Text>
          {location ? (
            <View style={styles.infoLocationRow}>
              <Text style={styles.infoLocationPin}>📍</Text>
              <Text style={styles.infoLocation}>{location}</Text>
            </View>
          ) : null}
          {provider.address ? <Text style={styles.infoAddress}>{provider.address}</Text> : null}
          <View style={styles.statsRow}>
            <View style={styles.likeBadge}>
              <Text style={styles.likeText}>❤️ {provider.likes_count} Likes</Text>
            </View>
            {provider.is_featured && (
              <View style={styles.featuredBadge}>
                <Text style={styles.featuredText}>⭐ Featured</Text>
              </View>
            )}
          </View>
        </View>

        {/* ════════════════════════════════════════════════════════════════════
            3. PHOTOS — Right after info card for maximum impact
         ════════════════════════════════════════════════════════════════════ */}
        {(() => {
          const photoList = images.length > 0
            ? images.map(img => ({ key: img.id, source: { uri: img.image_url } }))
            : PLACEHOLDER_IMAGES.map((src, i) => ({ key: `ph-${i}`, source: src }))
          return (
            <View style={styles.photosSection}>
              <View style={styles.photosSectionHeader}>
                <Text style={[styles.sectionHeading, { marginBottom: 0 }]}>
                  📸 Our Work {photoList.length > 0 && <Text style={styles.photoCount}>({photoList.length})</Text>}
                </Text>
                <Text style={styles.photosSubtitle}>Tap to view full screen</Text>
              </View>
              <FlatList
                data={photoList}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photosListContent}
                keyExtractor={(item) => item.key}
                renderItem={({ item, index }) => (
                  <Pressable
                    style={styles.photoCard}
                    onPress={() => {
                      setLightboxIndex(index)
                      setLightboxVisible(true)
                      setTimeout(() => {
                        lightboxRef.current?.scrollTo({ x: index * contentW, animated: false })
                      }, 50)
                    }}
                  >
                    <Image source={item.source} style={styles.photoCardImage} resizeMode="cover" />
                  </Pressable>
                )}
              />
            </View>
          )
        })()}

        {/* ════════════════════════════════════════════════════════════════════
            4. OFFERS BANNER (if discount exists on selected service)
         ════════════════════════════════════════════════════════════════════ */}
        {selectedService && selectedService.discount_pct > 0 && (
          <View style={styles.offerBanner}>
            <View style={styles.offerBadge}>
              <Text style={styles.offerBadgeText}>OFFER</Text>
            </View>
            <View style={styles.offerContent}>
              <Text style={styles.offerTitle}>
                Flat {selectedService.discount_pct}% OFF
              </Text>
              <Text style={styles.offerSub}>on prepaid booking</Text>
            </View>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            4. SERVICES LIST
         ════════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Services</Text>
          <View style={styles.servicesGrid}>
            {services.map((svc) => {
              const selected = svc.id === selectedServiceId
              const hasDiscount = svc.discount_pct > 0 && svc.discounted_price_paise != null
              return (
                <Pressable
                  key={svc.id}
                  style={[styles.serviceCard, selected && styles.serviceCardSelected]}
                  onPress={() => { setSelectedServiceId(svc.id); setSelectedSlot(null) }}
                >
                  {/* Top accent bar */}
                  <View style={[styles.serviceAccent, selected && styles.serviceAccentSelected]} />

                  <View style={styles.serviceCardBody}>
                    <View style={styles.serviceCardTop}>
                      <View style={styles.serviceCardLeft}>
                        <Text style={[styles.serviceName, selected && styles.serviceNameActive]}>
                          {svc.title}
                        </Text>
                        <View style={styles.serviceMetaRow}>
                          <Text style={styles.serviceMetaIcon}>🕐</Text>
                          <Text style={styles.serviceMeta}>{svc.duration_mins} min</Text>
                          <Text style={styles.serviceMetaDot}>·</Text>
                          <Text style={styles.serviceMeta}>{svc.category_slug}</Text>
                        </View>
                      </View>
                      <View style={styles.servicePriceBlock}>
                        {hasDiscount ? (
                          <>
                            <Text style={styles.servicePriceStrike}>{formatRupees(svc.price_paise)}</Text>
                            <Text style={styles.servicePriceDiscount}>{formatRupees(svc.discounted_price_paise!)}</Text>
                          </>
                        ) : (
                          <Text style={styles.servicePrice}>{formatRupees(svc.price_paise)}</Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.serviceCardBottom}>
                      {hasDiscount && (
                        <View style={styles.serviceDiscountTag}>
                          <Text style={styles.serviceDiscountText}>{svc.discount_pct}% OFF</Text>
                        </View>
                      )}
                      <View style={styles.serviceSelectBtn}>
                        {selected ? (
                          <View style={styles.serviceCheckCircle}>
                            <Text style={styles.serviceCheckMark}>✓</Text>
                          </View>
                        ) : (
                          <Text style={styles.serviceSelectText}>Select</Text>
                        )}
                      </View>
                    </View>
                  </View>
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* ════════════════════════════════════════════════════════════════════
            5. BOOKING SECTION — only if a service is selected
         ════════════════════════════════════════════════════════════════════ */}
        {selectedService && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Book Appointment</Text>

            {/* ── Calendar ── */}
            <View style={styles.calendarCard}>
              <View style={styles.calendarHeader}>
                <Pressable
                  style={[styles.calNavBtn, prevWeekDisabled && styles.calNavBtnDisabled]}
                  onPress={goToPrevWeek}
                  disabled={prevWeekDisabled}
                >
                  <Text style={[styles.calNavArrow, prevWeekDisabled && { color: '#ccc' }]}>‹</Text>
                </Pressable>
                <Text style={styles.calMonthLabel}>
                  {MONTHS_FULL[currentWeek[0].getMonth()]} {currentWeek[0].getFullYear()}
                  {currentWeek[0].getMonth() !== currentWeek[6].getMonth()
                    ? ` / ${MONTHS_FULL[currentWeek[6].getMonth()]}` : ''}
                </Text>
                <Pressable style={styles.calNavBtn} onPress={goToNextWeek}>
                  <Text style={styles.calNavArrow}>›</Text>
                </Pressable>
              </View>
              <View style={styles.calDayRow}>
                {DAYS_SHORT.map(d => <Text key={d} style={styles.calDayName}>{d}</Text>)}
              </View>
              <View style={styles.calDayRow}>
                {currentWeek.map((d, i) => {
                  const sel  = d.toDateString() === selectedDate.toDateString()
                  const past = d < today
                  const dayClosed = availability.find(a => a.day_of_week === d.getDay())?.is_closed ?? false
                  return (
                    <Pressable key={i} style={styles.calDayCell} onPress={() => !past && setSelectedDate(d)} disabled={past}>
                      <View style={[styles.calDayCircle, sel && styles.calDayCircleSel, past && { opacity: 0.35 }, dayClosed && !sel && { opacity: 0.4 }]}>
                        <Text style={[styles.calDayNum, sel && { color: '#fff' }, past && { color: '#bbb' }]}>{d.getDate()}</Text>
                      </View>
                      {dayClosed
                        ? <Text style={styles.calDayClosed}>Closed</Text>
                        : <Text style={[styles.calDayMon, sel && { color: ORANGE, fontWeight: '700' }]}>{MONTHS[d.getMonth()]}</Text>
                      }
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {/* ── Time slots ── */}
            <Text style={styles.subHeading}>Select a time slot</Text>
            {isDayClosed ? (
              <View style={styles.closedBanner}>
                <Text style={styles.closedBannerText}>🚫 Closed on {DAYS_FULL[selectedDate.getDay()]}s</Text>
              </View>
            ) : timeSlots.length === 0 ? (
              <View style={styles.closedBanner}>
                <Text style={styles.closedBannerText}>No slots available for this day</Text>
              </View>
            ) : (
              <View style={styles.pickerOuter}>
                <View style={[styles.pickerFade, { top: 0, backgroundColor: 'rgba(255,255,255,0.75)' }]} pointerEvents="none" />
                <View style={styles.pickerHighlight} pointerEvents="none" />
                <View style={[styles.pickerFade, { bottom: 0, backgroundColor: 'rgba(255,255,255,0.75)' }]} pointerEvents="none" />
                <ScrollView
                  ref={slotPickerRef}
                  style={{ height: SLOT_ITEM_H * SLOT_VISIBLE }}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={SLOT_ITEM_H}
                  decelerationRate="fast"
                  onScroll={(e) => {
                    const idx = Math.round(e.nativeEvent.contentOffset.y / SLOT_ITEM_H)
                    if (idx >= 0 && idx < timeSlots.length && timeSlots[idx] !== selectedSlot) {
                      setSelectedSlot(timeSlots[idx])
                    }
                  }}
                  scrollEventThrottle={16}
                  contentContainerStyle={{ paddingVertical: SLOT_ITEM_H * 1 }}
                >
                  {timeSlots.map((slot, i) => (
                    <Pressable
                      key={slot}
                      style={[styles.pickerItem, { height: SLOT_ITEM_H }]}
                      onPress={() => {
                        setSelectedSlot(slot)
                        slotPickerRef.current?.scrollTo({ y: i * SLOT_ITEM_H, animated: true })
                      }}
                    >
                      <Text style={[styles.pickerItemText, slot === selectedSlot && styles.pickerItemTextSel]}>
                        {slot}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Notes ── */}
            <Text style={styles.subHeading}>Notes <Text style={{ fontWeight: '400', color: '#aaa' }}>(optional)</Text></Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Any special requests…"
              placeholderTextColor="#bbb"
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
              maxLength={500}
            />
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            7. LOCATION
         ════════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Location</Text>

          {/* Embedded map — tapping opens Google Maps */}
          {provider.lat && provider.lng ? (
            <Pressable
              onPress={() => {
                const url = Platform.select({
                  ios: `maps://app?daddr=${provider.lat},${provider.lng}`,
                  android: `google.navigation:q=${provider.lat},${provider.lng}`,
                  default: `https://www.google.com/maps/search/?api=1&query=${provider.lat},${provider.lng}`,
                })
                Linking.openURL(url)
              }}
              style={styles.mapContainer}
            >
              {Platform.OS === 'web' ? (
                <iframe
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(provider.lng) - 0.006},${Number(provider.lat) - 0.004},${Number(provider.lng) + 0.006},${Number(provider.lat) + 0.004}&layer=mapnik&marker=${provider.lat},${provider.lng}`}
                  style={{ width: '100%', height: 220, border: 'none', borderRadius: 12, pointerEvents: 'none' } as any}
                />
              ) : (
                <Image
                  source={{ uri: `https://staticmap.openstreetmap.de/staticmap.php?center=${provider.lat},${provider.lng}&zoom=15&size=600x300&maptype=mapnik&markers=${provider.lat},${provider.lng},red-pushpin` }}
                  style={styles.mapImage}
                  resizeMode="cover"
                />
              )}
              <View style={styles.mapOverlayBadge}>
                <Text style={styles.mapOverlayText}>Open in Google Maps ›</Text>
              </View>
            </Pressable>
          ) : null}

          {/* Address + distance */}
          {provider.address && (
            <View style={styles.locationRow}>
              <Text style={styles.locationPin}>📍</Text>
              <Text style={styles.locationText}>{provider.address}</Text>
            </View>
          )}
          {location && !provider.address && (
            <View style={styles.locationRow}>
              <Text style={styles.locationPin}>📍</Text>
              <Text style={styles.locationText}>{location}</Text>
            </View>
          )}
          {provider.phone && (
            <Pressable
              style={styles.locationRow}
              onPress={() => Linking.openURL(`tel:${provider.phone}`)}
            >
              <Text style={styles.locationPin}>📞</Text>
              <Text style={[styles.locationText, { color: ORANGE }]}>{provider.phone}</Text>
            </Pressable>
          )}
        </View>

        {/* ════════════════════════════════════════════════════════════════════
            8. HELP & SUPPORT
         ════════════════════════════════════════════════════════════════════ */}
        <View style={styles.helpCard}>
          <Text style={styles.helpText}>Have queries or need help with something?</Text>
          <Text style={styles.helpLink}>View help & support ›</Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Sticky bottom CTA ── */}
      <View style={styles.ctaBar}>
        {selectedService && (
          <View style={styles.ctaSummary}>
            <Text style={styles.ctaServiceName} numberOfLines={1}>{selectedService.title}</Text>
            <Text style={styles.ctaPrice}>
              {selectedService.discounted_price_paise
                ? formatRupees(selectedService.discounted_price_paise)
                : formatRupees(selectedService.price_paise)}
            </Text>
          </View>
        )}
        {!authLoading && !isSignedIn ? (
          <Pressable style={styles.ctaBtn} onPress={handleBook}>
            <Text style={styles.ctaBtnText}>Login to Book</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.ctaBtn, !canBook && styles.ctaBtnDisabled]}
            onPress={handleBook}
            disabled={!canBook || booking}
          >
            {booking
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.ctaBtnText}>
                  {canBook ? `Book Now · ${selectedSlot}` : 'Select a time slot'}
                </Text>
            }
          </Pressable>
        )}
      </View>
      </View>

      {/* ═══════════════════════════════════════════════════════════════════
          PHOTO LIGHTBOX — Full-screen viewer with prev/next/close
       ═══════════════════════════════════════════════════════════════════ */}
      {(() => {
        const allPhotos = images.length > 0
          ? images.map(img => ({ key: img.id, source: { uri: img.image_url } }))
          : PLACEHOLDER_IMAGES.map((src, i) => ({ key: `ph-${i}`, source: src }))
        return (
          <Modal
            visible={lightboxVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setLightboxVisible(false)}
          >
            <View style={styles.lbOverlay}>
              {/* Top bar — close + counter */}
              <View style={styles.lbTopBar}>
                <Pressable style={styles.lbCloseBtn} onPress={() => setLightboxVisible(false)}>
                  <Text style={styles.lbCloseBtnText}>✕</Text>
                </Pressable>
                <Text style={styles.lbCounter}>
                  {lightboxIndex + 1} / {allPhotos.length}
                </Text>
                <View style={{ width: 40 }} />
              </View>

              {/* Scrollable images */}
              <ScrollView
                ref={lightboxRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.lbScroll}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth)
                  setLightboxIndex(idx)
                }}
              >
                {allPhotos.map((photo, i) => (
                  <View key={photo.key} style={[styles.lbSlide, { width: screenWidth }]}>
                    <Image
                      source={photo.source}
                      style={styles.lbImage}
                      resizeMode="contain"
                    />
                  </View>
                ))}
              </ScrollView>

              {/* Prev / Next arrows */}
              {allPhotos.length > 1 && (
                <>
                  {lightboxIndex > 0 && (
                    <Pressable
                      style={[styles.lbArrow, styles.lbArrowLeft]}
                      onPress={() => {
                        const prev = lightboxIndex - 1
                        setLightboxIndex(prev)
                        lightboxRef.current?.scrollTo({ x: prev * screenWidth, animated: true })
                      }}
                    >
                      <Text style={styles.lbArrowText}>‹</Text>
                    </Pressable>
                  )}
                  {lightboxIndex < allPhotos.length - 1 && (
                    <Pressable
                      style={[styles.lbArrow, styles.lbArrowRight]}
                      onPress={() => {
                        const next = lightboxIndex + 1
                        setLightboxIndex(next)
                        lightboxRef.current?.scrollTo({ x: next * screenWidth, animated: true })
                      }}
                    >
                      <Text style={styles.lbArrowText}>›</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </Modal>
        )
      })()}

    </View>
  )
}

// ─── theme ────────────────────────────────────────────────────────────────────

const ORANGE    = '#E8590C'
const ORANGE_BG = '#FFF4ED'
const DARK      = '#1B1B1B'
const GREY      = '#686B78'
const LIGHT_BG  = '#F1F1F6'
const BORDER    = '#E9E9EB'

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EDE4DA', alignItems: 'center' },
  contentWrap: { flex: 1, width: '100%', backgroundColor: '#F5EFE8' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5EFE8', padding: 24 },
  errorText: { color: '#e55', fontSize: 15, textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  scroll: { flex: 1 },

  // ── 1. hero banner ──
  bannerWrap: { position: 'relative', backgroundColor: '#111' },
  bannerImage: { height: 320 },

  floatBack: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 14,
    left: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    zIndex: 10,
    cursor: 'pointer' as any,
  },
  floatBackText: { fontSize: 20, color: DARK, fontWeight: '700', marginTop: -1 },

  floatCall: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 14,
    right: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    zIndex: 10,
    cursor: 'pointer' as any,
  },
  floatCallText: { fontSize: 18 },

  dotsRow: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: 54,
    alignSelf: 'center',
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotActive: { backgroundColor: '#fff', width: 22 },
  imgCountBadge: {
    position: 'absolute',
    bottom: 54,
    right: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  imgCountText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // ── 2. provider info card (overlapping banner) ──
  infoCard: {
    marginTop: -40,
    marginHorizontal: 12,
    backgroundColor: '#243D4F',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    shadowColor: '#00C896',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    borderWidth: 1.5,
    borderColor: '#00C896',
  },
  providerName: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', marginBottom: 8, letterSpacing: -0.4 },
  infoLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  infoLocationPin: { fontSize: 13 },
  infoLocation: { fontSize: 13, color: '#A0D8C8' },
  infoAddress: { fontSize: 12, color: '#7BADA0', marginTop: 2, marginLeft: 17 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  likeBadge: {
    backgroundColor: 'rgba(255,90,90,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,90,90,0.3)',
  },
  likeText: { fontSize: 12, fontWeight: '700', color: '#FF7B7B' },
  featuredBadge: {
    backgroundColor: 'rgba(0,200,150,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,200,150,0.3)',
  },
  featuredText: { fontSize: 12, fontWeight: '700', color: '#00E0A8' },

  // ── 3. offer banner ──
  offerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: ORANGE_BG,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#FFDAC8',
  },
  offerBadge: {
    backgroundColor: ORANGE,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  offerBadgeText: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  offerContent: {},
  offerTitle: { fontSize: 16, fontWeight: '900', color: DARK },
  offerSub: { fontSize: 12, color: GREY, marginTop: 2 },

  // ── 4. services ──
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '900',
    color: DARK,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  servicesGrid: { gap: 12 },
  serviceCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8E0D8',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  serviceCardSelected: {
    borderColor: ORANGE,
    shadowColor: ORANGE,
    shadowOpacity: 0.15,
    elevation: 5,
  },
  serviceAccent: {
    height: 4,
    backgroundColor: '#E8E0D8',
  },
  serviceAccentSelected: {
    backgroundColor: ORANGE,
  },
  serviceCardBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  serviceCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  serviceCardLeft: { flex: 1, marginRight: 12 },
  serviceName: { fontSize: 16, fontWeight: '800', color: DARK, marginBottom: 6 },
  serviceNameActive: { color: ORANGE },
  serviceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  serviceMetaIcon: { fontSize: 11 },
  serviceMeta: { fontSize: 12, color: GREY },
  serviceMetaDot: { fontSize: 12, color: '#C0B8B0' },
  serviceCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0EBE5',
  },
  serviceDiscountTag: {
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  serviceDiscountText: { fontSize: 11, fontWeight: '800', color: '#16A34A' },
  serviceSelectBtn: { marginLeft: 'auto' },
  serviceSelectText: { fontSize: 13, fontWeight: '700', color: ORANGE },
  serviceCheckCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCheckMark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  servicePriceBlock: { alignItems: 'flex-end' },
  servicePrice: { fontSize: 18, fontWeight: '900', color: DARK },
  servicePriceStrike: { fontSize: 12, color: '#B0A8A0', textDecorationLine: 'line-through', marginBottom: 2 },
  servicePriceDiscount: { fontSize: 18, fontWeight: '900', color: '#16A34A' },

  // ── 5. booking section ──
  subHeading: { fontSize: 14, fontWeight: '700', color: DARK, marginBottom: 10, marginTop: 16 },

  payModeOptions: { flexDirection: 'row', gap: 10 },
  payModeOption: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8DFD4',
    backgroundColor: '#FFF9F3',
  },
  payModeSelected: {
    borderColor: ORANGE,
    backgroundColor: ORANGE_BG,
  },
  payModeIcon: { fontSize: 20 },
  payModeLabel: { fontSize: 12, fontWeight: '700', color: GREY },
  payModeLabelSel: { color: ORANGE },
  payModeHint: { fontSize: 10, color: '#999', marginTop: 2 },

  calendarCard: {
    backgroundColor: '#FFF9F3',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E8DFD4',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  calMonthLabel: { fontSize: 14, fontWeight: '700', color: DARK },
  calNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: ORANGE_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calNavBtnDisabled: { backgroundColor: LIGHT_BG },
  calNavArrow: { fontSize: 20, color: ORANGE, lineHeight: 24, fontWeight: '700' },
  calDayRow: { flexDirection: 'row', justifyContent: 'space-around' },
  calDayName: { width: 34, textAlign: 'center', fontSize: 10, fontWeight: '600', color: '#999', marginBottom: 6 },
  calDayCell: { width: 34, alignItems: 'center', paddingVertical: 3 },
  calDayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  calDayCircleSel: { backgroundColor: ORANGE },
  calDayNum: { fontSize: 14, fontWeight: '700', color: DARK },
  calDayMon: { fontSize: 8, color: '#aaa', marginTop: 2, fontWeight: '500' },
  calDayClosed: { fontSize: 7, color: '#E55', marginTop: 2, fontWeight: '700' },

  closedBanner: {
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FDDCDC',
  },
  closedBannerText: { fontSize: 13, fontWeight: '700', color: '#C53030' },

  // ── wheel time picker ──
  pickerOuter: {
    alignSelf: 'center',
    width: '50%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0D8D0',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  pickerHighlight: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(232,89,12,0.08)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: ORANGE,
    zIndex: 2,
  },
  pickerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 40,
    zIndex: 3,
  },
  pickerItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerItemText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#B0A8A0',
  },
  pickerItemTextSel: {
    color: DARK,
    fontWeight: '800',
    fontSize: 20,
  },

  notesInput: {
    backgroundColor: '#FFF9F3',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8DFD4',
    padding: 12,
    fontSize: 14,
    color: DARK,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 8,
  },

  // ── 3. photos — horizontal sliding ──
  photosSection: {
    paddingTop: 20,
    paddingBottom: 14,
    backgroundColor: '#FFF3E8',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8DFD4',
  },
  photosSectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  photosSubtitle: {
    fontSize: 12,
    color: GREY,
    marginTop: 4,
  },
  photosListContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  photoCard: {
    width: 200,
    height: 150,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  photoCardImage: {
    width: 200,
    height: 150,
  },
  photoCount: { fontSize: 14, fontWeight: '600', color: GREY },

  // ── 7. location ──
  mapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#E8E8E8',
    position: 'relative',
  },
  mapImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
  },
  mapOverlayBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  mapOverlayText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
  },
  locationPin: { fontSize: 16, marginTop: 1 },
  locationText: { fontSize: 13, color: GREY, flex: 1, lineHeight: 20 },

  // ── 8. help card ──
  helpCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#FFF8F1',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#FFDAC8',
    shadowColor: '#E8590C',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  helpText: { fontSize: 13, fontWeight: '600', color: DARK },
  helpLink: { fontSize: 13, fontWeight: '700', color: ORANGE, marginTop: 4 },

  // ── sticky CTA bar ──
  ctaBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF5ED',
    borderTopWidth: 1,
    borderTopColor: '#E8DFD4',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 32 : 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  ctaSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ctaServiceName: { fontSize: 12, fontWeight: '600', color: GREY, flex: 1 },
  ctaPrice: { fontSize: 14, fontWeight: '800', color: DARK },
  ctaBtn: {
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaBtnDisabled: { backgroundColor: '#D0D0D0' },
  ctaBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // ── success ──
  successCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    maxWidth: 340,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  successIcon: { fontSize: 48, color: '#22C55E', marginBottom: 12 },
  successTitle: { fontSize: 22, fontWeight: '800', color: DARK, marginBottom: 8 },
  successSub: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 4 },
  successDetail: { fontSize: 14, color: '#555', marginBottom: 4, textAlign: 'center' },
  successNote: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 12, marginBottom: 20 },
  doneBtn: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 40 },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  otpCard: {
    backgroundColor: ORANGE_BG,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FFDAC8',
  },
  otpLabel: { fontSize: 11, fontWeight: '700', color: ORANGE, letterSpacing: 0.8, textTransform: 'uppercase' },
  otpCode:  { fontSize: 32, fontWeight: '900', color: DARK, letterSpacing: 8, marginVertical: 8 },
  otpHint:  { fontSize: 11, color: GREY, textAlign: 'center' },

  // ── lightbox ──
  lbOverlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  lbTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  lbCloseBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  lbCloseBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  lbCounter: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  lbScroll: { flex: 1 },
  lbSlide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  lbImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  lbArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  lbArrowLeft: { left: 16 },
  lbArrowRight: { right: 16 },
  lbArrowText: { color: '#fff', fontSize: 30, fontWeight: '300', marginTop: -2 },
})
