import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useAuth } from '../../lib/auth-context'

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name']

const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad']

const CATEGORIES: { id: string; icon: MCIcon; label: string; sub: string; bg: string; iconColor: string }[] = [
  { id: 'haircut',       icon: 'content-cut',           label: 'Hair Cut',        sub: 'Salons & Stylists',     bg: '#fce4ec', iconColor: '#ad1457' },
  { id: 'facial',        icon: 'face-woman-shimmer',    label: 'Facial',          sub: 'Skin & Glow',           bg: '#ede7f6', iconColor: '#7b1fa2' },
  { id: 'manicure',      icon: 'hand-heart',            label: 'Manicure',        sub: 'Nail Art & Care',       bg: '#fff8e1', iconColor: '#e65100' },
  { id: 'pedicure',      icon: 'foot-print',            label: 'Pedicure',        sub: 'Foot Care',             bg: '#e8f5e9', iconColor: '#2e7d32' },
  { id: 'haircolor',     icon: 'palette',               label: 'Hair Color',      sub: 'Highlights & Balayage', bg: '#fbe9e7', iconColor: '#bf360c' },
  { id: 'threading',     icon: 'eye-outline',           label: 'Threading',       sub: 'Brows & More',          bg: '#e0f7fa', iconColor: '#00838f' },
  { id: 'hairstyling',   icon: 'hair-dryer',            label: 'Hair Styling',    sub: 'Blowdry & Updo',        bg: '#e8eaf6', iconColor: '#283593' },
  { id: 'waxing',        icon: 'leaf',                  label: 'Waxing',          sub: 'Smooth & Soft',         bg: '#f1f8e9', iconColor: '#33691e' },
  { id: 'bridalmakeup',  icon: 'crown-outline',         label: 'Bridal Makeup',   sub: 'Bridal Artists',        bg: '#fce4ec', iconColor: '#880e4f' },
  { id: 'partymakeup',   icon: 'star-shooting',         label: 'Party Makeup',    sub: 'Glam & Glitter',        bg: '#f3e5f5', iconColor: '#6a1b9a' },
  { id: 'straightening', icon: 'auto-fix',              label: 'Straightening',   sub: 'Keratin & Rebond',      bg: '#e8eaf6', iconColor: '#1a237e' },
  { id: 'nailext',       icon: 'diamond-stone',         label: 'Nail Extensions', sub: 'Gel & Acrylic',         bg: '#fce4ec', iconColor: '#c62828' },
]

export default function HomeScreen() {
  const { user }                        = useAuth()
  const router                          = useRouter()
  const [city,       setCity]           = useState('Mumbai')
  const [showCities, setShowCities]     = useState(false)
  const [searchText, setSearchText]     = useState('')

  function handleSearch() {
    router.push('/(tabs)/search')
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
          <View style={styles.logoRow}>
            <View style={styles.logoDiamond}>
              <Text style={styles.logoDiamondText}>◆</Text>
            </View>
            <View>
              <Text style={styles.logoWord}>PURE</Text>
              <Text style={styles.logoTagline}>BEAUTY & WELLNESS</Text>
            </View>
          </View>

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

        {/* ── Location selector ────────────────────────────────── */}
        <Pressable style={styles.locationBar} onPress={() => setShowCities(!showCities)}>
          <Ionicons name="location-sharp" size={15} color="#7c6af7" />
          <Text style={styles.locationLabel}>City</Text>
          <Text style={styles.locationCity}>{city}</Text>
          <Ionicons
            name={showCities ? 'chevron-up' : 'chevron-down'}
            size={14}
            color="#999"
          />
        </Pressable>

        {showCities && (
          <View style={styles.cityDropdown}>
            {CITIES.map(c => (
              <Pressable
                key={c}
                style={[styles.cityItem, c === city && styles.cityItemActive]}
                onPress={() => { setCity(c); setShowCities(false) }}
              >
                <Text style={[styles.cityItemText, c === city && styles.cityItemTextActive]}>
                  {c}
                </Text>
                {c === city && <Ionicons name="checkmark" size={14} color="#7c6af7" />}
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Search bar ───────────────────────────────────────── */}
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color="#aaa" />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search in ${city} — salons, services…`}
            placeholderTextColor="#999"
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <Pressable onPress={handleSearch} style={styles.searchBtn}>
            <Text style={styles.searchBtnText}>Go</Text>
          </Pressable>
        </View>

        {/* ── Section title ────────────────────────────────────── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Popular Services</Text>
          <Text style={styles.sectionSub}>What are you looking for?</Text>
        </View>

        {/* ── Category grid ────────────────────────────────────── */}
        <View style={styles.grid}>
          {CATEGORIES.map(cat => (
            <Pressable key={cat.id} style={styles.catCard} onPress={handleSearch}>
              <View style={[styles.catIconBox, { backgroundColor: cat.bg }]}>
                <MaterialCommunityIcons name={cat.icon} size={30} color={cat.iconColor} />
              </View>
              <Text style={[styles.catLabel, { color: cat.iconColor }]}>{cat.label}</Text>
              <Text style={styles.catSub} numberOfLines={1}>{cat.sub}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Logged-in strip ──────────────────────────────────── */}
        {user && (
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
  root:  { flex: 1, backgroundColor: '#f5f5f7' },
  scroll: { alignItems: 'center', padding: 16 },

  // Centered white card — looks great on both mobile & web
  card: {
    width:        '100%',
    maxWidth:     520,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding:      20,
    shadowColor:  '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation:    6,
  },

  // ── Header ────────────────────────────────────────────────────────
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   20,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoDiamond: {
    width:           44,
    height:          44,
    borderRadius:    12,
    backgroundColor: '#0f0f23',
    alignItems:      'center',
    justifyContent:  'center',
  },
  logoDiamondText: { color: '#7c6af7', fontSize: 22 },
  logoWord:    { color: '#0f0f23', fontSize: 22, fontWeight: '900', letterSpacing: 4 },
  logoTagline: { color: '#7c6af7', fontSize: 9,  fontWeight: '700', letterSpacing: 3, marginTop: 1 },

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

  // ── Location ──────────────────────────────────────────────────────
  locationBar: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   '#f8f8fc',
    borderRadius:      10,
    paddingHorizontal: 14,
    paddingVertical:   11,
    marginBottom:      10,
    borderWidth:       1,
    borderColor:       '#ebebf5',
  },
  locationLabel: { color: '#aaa', fontSize: 12, fontWeight: '600', marginRight: 2 },
  locationCity:  { color: '#0f0f23', fontSize: 14, fontWeight: '700', flex: 1 },

  cityDropdown: {
    backgroundColor: '#f8f8fc',
    borderRadius:    10,
    marginBottom:    10,
    overflow:        'hidden',
    borderWidth:     1,
    borderColor:     '#ebebf5',
  },
  cityItem: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 14,
    paddingVertical:   11,
    borderBottomWidth: 1,
    borderBottomColor: '#ebebf5',
  },
  cityItemActive:     { backgroundColor: '#f0eeff' },
  cityItemText:       { color: '#555', fontSize: 14 },
  cityItemTextActive: { color: '#7c6af7', fontWeight: '700' },

  // ── Search ─────────────────────────────────────────────────────────
  searchBox: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    backgroundColor:   '#f8f8fc',
    borderRadius:      12,
    paddingHorizontal: 14,
    paddingVertical:   11,
    marginBottom:      24,
    borderWidth:       1,
    borderColor:       '#ebebf5',
  },
  searchInput: { flex: 1, color: '#0f0f23', fontSize: 14 },
  searchBtn: {
    backgroundColor:   '#0f0f23',
    borderRadius:      8,
    paddingHorizontal: 16,
    paddingVertical:    7,
  },
  searchBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },

  // ── Section header ─────────────────────────────────────────────────
  sectionRow: { marginBottom: 16 },
  sectionTitle: { color: '#0f0f23', fontSize: 18, fontWeight: '800' },
  sectionSub:   { color: '#999',    fontSize: 12, marginTop: 2 },

  // ── Category grid (3 cols) ─────────────────────────────────────────
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
    marginBottom:  20,
  },
  catCard: {
    width:           '30.5%',
    alignItems:      'center',
    backgroundColor: '#fafafa',
    borderRadius:    14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderWidth:     1,
    borderColor:     '#f0f0f5',
  },
  catIconBox: {
    width:          58,
    height:         58,
    borderRadius:   16,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   8,
  },
  catLabel:  { fontSize: 12, fontWeight: '800', textAlign: 'center', marginBottom: 2 },
  catSub:    { color: '#aaa', fontSize: 10, textAlign: 'center' },

  // ── Welcome strip ──────────────────────────────────────────────────
  welcomeStrip: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#0f0f23',
    borderRadius:    14,
    padding:         16,
    marginTop:       4,
  },
  welcomeLeft:  { flex: 1 },
  welcomeHi:    { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 3 },
  welcomeSub:   { color: '#888', fontSize: 12 },
  welcomeCta: {
    backgroundColor:   '#7c6af7',
    borderRadius:      10,
    paddingHorizontal: 16,
    paddingVertical:    9,
  },
  welcomeCtaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
})
