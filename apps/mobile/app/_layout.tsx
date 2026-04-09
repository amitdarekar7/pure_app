import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from '../lib/auth-context'
import { ProviderAuthProvider } from '../lib/provider-auth-context'

export default function RootLayout() {
  return (
    <AuthProvider>
      <ProviderAuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle:    { backgroundColor: '#1a1a2e' },
          headerTintColor: '#fff',
          contentStyle:   { backgroundColor: '#0f0f23' },
        }}
      >
        <Stack.Screen name="index"             options={{ headerShown: false }} />
        <Stack.Screen name="(auth)"            options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)"            options={{ headerShown: false }} />
        <Stack.Screen name="(provider-auth)"   options={{ headerShown: false, contentStyle: { backgroundColor: '#f8f8f8' } }} />
        <Stack.Screen name="(provider)"        options={{ headerShown: false, contentStyle: { backgroundColor: '#f8f8f8' } }} />
        <Stack.Screen name="+not-found"        options={{ title: 'Not Found' }} />
        <Stack.Screen name="provider/[id]"     options={{ headerShown: false }} />
      </Stack>
    </ProviderAuthProvider>
    </AuthProvider>
  )
}
