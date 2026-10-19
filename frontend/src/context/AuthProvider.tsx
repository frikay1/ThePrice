import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getCurrentUser, login as loginRequest, logout as logoutRequest, registerAccount, updatePassword as updatePasswordRequest, updateProfile as updateProfileRequest, type AuthUser } from '../services/authApi'
import { ApiRequestError, apiBaseUrl } from '../services/apiClient'
import { isNativePlatform, removeMobileAccessToken } from '../services/mobileTokenStorage'
import { AuthContext, type AuthContextValue } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isGuestMode, setIsGuestMode] = useState(() =>
    localStorage.getItem('theprice:guest-mode') === 'true' || !apiBaseUrl
  )
  const [isCheckingSession, setIsCheckingSession] = useState(() =>
    localStorage.getItem('theprice:guest-mode') !== 'true' && Boolean(apiBaseUrl)
  )
  const [sessionError, setSessionError] = useState<string | null>(null)
  const authStateVersion = useRef(0)

  const refreshUser = useCallback(async () => {
    try {
      setUser(await getCurrentUser())
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        setUser(null)
        setIsGuestMode(false)
        setSessionError('Tu sesión terminó. Inicia sesión nuevamente.')
      }
      throw error
    }
  }, [])

  useEffect(() => {
    if (isGuestMode) {
      return
    }
    let active = true
    const version = authStateVersion.current
    const onExpired = () => {
      authStateVersion.current += 1
      setUser(null)
      setSessionError('Tu sesión terminó. Inicia sesión nuevamente.')
      if (isNativePlatform()) {
        void removeMobileAccessToken().catch(error => {
          setSessionError(error instanceof Error
            ? `Tu sesión terminó y no se pudo borrar el token local: ${error.message}`
            : 'Tu sesión terminó y no se pudo borrar el token local.')
        })
      }
    }
    window.addEventListener('theprice:auth-expired', onExpired)
    void getCurrentUser().then(found => {
      if (active && authStateVersion.current === version) {
        setUser(found)
        setIsGuestMode(false)
        localStorage.removeItem('theprice:guest-mode')
      }
    }).catch(error => {
      if (active && authStateVersion.current === version) {
        setUser(null)
        setSessionError(error instanceof ApiRequestError && error.status === 401
          ? null
          : 'No se pudo comprobar la sesión. Comprueba la conexión con Laravel e inténtalo de nuevo.')
      }
    }).finally(() => {
      if (active) setIsCheckingSession(false)
    })
    return () => {
      active = false
      window.removeEventListener('theprice:auth-expired', onExpired)
    }
  }, [isGuestMode])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isGuestMode,
    isCheckingSession,
    sessionError,
    login: async (email, password) => {
      authStateVersion.current += 1
      const response = await loginRequest({ email, password })
      setUser(response.data)
      setIsGuestMode(false)
      localStorage.removeItem('theprice:guest-mode')
      setSessionError(null)
    },
    register: async input => {
      authStateVersion.current += 1
      const response = await registerAccount(input)
      setUser(response.data)
      setIsGuestMode(false)
      localStorage.removeItem('theprice:guest-mode')
      setSessionError(null)
    },
    logout: async () => {
      try {
        await logoutRequest()
      } catch (error) {
        if (isNativePlatform()) {
          authStateVersion.current += 1
          setUser(null)
          setIsGuestMode(false)
          localStorage.removeItem('theprice:guest-mode')
          setSessionError(null)
        }
        throw error
      }
      authStateVersion.current += 1
      setUser(null)
      setIsGuestMode(false)
      localStorage.removeItem('theprice:guest-mode')
      setSessionError(null)
    },
    refreshUser,
    updateName: async name => {
      const response = await updateProfileRequest(name)
      setUser(response.data)
    },
    changePassword: async input => {
      await updatePasswordRequest(input)
    },
    enterGuestMode: () => {
      localStorage.setItem('theprice:guest-mode', 'true')
      setUser(null)
      setIsGuestMode(true)
      setSessionError(null)
    },
  }), [isCheckingSession, isGuestMode, refreshUser, sessionError, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
