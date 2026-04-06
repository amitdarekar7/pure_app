import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../lib/auth-context'

export default function Index() {
  const { isLoading, isSignedIn } = useAuth()

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f23' }}>
        <ActivityIndicator size="large" color="#7c6af7" />
      </View>
    )
  }

  return <Redirect href={isSignedIn ? '/(tabs)/home' : '/(auth)/login'} />
}
