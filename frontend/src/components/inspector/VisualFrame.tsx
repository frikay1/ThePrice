import { useEffect, useRef, useState } from 'react'
import { Eye, RotateCcw, Maximize2, Minimize2, ZoomIn, ZoomOut, Search } from 'lucide-react'

interface VisualFrameProps {
  htmlDoc: string
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
  onHoverNode?: (nodeId: string | null) => void
  onResourceIssue?: (issueCount: number) => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

export function VisualFrame({
  htmlDoc,
  selectedNodeId,
  onSelectNode,
  onHoverNode,
  onResourceIssue,
  isFullscreen = false,
  onToggleFullscreen,
}: VisualFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isIframeLoaded, setIsIframeLoaded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const hoveredElRef = useRef<Element | null>(null)

  const handleZoomIn = () => {
    setZoom((z) => Math.min(1.8, Math.round((z + 0.15) * 100) / 100))
  }

  const handleZoomOut = () => {
    setZoom((z) => Math.max(0.4, Math.round((z - 0.15) * 100) / 100))
  }

  const handleResetZoom = () => {
    setZoom(1)
  }

  // Attach safe interaction listeners when iframe document loads
  const handleIframeLoad = () => {
    const iframe = iframeRef.current
    if (!iframe) return

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (!doc) return

      let failedResources = 0

      // 1. Intercept resource load errors (e.g., images blocked by origin or 404)
      doc.addEventListener(
        'error',
        (event) => {
          const target = event.target as HTMLElement
          if (target && (target.tagName === 'IMG' || target.tagName === 'LINK')) {
            failedResources++
            onResourceIssue?.(failedResources)
          }
        },
        true
      )

      // 2. Intercept clicks and touches in capture phase: prevent navigation, trigger selection
      const handleElementClick = (event: MouseEvent | TouchEvent) => {
        event.preventDefault()
        event.stopPropagation()

        const target = event.target as HTMLElement | null
        if (!target) return

        const inspectorEl = target.closest('[data-inspector-id]')
        if (inspectorEl) {
          const id = inspectorEl.getAttribute('data-inspector-id')
          if (id) {
            onSelectNode(id)
          }
        }
      }

      doc.addEventListener('click', handleElementClick, true)
      doc.addEventListener('touchstart', handleElementClick, { capture: true, passive: false })

      // 3. Intercept hover / pointer move for live DevTools outline
      const handlePointerOver = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null
        if (!target) return

        const inspectorEl = target.closest('[data-inspector-id]')
        if (inspectorEl && inspectorEl !== hoveredElRef.current) {
          if (hoveredElRef.current && hoveredElRef.current !== inspectorEl) {
            hoveredElRef.current.removeAttribute('data-inspector-hover')
          }
          hoveredElRef.current = inspectorEl
          inspectorEl.setAttribute('data-inspector-hover', 'true')
          const id = inspectorEl.getAttribute('data-inspector-id')
          onHoverNode?.(id)
        }
      }

      const handlePointerOut = (event: MouseEvent) => {
        const related = event.relatedTarget as HTMLElement | null
        if (!related || !related.closest('[data-inspector-id]')) {
          if (hoveredElRef.current) {
            hoveredElRef.current.removeAttribute('data-inspector-hover')
            hoveredElRef.current = null
            onHoverNode?.(null)
          }
        }
      }

      doc.addEventListener('mouseover', handlePointerOver, true)
      doc.addEventListener('mouseout', handlePointerOut, true)

      setIsIframeLoaded(true)

      // Highlight selected node if already present
      if (selectedNodeId) {
        highlightNodeInDoc(doc, selectedNodeId)
      }
    } catch {
      // Cross-origin restriction fallback
    }
  }

  // Update highlight and scroll when selectedNodeId changes
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (!doc) return

      highlightNodeInDoc(doc, selectedNodeId)
    } catch {
      // Ignored
    }
  }, [selectedNodeId, isIframeLoaded])

  return (
    <div className="visual-card-container">
      {/* Top Header matching reference image */}
      <header className="visual-card-header">
        <div className="visual-card-title">
          <span className="visual-card-icon-badge">
            <Eye size={15} />
          </span>
          <span className="visual-card-heading">Vista visual del producto</span>
        </div>

        <div className="visual-card-controls">
          <div className="visual-zoom-pill" title="Nivel de zoom">
            <Search size={12} className="visual-zoom-icon" />
            <span className="visual-zoom-percent">{Math.round(zoom * 100)}%</span>
          </div>

          <button
            type="button"
            className="visual-ctrl-btn"
            onClick={handleZoomOut}
            title="Alejar zoom"
            aria-label="Alejar zoom"
            disabled={zoom <= 0.45}
          >
            <ZoomOut size={13} />
          </button>

          <button
            type="button"
            className="visual-ctrl-btn"
            onClick={handleZoomIn}
            title="Acercar zoom"
            aria-label="Acercar zoom"
            disabled={zoom >= 1.75}
          >
            <ZoomIn size={13} />
          </button>

          <button
            type="button"
            className="visual-ctrl-btn"
            onClick={handleResetZoom}
            title="Restablecer zoom al 100%"
            aria-label="Restablecer zoom al 100%"
          >
            <RotateCcw size={13} />
          </button>

          {onToggleFullscreen && (
            <button
              type="button"
              className="visual-ctrl-btn"
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'Salir de pantalla completa' : 'Expandir vista'}
              aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Expandir vista'}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}
        </div>
      </header>

      {/* Frame Body with zoom support */}
      <div className="visual-card-viewport">
        <div
          className="visual-frame-scaler"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            width: zoom !== 1 ? `${100 / zoom}%` : '100%',
            height: zoom !== 1 ? `${100 / zoom}%` : '100%',
          }}
        >
          <iframe
            ref={iframeRef}
            title="Vista visual interactiva"
            sandbox="allow-same-origin"
            referrerPolicy="no-referrer"
            srcDoc={htmlDoc}
            onLoad={handleIframeLoad}
            className="visual-inspector-iframe"
          />
        </div>
      </div>
    </div>
  )
}

function highlightNodeInDoc(doc: Document, nodeId: string | null) {
  // Clear previous selection
  doc.querySelectorAll('[data-inspector-selected="true"]').forEach((el) => {
    el.removeAttribute('data-inspector-selected')
  })

  if (!nodeId) return

  const target = doc.querySelector(`[data-inspector-id="${nodeId}"]`)
  if (target) {
    target.setAttribute('data-inspector-selected', 'true')
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  }
}
