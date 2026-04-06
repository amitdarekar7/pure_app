import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { firebaseAuth } from './firebase'
import { AuthAPI, UsersAPI } from './api'
import type { User } from './api'

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
        try {
          const me = await UsersAPI.me()
          setUser(me)
        } catch {
          setUser(null)
        }
      } else {
        setUser(null)
      }
      setIsLoading(false)
    })
    return unsubscribe
  }, [])

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(firebaseAuth, email, password)
    // onAuthStateChanged fires and fetches the profile automatically
  }

  async function register(email: string, password: string, displayName: string) {
    await createUserWithEmailAndPassword(firebaseAuth, email, password)
    // Provision our DB record with display name (idempotent upsert)
    await AuthAPI.sync({ displayName })
    const me = await UsersAPI.me()
    setUser(me)
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
