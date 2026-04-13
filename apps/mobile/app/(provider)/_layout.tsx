import { Tabs, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Platform, View, Pressable, Text, StyleSheet, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useProviderAuth } from '../../lib/provider-auth-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

const ACCENT   = '#E8590C'
const INACTIVE = '#999'
const BAR_BG   = '#fff'

function ResponsiveProviderTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { width } = useWindowDimensions()
  const maxW     = width >= 1200 ? 560 : width >= 768 ? 480 : width
  const iconSize = width >= 768 ? 22 : 22
  const fontSize = width >= 768 ? 12 : 10
  const barH     = Platform.OS === 'ios' ? 78 : 58
  const padBot   = Platform.OS === 'ios' ? 20 : 6

  return (
    <View style={[ptb.outerBar, { height: barH, paddingBottom: padBot }]}>
      <View style={[ptb.innerBar, { maxWidth: maxW }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]

          // Skip hidden tabs (href: null)
          if ((options as any).href === null) return null

          const isFocused = state.index === index
          const color     = isFocused ? ACCENT : INACTIVE
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
              style={ptb.tab}
            >
              {icon}
              <Text style={[ptb.label, { color, fontSize }]} numberOfLines={1}>{label}</Text>
              {isFocused && <View style={ptb.indicator} />}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const ptb = StyleSheet.create({
  outerBar: {
    backgroundColor: BAR_BG,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f5',
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
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
})

function TabIcon({ name, color }: { name: IoniconsName; color: string }) {
  return <Ionicons name={name} size={24} color={color} />
}

function ProviderTabs() {
  const { isSignedIn, isLoading } = useProviderAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isSignedIn) {
      router.replace('/(provider-auth)/login')
    }
  }, [isLoading, isSignedIn])

  if (isLoading || !isSignedIn) return null

  return (
    <Tabs
      tabBar={(props) => <ResponsiveProviderTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title:       'Dashboard',
          tabBarLabel: 'Home',
          tabBarIcon:  ({ color }) => <TabIcon name="grid-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title:       'Booking Requests',
          tabBarLabel: 'Bookings',
          tabBarIcon:  ({ color }) => <TabIcon name="calendar-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="availability"
        options={{
          title:       'Availability',
          tabBarLabel: 'Hours',
          tabBarIcon:  ({ color }) => <TabIcon name="time-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title:       'Services',
          tabBarLabel: 'Services',
          tabBarIcon:  ({ color }) => <TabIcon name="pricetags-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="images"
        options={{
          title:       'Images',
          tabBarLabel: 'Photos',
          tabBarIcon:  ({ color }) => <TabIcon name="images-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="subscription"
        options={{
          title:       'Subscription',
          tabBarLabel: 'Subscribe',
          tabBarIcon:  ({ color }) => <TabIcon name="card-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title:       'Profile',
          tabBarIcon:  ({ color }) => <TabIcon name="person-outline" color={color} />,
        }}
      />
    </Tabs>
  )
}

export default function ProviderLayout() {
  return <ProviderTabs />
}
