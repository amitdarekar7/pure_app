import { Tabs, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useProviderAuth } from '../../lib/provider-auth-context'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

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
      screenOptions={{
        tabBarStyle: {
          backgroundColor:  '#ffffff',
          borderTopColor:   '#f0f0f5',
          borderTopWidth:   1,
          height:           58,
          paddingBottom:    6,
          width:            '100%',
          maxWidth:         520,
          alignSelf:        'center',
        },
        tabBarActiveTintColor:   '#7c6af7',
        tabBarInactiveTintColor: '#bbb',
        headerShown:             false,
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
          title:       'Services & Images',
          tabBarLabel: 'Services',
          tabBarIcon:  ({ color }) => <TabIcon name="images-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title:       'Profile',
          href:        null,
        }}
      />
    </Tabs>
  )
}

export default function ProviderLayout() {
  return <ProviderTabs />
}
