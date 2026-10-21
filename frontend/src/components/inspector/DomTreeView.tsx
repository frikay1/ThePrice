import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Code2, Search, Filter, FoldVertical, UnfoldVertical } from 'lucide-react'
import type { InspectorNode } from './domTreeUtils'

interface DomTreeViewProps {
  rootNodes: InspectorNode[]
  selectedNodeId: string | null
  expandedNodeIds: Set<string>
  onToggleExpand: (nodeId: string) => void
  onSelectNode: (nodeId: string) => void
  onExpandAll?: () => void
  onCollapseAll?: () => void
}

export function DomTreeView({
  rootNodes,
  selectedNodeId,
  expandedNodeIds,
  onToggleExpand,
  onSelectNode,
  onExpandAll,
  onCollapseAll,
}: DomTreeViewProps) {
  const [filterQuery, setFilterQuery] = useState('')
  const [allExpanded, setAllExpanded] = useState(false)
  const selectedRowRef = useRef<HTMLDivElement>(null)

  // Scroll to selected node in tree
  useEffect(() => {
    if (selectedNodeId && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }, [selectedNodeId])

  const handleToggleExpandAll = () => {
    if (allExpanded) {
      onCollapseAll?.()
      setAllExpanded(false)
    } else {
      onExpandAll?.()
      setAllExpanded(true)
    }
  }

  const renderNode = (node: InspectorNode, depth = 0): ReactNode => {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedNodeIds.has(node.id)
    const isSelected = selectedNodeId === node.id

    // Check search filter match if query exists
    const query = filterQuery.trim().toLowerCase()
    const matchesQuery =
      !query ||
      node.tagName.toLowerCase().includes(query) ||
      node.classes.some((c) => c.toLowerCase().includes(query)) ||
      node.textContent.toLowerCase().includes(query) ||
      Object.keys(node.attributes).some((k) => k.toLowerCase().includes(query))

    return (
      <div key={node.id} className="dom-node-group">
        <div
          ref={isSelected ? selectedRowRef : null}
          className={`dom-node-row ${isSelected ? 'selected' : ''} ${matchesQuery && query ? 'matched' : ''}`}
          style={{ paddingLeft: `${depth * 13 + 6}px` }}
          onClick={(e) => {
            e.stopPropagation()
            onSelectNode(node.id)
          }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="dom-triangle-btn"
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand(node.id)
              }}
              aria-label={isExpanded ? 'Colapsar nodo' : 'Expandir nodo'}
            >
              <span className={`dom-triangle ${isExpanded ? 'down' : 'right'}`} />
            </button>
          ) : (
            <span className="dom-triangle-spacer" />
          )}

          <span className="dom-tag-name">&lt;{node.tagName}</span>

          {Object.entries(node.attributes)
            .slice(0, 4)
            .map(([key, val]) => (
              <span key={key} className="dom-attr">
                <span className="dom-attr-name">{key}</span>=
                <span className="dom-attr-value">
                  "{val.length > 28 ? `${val.slice(0, 25)}…` : val}"
                </span>
              </span>
            ))}

          {Object.keys(node.attributes).length > 4 && (
            <span className="dom-attr-more">+{Object.keys(node.attributes).length - 4}</span>
          )}

          <span className="dom-tag-close">{hasChildren ? '>' : ' />'}</span>

          {!hasChildren && node.textContent && (
            <span className="dom-inline-text">
              {node.textContent.length > 30
                ? ` ${node.textContent.slice(0, 27)}…`
                : ` ${node.textContent}`}
            </span>
          )}

          {hasChildren && !isExpanded && (
            <span className="dom-collapsed-ellipsis">…&lt;/{node.tagName}&gt;</span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="dom-children-container">
            {node.children.map((child) => renderNode(child, depth + 1))}
            <div
              className="dom-node-closing-row"
              style={{ paddingLeft: `${depth * 13 + 18}px` }}
            >
              <span className="dom-tag-name">&lt;/{node.tagName}&gt;</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="dom-tree-card">
      {/* Header */}
      <header className="dom-card-header">
        <div className="dom-card-title">
          <Code2 size={15} className="dom-card-icon" />
          <span className="dom-card-heading">Árbol HTML</span>
        </div>
        <button
          type="button"
          className="dom-card-action-btn"
          onClick={handleToggleExpandAll}
          title={allExpanded ? 'Colapsar todo' : 'Expandir todo'}
          aria-label={allExpanded ? 'Colapsar todo' : 'Expandir todo'}
        >
          {allExpanded ? <FoldVertical size={13} /> : <UnfoldVertical size={13} />}
        </button>
      </header>

      {/* Search and filter bar */}
      <div className="dom-search-bar">
        <Search size={13} className="dom-search-icon" />
        <input
          type="text"
          placeholder="Buscar etiqueta, clase o texto..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          className="dom-search-input"
        />
        {filterQuery ? (
          <button
            type="button"
            className="dom-search-clear"
            onClick={() => setFilterQuery('')}
            title="Limpiar búsqueda"
          >
            ✕
          </button>
        ) : (
          <Filter size={12} className="dom-filter-icon" />
        )}
      </div>

      {/* DOM tree list */}
      <div className="dom-tree-scroll-container">
        {rootNodes.length === 0 ? (
          <div className="dom-tree-empty">No hay elementos HTML disponibles para inspeccionar.</div>
        ) : (
          rootNodes.map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  )
}
