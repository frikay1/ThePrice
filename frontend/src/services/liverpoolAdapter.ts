export type LiverpoolUrlResult =
  | { status: 'not-liverpool' }
  | { status: 'invalid'; message: string }
  | { status: 'valid'; url: string }

const officialHost = 'www.liverpool.com.mx'

export function inspectLiverpoolUrl(value: string): LiverpoolUrlResult {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    return { status: 'not-liverpool' }
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (host !== officialHost && !host.endsWith('.liverpool.com.mx') && !host.includes('liverpool.com.mx')) {
    return { status: 'not-liverpool' }
  }

  if (
    parsed.protocol !== 'https:'
    || host !== officialHost
    || parsed.username !== ''
    || parsed.password !== ''
    || (parsed.port !== '' && parsed.port !== '443')
    || !/^\/tienda\/pdp\/[^/]+\/[0-9]+\/?$/i.test(parsed.pathname)
  ) {
    return {
      status: 'invalid',
      message: 'Para Liverpool, usa una ficha HTTPS oficial de producto de www.liverpool.com.mx/tienda/pdp/.',
    }
  }

  return { status: 'valid', url: parsed.href }
}

export interface LiverpoolLookupAdapter {
  lookup(url: string): Promise<never>
}

export const liverpoolLookupAdapter: LiverpoolLookupAdapter = {
  async lookup() {
    throw new Error('La consulta automática de Liverpool no está disponible. Ingresa manualmente los datos reales del producto en MXN.')
  },
}
