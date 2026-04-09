import { Stack } from 'expo-router'

export default function ProviderAuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown:  false,
        contentStyle: { backgroundColor: '#0f0f23' },
        animation:    'slide_from_right',
      }}
    />
  )
}
