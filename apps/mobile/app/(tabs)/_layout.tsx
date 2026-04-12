import { Tabs } from 'expo-router'
import { Platform, View, Pressable, Text, StyleSheet, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'

const isTV = Platform.isTV

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

const ACTIVE   = '#7c6af7'
const INACTIVE = '#888'
const BAR_BG   = '#fff'

function ResponsiveTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { width } = useWindowDimensions()

  // Check if this screen wants to hide the tab bar
  const currentRoute = state.routes[state.index]
  const currentOptions = descriptors[currentRoute.key]?.options
  const tabBarStyle = currentOptions?.tabBarStyle as any
  if (tabBarStyle?.display === 'none') return null

  // Determine responsive sizing
  const isLarge  = width >= 768
  const maxW     = width >= 1200 ? 600 : width >= 768 ? 480 : width
  const iconSize = isTV ? 26 : isLarge ? 22 : 22
  const fontSize = isTV ? 13 : isLarge ? 12 : 11
  const barH     = isTV ? 68 : Platform.OS === 'ios' ? 80 : 60
  const padBot   = Platform.OS === 'ios' ? 20 : 8

  return (
    <View style={[tbStyles.outerBar, { height: barH, paddingBottom: padBot }]}>
      <View style={[tbStyles.innerBar, { maxWidth: maxW }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]

          // Skip hidden tabs (search)
          if (options.tabBarButton === undefined ? false : typeof options.tabBarButton === 'function' && (options.tabBarButton as any)({})  === null) return null
          // Check for null tabBarButton
          const btn = options.tabBarButton
          if (btn && typeof btn === 'function') {
            const result = btn({ children: null } as any)
            if (result === null) return null
          }

          const isFocused = state.index === index
          const color     = isFocused ? ACTIVE : INACTIVE
          const label     = typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : options.title ?? route.name

          const iconFn = options.tabBarIcon
          const icon   = iconFn ? iconFn({ focused: isFocused, color, size: iconSize }) : null

          return (
            <Pressable
              key={route.key}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params)
                }
              }}
              style={tbStyles.tab}
            >
              {icon}
              <Text style={[tbStyles.label, { color, fontSize }]} numberOfLines={1}>{label}</Text>
              {isFocused && <View style={tbStyles.indicator} />}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const tbStyles = StyleSheet.create({
  outerBar: {
    backgroundColor: BAR_BG,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerBar: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-around',
    flex: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    position: 'relative',
    paddingTop: 6,
  },
  label: {
    fontWeight: '600',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: ACTIVE,
  },
})

function TabIcon({ name, color }: { name: IoniconsName; color: string }) {
  return <Ionicons name={name} size={isTV ? 28 : 24} color={color} />
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <ResponsiveTabBar {...props} />}
      screenOptions={{
        headerStyle:             { backgroundColor: '#fff' },
        headerTintColor:         '#111',
        headerTitleStyle:        { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          headerShown:    false,
          tabBarStyle:    { display: 'none' },
          tabBarLabel:    'Home',
          tabBarIcon:     ({ color }) => <TabIcon name="home-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title:          'Search',
          tabBarLabel:    'Search',
          tabBarIcon:     ({ color }) => <TabIcon name="search-outline" color={color} />,
          tabBarButton:   () => null,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          headerShown:  false,
          tabBarLabel:  'Bookings',
          tabBarIcon:   ({ color }) => <TabIcon name="calendar-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          headerShown:  false,
          tabBarLabel:  'Pay',
          tabBarIcon:   ({ color }) => <TabIcon name="card-outline" color={color} />,
          href:         null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          headerShown:  false,
          header:       () => null,
          tabBarStyle:  { display: 'none' },
          tabBarLabel: 'Profile',
          tabBarIcon:  ({ color }) => <TabIcon name="person-outline" color={color} />,
        }}
      />
    </Tabs>
  )
}
