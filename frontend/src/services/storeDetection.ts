export interface DetectedStore {
  name: string
  domain: string
  automaticLookup: false
}

const stores = [
  { name: 'Liverpool', domain: 'liverpool.com.mx' },
  { name: 'Coppel', domain: 'coppel.com' },
  { name: 'Mercado Libre México', domain: 'mercadolibre.com.mx' },
  { name: 'Mercado Libre México', domain: 'meli.la' },
  { name: 'Temu', domain: 'temu.com' },
  { name: 'Amazon México', domain: 'amazon.com.mx' },
  { name: 'Amazon México', domain: 'amzn.to' },
  { name: 'Walmart México', domain: 'walmart.com.mx' },
  { name: 'Sears', domain: 'sears.com.mx' },
  { name: "Elektra", domain: 'elektra.mx' },
  { name: "Elektra", domain: 'elektra.com.mx' },
  { name: "Sam's Club", domain: 'sams.com.mx' },
  { name: 'The Home Depot México', domain: 'homedepot.com.mx' },
] as const

export function detectStore(value: string): DetectedStore | null {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    return null
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  const match = stores.find(store => host === store.domain || host.endsWith(`.${store.domain}`))
  return match ? { ...match, automaticLookup: false } : null
}

export function validateProductUrl(value: string): { valid: true; url: string } | { valid: false; message: string } {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    return { valid: false, message: 'Escribe un enlace completo y válido.' }
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')
  if (
    parsed.protocol !== 'https:'
    || !host.includes('.')
    || isIpAddress
    || host === 'localhost'
    || host.endsWith('.localhost')
    || parsed.username !== ''
    || parsed.password !== ''
    || (parsed.port !== '' && parsed.port !== '443')
  ) {
    return { valid: false, message: 'Usa un enlace HTTPS público, sin credenciales ni puertos alternativos.' }
  }

  return { valid: true, url: parsed.href }
}
