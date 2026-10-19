import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createProduct, getProducts, refreshProduct, registerManualPrice, removeProduct, updateProduct as updateProductRequest, updateProductTarget, updateProductVariant } from '../services/productApi'
import type { PriceProduct } from '../data/types'
import { AppContext, type AppContextValue } from './contextValue'
import { useAuth } from './useAuth'
import { readGuestProducts, writeGuestProducts } from '../services/guestProducts'

function alertPreferencesKey(userId: number): string {
  return `theprice:alerts:${userId}`
}

function applyAlertPreferences(products: PriceProduct[], userId: number): PriceProduct[] {
  let saved: Record<string, boolean> = {}
  try {
    saved = JSON.parse(localStorage.getItem(alertPreferencesKey(userId)) ?? '{}') as Record<string, boolean>
  } catch {
    saved = {}
  }
  return products.map(product => ({
    ...product,
    alertEnabled: saved[product.id] ?? true,
  }))
}

function guestInitialHistory(price: number, recordedAt: string): PriceProduct['history'] {
  return [{
    price,
    recordedAt,
    label: new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(recordedAt)),
  }]
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { user, isGuestMode } = useAuth()
  const userId = user?.id
  const [products, setProducts] = useState<PriceProduct[]>([])
  const [productsOwnerId, setProductsOwnerId] = useState<number | null>(null)
  const [loadCompletedForId, setLoadCompletedForId] = useState<number | null>(null)
  const [loadErrorOwnerId, setLoadErrorOwnerId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [readAlerts, setReadAlerts] = useState<string[]>([])
  const [readAlertsOwnerId, setReadAlertsOwnerId] = useState<number | null>(null)
  const guestProductsAvailable = isGuestMode ? products.length : (() => {
    try { return readGuestProducts().length } catch { return 0 }
  })()

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])

  const reloadProducts = useCallback(async () => {
    if (isGuestMode) {
      try {
        const guestProducts = readGuestProducts()
        setProducts(guestProducts)
        setProductsOwnerId(-1)
        setLoadCompletedForId(-1)
        setLoadError(null)
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar los productos temporales.')
        setLoadErrorOwnerId(-1)
      } finally {
        setIsLoading(false)
      }
      return
    }
    if (!userId) return
    setIsLoading(true)
    setLoadError(null)
    try {
      setProducts(applyAlertPreferences(await getProducts(), userId))
      setProductsOwnerId(userId)
      setLoadCompletedForId(userId)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar los productos.')
      setLoadErrorOwnerId(userId)
    } finally {
      setIsLoading(false)
    }
  }, [isGuestMode, userId])

  const updateProductHistory = useCallback((id: string, history: PriceProduct['history']) => {
    setProducts(current => current.map(product => {
      if (product.id !== id) return product
      return {
        ...product,
        history,
        previousPrice: history.length > 1 ? history[history.length - 2].price : null,
      }
    }))
  }, [])

  useEffect(() => {
    let isActive = true
    if (isGuestMode) {
      void Promise.resolve().then(() => {
        if (!isActive) return
        try {
          setProducts(readGuestProducts())
          setProductsOwnerId(-1)
          setLoadCompletedForId(-1)
          setLoadError(null)
          setLoadErrorOwnerId(null)
        } catch (error) {
          setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar los productos temporales.')
          setLoadErrorOwnerId(-1)
          setLoadCompletedForId(-1)
        } finally {
          setIsLoading(false)
        }
      })
      return () => { isActive = false }
    }
    if (!userId) return () => { isActive = false }
    const loadInitialProducts = async () => {
      try {
        const loadedProducts = applyAlertPreferences(await getProducts(), userId)
        if (isActive) {
          setProducts(loadedProducts)
          setProductsOwnerId(userId)
          setLoadError(null)
          setLoadErrorOwnerId(null)
          setLoadCompletedForId(userId)
        }
      } catch (error) {
        if (isActive) {
          setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar los productos.')
          setLoadErrorOwnerId(userId)
          setLoadCompletedForId(userId)
        }
      } finally {
        if (isActive) setIsLoading(false)
      }
    }
    void loadInitialProducts()
    return () => { isActive = false }
  }, [isGuestMode, userId])

  const activeOwnerId = isGuestMode ? -1 : userId
  const ownsLoadedProducts = activeOwnerId !== undefined && productsOwnerId === activeOwnerId
  const productsForUser = ownsLoadedProducts ? products : []
  const alertsOwnerId = activeOwnerId
  const alertsReadForUser = alertsOwnerId !== undefined && readAlertsOwnerId === alertsOwnerId ? readAlerts : []
  useEffect(() => {
    if (alertsOwnerId === undefined) return
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      try {
        const saved = JSON.parse(localStorage.getItem(`theprice:read-alerts:${alertsOwnerId}`) ?? '[]') as unknown
        const keys = Array.isArray(saved) && saved.every(item => typeof item === 'string') ? saved as string[] : []
        setReadAlerts(keys)
        setReadAlertsOwnerId(alertsOwnerId)
      } catch {
        setReadAlerts([])
        setReadAlertsOwnerId(alertsOwnerId)
      }
    })
    return () => { active = false }
  }, [alertsOwnerId])
  const persistGuestProducts = useCallback((update: (current: PriceProduct[]) => PriceProduct[]) => {
    setProducts(current => {
      const next = update(current)
      writeGuestProducts(next)
      return next
    })
  }, [])
  const importGuestProducts = useCallback(async () => {
    if (!userId) throw new Error('Inicia sesión antes de importar productos.')
    const temporaryProducts = readGuestProducts()
    const existing = new Set((await getProducts()).map(product => normalizeProductUrl(product.sourceUrl)))
    let imported = 0
    let duplicates = 0
    for (const product of temporaryProducts) {
      const url = normalizeProductUrl(product.sourceUrl)
      if (existing.has(url)) {
        duplicates += 1
        continue
      }
      const saved = await createProduct({
        name: product.name,
        store: product.store,
        url: product.sourceUrl,
        sku: product.sku ?? undefined,
        variant_name: product.variantName ?? undefined,
        image: product.image ?? undefined,
        current_price: product.currentPrice,
        currency: product.currency,
        target_price: product.targetPrice ?? undefined,
      })
      const preferencesKey = alertPreferencesKey(userId)
      const preferences = JSON.parse(localStorage.getItem(preferencesKey) ?? '{}') as Record<string, boolean>
      preferences[saved.id] = product.alertEnabled
      localStorage.setItem(preferencesKey, JSON.stringify(preferences))
      existing.add(url)
      imported += 1
    }
    writeGuestProducts([])
    const loadedProducts = applyAlertPreferences(await getProducts(), userId)
    setProducts(loadedProducts)
    setProductsOwnerId(userId)
    setLoadCompletedForId(userId)
    setLoadError(null)
    setLoadErrorOwnerId(null)
    return { imported, duplicates }
  }, [userId])
  const value: AppContextValue = {
    products: productsForUser,
    isLoading: activeOwnerId !== undefined && (loadCompletedForId !== activeOwnerId || isLoading),
    loadError: activeOwnerId !== undefined && loadErrorOwnerId === activeOwnerId ? loadError : null,
    successMessage,
    theme,
    setTheme,
    reloadProducts,
    dismissSuccess: () => setSuccessMessage(null),
    readAlerts: alertsReadForUser,
    isGuestMode,
    guestProductsAvailable,
    importGuestProducts,
    addProduct: async product => {
      if (isGuestMode) {
        const recordedAt = new Date().toISOString()
        const guestProduct: PriceProduct = {
          ...product,
          id: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          previousPrice: null,
          updatedAt: new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(recordedAt)),
          alertEnabled: product.alertEnabled,
          history: guestInitialHistory(product.currentPrice, recordedAt),
        }
        persistGuestProducts(current => [guestProduct, ...current])
        setProductsOwnerId(-1)
        setLoadCompletedForId(-1)
        setSuccessMessage('Producto guardado temporalmente en este navegador.')
        return
      }
      if (userId === undefined) throw new Error('Inicia sesión antes de guardar productos.')
      const saved = await createProduct({
        name: product.name,
        store: product.store,
        url: product.sourceUrl,
        sku: product.sku ?? undefined,
        variant_name: product.variantName ?? undefined,
        image: product.image ?? undefined,
        current_price: product.currentPrice,
        currency: product.currency,
        target_price: product.targetPrice ?? undefined,
      })
      const preferences = JSON.parse(localStorage.getItem(alertPreferencesKey(userId)) ?? '{}') as Record<string, boolean>
      preferences[saved.id] = product.alertEnabled
      localStorage.setItem(alertPreferencesKey(userId), JSON.stringify(preferences))
      setProducts(current => [{ ...saved, alertEnabled: product.alertEnabled }, ...current])
      setProductsOwnerId(userId)
      setLoadCompletedForId(userId)
      setSuccessMessage('Producto guardado correctamente.')
    },
    updateTarget: async (id, target) => {
      if (isGuestMode) {
        let reachedTarget = false
        persistGuestProducts(current => current.map(product => {
          if (product.id !== id) return product
          reachedTarget = target !== null && product.currentPrice <= target
          return { ...product, targetPrice: target }
        }))
        return reachedTarget
      }
      const reachedTarget = await updateProductTarget(id, target)
      setProducts(current => current.map(product => product.id === id ? { ...product, targetPrice: target } : product))
      return reachedTarget
    },
    updateProduct: async (id, input) => {
      if (isGuestMode) {
        persistGuestProducts(current => current.map(product => product.id === id ? {
          ...product,
          name: input.name,
          store: input.store,
          sourceUrl: input.url,
          sku: input.sku,
          variantName: input.variant_name,
          image: input.image,
        } : product))
        return
      }
      const updated = await updateProductRequest(id, input)
      setProducts(current => current.map(product => product.id === id ? { ...updated, alertEnabled: product.alertEnabled } : product))
    },
    updateProductHistory,
    refreshProduct: async id => {
      if (isGuestMode) throw new Error('La actualización automática no está disponible para productos temporales.')
      const result = await refreshProduct(id)
      setProducts(current => current.map(product => product.id === id ? { ...result.product, alertEnabled: product.alertEnabled } : product))
      return result
    },
    registerManualPrice: async (id, price) => {
      if (isGuestMode) {
        const recordedAt = new Date().toISOString()
        let result: Awaited<ReturnType<typeof registerManualPrice>> | null = null
        persistGuestProducts(current => current.map(product => {
          if (product.id !== id) return product
          const changed = Math.abs(product.currentPrice - price) >= 0.005
          const direction = price < product.currentPrice ? 'down' : price > product.currentPrice ? 'up' : 'unchanged'
          const history = changed ? [...product.history, ...guestInitialHistory(price, recordedAt)] : product.history
          const updated = {
            ...product,
            currentPrice: changed ? price : product.currentPrice,
            previousPrice: changed ? product.currentPrice : product.previousPrice,
            history,
            updatedAt: changed ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(recordedAt)) : product.updatedAt,
          }
          result = {
            product: updated,
            previousPrice: product.currentPrice,
            currentPrice: updated.currentPrice,
            direction,
            changed,
            reachedTarget: updated.targetPrice !== null && updated.currentPrice <= updated.targetPrice,
            recordedAt: changed ? recordedAt : null,
            message: changed ? 'El precio se registró temporalmente en este navegador.' : 'El precio sigue igual.',
          }
          return updated
        }))
        if (!result) throw new Error('No se encontró el producto temporal.')
        return result
      }
      const result = await registerManualPrice(id, price)
      setProducts(current => current.map(product => product.id === id ? { ...result.product, alertEnabled: product.alertEnabled } : product))
      return result
    },
    updateVariant: async (id, variantName) => {
      if (isGuestMode) {
        persistGuestProducts(current => current.map(product => product.id === id ? { ...product, variantName } : product))
        return
      }
      await updateProductVariant(id, variantName)
      setProducts(current => current.map(product => product.id === id ? { ...product, variantName } : product))
    },
    deleteProduct: async id => {
      if (isGuestMode) {
        persistGuestProducts(current => current.filter(product => product.id !== id))
        setReadAlerts(current => current.filter(alertId => alertId !== id))
        setSuccessMessage('Producto temporal eliminado.')
        return
      }
      await removeProduct(id)
      setProducts(current => current.filter(product => product.id !== id))
      setReadAlerts(current => current.filter(alertId => alertId !== id))
      setSuccessMessage('Producto eliminado correctamente.')
    },
    markAllRead: () => {
      if (alertsOwnerId === undefined) return
      const keys = productsForUser.filter(isAlertActive).map(alertKey)
      setReadAlertsOwnerId(alertsOwnerId)
      setReadAlerts(keys)
      localStorage.setItem(`theprice:read-alerts:${alertsOwnerId}`, JSON.stringify(keys))
    },
    markAlertRead: id => {
      const product = productsForUser.find(item => item.id === id)
      if (!product || alertsOwnerId === undefined) return
      const key = alertKey(product)
      const updated = [...new Set([...alertsReadForUser, key])]
      setReadAlertsOwnerId(alertsOwnerId)
      setReadAlerts(updated)
      localStorage.setItem(`theprice:read-alerts:${alertsOwnerId}`, JSON.stringify(updated))
    },
    toggleAlerts: (id, enabled) => {
      if (isGuestMode) {
        persistGuestProducts(current => current.map(product => product.id === id ? { ...product, alertEnabled: enabled } : product))
        return
      }
      if (!userId) return
      const preferences = JSON.parse(localStorage.getItem(alertPreferencesKey(userId)) ?? '{}') as Record<string, boolean>
      preferences[id] = enabled
      localStorage.setItem(alertPreferencesKey(userId), JSON.stringify(preferences))
      setProducts(current => current.map(product => product.id === id ? { ...product, alertEnabled: enabled } : product))
    },
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

function normalizeProductUrl(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ''
    return url.href.replace(/\/$/, '')
  } catch {
    return value.trim()
  }
}

function alertKey(product: PriceProduct): string {
  const kind = product.targetPrice !== null && product.currentPrice <= product.targetPrice ? 'target' : 'drop'
  return `${product.id}:${kind}:${product.currentPrice}`
}

function isAlertActive(product: PriceProduct): boolean {
  return product.alertEnabled && (
    (product.targetPrice !== null && product.currentPrice <= product.targetPrice)
    || (product.previousPrice !== null && product.currentPrice < product.previousPrice)
  )
}
