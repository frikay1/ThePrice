export interface InspectorNode {
  id: string
  tagName: string
  attributes: Record<string, string>
  classes: string[]
  textContent: string
  children: InspectorNode[]
  parentId: string | null
  cssSelector: string
  outerHtmlSnippet: string
}

export interface ProcessedHtmlResult {
  sanitizedHtml: string
  rootNodes: InspectorNode[]
  nodesById: Map<string, InspectorNode>
  totalElements: number
}

/**
 * Builds a clean, unique CSS selector for a DOM element.
 */
function generateCssSelector(element: Element): string {
  if (element.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(element.id)) {
    return `#${element.id}`
  }

  const parts: string[] = []
  let current: Element | null = element

  while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName.toLowerCase() !== 'html') {
    const tag = current.tagName.toLowerCase()

    if (tag === 'body') {
      parts.unshift('body')
      break
    }

    if (current.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(current.id)) {
      parts.unshift(`#${current.id}`)
      break
    }

    const classNames = Array.from(current.classList)
      .filter(cls => /^[a-zA-Z0-9_-]+$/.test(cls) && !cls.startsWith('inspector-') && !cls.startsWith('data-'))
      .slice(0, 2)

    let selector = tag
    if (classNames.length > 0) {
      selector += `.${classNames.join('.')}`
    }

    // Check sibling index if needed for disambiguation
    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(child => child.tagName === current?.tagName)
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1
        selector += `:nth-of-type(${index})`
      }
    }

    parts.unshift(selector)
    current = current.parentElement

    if (parts.length >= 4) break
  }

  return parts.join(' > ')
}

/**
 * Creates a concise preview snippet of the element's opening and closing tags.
 */
function createHtmlSnippet(element: Element): string {
  const tag = element.tagName.toLowerCase()
  const attrs: string[] = []

  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i]
    if (attr.name.startsWith('data-inspector-')) continue
    const val = attr.value.length > 50 ? `${attr.value.slice(0, 47)}…` : attr.value
    attrs.push(`${attr.name}="${val}"`)
  }

  const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : ''
  const isSelfClosing = ['img', 'input', 'br', 'hr', 'meta', 'link'].includes(tag)

  if (isSelfClosing) {
    return `<${tag}${attrStr} />`
  }

  const text = element.textContent?.trim() || ''
  if (element.children.length === 0 && text.length > 0 && text.length <= 40) {
    return `<${tag}${attrStr}>${text}</${tag}>`
  }

  return `<${tag}${attrStr}>…</${tag}>`
}

/**
 * Strips active scripts and unsafe attributes while preserving structure, images, and styles.
 */
export function processHtmlForInspector(rawHtml: string, sourceUrl?: string): ProcessedHtmlResult {
  const parser = new DOMParser()
  const doc = parser.parseFromString(rawHtml, 'text/html')

  // 1. Remove scripts, noscript, iframes, objects, embeds
  const dangerousTags = ['script', 'noscript', 'iframe', 'object', 'embed', 'meta[http-equiv="refresh"]']
  dangerousTags.forEach(tag => {
    doc.querySelectorAll(tag).forEach(el => el.remove())
  })

  // 2. Clean inline event handlers and dangerous URLs on ALL elements
  const allElements = doc.querySelectorAll('*')
  allElements.forEach(el => {
    // Strip on* event listeners
    const attrNames = Array.from(el.attributes).map(a => a.name)
    attrNames.forEach(name => {
      if (name.startsWith('on')) {
        el.removeAttribute(name)
      }
    })

    // Neutralize javascript: href / src
    const href = el.getAttribute('href')
    if (href && href.trim().toLowerCase().startsWith('javascript:')) {
      el.setAttribute('href', '#')
    }
    const src = el.getAttribute('src')
    if (src && src.trim().toLowerCase().startsWith('javascript:')) {
      el.removeAttribute('src')
    }
  })

  // 3. Inject <base> tag into <head> for resolving relative links/images
  let head = doc.querySelector('head')
  if (!head) {
    head = doc.createElement('head')
    doc.documentElement.insertBefore(head, doc.body)
  }

  if (sourceUrl && !head.querySelector('base')) {
    try {
      const parsedUrl = new URL(sourceUrl)
      const baseTag = doc.createElement('base')
      baseTag.href = parsedUrl.href
      baseTag.target = '_blank'
      head.prepend(baseTag)
    } catch {
      // Invalid URL, ignore base injection
    }
  }

  // 4. Inject CSP meta tag (strictly block any script execution)
  const cspMeta = doc.createElement('meta')
  cspMeta.httpEquiv = 'Content-Security-Policy'
  cspMeta.content = "script-src 'none';"
  head.prepend(cspMeta)

  // 5. Inject inspector styles for selection and hover highlights
  const inspectorStyle = doc.createElement('style')
  inspectorStyle.id = 'inspector-injected-styles'
  inspectorStyle.textContent = `
    [data-inspector-selected="true"] {
      outline: 2px dashed #d84c7a !important;
      outline-offset: -1px !important;
      background-color: rgba(232, 165, 188, 0.22) !important;
      box-shadow: 0 0 0 2px rgba(216, 76, 122, 0.25) !important;
      border-radius: 4px !important;
      transition: outline 0.15s ease-in-out, background-color 0.15s ease-in-out !important;
    }
    [data-inspector-hover="true"]:not([data-inspector-selected="true"]) {
      outline: 1.5px dashed #A85D7A !important;
      outline-offset: -1px !important;
      background-color: rgba(232, 165, 188, 0.08) !important;
      cursor: crosshair !important;
    }
    * {
      -webkit-tap-highlight-color: rgba(232, 165, 188, 0.3) !important;
    }
  `
  head.appendChild(inspectorStyle)

  // 6. Traverse DOM and assign stable data-inspector-id
  let counter = 0
  const nodesById = new Map<string, InspectorNode>()

  function buildNode(element: Element, parentId: string | null): InspectorNode {
    const id = `node-${++counter}`
    element.setAttribute('data-inspector-id', id)

    const attributes: Record<string, string> = {}
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i]
      if (attr.name !== 'data-inspector-id' && !attr.name.startsWith('data-inspector-')) {
        attributes[attr.name] = attr.value
      }
    }

    const classes = Array.from(element.classList).filter(c => !c.startsWith('inspector-'))
    const textContent = element.textContent?.trim() || ''
    const cssSelector = generateCssSelector(element)
    const outerHtmlSnippet = createHtmlSnippet(element)

    const children: InspectorNode[] = []
    const childElements = Array.from(element.children).filter(child => {
      const tag = child.tagName.toLowerCase()
      return tag !== 'script' && tag !== 'style' && tag !== 'noscript'
    })

    const node: InspectorNode = {
      id,
      tagName: element.tagName.toLowerCase(),
      attributes,
      classes,
      textContent,
      children,
      parentId,
      cssSelector,
      outerHtmlSnippet,
    }

    nodesById.set(id, node)

    childElements.forEach(child => {
      children.push(buildNode(child, id))
    })

    return node
  }

  const rootNodes: InspectorNode[] = []
  const bodyElement = doc.body || doc.documentElement
  if (bodyElement) {
    // If body exists, we build the tree from body's children or body itself
    const bodyNode = buildNode(bodyElement, null)
    rootNodes.push(bodyNode)
  }

  return {
    sanitizedHtml: doc.documentElement.outerHTML,
    rootNodes,
    nodesById,
    totalElements: counter,
  }
}

/**
 * Extracts numeric price from string text (e.g. "$1,299.50" or "£51.77" -> "1299.50").
 */
export function extractPriceFromText(text: string): string | null {
  if (!text) return null
  const cleaned = text.replace(/[\n\r\t]/g, ' ').trim()
  const match = cleaned.match(/(?:[$£€¥]\s*|\b)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)/)
  if (match && match[1]) {
    const num = Number(match[1].replace(/,/g, ''))
    if (!Number.isNaN(num) && num > 0) {
      return num.toFixed(2)
    }
  }
  return null
}

/**
 * Extracts image URL from an inspector node or resolves relative paths.
 */
export function extractImageFromNode(node: InspectorNode, sourceUrl?: string): string | null {
  let rawSrc = node.attributes['src'] || node.attributes['data-src'] || node.attributes['data-lazy-src']

  if (!rawSrc && node.tagName !== 'img') {
    // Search in direct children
    for (const child of node.children) {
      if (child.tagName === 'img') {
        rawSrc = child.attributes['src'] || child.attributes['data-src']
        if (rawSrc) break
      }
    }
  }

  if (!rawSrc) return null

  try {
    if (sourceUrl) {
      return new URL(rawSrc, sourceUrl).href
    }
    return rawSrc
  } catch {
    return rawSrc
  }
}

/**
 * Returns the ancestor hierarchy for breadcrumbs and auto-expanding nodes.
 */
export function getNodeAncestors(nodeId: string, nodesById: Map<string, InspectorNode>): InspectorNode[] {
  const ancestors: InspectorNode[] = []
  let current = nodesById.get(nodeId)

  while (current && current.parentId) {
    const parent = nodesById.get(current.parentId)
    if (parent) {
      ancestors.unshift(parent)
      current = parent
    } else {
      break
    }
  }

  return ancestors
}
