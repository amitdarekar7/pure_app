import admin from 'firebase-admin'

// Augment Fastify's Request with firebase fields set by the auth middleware
declare module 'fastify' {
  interface FastifyRequest {
    firebaseUid:   string
    firebaseEmail: string
  }
}

let instance: admin.app.App | undefined

export function getFirebaseAdmin(): admin.app.App {
  if (instance) return instance

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const credential = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8'),
    )
    instance = admin.initializeApp({ credential: admin.credential.cert(credential) })
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    instance = admin.initializeApp()
  } else {
    throw new Error(
      'Firebase Admin not configured. ' +
      'Set FIREBASE_SERVICE_ACCOUNT_BASE64 or GOOGLE_APPLICATION_CREDENTIALS.',
    )
  }

  return instance
}

export async function verifyIdToken(idToken: string) {
  return getFirebaseAdmin().auth().verifyIdToken(idToken)
}
