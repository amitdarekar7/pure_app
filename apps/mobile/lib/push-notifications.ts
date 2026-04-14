/**
 * Push notification registration & handling.
 *
 * - Requests permission on native devices
 * - Retrieves the Expo push token (backed by FCM on Android, APNs on iOS)
 * - Sends the token to our backend
 * - Provides a hook for components to listen for incoming notifications
 *
 * expo-notifications accesses localStorage at module load on web/SSR,
 * so we lazy-import it only on native platforms.
 */
import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { UsersAPI } from './api'

// Lazy-loaded references — only populated on native
let Notifications: typeof import('expo-notifications') | null = null
let Device: typeof import('expo-device') | null = null
let Constants: typeof import('expo-constants').default | null = null

const isNative = Platform.OS === 'ios' || Platform.OS === 'android'

if (isNative) {
  // Safe to require synchronously — bundler tree-shakes for web
  Notifications = require('expo-notifications') as typeof import('expo-notifications')
  Device        = require('expo-device')        as typeof import('expo-device')
  Constants     = require('expo-constants').default as typeof import('expo-constants').default

  // Show notifications when app is in the foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  true,
    }),
  })
}

/**
 * Register for push notifications and send the token to the backend.
 * Safe to call on web (no-ops silently) and simulators.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!isNative || !Notifications || !Device || !Constants) return null

  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('[push] Not a physical device — skipping registration')
    return null
  }

  // Check / request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') {
    console.log('[push] Notification permission not granted')
    return null
  }

  // Android: set up notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('bookings', {
      name:       'Bookings',
      importance: Notifications.AndroidImportance.MAX,
      sound:      'default',
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  // Get the token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  })
  const token = tokenData.data

  // Send to backend
  try {
    await UsersAPI.registerPushToken(token, Platform.OS)
    console.log('[push] Token registered:', token.slice(0, 20) + '...')
  } catch (err) {
    console.error('[push] Failed to register token with backend:', err)
  }

  return token
}

/**
 * Hook to handle incoming notifications.
 * @param onReceived  - called when notification arrives while app is foregrounded
 * @param onTapped    - called when user taps a notification
 */
export function useNotificationListeners(
  onReceived?: (notification: any) => void,
  onTapped?:   (response: any) => void,
) {
  const receivedRef = useRef(onReceived)
  const tappedRef   = useRef(onTapped)
  receivedRef.current = onReceived
  tappedRef.current   = onTapped

  useEffect(() => {
    if (!isNative || !Notifications) return
    const sub1 = Notifications.addNotificationReceivedListener((n) => {
      receivedRef.current?.(n)
    })
    const sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
      tappedRef.current?.(r)
    })
    return () => {
      sub1.remove()
      sub2.remove()
    }
  }, [])
}
