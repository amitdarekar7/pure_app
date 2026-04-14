import { Pool } from 'pg'
import { getFirebaseAdmin } from './firebase-admin'

/**
 * Send an FCM push notification to all devices registered to a user.
 * Silently ignores invalid / expired tokens and removes them from the DB.
 */
export async function sendPushNotification(
  db: Pool,
  userId: string,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<number> {
  const { rows } = await db.query<{ id: string; push_token: string }>(
    `SELECT id, push_token FROM devices
      WHERE user_id = $1 AND push_token IS NOT NULL`,
    [userId],
  )

  if (rows.length === 0) return 0

  const messaging = getFirebaseAdmin().messaging()
  let sent = 0

  for (const device of rows) {
    try {
      await messaging.send({
        token: device.push_token,
        notification: {
          title: payload.title,
          body:  payload.body,
        },
        data: payload.data,
        android: {
          priority: 'high',
          notification: { sound: 'default', channelId: 'bookings' },
        },
        apns: {
          payload: {
            aps: { sound: 'default', badge: 1 },
          },
        },
      })
      sent++
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      // Remove invalid tokens so we don't keep retrying
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        await db.query(`UPDATE devices SET push_token = NULL WHERE id = $1`, [device.id])
      }
      // Other errors (rate limit, server error) — just skip
    }
  }

  return sent
}
