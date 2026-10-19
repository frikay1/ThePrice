import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

const ACCESS_TOKEN_KEY = 'sanctum-access-token'

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export async function getMobileAccessToken(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  return SecureStorage.getItem(ACCESS_TOKEN_KEY)
}

export async function saveMobileAccessToken(token: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('El token móvil solo se puede guardar en el almacenamiento seguro nativo.')
  }
  await SecureStorage.setItem(ACCESS_TOKEN_KEY, token)
}

export async function removeMobileAccessToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await SecureStorage.remove(ACCESS_TOKEN_KEY)
}
