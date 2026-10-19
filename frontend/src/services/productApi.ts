import type { PriceProduct, PricePoint } from '../data/types'
import { request } from './apiClient'

interface ApiPriceHistory {
  id: number
  price: string | number
  recorded_at: string
}

interface ApiProduct {
  id: number
  name: string
  store: string
  url: string
  sku: string | null
  variant_name: string | null
  image: string | null
  current_price: string | number
  currency: string
  target_price: string | number | null
  last_checked_at: string | null
  created_at: string
  price_histories?: ApiPriceHistory[]
}

interface ProductInput {
  name: string
  store: string
  url: string
  sku?: string
  variant_name?: string
  image?: string
  current_price: number
  currency: string
  target_price?: number
}

export interface ProductEditInput {
  name: string
  store: string
  url: string
  sku: string | null
  variant_name: string | null
  image: string | null
}

export interface ProductLookupResult {
  name: string
  store: string
  url: string
  image: string | null
  current_price: string | number
  currency: string
  is_demo: boolean
  notice: string
}

export interface ProductRefreshResult {
  product: PriceProduct
  direction: 'down' | 'up' | 'unchanged'
  changed: boolean
  reachedTarget: boolean
  message: string
}

export interface ManualPriceResult {
  product: PriceProduct
  previousPrice: number
  currentPrice: number
  direction: 'down' | 'up' | 'unchanged'
  changed: boolean
  reachedTarget: boolean
  recordedAt: string | null
  message: string
}

function mapProduct(product: ApiProduct): PriceProduct {
  const history: PricePoint[] = (product.price_histories ?? [])
    .slice()
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
    .map(mapHistoryPoint)
  const currentPrice = Number(product.current_price)
  const previousPrice = history.length > 1 ? history[history.length - 2].price : null
  const checkedDate = product.last_checked_at ? new Date(product.last_checked_at) : new Date(product.created_at)

  return {
    id: String(product.id),
    name: product.name,
    store: product.store,
    sku: product.sku,
    variantName: product.variant_name,
    currentPrice,
    previousPrice,
    targetPrice: product.target_price === null ? null : Number(product.target_price),
    currency: product.currency,
    image: product.image,
    sourceUrl: product.url,
    updatedAt: Number.isNaN(checkedDate.getTime())
      ? 'Sin fecha'
      : new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(checkedDate),
    alertEnabled: false,
    history,
  }
}

function mapHistoryPoint(point: ApiPriceHistory): PricePoint {
  return {
    label: new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(point.recorded_at)),
    price: Number(point.price),
    recordedAt: point.recorded_at,
  }
}

export async function getProducts(): Promise<PriceProduct[]> {
  const response = await request<{ data: ApiProduct[] }>('/products')
  return response.data.map(mapProduct)
}

export async function getProductHistory(id: string): Promise<PricePoint[]> {
  const response = await request<{ data: ApiPriceHistory[] }>(`/products/${encodeURIComponent(id)}/history`)
  return response.data.map(mapHistoryPoint)
}

export async function updateProductTarget(id: string, target: number | null): Promise<boolean> {
  const response = await request<{ reached_target: boolean }>(`/products/${encodeURIComponent(id)}/target`, {
    method: 'PATCH',
    body: JSON.stringify({ target_price: target }),
  })
  return response.reached_target
}

export async function updateProduct(id: string, input: ProductEditInput): Promise<PriceProduct> {
  const response = await request<{ data: ApiProduct }>(`/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return mapProduct(response.data)
}

export async function refreshProduct(id: string): Promise<ProductRefreshResult> {
  const response = await request<{
    message: string
    data: {
      product: ApiProduct
      direction: ProductRefreshResult['direction']
      changed: boolean
      reached_target: boolean
    }
  }>(`/products/${encodeURIComponent(id)}/refresh`, { method: 'POST' })
  return {
    product: mapProduct(response.data.product),
    direction: response.data.direction,
    changed: response.data.changed,
    reachedTarget: response.data.reached_target,
    message: response.message,
  }
}

export async function registerManualPrice(id: string, price: number): Promise<ManualPriceResult> {
  const response = await request<{
    message: string
    data: {
      product: ApiProduct
      previous_price: string | number
      current_price: string | number
      direction: ManualPriceResult['direction']
      changed: boolean
      reached_target: boolean
      recorded_at: string | null
    }
  }>(`/products/${encodeURIComponent(id)}/manual-price`, {
    method: 'POST',
    body: JSON.stringify({ price }),
  })
  return {
    product: mapProduct(response.data.product),
    previousPrice: Number(response.data.previous_price),
    currentPrice: Number(response.data.current_price),
    direction: response.data.direction,
    changed: response.data.changed,
    reachedTarget: response.data.reached_target,
    recordedAt: response.data.recorded_at,
    message: response.message,
  }
}

export async function updateProductVariant(id: string, variantName: string | null): Promise<void> {
  await request<{ message: string }>(`/products/${encodeURIComponent(id)}/variant`, {
    method: 'PATCH',
    body: JSON.stringify({ variant_name: variantName }),
  })
}

export async function lookupProduct(url: string): Promise<ProductLookupResult> {
  const response = await request<{ data: ProductLookupResult }>('/products/lookup', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
  return response.data
}

export async function createProduct(input: ProductInput): Promise<PriceProduct> {
  const response = await request<{ data: ApiProduct }>('/products', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return mapProduct(response.data)
}

export async function removeProduct(id: string): Promise<void> {
  await request<{ message: string }>(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
