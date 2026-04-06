import React, { createContext, useContext, useEffect, useState } from 'react'
import { AuthAPI, TokenStore, UsersAPI } from './api'
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

  // Restore session from stored tokens on app launch
  useEffect(() => {
    ;(async () => {
      try {
        const token = await TokenStore.getAccess()
        if (token) {
          const me = await UsersAPI.me()
          setUser(me)
        }
      } catch {
        await TokenStore.clear()
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  async function login(email: string, password: string) {
    const res = await AuthAPI.login(email, password)
    await TokenStore.setTokens(res.accessToken, res.refreshToken)
    const me = await UsersAPI.me()
    setUser(me)
  }

  async function register(email: string, password: string, displayName: string) {
    const res = await AuthAPI.register(email, password, displayName)
    await TokenStore.setTokens(res.accessToken, res.refreshToken)
    const me = await UsersAPI.me()
    setUser(me)
  }

  async function logout() {
    try {
      const rt = await TokenStore.getRefresh()
      if (rt) await AuthAPI.logout(rt)
    } finally {
      await TokenStore.clear()
      setUser(null)
    }
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
