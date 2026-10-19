import type { PriceProduct } from '../data/types'

const storageKey = 'theprice:guest-products'

export function readGuestProducts(): PriceProduct[] {
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) throw new Error('El almacenamiento de invitado tiene un formato inválido.')
    return parsed as PriceProduct[]
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('No se pudieron leer los productos temporales del navegador.', { cause: error })
    throw error
  }
}

export function writeGuestProducts(products: PriceProduct[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(products))
  } catch {
    throw new Error('No se pudieron guardar los productos temporales. Comprueba el espacio disponible del navegador.')
  }
}
