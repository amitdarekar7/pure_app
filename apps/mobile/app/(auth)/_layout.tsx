import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown:   false,
        contentStyle:  { backgroundColor: '#f5f5f7' },
        animation:     'slide_from_right',
      }}
    />
  )
}
