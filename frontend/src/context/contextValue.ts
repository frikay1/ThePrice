import { createContext } from 'react'
import type { PriceProduct, PricePoint } from '../data/types'
import type { ManualPriceResult, ProductEditInput, ProductRefreshResult } from '../services/productApi'

export interface AppContextValue {
  products: PriceProduct[]
  isLoading: boolean
  loadError: string | null
  successMessage: string | null
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
  reloadProducts: () => Promise<void>
  dismissSuccess: () => void
  readAlerts: string[]
  isGuestMode: boolean
  guestProductsAvailable: number
  importGuestProducts: () => Promise<{ imported: number; duplicates: number }>
  addProduct: (product: Omit<PriceProduct, 'id' | 'previousPrice' | 'updatedAt' | 'history'>) => Promise<void>
  updateTarget: (id: string, target: number | null) => Promise<boolean>
  updateProduct: (id: string, input: ProductEditInput) => Promise<void>
  updateProductHistory: (id: string, history: PricePoint[]) => void
  refreshProduct: (id: string) => Promise<ProductRefreshResult>
  registerManualPrice: (id: string, price: number) => Promise<ManualPriceResult>
  updateVariant: (id: string, variantName: string | null) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  markAllRead: () => void
  markAlertRead: (id: string) => void
  toggleAlerts: (id: string, enabled: boolean) => void
}

export const AppContext = createContext<AppContextValue | null>(null)
