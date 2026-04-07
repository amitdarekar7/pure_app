import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useState, useEffect } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useAuth } from '../../lib/auth-context'
import { LocationAPI, ProvidersAPI, City, Area, Provider } from '../../lib/api'

const LOGO = require('../../assets/images/logo_pure.jpeg')

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
]

export default function HomeScreen() {
  const { user }   = useAuth()
  const router     = useRouter()

  // ── Location state ──────────────────────────────────────────────────────
  const [cities,      setCities]      = useState<City[]>([])
  const [city,        setCity]        = useState<City | null>(null)
  const [showCities,  setShowCities]  = useState(false)
  const [areas,       setAreas]       = useState<Area[]>([])
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
  }, [])

  useEffect(() => {
    if (!city) { setAreas([]); setArea(null); return }
    setArea(null)
    setAreas([])
    LocationAPI.areas(city.id)
      .then(({ areas: data }) => setAreas(data))
      .catch(() => setAreas([]))
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

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>

        {/* ── Header ───────────────────────────────────────────── */}
        <View style={styles.header}>
          <Image source={LOGO} style={styles.logoImage} resizeMode="contain" />

          {user ? (
            <Pressable
              onPress={() => router.push('/(tabs)/profile')}
              style={styles.avatarRow}
            >
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarLetter}>
                  {(user.display_name ?? user.email)[0].toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={styles.avatarName} numberOfLines={1}>
                  {user.display_name
                    ? user.display_name.split(' ')[0]
                    : user.email.split('@')[0]}
                </Text>
                <Text style={styles.avatarSub}>View Profile</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#ccc" />
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push('/(auth)/login')} style={styles.loginBtn}>
              <Ionicons name="person-outline" size={13} color="#7c6af7" />
              <Text style={styles.loginBtnText}>Login</Text>
            </Pressable>
          )}
        </View>

        {/* ── Section label ────────────────────────────────────── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Find a Service</Text>
          <Text style={styles.sectionSub}>Select city, area &amp; service, then Search</Text>
        </View>

        {/* ── City dropdown ────────────────────────────────────── */}
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
          <Ionicons name={showCities ? 'chevron-up' : 'chevron-down'} size={14} color="#999" />
        </View>

        {showCities && (
          <View style={styles.dropdown}>
            {cities.length === 0 ? (
              <View style={styles.dropdownEmpty}>
                <Text style={styles.dropdownEmptyText}>Loading cities…</Text>
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

        {/* ── Area dropdown ────────────────────────────────────── */}
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
          <Ionicons name={showAreas ? 'chevron-up' : 'chevron-down'} size={14} color="#999" />
        </View>

        {showAreas && (
          <View style={styles.dropdown}>
            {areas.length === 0 ? (
              <View style={styles.dropdownEmpty}>
                <Text style={styles.dropdownEmptyText}>Loading areas…</Text>
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
                    style={[styles.catCard, selected && styles.catCardSelected]}
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
                    <Text style={styles.providerPrice}>₹{Math.round(p.price_paise / 100)}</Text>
                    <Text style={styles.priceSep}>·</Text>
                    <Text style={styles.providerDuration}>{p.duration_mins} min</Text>
                  </View>
                  <Pressable style={styles.bookBtn} onPress={() => router.push({ pathname: '/provider/[id]', params: { id: p.id, sid: p.service_id } } as any)}>
                    <Text style={styles.bookBtnText}>View</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Logged-in strip ──────────────────────────────────── */}
        {user && !searched && (
          <View style={styles.welcomeStrip}>
            <View style={styles.welcomeLeft}>
              <Text style={styles.welcomeHi}>👋 Hey {user.display_name?.split(' ')[0] ?? 'there'}!</Text>
              <Text style={styles.welcomeSub}>Ready for your next appointment?</Text>
            </View>
            <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.welcomeCta}>
              <Text style={styles.welcomeCtaText}>Book Now</Text>
            </Pressable>
          </View>
        )}

      </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f8f8f8' },
  scroll: { alignItems: 'center', padding: 16 },

  card: {
    width:           '100%',
    maxWidth:        520,
    backgroundColor: '#f8f8f8',
    borderRadius:    20,
    padding:         20,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.08,
    shadowRadius:    16,
    elevation:       6,
  },

  // ── Header ────────────────────────────────────────────────────────
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   20,
  },
  logoImage: { width: 160, height: 56 },

  avatarRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    backgroundColor: '#f8f8fc',
    borderRadius:    22,
    paddingVertical:  6,
    paddingLeft:      6,
    paddingRight:    12,
    maxWidth:        160,
  },
  avatarCircle: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: '#0f0f23',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  avatarLetter: { color: '#7c6af7', fontWeight: '900', fontSize: 15 },
  avatarName:   { color: '#0f0f23', fontWeight: '800', fontSize: 13, maxWidth: 80 },
  avatarSub:    { color: '#aaa',    fontSize: 10, marginTop: 1 },

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

  // ── Service grid (3 cols) ─────────────────────────────────────────
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
    marginBottom:  20,
  },
  catCard: {
    width:             '30.5%',
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
  priceSep:         { color: '#888', fontSize: 11 },
  providerDuration: { color: '#888', fontSize: 11 },
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

  // ── Welcome strip ──────────────────────────────────────────────────
  welcomeStrip: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#0f0f23',
    borderRadius:    14,
    padding:         16,
    marginTop:       4,
  },
  welcomeLeft: { flex: 1 },
  welcomeHi:   { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 3 },
  welcomeSub:  { color: '#888', fontSize: 12 },
  welcomeCta: {
    backgroundColor:   '#7c6af7',
    borderRadius:      10,
    paddingHorizontal: 16,
    paddingVertical:    9,
  },
  welcomeCtaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
})
