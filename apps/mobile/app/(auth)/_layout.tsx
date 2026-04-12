import { Stack, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { useAuth } from '../../lib/auth-context'

export default function AuthLayout() {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  // If already signed in, redirect to home
  useEffect(() => {
    if (!isLoading && user) router.replace('/(tabs)/home')
  }, [isLoading, user])

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
