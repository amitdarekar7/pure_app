import { Stack } from 'expo-router'

export default function LegalLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F9FAFB' },
      }}
    >
      <Stack.Screen name="terms" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="refund" />
      <Stack.Screen name="provider-terms" />
      <Stack.Screen name="provider-privacy" />
      <Stack.Screen name="about" />
      <Stack.Screen name="complaint" />
    </Stack>
  )
}
