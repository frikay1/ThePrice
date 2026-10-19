import { request } from './apiClient'
import { isNativePlatform, removeMobileAccessToken, saveMobileAccessToken } from './mobileTokenStorage'

export interface AuthUser {
  id: number
  name: string
  email: string
  created_at: string
  products_count: number
}

interface AuthResponse {
  message: string
  data: AuthUser
}

interface MobileAuthResponse extends AuthResponse {
  token: string
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await request<{ data: AuthUser }>('/auth/me')
  return response.data
}

export async function registerAccount(input: {
  name: string
  email: string
  password: string
  password_confirmation: string
}): Promise<AuthResponse> {
  if (isNativePlatform()) {
    const response = await request<MobileAuthResponse>('/auth/mobile-register', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await saveMobileAccessToken(response.token)
    return { message: response.message, data: response.data }
  }
  return request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) })
}

export async function login(input: { email: string; password: string }): Promise<AuthResponse> {
  if (isNativePlatform()) {
    const response = await request<MobileAuthResponse>('/auth/mobile-login', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await saveMobileAccessToken(response.token)
    return { message: response.message, data: response.data }
  }
  return request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) })
}

export async function logout(): Promise<void> {
  try {
    await request<{ message: string }>('/auth/logout', { method: 'POST' })
  } finally {
    await removeMobileAccessToken()
  }
}

export async function updateProfile(name: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/profile', { method: 'PATCH', body: JSON.stringify({ name }) })
}

export async function updatePassword(input: {
  current_password: string
  password: string
  password_confirmation: string
}): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/password', { method: 'PATCH', body: JSON.stringify(input) })
}
