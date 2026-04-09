import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth'
import { firebaseAuth } from './firebase'
import { ProviderPortalAPI, type ProviderProfile } from './api'

interface ProviderAuthCtx {
  providerUser:     FirebaseUser | null
  providerProfile:  ProviderProfile | null
  providerId:       string | null
  isLoading:        boolean
  isSignedIn:       boolean
  login:            (email: string, password: string) => Promise<void>
  register:         (p: {
    email:        string
    password:     string
    displayName:  string
    providerName: string
    address?:     string
    cityId:       string
    phone?:       string
  }) => Promise<void>
  logout:           () => Promise<void>
  refreshProfile:   () => Promise<void>
}

const ProviderAuthContext = createContext<ProviderAuthCtx | null>(null)

export function ProviderAuthProvider({ children }: { children: React.ReactNode }) {
  const [providerUser,    setProviderUser]    = useState<FirebaseUser | null>(null)
  const [providerProfile, setProviderProfile] = useState<ProviderProfile | null>(null)
  const [providerId,      setProviderId]      = useState<string | null>(null)
  const [isLoading,       setIsLoading]       = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      if (fbUser) {
        setProviderUser(fbUser)
        try {
          const { provider, services: _ } = await ProviderPortalAPI.me()
          setProviderProfile(provider)
          setProviderId(provider.id)
        } catch {
          // Firebase user exists but may not be a provider — leave profile null
          setProviderProfile(null)
          setProviderId(null)
        }
      } else {
        setProviderUser(null)
        setProviderProfile(null)
        setProviderId(null)
      }
      setIsLoading(false)
    })
    return unsub
  }, [])

  async function login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(firebaseAuth, email, password)
    setProviderUser(cred.user)
    const { provider } = await ProviderPortalAPI.me()
    setProviderProfile(provider)
    setProviderId(provider.id)
  }

  async function register(p: {
    email:        string
    password:     string
    displayName:  string
    providerName: string
    address?:     string
    cityId:       string
    phone?:       string
  }) {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, p.email, p.password)
    setProviderUser(cred.user)
    const { providerId: pid } = await ProviderPortalAPI.register({
      providerName: p.providerName,
      address:      p.address,
      cityId:       p.cityId,
      phone:        p.phone,
      displayName:  p.displayName,
    })
    const { provider } = await ProviderPortalAPI.me()
    setProviderProfile(provider)
    setProviderId(pid)
  }

  async function logout() {
    await signOut(firebaseAuth)
    setProviderUser(null)
    setProviderProfile(null)
    setProviderId(null)
  }

  async function refreshProfile() {
    try {
      const { provider } = await ProviderPortalAPI.me()
      setProviderProfile(provider)
      setProviderId(provider.id)
    } catch { /* ignore */ }
  }

  const value: ProviderAuthCtx = {
    providerUser,
    providerProfile,
    providerId,
    isLoading,
    isSignedIn: providerUser !== null && providerProfile !== null,
    login,
    register,
    logout,
    refreshProfile,
  }

  return (
    <ProviderAuthContext.Provider value={value}>
      {children}
    </ProviderAuthContext.Provider>
  )
}

export function useProviderAuth(): ProviderAuthCtx {
  const ctx = useContext(ProviderAuthContext)
  if (!ctx) throw new Error('useProviderAuth must be used inside ProviderAuthProvider')
  return ctx
}
