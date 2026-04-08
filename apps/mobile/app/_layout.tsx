import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from '../lib/auth-context'

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle:    { backgroundColor: '#1a1a2e' },
          headerTintColor: '#fff',
          contentStyle:   { backgroundColor: '#0f0f23' },
        }}
      >
        <Stack.Screen name="index"       options={{ headerShown: false }} />
        <Stack.Screen name="(auth)"      options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)"      options={{ headerShown: false }} />
        <Stack.Screen name="+not-found"  options={{ title: 'Not Found' }} />
        <Stack.Screen name="provider/[id]" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  )
}
