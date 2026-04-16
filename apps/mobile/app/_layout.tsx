import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from '../lib/auth-context'
import { ProviderAuthProvider } from '../lib/provider-auth-context'
import { useFonts } from 'expo-font'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { Platform, View, ActivityIndicator, StyleSheet } from 'react-native'

SplashScreen.preventAutoHideAsync()

function revealApp() {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const root = document.getElementById('root')
    if (root) root.classList.add('app-ready')
    document.body.classList.add('app-ready')
  }
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  })

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync()
      revealApp()
    }
  }, [fontsLoaded])

  if (!fontsLoaded) {
    return (
      <View style={loadingStyles.container}>
        <ActivityIndicator size="large" color="#7c6af7" />
      </View>
    )
  }

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
        <Stack.Screen name="(legal)"            options={{ headerShown: false }} />
        <Stack.Screen name="+not-found"        options={{ title: 'Not Found' }} />
        <Stack.Screen name="provider/[id]"     options={{ headerShown: false }} />
      </Stack>
    </ProviderAuthProvider>
    </AuthProvider>
  )
}

const loadingStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7', alignItems: 'center', justifyContent: 'center' },
})
