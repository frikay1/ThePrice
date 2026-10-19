interface ApiErrorPayload {
  message?: string
  errors?: Record<string, string[]>
}

export class ApiRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const candidateApiBaseUrl = configuredApiBaseUrl || (import.meta.env.DEV ? 'http://localhost:8000/api' : '')
const isLocalhost = (() => {
  if (!candidateApiBaseUrl) return false
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(candidateApiBaseUrl).hostname)
  } catch {
    return false
  }
})()

export const apiBaseUrl = import.meta.env.PROD && isLocalhost
  ? ''
  : candidateApiBaseUrl.replace(/\/+$/, '')

function csrfCookieUrl() {
  return `${apiBaseUrl.replace(/\/api$/i, '')}/sanctum/csrf-cookie`
}

function xsrfToken() {
  const cookie = document.cookie.split('; ').find(value => value.startsWith('XSRF-TOKEN='))
  return cookie ? decodeURIComponent(cookie.slice('XSRF-TOKEN='.length)) : null
}

async function ensureCsrfCookie() {
  let response: Response
  try {
    response = await fetch(csrfCookieUrl(), { credentials: 'include', headers: { Accept: 'application/json' } })
  } catch {
    throw new Error('No se pudo conectar con Laravel para iniciar una sesión segura.')
  }

  if (!response.ok) {
    throw new Error('No se pudo preparar la protección de sesión. Comprueba CORS y la configuración de Laravel.')
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error('El backend no está configurado para esta instalación. Puedes continuar en modo invitado.')
  }
  const nativePlatform = isNativePlatform()
  const method = (init?.method ?? 'GET').toUpperCase()
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  if (mutating && !nativePlatform) await ensureCsrfCookie()
  const accessToken = nativePlatform ? await getMobileAccessToken() : null

  let response: Response
  try {
    const xsrf = mutating && !nativePlatform ? xsrfToken() : null
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: nativePlatform ? 'omit' : 'include',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new Error('No se pudo conectar con Laravel. Comprueba que el backend esté iniciado y la URL de API configurada.')
  }

  const payload = await response.json().catch(() => null) as ApiErrorPayload | null
  if (!response.ok) {
    if (response.status === 401 && !['/auth/login', '/auth/register', '/auth/me'].includes(path)) {
      window.dispatchEvent(new Event('theprice:auth-expired'))
    }
    const firstValidationError = payload?.errors ? Object.values(payload.errors).flat()[0] : undefined
    throw new ApiRequestError(firstValidationError || payload?.message || `La solicitud falló (HTTP ${response.status}).`, response.status)
  }
  if (payload === null) throw new Error('Laravel devolvió una respuesta vacía o inválida.')
  return payload as T
}
import { getMobileAccessToken, isNativePlatform } from './mobileTokenStorage'
