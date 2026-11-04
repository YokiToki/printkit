import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewFace } from './viewCommands'

export interface ViewCubeProps {
  /** Углы поворота камеры (в градусах) для синхронизации ориентации кубика: [pitch, yaw, roll] */
  rotation?: [number, number, number]
  onSelectFace: (face: ViewFace) => void
  onOrbit?: (dx: number, dy: number) => void
}

/**
 * DOM+CSS 3D-куб для интерактивной ориентации и быстрого выбора стандартных видов.
 * Поддерживает как клик по граням, так и прямое вращение камеры перетаскиванием (drag).
 */
export function ViewCube({ rotation = [0, 0, 0], onSelectFace, onOrbit }: ViewCubeProps) {
  const { t } = useTranslation()
  const dragRef = useRef<{
    startX: number
    startY: number
    lastX: number
    lastY: number
    moved: boolean
    pointerId: number
    captured: boolean
  } | null>(null)

  const [pitch, yaw] = rotation

  const faces: { face: ViewFace; transform: string; labelKey: string }[] = [
    { face: 'top', transform: 'rotateX(90deg) translateZ(36px)', labelKey: 'editor.view.top' },
    { face: 'bottom', transform: 'rotateX(-90deg) translateZ(36px)', labelKey: 'editor.view.bottom' },
    { face: 'front', transform: 'translateZ(36px)', labelKey: 'editor.view.front' },
    { face: 'back', transform: 'rotateY(180deg) translateZ(36px)', labelKey: 'editor.view.back' },
    { face: 'right', transform: 'rotateY(90deg) translateZ(36px)', labelKey: 'editor.view.right' },
    { face: 'left', transform: 'rotateY(-90deg) translateZ(36px)', labelKey: 'editor.view.left' },
  ]

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (e.button !== 0) return
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
      pointerId: e.pointerId,
      captured: false,
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    e.stopPropagation()
    const dist = Math.hypot(e.clientX - dragRef.current.startX, e.clientY - dragRef.current.startY)
    if (dist > 3) {
      if (!dragRef.current.captured) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragRef.current.captured = true
        } catch {
          // Ignored in test environments
        }
      }
      dragRef.current.moved = true
      const dx = e.clientX - dragRef.current.lastX
      const dy = e.clientY - dragRef.current.lastY
      dragRef.current.lastX = e.clientX
      dragRef.current.lastY = e.clientY
      onOrbit?.(dx, dy)
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    e.stopPropagation()
    if (dragRef.current.captured) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
      } catch {
        // Ignored
      }
    }
    setTimeout(() => {
      dragRef.current = null
    }, 50)
  }

  return (
    <div
      data-testid="view-cube"
      className="relative select-none pointer-events-auto cursor-grab active:cursor-grabbing touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        width: 80,
        height: 80,
        perspective: 400,
      }}
    >
      <div
        className="w-full h-full relative transition-transform duration-75"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${-pitch}deg) rotateY(${-yaw}deg)`,
        }}
      >
        {faces.map(({ face, transform, labelKey }) => (
          <button
            key={face}
            type="button"
            data-testid={`view-cube-${face}`}
            onClick={(e) => {
              e.stopPropagation()
              if (dragRef.current?.moved) return
              onSelectFace(face)
            }}
            className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wider
                       border border-neutral-700 bg-neutral-900/85 hover:bg-neutral-800 text-neutral-300 hover:text-white
                       transition-colors rounded-[2px]"
            style={{
              width: 72,
              height: 72,
              transform,
              backfaceVisibility: 'hidden',
            }}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
