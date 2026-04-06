import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useState } from 'react'
import { SearchAPI } from '../../lib/api'
import type { SearchHit } from '../../lib/api'

/** Strip OpenSearch highlight <em> tags */
function stripTags(s: string | undefined): string {
  return s?.replace(/<[^>]+>/g, '') ?? ''
}

function formatPrice(cents: number | undefined): string {
  if (cents == null) return ''
  return `$${(cents / 100).toFixed(2)}`
}

export default function SearchScreen() {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  async function handleSearch() {
    const q = query.trim()
    if (!q) return

    setLoading(true)
    setError(null)
    try {
      const data = await SearchAPI.query(q)
      setResults(data.hits?.hits ?? [])
      setTotal(data.hits?.total?.value ?? 0)
      setSearched(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Search products…"
          placeholderTextColor="#555"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Pressable
          style={[styles.searchBtn, loading && { opacity: 0.6 }]}
          onPress={handleSearch}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.searchBtnText}>Search</Text>}
        </Pressable>
      </View>

      {/* Result count */}
      {searched && !loading && !error && (
        <Text style={styles.resultCount}>
          {total === 0 ? 'No results' : `${total} result${total !== 1 ? 's' : ''}`}
        </Text>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => {
            const title = stripTags(item.highlight?.title?.[0]) || item._source.title || item._id
            const desc  = stripTags(item.highlight?.description?.[0]) || item._source.description
            const price = formatPrice(item._source.price_cents)
            const tags  = item._source.tags ?? []
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.title} numberOfLines={2}>{title}</Text>
                  {price ? <Text style={styles.price}>{price}</Text> : null}
                </View>
                {desc ? (
                  <Text style={styles.desc} numberOfLines={2}>{desc}</Text>
                ) : null}
                <View style={styles.cardFooter}>
                  <View style={styles.tagsRow}>
                    {tags.slice(0, 3).map((tag) => (
                      <View key={tag} style={styles.tag}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.score}>{item._score?.toFixed(2)}</Text>
                </View>
              </View>
            )
          }}
          ListEmptyComponent={
            searched && !loading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>No results found</Text>
                <Text style={styles.emptyDesc}>Try a different keyword.</Text>
              </View>
            ) : null
          }
          contentContainerStyle={results.length === 0 && searched ? { flex: 1 } : undefined}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0f0f23', padding: 16 },

  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  input: {
    flex:              1,
    backgroundColor:   '#1a1a2e',
    borderWidth:       1,
    borderColor:       '#2d2d4e',
    color:             '#fff',
    borderRadius:      10,
    paddingHorizontal: 14,
    paddingVertical:   11,
    fontSize:          15,
  },
  searchBtn: {
    backgroundColor: '#7c6af7',
    borderRadius:    10,
    paddingHorizontal: 18,
    justifyContent:  'center',
    alignItems:      'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  resultCount: { color: '#666', fontSize: 13, marginBottom: 12 },

  errorBox:  { backgroundColor: '#2a1a1a', borderRadius: 10, padding: 16, alignItems: 'center' },
  errorText: { color: '#ff6b6b' },

  card: {
    backgroundColor: '#1a1a2e',
    borderRadius:    12,
    padding:         14,
    marginBottom:    10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  title:      { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
  price:      { color: '#51cf66', fontSize: 14, fontWeight: '700', flexShrink: 0 },
  desc:       { color: '#888', fontSize: 13, marginTop: 6, lineHeight: 18 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  tagsRow:    { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 },
  tag:        { backgroundColor: '#2d2d4e', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  tagText:    { color: '#aaa', fontSize: 11 },
  score:      { color: '#7c6af7', fontSize: 12, fontWeight: '600' },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptyDesc:  { color: '#555', fontSize: 14 },
})
