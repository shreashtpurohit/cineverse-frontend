'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import {
  auth as authApi,
  User,
  getStoredUser,
  setStoredUser,
  setTokens,
  clearTokens,
} from '@/lib/api'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = getStoredUser()
    if (stored) setUser(stored)
    setLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password)
    setTokens(data.accessToken, data.refreshToken)
    setStoredUser(data.user)
    setUser(data.user)
  }

  const register = async (name: string, email: string, password: string) => {
    const data = await authApi.register(name, email, password)
    setTokens(data.accessToken, data.refreshToken)
    setStoredUser(data.user)
    setUser(data.user)
  }

  const logout = async () => {
    await authApi.logout()
    clearTokens()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
