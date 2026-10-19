import { createContext } from 'react'
import type { AuthUser } from '../services/authApi'

export interface AuthContextValue {
  user: AuthUser | null
  isGuestMode: boolean
  isCheckingSession: boolean
  sessionError: string | null
  login: (email: string, password: string) => Promise<void>
  register: (input: { name: string; email: string; password: string; password_confirmation: string }) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  updateName: (name: string) => Promise<void>
  changePassword: (input: { current_password: string; password: string; password_confirmation: string }) => Promise<void>
  enterGuestMode: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
