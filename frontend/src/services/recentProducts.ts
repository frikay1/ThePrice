export interface RecentProductVisit {
  productId: string
  visitedAt: string
}

function storageKey(ownerId: string): string {
  return `theprice:recent-products:${ownerId}`
}

export function readRecentProductVisits(ownerId: string): RecentProductVisit[] {
  let stored: string | null
  try {
    stored = localStorage.getItem(storageKey(ownerId))
  } catch (error) {
    throw new Error('No se pudo leer el historial de productos recientes.', { cause: error })
  }
  if (!stored) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch (error) {
    throw new Error('El historial de productos recientes tiene un formato inválido.', { cause: error })
  }
  if (!Array.isArray(parsed)) {
    throw new Error('El historial de productos recientes tiene un formato inválido.')
  }

  return parsed.map((visit: unknown) => {
    if (
      typeof visit !== 'object'
      || visit === null
      || !('productId' in visit)
      || typeof visit.productId !== 'string'
      || !visit.productId
      || !('visitedAt' in visit)
      || typeof visit.visitedAt !== 'string'
      || !Number.isFinite(Date.parse(visit.visitedAt))
    ) {
      throw new Error('El historial de productos recientes tiene un formato inválido.')
    }
    return { productId: visit.productId, visitedAt: visit.visitedAt }
  })
}

export function recordRecentProductVisit(ownerId: string, productId: string): void {
  const visits = readRecentProductVisits(ownerId)
  const updated = [
    { productId, visitedAt: new Date().toISOString() },
    ...visits.filter(visit => visit.productId !== productId),
  ].slice(0, 5)
  try {
    localStorage.setItem(storageKey(ownerId), JSON.stringify(updated))
  } catch (error) {
    throw new Error('No se pudo guardar el historial de productos recientes.', { cause: error })
  }
}
