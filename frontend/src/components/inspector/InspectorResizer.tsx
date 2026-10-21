import { useCallback, useEffect, useRef } from 'react'
import { ChevronsUpDown } from 'lucide-react'

interface InspectorResizerProps {
  splitRatio: number
  onSplitChange: (newRatio: number) => void
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function InspectorResizer({
  splitRatio,
  onSplitChange,
  containerRef,
}: InspectorResizerProps) {
  const isDraggingRef = useRef(false)
  const startYRef = useRef(0)
  const startRatioRef = useRef(splitRatio)

  const handlePointerDown = (clientY: number) => {
    isDraggingRef.current = true
    startYRef.current = clientY
    startRatioRef.current = splitRatio
    document.body.style.userSelect = 'none'
  }

  const handlePointerMove = useCallback((clientY: number) => {
    if (!isDraggingRef.current || !containerRef.current) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const containerHeight = containerRect.height

    if (containerHeight <= 0) return

    const deltaY = clientY - startYRef.current
    const deltaRatio = (deltaY / containerHeight) * 100
    const nextRatio = Math.min(75, Math.max(25, startRatioRef.current + deltaRatio))

    onSplitChange(Math.round(nextRatio))
  }, [containerRef, onSplitChange])

  const handlePointerUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      document.body.style.userSelect = ''
    }
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handlePointerMove(e.clientY)
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientY)
      }
    }
    const onMouseUp = () => handlePointerUp()
    const onTouchEnd = () => handlePointerUp()

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('touchend', onTouchEnd)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [handlePointerMove, handlePointerUp])

  return (
    <div
      className="inspector-resizer-bar"
      onMouseDown={(e) => handlePointerDown(e.clientY)}
      onTouchStart={(e) => {
        if (e.touches.length > 0) {
          handlePointerDown(e.touches[0].clientY)
        }
      }}
      title="Arrastra para ajustar el tamaño de los paneles"
    >
      <div className="inspector-resizer-handle">
        <ChevronsUpDown size={13} className="inspector-resizer-icon" />
        <span className="inspector-resizer-label">Arrastra para ajustar el tamaño</span>
      </div>
    </div>
  )
}
