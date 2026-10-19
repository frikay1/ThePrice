export interface PricePoint {
  label: string
  price: number
  recordedAt?: string
}

export interface PriceProduct {
  id: string
  name: string
  store: string
  sku: string | null
  variantName: string | null
  currentPrice: number
  previousPrice: number | null
  targetPrice: number | null
  currency: string
  image: string | null
  sourceUrl: string
  updatedAt: string
  alertEnabled: boolean
  history: PricePoint[]
}
