import { useTranslation } from 'react-i18next'
import type { ViewFace } from './viewCommands'

export interface ViewCubeProps {
  /** Углы поворота камеры (в градусах) для синхронизации ориентации кубика: [pitch, yaw, roll] */
  rotation?: [number, number, number]
  onSelectFace: (face: ViewFace) => void
}

/**
 * DOM+CSS 3D-куб для интерактивной ориентации и быстрого выбора стандартных видов.
 */
export function ViewCube({ rotation = [0, 0, 0], onSelectFace }: ViewCubeProps) {
  const { t } = useTranslation()

  const [pitch, yaw] = rotation

  const faces: { face: ViewFace; transform: string; labelKey: string }[] = [
    { face: 'top', transform: 'rotateX(90deg) translateZ(36px)', labelKey: 'editor.view.top' },
    { face: 'bottom', transform: 'rotateX(-90deg) translateZ(36px)', labelKey: 'editor.view.bottom' },
    { face: 'front', transform: 'translateZ(36px)', labelKey: 'editor.view.front' },
    { face: 'back', transform: 'rotateY(180deg) translateZ(36px)', labelKey: 'editor.view.back' },
    { face: 'right', transform: 'rotateY(90deg) translateZ(36px)', labelKey: 'editor.view.right' },
    { face: 'left', transform: 'rotateY(-90deg) translateZ(36px)', labelKey: 'editor.view.left' },
  ]

  return (
    <div
      data-testid="view-cube"
      className="relative select-none pointer-events-auto"
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
          transform: `rotateX(${-pitch}deg) rotateY(${yaw}deg)`,
        }}
      >
        {faces.map(({ face, transform, labelKey }) => (
          <button
            key={face}
            type="button"
            data-testid={`view-cube-${face}`}
            onClick={(e) => {
              e.stopPropagation()
              onSelectFace(face)
            }}
            className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wider
                       border border-neutral-700 bg-neutral-900/85 hover:bg-neutral-800 text-neutral-300 hover:text-white
                       transition-colors rounded-[2px]"
            style={{
              width: 72,
              height: 72,
              transform,
              backfaceVisibility: 'visible',
            }}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
