import { useState } from 'react'
import {
  FileText,
  Copy,
  Check,
  X,
  Tag,
  DollarSign,
  Image as ImageIcon,
  Code2,
} from 'lucide-react'
import type { InspectorNode } from './domTreeUtils'
import { extractPriceFromText, extractImageFromNode } from './domTreeUtils'

interface NodeDetailsPanelProps {
  node: InspectorNode | null
  ancestors: InspectorNode[]
  onSelectNode: (nodeId: string) => void
  onClearSelection?: () => void
  onAssignName?: (name: string) => void
  onAssignPrice?: (price: string) => void
  onAssignImage?: (image: string) => void
  sourceUrl?: string
}

export function NodeDetailsPanel({
  node,
  ancestors,
  onSelectNode,
  onClearSelection,
  onAssignName,
  onAssignPrice,
  onAssignImage,
  sourceUrl,
}: NodeDetailsPanelProps) {
  const [copiedType, setCopiedType] = useState<string | null>(null)

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedType(type)
      setTimeout(() => setCopiedType(null), 1800)
    } catch {
      // Fallback
    }
  }

  if (!node) {
    return (
      <div className="details-card">
        <header className="details-card-header">
          <div className="details-card-title">
            <FileText size={15} className="details-card-icon" />
            <span className="details-card-heading">Detalles del elemento</span>
          </div>
        </header>
        <div className="details-empty-state">
          <Code2 size={24} className="details-empty-icon" />
          <p>Toca cualquier elemento en la vista previa o en el árbol DOM para ver sus propiedades.</p>
        </div>
      </div>
    )
  }

  const extractedPrice = extractPriceFromText(node.textContent)
  const extractedImage = extractImageFromNode(node, sourceUrl)
  const cleanText = node.textContent.replace(/\s+/g, ' ').trim()

  // Full breadcrumbs string: html > body > div#productDetails > ...
  const fullPathString = [
    ...ancestors.map((a) => {
      let part = a.tagName
      if (a.attributes['id']) part += `#${a.attributes['id']}`
      else if (a.classes.length > 0) part += `.${a.classes[0]}`
      return part
    }),
    (() => {
      let currentPart = node.tagName
      if (node.attributes['id']) currentPart += `#${node.attributes['id']}`
      else if (node.classes.length > 0) currentPart += `.${node.classes[0]}`
      return currentPart
    })(),
  ].join(' > ')

  // Main attributes to display
  const attributeEntries = Object.entries(node.attributes)

  return (
    <div className="details-card">
      {/* Header */}
      <header className="details-card-header">
        <div className="details-card-title">
          <FileText size={15} className="details-card-icon" />
          <span className="details-card-heading">Detalles del elemento</span>
        </div>
        {onClearSelection && (
          <button
            type="button"
            className="details-close-btn"
            onClick={onClearSelection}
            title="Deseleccionar elemento"
            aria-label="Deseleccionar elemento"
          >
            <X size={14} />
          </button>
        )}
      </header>

      <div className="details-card-body">
        {/* Section A: HTML Tag Pill */}
        <div className="details-tag-row">
          <div className="details-tag-pill">
            <span className="tag-bracket">&lt;</span>
            <span className="tag-name">{node.tagName}</span>
            {node.classes.length > 0 && (
              <span className="tag-class"> class="{node.classes.slice(0, 2).join(' ')}"</span>
            )}
            <span className="tag-bracket">&gt;</span>
          </div>
          <button
            type="button"
            className="details-mini-copy-btn"
            onClick={() => copyToClipboard(`<${node.tagName}>`, 'tag')}
            title="Copiar etiqueta"
          >
            {copiedType === 'tag' ? <Check size={12} color="#A85D7A" /> : <Copy size={12} />}
          </button>
        </div>

        {/* Section B: Selector CSS */}
        <div className="details-section">
          <label className="details-section-label">Selector CSS</label>
          <div className="details-code-box">
            <code className="details-code-text" title={node.cssSelector}>
              {node.cssSelector}
            </code>
            <button
              type="button"
              className="details-mini-copy-btn"
              onClick={() => copyToClipboard(node.cssSelector, 'selector')}
              title="Copiar selector CSS"
            >
              {copiedType === 'selector' ? <Check size={12} color="#A85D7A" /> : <Copy size={12} />}
            </button>
          </div>
        </div>

        {/* Section C: Ruta del nodo */}
        <div className="details-section">
          <label className="details-section-label">Ruta del nodo</label>
          <div className="details-code-box">
            <div className="details-breadcrumb-trail">
              {ancestors.map((ancestor) => (
                <span key={ancestor.id} className="trail-crumb">
                  <button
                    type="button"
                    className="trail-crumb-btn"
                    onClick={() => onSelectNode(ancestor.id)}
                    title={`Seleccionar <${ancestor.tagName}>`}
                  >
                    <span className="trail-tag">{ancestor.tagName}</span>
                    {ancestor.attributes['id'] ? (
                      <span className="trail-id">#{ancestor.attributes['id']}</span>
                    ) : ancestor.classes.length > 0 ? (
                      <span className="trail-cls">.{ancestor.classes[0]}</span>
                    ) : null}
                  </button>
                  <span className="trail-sep">&gt;</span>
                </span>
              ))}
              <span className="trail-crumb current">
                <span className="trail-tag bold">{node.tagName}</span>
                {node.attributes['id'] ? (
                  <span className="trail-id bold">#{node.attributes['id']}</span>
                ) : node.classes.length > 0 ? (
                  <span className="trail-cls bold">.{node.classes[0]}</span>
                ) : null}
              </span>
            </div>
            <button
              type="button"
              className="details-mini-copy-btn"
              onClick={() => copyToClipboard(fullPathString, 'path')}
              title="Copiar ruta del nodo"
            >
              {copiedType === 'path' ? <Check size={12} color="#A85D7A" /> : <Copy size={12} />}
            </button>
          </div>
        </div>

        {/* Section D: Atributos Table */}
        <div className="details-section">
          <label className="details-section-label">Atributos</label>
          <div className="details-attrs-table">
            <div className="attrs-table-header">
              <span className="col-key">Atributo</span>
              <span className="col-val">Valor</span>
            </div>
            {attributeEntries.length === 0 ? (
              <div className="attrs-table-row empty">
                <span className="col-key">-</span>
                <span className="col-val">Sin atributos</span>
              </div>
            ) : (
              attributeEntries.map(([key, val]) => (
                <div key={key} className="attrs-table-row">
                  <span className="col-key">{key}</span>
                  <span className="col-val" title={val}>
                    {val || '-'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Section E: Contenido de texto */}
        <div className="details-section">
          <label className="details-section-label">Contenido de texto</label>
          <div className="details-code-box">
            <span className="details-text-val">
              {cleanText || <em className="muted-text">Sin texto</em>}
            </span>
            {cleanText && (
              <button
                type="button"
                className="details-mini-copy-btn"
                onClick={() => copyToClipboard(cleanText, 'text')}
                title="Copiar texto"
              >
                {copiedType === 'text' ? <Check size={12} color="#A85D7A" /> : <Copy size={12} />}
              </button>
            )}
          </div>

          {/* Optional thumbnail preview if element is an image */}
          {extractedImage && (
            <div className="details-image-preview-box">
              <img src={extractedImage} alt="Vista previa de imagen" className="details-img-thumb" />
              <div className="details-img-url" title={extractedImage}>
                {extractedImage}
              </div>
            </div>
          )}
        </div>

        {/* Section F: Asignar a campo (Requirement 10) */}
        <div className="details-section">
          <label className="details-section-label">Asignar a campo</label>
          <div className="details-assign-row">
            {onAssignName && (
              <button
                type="button"
                className="assign-field-btn"
                disabled={!cleanText}
                onClick={() => cleanText && onAssignName(cleanText)}
                title="Asignar este texto al nombre del producto"
              >
                <Tag size={13} />
                <span>Nombre</span>
              </button>
            )}

            {onAssignPrice && (
              <button
                type="button"
                className={`assign-field-btn ${extractedPrice ? 'active-price' : ''}`}
                disabled={!extractedPrice && !cleanText}
                onClick={() => {
                  const priceToUse = extractedPrice || cleanText
                  if (priceToUse) onAssignPrice(priceToUse)
                }}
                title={
                  extractedPrice
                    ? `Asignar precio detectado: $${extractedPrice}`
                    : 'Asignar al campo de precio'
                }
              >
                <DollarSign size={13} />
                <span>Precio {extractedPrice ? `($${extractedPrice})` : ''}</span>
              </button>
            )}

            {onAssignImage && (
              <button
                type="button"
                className={`assign-field-btn ${extractedImage ? 'active-image' : ''}`}
                disabled={!extractedImage}
                onClick={() => extractedImage && onAssignImage(extractedImage)}
                title="Asignar URL de imagen"
              >
                <ImageIcon size={13} />
                <span>Imagen</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
