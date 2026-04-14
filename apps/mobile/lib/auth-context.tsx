import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth'
import { firebaseAuth } from './firebase'
import { AuthAPI, UsersAPI } from './api'
import type { User } from './api'
import { registerForPushNotifications } from './push-notifications'

/** Build a minimal User from Firebase auth data (used when backend is unreachable) */
function userFromFirebase(fbUser: FirebaseUser): User {
  return {
    id:           fbUser.uid,
    email:        fbUser.email ?? '',
    phone:        null,
    display_name: fbUser.displayName ?? null,
    avatar_url:   null,
    bio:          null,
    address:      null,
    locale:       'en-US',
    timezone:     null,
    status:       'active',
    created_at:   new Date().toISOString(),
  }
}

interface AuthCtx {
  user:        User | null
  isLoading:   boolean
  isSignedIn:  boolean
  login:       (email: string, password: string) => Promise<void>
  register:    (email: string, password: string, displayName: string) => Promise<void>
  logout:      () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Subscribe to Firebase auth state — handles session restore on app launch
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      if (fbUser) {
        // Set from Firebase data immediately so the UI updates without waiting for backend
        setUser(userFromFirebase(fbUser))
        try {
          // Then upgrade with full profile from our backend (display_name, bio, etc.)
          const me = await UsersAPI.me()
          setUser(me)
          // Register push notification token after successful backend sync
          registerForPushNotifications().catch(() => {})
        } catch {
          // Backend unreachable — keep the Firebase-derived user so the header still shows
        }
      } else {
        setUser(null)
      }
      setIsLoading(false)
    })
    return unsubscribe
  }, [])

  async function login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(firebaseAuth, email, password)
    // Set user synchronously so the home screen renders with the name immediately
    // onAuthStateChanged will fire shortly after and upgrade it with backend data
    setUser(userFromFirebase(cred.user))
  }

  async function register(email: string, password: string, displayName: string) {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password)
    // Show the user immediately from Firebase data
    setUser(userFromFirebase(cred.user))
    try {
      // Provision our DB record with display name, then fetch the full profile
      await AuthAPI.sync({ displayName })
      const me = await UsersAPI.me()
      setUser(me)
    } catch {
      // Backend unreachable — Firebase user is still set above
    }
  }

  async function logout() {
    await signOut(firebaseAuth)
    setUser(null)
  }

  async function refreshUser() {
    const me = await UsersAPI.me()
    setUser(me)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, isSignedIn: user !== null, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be called inside <AuthProvider>')
  return ctx
}
