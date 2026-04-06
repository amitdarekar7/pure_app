import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../lib/auth-context'
import { AIAPI } from '../../lib/api'
import type { RecommendedItem } from '../../lib/api'

export default function HomeScreen() {
  const { user }    = useAuth()
  const [items,    setItems]    = useState<RecommendedItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      setError(null)
      const data = await AIAPI.recommendations(user?.id ?? 'guest', 'home', 10)
      setItems(data.items ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load recommendations')
    }
  }, [user?.id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const greeting = user?.display_name
    ? `Hello, ${user.display_name.split(' ')[0]} 👋`
    : 'For You'

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7c6af7" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>{greeting}</Text>
      <Text style={styles.sub}>Personalised picks</Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.item_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c6af7" />}
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{index + 1}</Text>
                </View>
                <View>
                  <Text style={styles.itemId}>{item.item_id}</Text>
                  <Text style={styles.itemLabel}>Recommended item</Text>
                </View>
              </View>
              <View style={styles.scorePill}>
                <Text style={styles.scoreText}>{(item.score * 100).toFixed(0)}%</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🎯</Text>
              <Text style={styles.emptyTitle}>No recommendations yet</Text>
              <Text style={styles.emptyDesc}>Use the app to get personalised picks.</Text>
            </View>
          }
          contentContainerStyle={items.length === 0 ? { flex: 1 } : undefined}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23', padding: 16 },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f23' },

  greeting: { fontSize: 26, fontWeight: '800', color: '#fff', marginTop: 8 },
  sub:      { fontSize: 13, color: '#666', marginBottom: 20, marginTop: 2 },

  errorBox: { backgroundColor: '#2a1a1a', borderRadius: 10, padding: 16, alignItems: 'center' },
  errorText:{ color: '#ff6b6b', textAlign: 'center', marginBottom: 10 },
  retryBtn: { backgroundColor: '#7c6af7', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  retryText:{ color: '#fff', fontWeight: '700' },

  card: {
    backgroundColor: '#1a1a2e',
    borderRadius:    12,
    padding:         16,
    marginBottom:    10,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  cardLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankBadge:   { backgroundColor: '#2d2d4e', borderRadius: 8, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  rankText:    { color: '#7c6af7', fontWeight: '800', fontSize: 13 },
  itemId:      { color: '#fff', fontSize: 15, fontWeight: '600' },
  itemLabel:   { color: '#555', fontSize: 12, marginTop: 2 },
  scorePill:   { backgroundColor: '#0f2a1a', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  scoreText:   { color: '#51cf66', fontWeight: '700', fontSize: 13 },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptyDesc:  { color: '#555', fontSize: 14, textAlign: 'center' },
})
