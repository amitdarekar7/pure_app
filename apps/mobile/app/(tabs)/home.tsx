import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useAuth } from '../../lib/auth-context'
import { LocationAPI, ProvidersAPI, BookingsAPI, SearchAPI, City, Area, Provider, BookingSummary } from '../../lib/api'
import type { SearchHit } from '../../lib/api'
import { useEventStream, type BookingRespondedEvent } from '../../lib/use-event-stream'

const LOGO = require('../../assets/images/logo_pure.png')

const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_S   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const BOOKING_STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  confirmed:  { label: 'Confirmed',  color: '#065f46', bg: '#d1fae5', icon: 'checkmark-circle' },
  pending:    { label: 'Pending',    color: '#92400e', bg: '#fef3c7', icon: 'time-outline' },
  cancelled:  { label: 'Cancelled',  color: '#991b1b', bg: '#fee2e2', icon: 'close-circle' },
  rejected:   { label: 'Rejected',   color: '#991b1b', bg: '#fee2e2', icon: 'close-circle' },
  completed:  { label: 'Completed',  color: '#1e3a5f', bg: '#dbeafe', icon: 'ribbon-outline' },
  _default:   { label: 'Pending',    color: '#92400e', bg: '#fef3c7', icon: 'time-outline' },
}

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name']

const SERVICES: { id: string; icon: MCIcon; label: string; sub: string; bg: string; iconColor: string }[] = [
  { id: 'haircut',       icon: 'content-cut',        label: 'Hair Cut',        sub: 'Salons & Stylists',     bg: '#fce4ec', iconColor: '#ad1457' },
  { id: 'facial',        icon: 'face-woman-shimmer', label: 'Facial',          sub: 'Skin & Glow',           bg: '#ede7f6', iconColor: '#7b1fa2' },
  { id: 'manicure',      icon: 'hand-heart',         label: 'Manicure',        sub: 'Nail Art & Care',       bg: '#fff8e1', iconColor: '#e65100' },
  { id: 'pedicure',      icon: 'foot-print',         label: 'Pedicure',        sub: 'Foot Care',             bg: '#e8f5e9', iconColor: '#2e7d32' },
  { id: 'haircolor',     icon: 'palette',            label: 'Hair Color',      sub: 'Highlights & Balayage', bg: '#fbe9e7', iconColor: '#bf360c' },
  { id: 'threading',     icon: 'eye-outline',        label: 'Threading',       sub: 'Brows & More',          bg: '#e0f7fa', iconColor: '#00838f' },
  { id: 'hairstyling',   icon: 'hair-dryer',         label: 'Hair Styling',    sub: 'Blowdry & Updo',        bg: '#e8eaf6', iconColor: '#283593' },
  { id: 'waxing',        icon: 'leaf',               label: 'Waxing',          sub: 'Smooth & Soft',         bg: '#f1f8e9', iconColor: '#33691e' },
  { id: 'bridalmakeup',  icon: 'crown-outline',      label: 'Bridal Makeup',   sub: 'Bridal Artists',        bg: '#fce4ec', iconColor: '#880e4f' },
  { id: 'partymakeup',   icon: 'star-shooting',      label: 'Party Makeup',    sub: 'Glam & Glitter',        bg: '#f3e5f5', iconColor: '#6a1b9a' },
  { id: 'straightening', icon: 'auto-fix',           label: 'Straightening',   sub: 'Keratin & Rebond',      bg: '#e8eaf6', iconColor: '#1a237e' },
  { id: 'nailext',       icon: 'diamond-stone',      label: 'Nail Extensions', sub: 'Gel & Acrylic',         bg: '#fce4ec', iconColor: '#c62828' },
  { id: 'hairspa',       icon: 'spa',                label: 'Hair Spa',        sub: 'Deep Conditioning',     bg: '#e0f2f1', iconColor: '#00695c' },
  { id: 'groommakeup',   icon: 'face-man-shimmer',   label: 'Groom Makeup',    sub: 'Groom & Men',           bg: '#e3f2fd', iconColor: '#1565c0' },
  { id: 'beard',         icon: 'mustache',           label: 'Beard',           sub: 'Trim & Grooming',       bg: '#efebe9', iconColor: '#4e342e' },
  { id: 'sidermakeup',   icon: 'account-group',      label: 'Sider Makeup',    sub: 'Bride Relatives',       bg: '#fce4ec', iconColor: '#d81b60' },
]

export default function HomeScreen() {
  const { user, isLoading: authLoading } = useAuth()
  const router     = useRouter()
  const scrollRef  = useRef<ScrollView>(null)
  const { width }  = useWindowDimensions()
  // Responsive helpers
  const isTablet   = width >= 600
  const isDesktop  = width >= 1024
  const maxW       = isDesktop ? 760 : isTablet ? 640 : 520
  // Service grid: 4 cols on desktop, 3 on tablet, 3 on phone
  const gridCols   = isDesktop ? 4 : 3
  const gridGap    = 10
  // scroll padding=16*2 + card padding=20*2 = 72
  const containerW = Math.min(width, maxW) - 72
  const catW       = Math.floor((containerW - (gridCols - 1) * gridGap) / gridCols)

  // ── Location state ──────────────────────────────────────────────────────
  const [cities,      setCities]      = useState<City[]>([])
  const [citiesLoading, setCitiesLoading] = useState(true)
  const [city,        setCity]        = useState<City | null>(null)
  const [showCities,  setShowCities]  = useState(false)
  const [areas,       setAreas]       = useState<Area[]>([])
  const [areasLoading, setAreasLoading] = useState(false)
  const [area,        setArea]        = useState<Area | null>(null)
  const [showAreas,   setShowAreas]   = useState(false)

  // ── Filter state ────────────────────────────────────────────────────────
  const [citySearch,  setCitySearch]  = useState('')
  const [areaSearch,  setAreaSearch]  = useState('')

  // ── Service state ───────────────────────────────────────────────────────
  const [services,     setServices]     = useState<typeof SERVICES>([])  // multi-select
  const [showServices, setShowServices] = useState(false)

  // ── Results state ───────────────────────────────────────────────────────
  const [providers,        setProviders]        = useState<Provider[]>([])
  const [loadingProviders, setLoadingProviders]  = useState(false)
  const [searched,         setSearched]          = useState(false)
  const [likedIds,         setLikedIds]          = useState<Set<string>>(new Set())
  const [bookingBanner,    setBookingBanner]      = useState<{ text: string; ok: boolean } | null>(null)
  const [recentBookings,   setRecentBookings]     = useState<BookingSummary[]>([])
  const [bookingsLoading,  setBookingsLoading]    = useState(false)

  // ── Global full-text search state ───────────────────────────────────────
  const [globalQuery,     setGlobalQuery]     = useState('')
  const [globalResults,   setGlobalResults]   = useState<SearchHit[]>([])
  const [globalTotal,     setGlobalTotal]     = useState(0)
  const [globalSearching, setGlobalSearching] = useState(false)
  const [globalMode,      setGlobalMode]      = useState(false)

  // ── Autocomplete suggestions state ───────────────────────────────────────
  const [suggestions,     setSuggestions]     = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestDebounce   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch last 3 bookings whenever user is signed in
  const fetchRecentBookings = useCallback(async () => {
    if (!user) { setRecentBookings([]); return }
    setBookingsLoading(true)
    try {
      const { bookings } = await BookingsAPI.my()
      setRecentBookings(bookings.slice(0, 3))
    } catch { /* ignore */ }
    finally { setBookingsLoading(false) }
  }, [user])

  useEffect(() => { fetchRecentBookings() }, [fetchRecentBookings])

  // Real-time SSE: fires when a provider responds to this user's booking
  const { lastEvent } = useEventStream('user')
  useEffect(() => {
    if (!lastEvent || lastEvent.event_type !== 'booking.responded') return
    const ev = lastEvent as BookingRespondedEvent
    const ok = ev.data.action === 'confirm'
    const text = ok
      ? `${ev.data.provider_name} confirmed your booking for ${ev.data.service_title ?? 'your service'}!`
      : ev.data.action === 'reschedule'
        ? `${ev.data.provider_name} rescheduled your booking.`
        : `${ev.data.provider_name} cancelled your booking for ${ev.data.service_title ?? 'your service'}.`
    // ① persistent 8-second banner in the page
    setBookingBanner({ text, ok })
    const t = setTimeout(() => setBookingBanner(null), 8_000)
    // ② native alert for immediate attention even when app is in background
    const alertTitle = ok ? '🎉 Booking Confirmed!' : ev.data.action === 'reschedule' ? '📅 Booking Rescheduled' : '❌ Booking Cancelled'
    Alert.alert(alertTitle, text, [{ text: 'OK' }])
    // ③ refresh the widget cards in the background
    fetchRecentBookings()
    return () => clearTimeout(t)
  }, [lastEvent, fetchRecentBookings])

  useEffect(() => {
    // Remove browser focus outline on web inputs
    if (typeof document !== 'undefined') {
      const style = document.createElement('style')
      style.textContent = 'input:focus { outline: none !important; box-shadow: none !important; }'
      document.head.appendChild(style)
    }
    LocationAPI.cities()
      .then(({ cities: data }) => setCities(data))
      .catch(() => setCities([]))
      .finally(() => setCitiesLoading(false))
  }, [])

  useEffect(() => {
    if (!city) { setAreas([]); setArea(null); return }
    setArea(null)
    setAreas([])
    setAreasLoading(true)
    LocationAPI.areas(city.id)
      .then(({ areas: data }) => setAreas(data))
      .catch(() => setAreas([]))
      .finally(() => setAreasLoading(false))
  }, [city])

  function closeAll() {
    setShowCities(false)
    setShowAreas(false)
    setShowServices(false)
    setCitySearch('')
    setAreaSearch('')
  }

  function handleSearch() {
    if (!city || services.length === 0) return
    closeAll()
    setLoadingProviders(true)
    setSearched(true)
    Promise.all(
      services.map(svc => ProvidersAPI.list(city.id, svc.id).then(r => r.providers))
    )
      .then(results => {
        const flat = [...results.flat()].sort((a, b) => b.likes_count - a.likes_count)
        setProviders(flat)
        setLikedIds(new Set(flat.filter(p => p.is_liked).map(p => p.id)))
      })
      .catch(() => setProviders([]))
      .finally(() => setLoadingProviders(false))
  }

  const canSearch = !!city && services.length > 0

  function toggleService(svc: typeof SERVICES[0]) {
    setServices(prev =>
      prev.some(s => s.id === svc.id)
        ? prev.filter(s => s.id !== svc.id)
        : [...prev, svc]
    )
    setSearched(false)
  }

  // Fetch autocomplete suggestions debounced at 250 ms
  function onQueryChange(t: string) {
    setGlobalQuery(t)
    if (!t.trim()) {
      clearGlobalSearch()
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    if (suggestDebounce.current) clearTimeout(suggestDebounce.current)
    suggestDebounce.current = setTimeout(async () => {
      try {
        const data = await SearchAPI.query(t.trim())
        const hits = data.hits?.hits ?? []
        const seen = new Set<string>()
        const list: string[] = []
        for (const h of hits) {
          const pn = h._source.provider_name
          const st = h._source.service_title
          if (pn && !seen.has(pn)) { seen.add(pn); list.push(pn) }
          if (st && !seen.has(st)) { seen.add(st); list.push(st) }
          if (list.length >= 6) break
        }
        setSuggestions(list)
        setShowSuggestions(list.length > 0)
      } catch {
        setSuggestions([])
        setShowSuggestions(false)
      }
    }, 250)
  }

  function pickSuggestion(s: string) {
    setGlobalQuery(s)
    setSuggestions([])
    setShowSuggestions(false)
    runSearch(s)
  }

  async function runSearch(q: string) {
    closeAll()
    setGlobalSearching(true)
    setGlobalMode(true)
    try {
      const data = await SearchAPI.query(q)
      setGlobalResults(data.hits?.hits ?? [])
      setGlobalTotal(data.hits?.total?.value ?? 0)
    } catch {
      setGlobalResults([])
      setGlobalTotal(0)
    } finally {
      setGlobalSearching(false)
    }
  }

  async function handleGlobalSearch() {
    const q = globalQuery.trim()
    if (!q) return
    setSuggestions([])
    setShowSuggestions(false)
    runSearch(q)
  }

  function clearGlobalSearch() {
    setGlobalMode(false)
    setGlobalQuery('')
    setGlobalResults([])
    setGlobalTotal(0)
    setSuggestions([])
    setShowSuggestions(false)
  }

  async function handleLike(providerId: string) {
    const isLiked = likedIds.has(providerId)
    // Optimistic update
    setLikedIds(prev => {
      const next = new Set(prev)
      isLiked ? next.delete(providerId) : next.add(providerId)
      return next
    })
    setProviders(prev => {
      const updated = prev.map(p =>
        p.id === providerId
          ? { ...p, likes_count: p.likes_count + (isLiked ? -1 : 1) }
          : p
      )
      return [...updated].sort((a, b) => b.likes_count - a.likes_count)
    })
    // Persist to server
    try {
      isLiked
        ? await ProvidersAPI.unlike(providerId)
        : await ProvidersAPI.like(providerId)
    } catch {
      // Revert on failure
      setLikedIds(prev => {
        const next = new Set(prev)
        isLiked ? next.add(providerId) : next.delete(providerId)
        return next
      })
      setProviders(prev => {
        const reverted = prev.map(p =>
          p.id === providerId
            ? { ...p, likes_count: p.likes_count + (isLiked ? 1 : -1) }
            : p
        )
        return [...reverted].sort((a, b) => b.likes_count - a.likes_count)
      })
    }
  }

  const firstName = user?.display_name
    ? user.display_name.split(' ')[0]
    : user ? user.email.split('@')[0] : ''

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  if (authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8f8f8', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#7c6af7" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        style={styles.root}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={closeAll}
      >
      <View style={styles.card}>
        <View style={{ maxWidth: maxW, width: '100%', alignSelf: 'center' }}>

        {/* ── Hero Header (matches provider dashboard) ─────── */}
        <View style={styles.heroCard}>
          {/* Top bar: logo + small avatar */}
          <View style={styles.heroTop}>
            <Pressable
              onPress={() => {
                clearGlobalSearch()
                setSearched(false)
                setProviders([])
                closeAll()
                scrollRef.current?.scrollTo({ y: 0, animated: true })
              }}
              hitSlop={8}
            >
              <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
            </Pressable>

            {user ? (
              <View style={styles.heroRight}>
                <Pressable style={styles.bellWrap} onPress={() => router.push('/(tabs)/bookings')}>
                  <Ionicons name="notifications-outline" size={22} color="#374151" />
                  {recentBookings.filter(b => b.status === 'pending').length > 0 && (
                    <View style={styles.bellBadge}>
                      <Text style={styles.bellBadgeText}>
                        {recentBookings.filter(b => b.status === 'pending').length > 9
                          ? '9+'
                          : recentBookings.filter(b => b.status === 'pending').length}
                      </Text>
                    </View>
                  )}
                </Pressable>
                <Pressable onPress={() => router.push('/(tabs)/profile')}>
                  {user.avatar_url ? (
                    <Image source={{ uri: user.avatar_url }} style={styles.avatarImgSm} />
                  ) : (
                    <View style={styles.avatarCircleSm}>
                      <Text style={styles.avatarLetterSm}>
                        {firstName[0]?.toUpperCase() ?? 'U'}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => router.push('/(auth)/login')} style={styles.loginBtn}>
                <Ionicons name="person-outline" size={13} color="#7c6af7" />
                <Text style={styles.loginBtnText}>Login</Text>
              </Pressable>
            )}
          </View>

          {/* Greeting row */}
          {user ? (
            <>
              <View style={styles.greetingRow}>
                {user.avatar_url ? (
                  <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarLetter}>
                      {firstName[0]?.toUpperCase() ?? 'U'}
                    </Text>
                  </View>
                )}
                <View style={styles.greetingInfo}>
                  <Text style={styles.greetingText}>{greeting},</Text>
                  <Text style={styles.greetingName}>{firstName} 👋</Text>
                </View>
              </View>
              {user.address ? (
                <Text style={styles.addressText}>📍 {user.address}</Text>
              ) : null}
            </>
          ) : (
            <View style={styles.greetingRow}>
              <View style={styles.greetingInfo}>
                <Text style={styles.greetingText}>{greeting},</Text>
                <Text style={styles.greetingName}>Welcome to Pure 👋</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Global search bar ────────────────────────────────── */}
        <View style={styles.globalSearchWrap}>
          <View style={styles.globalSearchRow}>
            <Ionicons name="search-outline" size={16} color="#aaa" />
            <TextInput
              style={styles.globalSearchInput}
              placeholder="Search salons, services, stylists…"
              placeholderTextColor="#bbb"
              value={globalQuery}
              onChangeText={onQueryChange}
              onSubmitEditing={handleGlobalSearch}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {(globalMode || globalQuery.length > 0) && (
              <Pressable onPress={clearGlobalSearch} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#ccc" />
              </Pressable>
            )}
            <Pressable
              style={[styles.globalSearchBtn, !globalQuery.trim() && styles.globalSearchBtnDisabled]}
              onPress={handleGlobalSearch}
              disabled={!globalQuery.trim() || globalSearching}
            >
              {globalSearching
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.globalSearchBtnText}>Search</Text>}
            </Pressable>
          </View>

          {/* ── Autocomplete dropdown ──────────────────────────── */}
          {showSuggestions && (
            <View style={styles.suggestBox}>
              {suggestions.map((s, i) => (
                <Pressable
                  key={i}
                  style={[styles.suggestItem, i < suggestions.length - 1 && styles.suggestItemBorder]}
                  onPress={() => pickSuggestion(s)}
                >
                  <Ionicons name="search-outline" size={13} color="#aaa" style={{ marginRight: 6 }} />
                  <Text style={styles.suggestText} numberOfLines={1}>{s}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* ── Global search results (shown when user searched) ── */}
        {globalMode && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>
                {globalSearching ? 'Searching…' : `${globalTotal} result${globalTotal !== 1 ? 's' : ''}`}
              </Text>
              <Text style={styles.sectionSub}>for "{globalQuery}"</Text>
            </View>

            {globalSearching && (
              <View style={styles.providerEmpty}>
                <ActivityIndicator size="large" color="#7c6af7" />
              </View>
            )}

            {!globalSearching && globalResults.length === 0 && (
              <View style={styles.providerEmpty}>
                <Ionicons name="search-outline" size={32} color="#ddd" />
                <Text style={styles.providerEmptyTitle}>No results found</Text>
                <Text style={styles.providerEmptyText}>Try a different keyword</Text>
              </View>
            )}

            {!globalSearching && globalResults.map(hit => {
              const s = hit._source
              const providerName = (hit.highlight?.provider_name?.[0] ?? s.provider_name ?? 'Unknown Salon')
                .replace(/<[^>]+>/g, '')
              const serviceTitle = (hit.highlight?.service_title?.[0] ?? s.service_title ?? '')
                .replace(/<[^>]+>/g, '')
              const location = [s.area_name, s.city_name].filter(Boolean).join(', ')
              return (
                <Pressable
                  key={hit._id}
                  style={styles.searchHitCard}
                  onPress={() => s.provider_id
                    ? router.push({ pathname: '/provider/[id]', params: { id: s.provider_id, sid: s.service_id } } as any)
                    : undefined}
                >
                  <View style={styles.searchHitTop}>
                    <View style={styles.searchHitLeft}>
                      <Text style={styles.searchHitTitle} numberOfLines={1}>{providerName}</Text>
                      {serviceTitle ? (
                        <View style={styles.searchHitBadge}>
                          <Text style={styles.searchHitBadgeText}>{serviceTitle}</Text>
                        </View>
                      ) : null}
                      {location ? (
                        <View style={styles.searchHitLocationRow}>
                          <Ionicons name="location-outline" size={11} color="#aaa" />
                          <Text style={styles.searchHitLocation}>{location}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.searchHitRight}>
                      {s.price_paise != null && (
                        s.discount_pct && s.discount_pct > 0 && s.discounted_price_paise ? (
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.searchHitPriceStrike}>₹{Math.round(s.price_paise / 100)}</Text>
                            <Text style={styles.searchHitPriceDiscount}>₹{Math.round(s.discounted_price_paise / 100)}</Text>
                          </View>
                        ) : (
                          <Text style={styles.searchHitPrice}>₹{Math.round(s.price_paise / 100)}</Text>
                        )
                      )}
                      {s.duration_mins != null && (
                        <Text style={styles.searchHitDuration}>{s.duration_mins} min</Text>
                      )}
                      <Ionicons name="chevron-forward" size={14} color="#ccc" />
                    </View>
                  </View>
                  <View style={styles.searchHitPayBadge}>
                    <Text style={styles.searchHitPayBadgeIcon}>💳</Text>
                    <Text style={styles.searchHitPayBadgeText}>
                      {s.discount_pct && s.discount_pct > 0
                        ? `${s.discount_pct}% OFF on this service`
                        : 'Pay at the venue · No advance payment needed'}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </>
        )}

        {/* ── Location browse (hidden while in global search mode) ─ */}
        {!globalMode && (
          <>
        {/* ── Section label ──────────────────────────────────── */}
        <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Browse by Location</Text>
            <Text style={styles.sectionSub}>Select city &amp; service to find salons</Text>
        </View>

        <View style={styles.dropdownBar}>
          <Ionicons name="location-sharp" size={15} color="#7c6af7" />
          <Text style={styles.dropdownLabel}>City</Text>
          <TextInput
            style={[styles.dropdownValue, !city && !citySearch && styles.dropdownPlaceholder]}
            placeholder="Search or select city…"
            placeholderTextColor="#bbb"
            value={showCities ? citySearch : (city?.name ?? '')}
            onFocus={() => { setCitySearch(''); setShowCities(true); setShowAreas(false); setShowServices(false) }}
            onChangeText={t => { setCitySearch(t); setShowCities(true) }}
          />
          {city && !showCities ? (
            <Pressable onPress={() => { setCity(null); setArea(null); setCitySearch(''); setSearched(false) }}>
              <Ionicons name="close-circle" size={14} color="#bbb" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              if (showCities) {
                setShowCities(false)
              } else {
                setCitySearch('')
                setShowCities(true)
                setShowAreas(false)
                setShowServices(false)
              }
            }}
            hitSlop={8}
          >
            <Ionicons name={showCities ? 'chevron-up' : 'chevron-down'} size={14} color="#999" />
          </Pressable>
        </View>

        {showCities && (
          <View style={styles.dropdown}>
            {citiesLoading ? (
              <View style={styles.dropdownEmpty}>
                <Text style={styles.dropdownEmptyText}>Loading cities…</Text>
              </View>
            ) : cities.length === 0 ? (
              <View style={styles.dropdownEmpty}>
                <Text style={styles.dropdownEmptyText}>No cities available</Text>
              </View>
            ) : (() => {
              const filtered = citySearch.trim()
                ? cities.filter(c =>
                    c.name.toLowerCase().includes(citySearch.toLowerCase()) ||
                    c.state.toLowerCase().includes(citySearch.toLowerCase())
                  )
                : cities
              return filtered.length === 0 ? (
                <View style={styles.dropdownEmpty}>
                  <Text style={styles.dropdownEmptyText}>No cities match "{citySearch}"</Text>
                </View>
              ) : (
                <ScrollView style={styles.dropdownScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {filtered.map(c => (
                    <Pressable
                      key={c.id}
                      style={[styles.dropdownItem, c.id === city?.id && styles.dropdownItemActive]}
                      onPress={() => { setCity(c); setShowCities(false); setCitySearch(''); setSearched(false) }}
                    >
                      <View>
                        <Text style={[styles.dropdownItemText, c.id === city?.id && styles.dropdownItemTextActive]}>
                          {c.name}
                        </Text>
                        <Text style={styles.dropdownItemSub}>{c.state}</Text>
                      </View>
                      {c.id === city?.id && <Ionicons name="checkmark-circle" size={16} color="#7c6af7" />}
                    </Pressable>
                  ))}
                </ScrollView>
              )
            })()}
          </View>
        )}

        {/* ── Area dropdown ──────────────────────────── */}
        <View style={[styles.dropdownBar, !city && styles.dropdownBarDisabled]}>
          <Ionicons name="map-outline" size={15} color={city ? '#7c6af7' : '#ccc'} />
          <Text style={[styles.dropdownLabel, !city && styles.dropdownLabelDisabled]}>Area</Text>
          <TextInput
            style={[styles.dropdownValue, (!area && !areaSearch) && styles.dropdownPlaceholder]}
            placeholder={!city ? 'Select city first' : 'Search or select area…'}
            placeholderTextColor="#bbb"
            editable={!!city}
            value={showAreas ? areaSearch : (area?.name ?? '')}
            onFocus={() => { if (!city) return; setAreaSearch(''); setShowAreas(true); setShowCities(false); setShowServices(false) }}
            onChangeText={t => { if (!city) return; setAreaSearch(t); setShowAreas(true) }}
          />
          {area && !showAreas ? (
            <Pressable onPress={() => { setArea(null); setAreaSearch(''); setSearched(false) }}>
              <Ionicons name="close-circle" size={14} color="#bbb" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              if (showAreas) {
                setShowAreas(false)
              } else {
                if (!city) return
                setAreaSearch('')
                setShowAreas(true)
                setShowCities(false)
                setShowServices(false)
              }
            }}
            hitSlop={8}
          >
            <Ionicons name={showAreas ? 'chevron-up' : 'chevron-down'} size={14} color="#999" />
          </Pressable>
        </View>

        {showAreas && (
          <View style={styles.dropdown}>
            {areasLoading ? (
              <View style={styles.dropdownEmpty}>
                <Text style={styles.dropdownEmptyText}>Loading areas…</Text>
              </View>
            ) : areas.length === 0 ? (
              <View style={styles.dropdownEmpty}>
                <Text style={styles.dropdownEmptyText}>No areas available</Text>
              </View>
            ) : (() => {
              const filtered = areaSearch.trim()
                ? areas.filter(a =>
                    a.name.toLowerCase().includes(areaSearch.toLowerCase()) ||
                    (a.pincode ?? '').includes(areaSearch)
                  )
                : areas
              return filtered.length === 0 ? (
                <View style={styles.dropdownEmpty}>
                  <Text style={styles.dropdownEmptyText}>No areas match "{areaSearch}"</Text>
                </View>
              ) : (
                <ScrollView style={styles.dropdownScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {filtered.map(a => (
                    <Pressable
                      key={a.id}
                      style={[styles.dropdownItem, a.id === area?.id && styles.dropdownItemActive]}
                      onPress={() => { setArea(a); setShowAreas(false); setAreaSearch(''); setSearched(false) }}
                    >
                      <View>
                        <Text style={[styles.dropdownItemText, a.id === area?.id && styles.dropdownItemTextActive]}>
                          {a.name}
                        </Text>
                        {a.pincode && <Text style={styles.dropdownItemSub}>{a.pincode}</Text>}
                      </View>
                      {a.id === area?.id && <Ionicons name="checkmark-circle" size={16} color="#7c6af7" />}
                    </Pressable>
                  ))}
                </ScrollView>
              )
            })()}
          </View>
        )}

        {/* ── Service dropdown + grid (hidden after search) ─── */}
        {!searched && (
          <>
            {/* ── Service dropdown ─────────────────────────────────── */}
            <Pressable
              style={styles.dropdownBar}
              onPress={() => { setShowServices(!showServices); setShowCities(false); setShowAreas(false) }}
            >
              <MaterialCommunityIcons name="scissors-cutting" size={15} color="#7c6af7" />
              <Text style={styles.dropdownLabel}>Service</Text>
              <Text style={[styles.dropdownValue, services.length === 0 && styles.dropdownPlaceholder]}>
                {services.length === 0
                  ? 'Select service(s)…'
                  : services.length === 1
                    ? services[0].label
                    : `${services[0].label} +${services.length - 1} more`}
              </Text>
              {services.length > 0 && !showServices && (
                <Pressable onPress={() => { setServices([]); setSearched(false) }}>
                  <Ionicons name="close-circle" size={14} color="#bbb" />
                </Pressable>
              )}
              <Ionicons name={showServices ? 'chevron-up' : 'chevron-down'} size={14} color="#999" />
            </Pressable>

            {showServices && (
              <View style={styles.dropdown}>
                <ScrollView style={styles.dropdownScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {SERVICES.map(s => {
                    const selected = services.some(x => x.id === s.id)
                    return (
                      <Pressable
                        key={s.id}
                        style={[styles.dropdownItem, selected && styles.dropdownItemActive]}
                        onPress={() => toggleService(s)}
                      >
                        <View style={styles.dropdownItemRow}>
                          <MaterialCommunityIcons name={s.icon} size={18} color={selected ? '#7c6af7' : '#888'} />
                          <View>
                            <Text style={[styles.dropdownItemText, selected && styles.dropdownItemTextActive]}>
                              {s.label}
                            </Text>
                            <Text style={styles.dropdownItemSub}>{s.sub}</Text>
                          </View>
                        </View>
                        <Ionicons
                          name={selected ? 'checkbox' : 'square-outline'}
                          size={18}
                          color={selected ? '#7c6af7' : '#ddd'}
                        />
                      </Pressable>
                    )
                  })}
                </ScrollView>
                {services.length > 0 && (
                  <Pressable style={styles.dropdownDoneBtn} onPress={() => setShowServices(false)}>
                    <Text style={styles.dropdownDoneBtnText}>Done · {services.length} selected</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* ── Search button ────────────────────────────────────── */}
            <Pressable
              style={[styles.searchBtn, !canSearch && styles.searchBtnDisabled]}
              onPress={handleSearch}
              disabled={!canSearch}
            >
              <Ionicons name="search" size={17} color="#fff" />
              <Text style={styles.searchBtnText}>
                {canSearch
                  ? `Search in ${city!.name}`
                  : 'Select city & service to search'}
              </Text>
            </Pressable>

            {/* ── Service grid ─────────────────────────────────────── */}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Popular Services</Text>
              <Text style={styles.sectionSub}>Tap a card or use the dropdown above</Text>
            </View>
            <View style={styles.grid}>
              {SERVICES.map(svc => {
                const selected = services.some(s => s.id === svc.id)
                return (
                  <Pressable
                    key={svc.id}
                    style={[styles.catCard, { width: catW }, selected && styles.catCardSelected]}
                    onPress={() => { toggleService(svc); closeAll() }}
                  >
                    <View style={[styles.catIconBox, { backgroundColor: selected ? svc.iconColor : svc.bg }]}>
                      <MaterialCommunityIcons
                        name={svc.icon}
                        size={30}
                        color={selected ? '#fff' : svc.iconColor}
                      />
                    </View>
                    <Text style={[styles.catLabel, { color: svc.iconColor }]}>{svc.label}</Text>
                    <Text style={styles.catSub} numberOfLines={1}>{svc.sub}</Text>
                  </Pressable>
                )
              })}
            </View>
          </>
        )}

        {searched && (
          <Pressable style={styles.modifyBtn} onPress={() => setSearched(false)}>
            <Ionicons name="options-outline" size={14} color="#7c6af7" />
            <Text style={styles.modifyBtnText}>Modify Search</Text>
          </Pressable>
        )}

        {/* ── Provider results ─────────────────────────────────── */}
        {searched && (
          <View>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>
                {services.length === 1 ? services[0].label : `${services.length} Services`} Providers
              </Text>
              <Text style={styles.sectionSub}>
                {city?.name}{area ? ` · ${area.name}` : ''}
              </Text>
            </View>

            {loadingProviders && (
              <View style={styles.providerEmpty}>
                <Text style={styles.providerEmptyText}>Searching…</Text>
              </View>
            )}

            {!loadingProviders && providers.length === 0 && (
              <View style={styles.providerEmpty}>
                <Ionicons name="storefront-outline" size={32} color="#ddd" />
                <Text style={styles.providerEmptyTitle}>No providers found</Text>
                <Text style={styles.providerEmptyText}>
                  No providers found in {city?.name} yet.
                </Text>
              </View>
            )}

            {!loadingProviders && providers.map(p => (
              <View key={p.service_id} style={styles.providerCard}>
                <View style={styles.providerLeft}>
                  <View style={styles.providerInitial}>
                    <Text style={styles.providerInitialText}>{p.name[0]}</Text>
                  </View>
                  <View style={styles.providerInfo}>
                    <Text style={styles.providerName}>{p.name}</Text>
                    {p.area_name && (
                      <View style={styles.providerAreaRow}>
                        <Ionicons name="location-outline" size={11} color="#aaa" />
                        <Text style={styles.providerArea}>{p.area_name}</Text>
                      </View>
                    )}
                    <Text style={styles.providerService}>{p.service_title}</Text>
                    {/* ── Like button ── */}
                    <Pressable
                      style={styles.likeRow}
                      onPress={() => handleLike(p.id)}
                    >
                      <Ionicons
                        name={likedIds.has(p.id) ? 'heart' : 'heart-outline'}
                        size={18}
                        color={likedIds.has(p.id) ? '#e91e63' : '#ccc'}
                      />
                      <Text style={[styles.likeCount, likedIds.has(p.id) && styles.likeCountActive]}>
                        {p.likes_count}
                      </Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.providerRight}>
                  <View style={styles.pricePill}>
                    {p.discount_pct > 0 && p.discounted_price_paise != null ? (
                      <>
                        <Text style={styles.providerPriceStrike}>₹{Math.round(p.price_paise / 100)}</Text>
                        <Text style={styles.providerPriceDiscount}>₹{Math.round(p.discounted_price_paise / 100)}</Text>
                      </>
                    ) : (
                      <Text style={styles.providerPrice}>₹{Math.round(p.price_paise / 100)}</Text>
                    )}
                    <Text style={styles.priceSep}>·</Text>
                    <Text style={styles.providerDuration}>{p.duration_mins} min</Text>
                  </View>
                  {p.discount_pct > 0 && (
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountBadgeText}>{p.discount_pct}% OFF</Text>
                    </View>
                  )}
                  <Pressable style={styles.bookBtn} onPress={() => router.push({ pathname: '/provider/[id]', params: { id: p.id, sid: p.service_id } } as any)}>
                    <Text style={styles.bookBtnText}>View</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

          </>
        )}

        {/* ── My Bookings widget ───────────────────────────────── */}
        {user && !searched && !globalMode && (
          <View style={styles.bwWidget}>
            <View style={styles.bwHeader}>
              <View style={styles.bwTitleRow}>
                <Ionicons name="calendar" size={16} color="#7c6af7" />
                <Text style={styles.bwTitle}>My Bookings</Text>
              </View>
              <Pressable onPress={() => router.push('/(tabs)/bookings')} style={styles.bwViewAll}>
                <Text style={styles.bwViewAllText}>View All</Text>
                <Ionicons name="chevron-forward" size={13} color="#7c6af7" />
              </Pressable>
            </View>

            {/* Real-time notification strip */}
            {bookingBanner && (
              <View style={[styles.bwBanner, bookingBanner.ok ? styles.bwBannerOk : styles.bwBannerCancel]}>
                <Ionicons name={bookingBanner.ok ? 'checkmark-circle' : 'close-circle'} size={15} color="#fff" />
                <Text style={styles.bwBannerText} numberOfLines={2}>{bookingBanner.text}</Text>
              </View>
            )}

            {bookingsLoading ? (
              <View style={styles.bwEmpty}>
                <Text style={styles.bwEmptyText}>Loading…</Text>
              </View>
            ) : recentBookings.length === 0 ? (
              <View style={styles.bwEmpty}>
                <Ionicons name="calendar-outline" size={28} color="#ddd" />
                <Text style={styles.bwEmptyText}>No bookings yet</Text>
                <Pressable onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} style={styles.bwBookNowBtn}>
                  <Text style={styles.bwBookNowText}>Book a service</Text>
                </Pressable>
              </View>
            ) : (
              recentBookings.map(b => {
                const meta = BOOKING_STATUS_META[b.status] ?? BOOKING_STATUS_META._default
                const d    = new Date(b.scheduled_at)
                const dateStr = `${DAYS_S[d.getDay()]}, ${d.getDate()} ${MONTHS_S[d.getMonth()]} · ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                const needsPay = b.status === 'confirmed' && b.payment_mode === 'prepaid' && b.payment_status === 'unpaid'
                const isPaid   = b.payment_mode === 'prepaid' && b.payment_status === 'paid'
                const isVenue  = b.payment_mode === 'pay_at_venue'
                return (
                  <View key={b.id} style={styles.bwCard}>
                    <View style={styles.bwCardTopRow}>
                      <View style={styles.bwCardLeft}>
                        <Text style={styles.bwCardProvider} numberOfLines={1}>{b.provider_name}</Text>
                        <Text style={styles.bwCardService} numberOfLines={1}>{b.service_title}</Text>
                        <Text style={styles.bwCardDate}>{dateStr}</Text>
                      </View>
                      <View style={styles.bwCardRight}>
                        <View style={[styles.bwBadge, { backgroundColor: meta.bg }]}>
                          <Ionicons name={meta.icon as any} size={11} color={meta.color} />
                          <Text style={[styles.bwBadgeText, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                        <Text style={styles.bwCardPrice}>₹{Math.round(b.price_paise / 100)}</Text>
                      </View>
                    </View>
                    {/* Confirmed + unpaid: show two clear options */}
                    {needsPay && (
                      <View style={styles.bwPayChoiceRow}>
                        <Pressable style={styles.bwPayOnlineBtn} onPress={() => router.push('/(tabs)/bookings')}>
                          <Ionicons name="phone-portrait-outline" size={13} color="#fff" />
                          <Text style={styles.bwPayOnlineText}>Pay Online</Text>
                        </Pressable>
                        <Pressable style={styles.bwPayVenueBtn} onPress={() => router.push('/(tabs)/bookings')}>
                          <Ionicons name="storefront-outline" size={13} color="#E8590C" />
                          <Text style={styles.bwPayVenueText}>Pay at Venue</Text>
                        </Pressable>
                      </View>
                    )}
                    {isPaid && (
                      <View style={[styles.bwPayStrip, { backgroundColor: '#ecfdf5' }]}>
                        <Ionicons name="checkmark-done" size={13} color="#065f46" />
                        <Text style={[styles.bwPayStripText, { color: '#065f46' }]}>Paid — see you at the salon</Text>
                      </View>
                    )}
                    {b.status === 'confirmed' && isVenue && (
                      <View style={[styles.bwPayStrip, { backgroundColor: '#ecfdf5' }]}>
                        <Ionicons name="wallet-outline" size={13} color="#065f46" />
                        <Text style={[styles.bwPayStripText, { color: '#065f46' }]}>Pay at venue when you arrive</Text>
                      </View>
                    )}
                    {b.status === 'pending' && (
                      <View style={[styles.bwPayStrip, { backgroundColor: '#fef9ee' }]}>
                        <Ionicons name="hourglass-outline" size={13} color="#92400e" />
                        <Text style={[styles.bwPayStripText, { color: '#92400e' }]}>Awaiting salon confirmation</Text>
                      </View>
                    )}
                  </View>
                )
              })
            )}
          </View>
        )}

      </View>
        </View>
      <View style={{ height: 32 }} />
    </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f8f8f8' },
  scroll: { alignItems: 'center', padding: 16 },

  // ── Global search bar ───────────────────────────────────────────────────
  globalSearchWrap: {
    position:     'relative',
    marginBottom: 4,
    zIndex:       100,
  },
  globalSearchRow: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  '#fff',
    borderRadius:     14,
    borderWidth:      1,
    borderColor:      '#ebe8ff',
    paddingHorizontal: 12,
    paddingVertical:   8,
    gap:              8,
    marginBottom:     0,
  },

  suggestBox: {
    backgroundColor:  '#fff',
    borderWidth:      1,
    borderColor:      '#ebe8ff',
    borderTopWidth:   0,
    borderBottomLeftRadius:  12,
    borderBottomRightRadius: 12,
    overflow:         'hidden',
    marginBottom:     12,
  },
  suggestItem: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 14,
    paddingVertical:   11,
  },
  suggestItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f3f0ff',
  },
  suggestText: {
    fontSize: 14,
    color:    '#333',
    flex:     1,
  },
  globalSearchInput: {
    flex:       1,
    fontSize:   14,
    color:      '#111',
    paddingVertical: 0,
  },
  globalSearchBtn: {
    backgroundColor: '#7c6af7',
    borderRadius:    10,
    paddingHorizontal: 14,
    paddingVertical:   7,
  },
  globalSearchBtnDisabled: {
    backgroundColor: '#c4b5fd',
  },
  globalSearchBtnText: {
    color:      '#fff',
    fontWeight: '700',
    fontSize:   13,
  },

  // ── Global search result cards ─────────────────────────────────────────
  searchHitCard: {
    backgroundColor:  '#fff',
    borderRadius:     14,
    padding:          14,
    marginBottom:     10,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 1 },
    shadowOpacity:    0.05,
    shadowRadius:     4,
    elevation:        2,
  },
  searchHitTop: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    marginBottom:   10,
  },
  searchHitLeft: { flex: 1, gap: 4 },
  searchHitTitle: {
    fontSize:   14,
    fontWeight: '700',
    color:      '#111827',
  },
  searchHitBadge: {
    alignSelf:        'flex-start',
    backgroundColor:  '#ede8ff',
    borderRadius:     20,
    paddingHorizontal: 8,
    paddingVertical:  3,
  },
  searchHitBadgeText: {
    fontSize:   11,
    color:      '#7c6af7',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  searchHitDesc: {
    fontSize:   12,
    color:      '#6b7280',
    lineHeight: 17,
  },
  searchHitLocationRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           3,
    marginTop:     2,
  },
  searchHitLocation: {
    fontSize: 11,
    color:    '#9ca3af',
  },
  searchHitRight: {
    alignItems:  'flex-end',
    gap:         4,
    marginLeft:  8,
  },
  searchHitPrice: {
    fontSize:   14,
    fontWeight: '700',
    color:      '#7c6af7',
  },
  searchHitPriceStrike: {
    fontSize:   11,
    fontWeight: '500',
    color:      '#aaa',
    textDecorationLine: 'line-through' as const,
  },
  searchHitPriceDiscount: {
    fontSize:   14,
    fontWeight: '700',
    color:      '#16a34a',
  },
  searchHitDuration: {
    fontSize: 11,
    color:    '#9ca3af',
  },
  searchHitPayNote: {
    fontSize:   9,
    color:      '#16a34a',
    fontWeight: '600',
    textAlign:  'right',
  },
  searchHitPayBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   '#f0fdf4',
    borderRadius:      8,
    paddingHorizontal: 10,
    paddingVertical:   7,
    gap:               6,
  },
  searchHitPayBadgeIcon: {
    fontSize: 13,
  },
  searchHitPayBadgeText: {
    fontSize:   11,
    color:      '#166534',
    fontWeight: '600',
    flex:       1,
  },

  card: {
    width:           '100%',
    backgroundColor: '#f8f8f8',
    borderRadius:    20,
    padding:         20,
    alignSelf:       'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.08,
    shadowRadius:    16,
    elevation:       6,
  },

  // ── Hero header (matches provider dashboard) ───────────────────────
  heroCard: {
    backgroundColor: '#fff',
    borderRadius:    20,
    padding:         20,
    marginBottom:    16,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    12,
    elevation:       3,
    borderWidth:     1,
    borderColor:     '#F3F4F6',
  },
  heroTop: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   20,
  },
  heroRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bellWrap: { position: 'relative', padding: 4 },
  bellBadge: {
    position:        'absolute',
    top:             0,
    right:           0,
    minWidth:        17,
    height:          17,
    borderRadius:    9,
    backgroundColor: '#EF4444',
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 4,
    borderWidth:     1.5,
    borderColor:     '#fff',
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  logoImg: { width: 80, height: 30 },
  avatarCircleSm: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#E8590C', alignItems: 'center', justifyContent: 'center',
  },
  avatarLetterSm: { color: '#fff', fontWeight: '900', fontSize: 14 },
  avatarImgSm: { width: 34, height: 34, borderRadius: 17 },

  greetingRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
    marginBottom:  8,
  },
  avatarCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#E8590C', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#E8590C', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 3,
  },
  avatarLetter: { color: '#fff', fontWeight: '900', fontSize: 20 },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  greetingInfo: {},
  greetingText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  greetingName: { fontSize: 22, fontWeight: '900', color: '#1B1B1B', marginTop: 2 },
  addressText:  { fontSize: 12, color: '#6B7280', marginTop: 6 },

  loginBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    borderWidth:       1.5,
    borderColor:       '#7c6af7',
    borderRadius:      20,
    paddingHorizontal: 14,
    paddingVertical:    7,
  },
  loginBtnText: { color: '#7c6af7', fontWeight: '700', fontSize: 13 },

  // (SSE booking banner styles now in bwBanner* below)

  // ── Section header ─────────────────────────────────────────────────
  sectionRow:   { marginBottom: 16 },
  sectionTitle: { color: '#0f0f23', fontSize: 18, fontWeight: '800' },
  sectionSub:   { color: '#999',    fontSize: 12, marginTop: 2 },

  // ── Dropdowns ─────────────────────────────────────────────────────
  dropdownBar: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    backgroundColor:   '#fff',
    borderRadius:      12,
    paddingHorizontal: 14,
    paddingVertical:   13,
    marginBottom:      10,
  },
  dropdownBarDisabled: { backgroundColor: '#fafafa' },
  dropdownLabel:         { color: '#aaa', fontSize: 12, fontWeight: '700', width: 46 },
  dropdownLabelDisabled: { color: '#ddd' },
  dropdownValue:         { color: '#0f0f23', fontSize: 14, fontWeight: '700', flex: 1 } as any,
  dropdownPlaceholder:   { color: '#bbb', fontWeight: '400' },

  dropdown: {
    backgroundColor: '#fff',
    borderRadius:    12,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     '#e0e0f0',
    overflow:        'hidden',
  },
  dropdownSearch: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingHorizontal: 12,
    paddingVertical:   10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f8',
    backgroundColor:   '#fafafa',
  },
  dropdownSearchInput: {
    flex:     1,
    color:    '#0f0f23',
    fontSize: 13,
  },
  dropdownScroll: {
    maxHeight: 220,
  },
  dropdownDoneBtn: {
    alignItems:        'center',
    paddingVertical:   12,
    borderTopWidth:    1,
    borderTopColor:    '#f0f0f8',
    backgroundColor:   '#f4f0ff',
  },
  dropdownDoneBtnText: {
    color:      '#7c6af7',
    fontWeight: '800',
    fontSize:   13,
  },
  dropdownEmpty: { paddingVertical: 16, alignItems: 'center' },
  dropdownEmptyText: { color: '#bbb', fontSize: 13 },

  dropdownItem: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 14,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f8',
  },
  dropdownItemActive:     { backgroundColor: '#f4f0ff' },
  dropdownItemText:       { color: '#444', fontSize: 14 },
  dropdownItemTextActive: { color: '#7c6af7', fontWeight: '700' },
  dropdownItemSub:        { color: '#bbb', fontSize: 11, marginTop: 2 },
  dropdownItemRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },

  // ── Service grid ──────────────────────────────────────────────
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    justifyContent: 'space-between',
    rowGap:        10,
    marginBottom:  20,
  },
  catCard: {
    alignItems:        'center',
    backgroundColor:   '#fafafa',
    borderRadius:      14,
    paddingVertical:   14,
    paddingHorizontal: 4,
    borderWidth:       1,
    borderColor:       '#f0f0f5',
  },
  catCardSelected: {
    borderColor:     '#7c6af7',
    backgroundColor: '#f4f0ff',
  },
  catIconBox: {
    width:          58,
    height:         58,
    borderRadius:   16,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   8,
  },
  catLabel: { fontSize: 12, fontWeight: '800', textAlign: 'center', marginBottom: 2 },
  catSub:   { color: '#aaa', fontSize: 10, textAlign: 'center' },

  // ── Search button ─────────────────────────────────────────────────
  searchBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               8,
    backgroundColor:   '#7c6af7',
    borderRadius:      14,
    paddingVertical:   15,
    marginBottom:      20,
    marginTop:         4,
  },
  searchBtnDisabled: { backgroundColor: '#c8c8d8' },
  searchBtnText:     { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },

  modifyBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               6,
    borderWidth:       1,
    borderColor:       '#c0b8f0',
    borderRadius:      10,
    paddingVertical:   9,
    marginBottom:      14,
    backgroundColor:   '#f4f0ff',
  },
  modifyBtnText: { color: '#7c6af7', fontWeight: '700', fontSize: 13 },

  // ── Provider cards ────────────────────────────────────────────────
  providerCard: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: '#fff',
    borderRadius:    14,
    padding:         14,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     '#ebebf5',
    shadowColor:     '#7c6af7',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    8,
    elevation:       2,
  },
  providerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  providerInitial: {
    width:           42,
    height:          42,
    borderRadius:    21,
    backgroundColor: '#fdf0f4',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  providerInitialText: { color: '#c06080', fontWeight: '900', fontSize: 17 },
  providerInfo:        { flex: 1 },
  providerName:        { color: '#0f0f23', fontWeight: '800', fontSize: 14, marginBottom: 2 },
  providerAreaRow:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  providerArea:        { color: '#aaa', fontSize: 11 },
  providerService:     { color: '#757575', fontSize: 12, fontWeight: '600' },
  likeRow:             { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  likeCount:           { color: '#aaa', fontSize: 13, fontWeight: '600' },
  likeCountActive:     { color: '#7c6af7', fontWeight: '700' },
  providerRight:       { alignItems: 'flex-end', gap: 6, marginLeft: 8 },
  pricePill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    backgroundColor:   '#f4f0ff',
    borderRadius:      8,
    paddingHorizontal: 8,
    paddingVertical:   4,
  },
  providerPrice:    { color: '#1a1a1a', fontWeight: '800', fontSize: 13 },
  providerPriceStrike: { color: '#aaa', fontWeight: '600', fontSize: 11, textDecorationLine: 'line-through' as const },
  providerPriceDiscount: { color: '#16a34a', fontWeight: '800', fontSize: 13 },
  priceSep:         { color: '#888', fontSize: 11 },
  providerDuration: { color: '#888', fontSize: 11 },
  discountBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius:    6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountBadgeText: { color: '#16a34a', fontWeight: '700', fontSize: 10 },
  bookBtn: {
    backgroundColor:   '#f4f0ff',
    borderRadius:      10,
    borderWidth:       1,
    borderColor:       '#c0b8f0',
    paddingHorizontal: 14,
    paddingVertical:    6,
  },
  bookBtnText: { color: '#7c6af7', fontWeight: '800', fontSize: 12 },
  providerEmpty:     { alignItems: 'center', paddingVertical: 32, gap: 8 },
  providerEmptyTitle: { color: '#555', fontSize: 15, fontWeight: '700' },
  providerEmptyText: { color: '#bbb', fontSize: 13, textAlign: 'center' },

  // ── My Bookings widget ────────────────────────────────────────────
  bwWidget: {
    backgroundColor: '#fff',
    borderRadius:    16,
    padding:         16,
    marginTop:        4,
    borderWidth:     1,
    borderColor:     '#ebebf5',
    shadowColor:     '#7c6af7',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    8,
    elevation:       2,
    gap:             10,
  },
  bwHeader: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  bwTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bwTitle:    { fontSize: 15, fontWeight: '800', color: '#0f0f23' },
  bwViewAll: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           2,
  },
  bwViewAllText: { fontSize: 12, fontWeight: '700', color: '#7c6af7' },

  bwBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    borderRadius:      10,
    paddingVertical:   8,
    paddingHorizontal: 12,
  },
  bwBannerOk:     { backgroundColor: '#059669' },
  bwBannerCancel: { backgroundColor: '#dc2626' },
  bwBannerText:   { color: '#fff', fontSize: 12, fontWeight: '600', flex: 1 },

  bwEmpty: { alignItems: 'center', paddingVertical: 16, gap: 6 },
  bwEmptyText: { color: '#bbb', fontSize: 13 },
  bwBookNowBtn: {
    backgroundColor:   '#7c6af7',
    borderRadius:      10,
    paddingHorizontal: 18,
    paddingVertical:    8,
    marginTop:          4,
  },
  bwBookNowText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  bwCard: {
    paddingVertical: 10,
    borderTopWidth:  1,
    borderTopColor:  '#f2f2f8',
  },
  bwCardTopRow: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    justifyContent:  'space-between',
    gap:             10,
  },
  bwCardLeft:    { flex: 1 },
  bwCardRight:   { alignItems: 'flex-end', gap: 4 },
  bwCardProvider: { fontSize: 13, fontWeight: '700', color: '#111827' },
  bwCardService:  { fontSize: 12, color: '#6b7280', marginTop: 1 },
  bwCardDate:     { fontSize: 11, color: '#9ca3af', marginTop: 3 },
  bwCardPrice:    { fontSize: 13, fontWeight: '700', color: '#7c6af7' },

  bwPayChoiceRow: {
    flexDirection:  'row',
    gap:            8,
    marginTop:      8,
  },
  bwPayOnlineBtn: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               5,
    backgroundColor:   '#E8590C',
    borderRadius:      8,
    paddingVertical:   7,
  },
  bwPayOnlineText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  bwPayVenueBtn: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               5,
    backgroundColor:   '#fff',
    borderRadius:      8,
    paddingVertical:   7,
    borderWidth:       1.5,
    borderColor:       '#E8590C',
  },
  bwPayVenueText: { color: '#E8590C', fontSize: 11, fontWeight: '700' },

  bwPayStrip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    marginTop:         8,
    paddingVertical:   6,
    paddingHorizontal: 10,
    borderRadius:      8,
    backgroundColor:   '#fff7ed',
  },
  bwPayStripText: { fontSize: 11, color: '#E8590C', flex: 1, fontWeight: '600' },

  bwBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               3,
    paddingHorizontal: 7,
    paddingVertical:   3,
    borderRadius:      20,
  },
  bwBadgeText: { fontSize: 10, fontWeight: '700' },
})
