import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ensureUserProfile,
  loginWithEmail,
  logoutUser,
  registerUser as createFirebaseUser,
  resetPassword,
  subscribeToAuth,
} from '../services/authService'

export const AuthContext = createContext(null)

// ──── TEMPORARY DEV AUTH BYPASS ────────────────────────────────────
// Set to `false` or remove this entire block to restore real Firebase auth.
// This flag is automatically true when running on localhost via Vite.
const DEV_BYPASS_AUTH = false

const mockAdminUser = {
  uid: 'temp-admin-001',
  fullName: 'Pratik Admin',
  email: 'admin@dailycollection.com',
  role: 'admin',
  status: 'active',
}
// ──── END DEV BYPASS ───────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const userRef = useRef(null)

  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    // ── DEV BYPASS: skip Firebase auth entirely ──
    if (DEV_BYPASS_AUTH) {
      setFirebaseUser({ uid: mockAdminUser.uid })
      setUser(mockAdminUser)
      setLoading(false)
      return () => { } // no-op unsubscribe
    }
    // ── END DEV BYPASS ──

    const unsubscribe = subscribeToAuth(async (authUser) => {
      setLoading(!userRef.current)
      try {
        if (!authUser) {
          setFirebaseUser(null)
          setUser(null)
          return
        }

        const profile = await ensureUserProfile(authUser)
        setFirebaseUser(authUser)
        setUser(profile)
      } finally {
        setLoading(false)
      }
    })

    return unsubscribe
  }, [])

  const login = useCallback(async (credentials) => {
    setActionLoading(true)
    try {
      const profile = await loginWithEmail(credentials)
      setUser(profile)
      return profile
    } finally {
      setActionLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    setActionLoading(true)
    try {
      await logoutUser()
    } finally {
      setActionLoading(false)
    }
  }, [])

  const sendResetEmail = useCallback(async (email) => resetPassword(email), [])

  const registerUser = useCallback(async (payload) => {
    setActionLoading(true)
    try {
      return await createFirebaseUser(payload)
    } finally {
      setActionLoading(false)
    }
  }, [])

  const value = useMemo(
    () => ({
      firebaseUser,
      user,
      loading,
      actionLoading,
      isAuthenticated: Boolean(firebaseUser && user && user.status !== 'disabled'),
      login,
      logout,
      registerUser,
      sendResetEmail,
    }),
    [actionLoading, firebaseUser, loading, login, logout, registerUser, sendResetEmail, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
