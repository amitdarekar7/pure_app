import { Tabs } from 'expo-router'
import { Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const isTV = Platform.isTV

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function TabIcon({ name, color }: { name: IoniconsName; color: string }) {
  return <Ionicons name={name} size={isTV ? 28 : 24} color={color} />
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#1a1a2e',
          borderTopColor:  '#2d2d4e',
          height:          isTV ? 72 : 58,
          paddingBottom:   isTV ? 10 : 6,
        },
        tabBarActiveTintColor:   '#7c6af7',
        tabBarInactiveTintColor: '#555',
        headerStyle:             { backgroundColor: '#1a1a2e' },
        headerTintColor:         '#fff',
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
          title:       'Search',
          tabBarLabel: 'Search',
          tabBarIcon:  ({ color }) => <TabIcon name="search-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title:       'Payments',
          tabBarLabel: 'Pay',
          tabBarIcon:  ({ color }) => <TabIcon name="card-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title:       'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon:  ({ color }) => <TabIcon name="person-outline" color={color} />,
        }}
      />
    </Tabs>
  )
}
