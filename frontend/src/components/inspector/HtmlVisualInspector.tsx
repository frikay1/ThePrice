import { useMemo, useState, useRef } from 'react'
import {
  FileText,
  Eye,
  Trash2,
  AlertTriangle,
  Code2,
  Info,
} from 'lucide-react'
import {
  processHtmlForInspector,
  getNodeAncestors,
  type InspectorNode,
} from './domTreeUtils'
import { VisualFrame } from './VisualFrame'
import { DomTreeView } from './DomTreeView'
import { NodeDetailsPanel } from './NodeDetailsPanel'
import { InspectorResizer } from './InspectorResizer'

interface HtmlVisualInspectorProps {
  html: string | null
  sourceUrl?: string
  isTruncated?: boolean
  onAssignName?: (name: string) => void
  onAssignPrice?: (price: string) => void
  onAssignImage?: (image: string) => void
  onClose?: () => void
}

export function HtmlVisualInspector({
  html,
  sourceUrl,
  isTruncated = false,
  onAssignName,
  onAssignPrice,
  onAssignImage,
  onClose,
}: HtmlVisualInspectorProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [splitRatio, setSplitRatio] = useState(50)
  const [resourceIssues, setResourceIssues] = useState(0)
  const [bottomTab, setBottomTab] = useState<'tree' | 'details'>('tree')
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  // Custom snippet fallback
  const [customSnippet, setCustomSnippet] = useState('')
  const [useCustomSnippet, setUseCustomSnippet] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  const activeHtml = useCustomSnippet ? customSnippet : (html ?? '')

  // Process HTML into sanitized representation + indexed tree
  const processed = useMemo(() => {
    if (!activeHtml.trim()) return null
    return processHtmlForInspector(activeHtml, sourceUrl)
  }, [activeHtml, sourceUrl])

  // Select node and expand all its ancestors in the tree
  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId)

    if (processed) {
      const ancestors = getNodeAncestors(nodeId, processed.nodesById)
      setExpandedNodeIds((prev) => {
        const next = new Set(prev)
        ancestors.forEach((a) => next.add(a.id))
        next.add(nodeId)
        return next
      })
    }
  }

  // Clear current selection
  const handleClearSelection = () => {
    setSelectedNodeId(null)
  }

  // Toggle single node expansion
  const handleToggleExpand = (nodeId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  // Expand all nodes
  const handleExpandAll = () => {
    if (processed) {
      const allIds = new Set<string>()
      processed.nodesById.forEach((node) => {
        if (node.children.length > 0) allIds.add(node.id)
      })
      setExpandedNodeIds(allIds)
    }
  }

  // Collapse all nodes (except root)
  const handleCollapseAll = () => {
    if (processed && processed.rootNodes.length > 0) {
      setExpandedNodeIds(new Set([processed.rootNodes[0].id]))
    } else {
      setExpandedNodeIds(new Set())
    }
  }

  // Copy raw HTML
  const handleCopyRawHtml = async () => {
    if (!activeHtml) return
    try {
      await navigator.clipboard.writeText(activeHtml)
      setCopyFeedback('HTML copiado')
      setTimeout(() => setCopyFeedback(null), 2000)
    } catch {
      // Fallback
    }
  }

  // Adjust initial expansion and selection when processed document changes
  const prevProcessedRef = useRef(processed)
  if (processed !== prevProcessedRef.current) {
    prevProcessedRef.current = processed
    if (processed && processed.rootNodes.length > 0) {
      const initialRoot = processed.rootNodes[0]
      setExpandedNodeIds(new Set([initialRoot.id]))
      if (initialRoot.children.length > 0) {
        setSelectedNodeId(initialRoot.children[0].id)
      } else {
        setSelectedNodeId(initialRoot.id)
      }
    }
  }

  const selectedNode: InspectorNode | null = useMemo(() => {
    if (!processed || !selectedNodeId) return null
    return processed.nodesById.get(selectedNodeId) || null
  }, [processed, selectedNodeId])

  const ancestors: InspectorNode[] = useMemo(() => {
    if (!processed || !selectedNodeId) return []
    return getNodeAncestors(selectedNodeId, processed.nodesById)
  }, [processed, selectedNodeId])

  // If no HTML is available at all
  if (!activeHtml && !useCustomSnippet) {
    return (
      <div className="inspector-unavailable-card">
        <div className="inspector-unavailable-icon">
          <AlertTriangle size={22} />
        </div>
        <div className="inspector-unavailable-copy">
          <h3>Inspector visual no disponible</h3>
          <p>
            No se recibió HTML de la página (la tienda bloqueó la consulta o requiere sesión activa).
            Puedes pegar un fragmento HTML para inspeccionarlo interactivamente.
          </p>
          <div className="inspector-custom-snippet-box">
            <textarea
              rows={4}
              placeholder="<div class='product-info'><h1>Nombre</h1><span class='price'>$299.00</span></div>"
              value={customSnippet}
              onChange={(e) => setCustomSnippet(e.target.value)}
              className="inspector-custom-textarea"
            />
            <button
              type="button"
              className="secondary-button"
              disabled={!customSnippet.trim()}
              onClick={() => setUseCustomSnippet(true)}
            >
              Inspeccionar fragmento HTML
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`inspector-shell ${isFullscreen ? 'is-fullscreen' : ''}`}
    >
      {/* Warnings & Notices */}
      {(isTruncated || resourceIssues > 0) && (
        <div className="inspector-notices-banner">
          {isTruncated && (
            <span className="notice-item">
              <Info size={12} />
              <span>HTML limitado a 256 KB por seguridad; la estructura principal está activa.</span>
            </span>
          )}
          {resourceIssues > 0 && (
            <span className="notice-item warning">
              <AlertTriangle size={12} />
              <span>{resourceIssues} recurso(s) externos restringidos por CORS de la tienda.</span>
            </span>
          )}
        </div>
      )}

      {/* Main Workspace: Top (Visual) + Resizer + Bottom (DOM Tree & Details) */}
      <div className="inspector-main-workspace">
        {/* Top Area: Visual Frame Card */}
        <div
          className="inspector-top-pane"
          style={{ flexBasis: `${splitRatio}%` }}
        >
          {processed ? (
            <VisualFrame
              htmlDoc={processed.sanitizedHtml}
              selectedNodeId={selectedNodeId}
              onSelectNode={handleSelectNode}
              onResourceIssue={(count) => setResourceIssues(count)}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
            />
          ) : (
            <div className="visual-card-loading">Cargando visualización...</div>
          )}
        </div>

        {/* Resizer Divider Bar */}
        <InspectorResizer
          splitRatio={splitRatio}
          onSplitChange={setSplitRatio}
          containerRef={containerRef}
        />

        {/* Bottom Area: HTML Tree & Element Details Cards */}
        <div
          className="inspector-bottom-pane"
          style={{ flexBasis: `${100 - splitRatio}%` }}
        >
          {/* Mobile Tab Switcher (< 640px) */}
          <div className="mobile-tabs-bar">
            <button
              type="button"
              className={`mobile-tab-btn ${bottomTab === 'tree' ? 'active' : ''}`}
              onClick={() => setBottomTab('tree')}
            >
              <Code2 size={13} />
              <span>Árbol HTML</span>
              {processed && <span className="tab-badge">{processed.totalElements}</span>}
            </button>

            <button
              type="button"
              className={`mobile-tab-btn ${bottomTab === 'details' ? 'active' : ''}`}
              onClick={() => setBottomTab('details')}
            >
              <FileText size={13} />
              <span>Detalles del elemento</span>
              {selectedNode && <span className="tab-selected-dot" />}
            </button>
          </div>

          {/* Cards Container (Side-by-Side on desktop/tablet, tabbed on mobile) */}
          <div className="bottom-cards-grid">
            {/* Left Card: Árbol HTML */}
            <div className={`bottom-card-col tree-col ${bottomTab === 'tree' ? 'mobile-visible' : 'mobile-hidden'}`}>
              {processed ? (
                <DomTreeView
                  rootNodes={processed.rootNodes}
                  selectedNodeId={selectedNodeId}
                  expandedNodeIds={expandedNodeIds}
                  onToggleExpand={handleToggleExpand}
                  onSelectNode={handleSelectNode}
                  onExpandAll={handleExpandAll}
                  onCollapseAll={handleCollapseAll}
                />
              ) : null}
            </div>

            {/* Right Card: Detalles del elemento */}
            <div className={`bottom-card-col details-col ${bottomTab === 'details' ? 'mobile-visible' : 'mobile-hidden'}`}>
              <NodeDetailsPanel
                node={selectedNode}
                ancestors={ancestors}
                onSelectNode={handleSelectNode}
                onClearSelection={handleClearSelection}
                onAssignName={onAssignName}
                onAssignPrice={onAssignPrice}
                onAssignImage={onAssignImage}
                sourceUrl={sourceUrl}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Actions Bar (matching reference image) */}
      <footer className="inspector-footer-bar">
        <button
          type="button"
          className="inspector-action-pill"
          onClick={handleCopyRawHtml}
          title="Copiar HTML original al portapapeles"
        >
          <FileText size={14} className="pill-icon" />
          <span>{copyFeedback || 'Copiar HTML'}</span>
        </button>

        {onClose && (
          <button
            type="button"
            className="inspector-action-pill"
            onClick={onClose}
            title="Ocultar inspector"
          >
            <Eye size={14} className="pill-icon" />
            <span>Ocultar inspector</span>
          </button>
        )}

        <button
          type="button"
          className="inspector-action-pill clear-pill"
          onClick={handleClearSelection}
          title="Limpiar elemento seleccionado"
          disabled={!selectedNodeId}
        >
          <Trash2 size={14} className="pill-icon" />
          <span>Limpiar selección</span>
        </button>
      </footer>
    </div>
  )
}
