import { useState } from 'react'
import type { ViewportSketchConfig } from './sketchMesh'
import type { Constraint, LineCurve, CircleCurve, ArcCurve } from '../../editor/sketch/model'
import { LengthField } from '../../ui/LengthField'
import { NumberField } from '../../ui/NumberField'
import { useUnit, toDisplay } from '../../ui/units'

export interface SketchOverlayProps {
  config: ViewportSketchConfig
  project: (planePt: { x: number; y: number }) => { x: number; y: number } | null
  onUpdateConstraint?: (id: string, value: number) => void
  onDeleteConstraint?: (id: string) => void
  onSelectConstraint?: (id: string) => void
}

function getConstraintPosition(
  c: Constraint,
  sketch: ViewportSketchConfig['sketch'],
): { x: number; y: number } | null {
  const pts = sketch.points
  const curves = sketch.curves

  if (c.kind === 'distance') {
    if (c.refs.length === 2) {
      const p1 = pts[c.refs[0]]
      const p2 = pts[c.refs[1]]
      if (p1 && p2) return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    } else if (c.refs.length === 1) {
      const line = curves[c.refs[0]] as LineCurve | undefined
      if (line && line.kind === 'line') {
        const p1 = pts[line.a]
        const p2 = pts[line.b]
        if (p1 && p2) return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      }
    }
  } else if (c.kind === 'radius') {
    const curve = curves[c.refs[0]] as CircleCurve | ArcCurve | undefined
    if (curve && (curve.kind === 'circle' || curve.kind === 'arc')) {
      const center = pts[curve.c]
      if (center) {
        const r = curve.kind === 'circle' ? curve.r : Math.hypot(pts[curve.a].x - center.x, pts[curve.a].y - center.y)
        return { x: center.x + r * 0.707, y: center.y + r * 0.707 }
      }
    }
  } else if (c.kind === 'angle') {
    const l1 = curves[c.refs[0]] as LineCurve | undefined
    const l2 = curves[c.refs[1]] as LineCurve | undefined
    if (l1 && l2 && l1.kind === 'line' && l2.kind === 'line') {
      const p1 = pts[l1.a], p2 = pts[l1.b]
      const p3 = pts[l2.a], p4 = pts[l2.b]
      if (p1 && p2 && p3 && p4) {
        return {
          x: (p1.x + p2.x + p3.x + p4.x) / 4,
          y: (p1.y + p2.y + p3.y + p4.y) / 4,
        }
      }
    }
  } else if (c.kind === 'horizontal' || c.kind === 'vertical' || c.kind === 'parallel') {
    const line = curves[c.refs[0]] as LineCurve | undefined
    if (line && line.kind === 'line') {
      const p1 = pts[line.a]
      const p2 = pts[line.b]
      if (p1 && p2) return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    }
  } else if (c.kind === 'tangent' || c.kind === 'perpendicular') {
    const c1 = curves[c.refs[0]]
    if (c1) {
      if (c1.kind === 'line') {
        const p1 = pts[c1.a], p2 = pts[c1.b]
        if (p1 && p2) return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      } else if (c1.kind === 'circle' || c1.kind === 'arc') {
        const center = pts[c1.c]
        if (center) return { x: center.x, y: center.y }
      }
    }
  } else if (c.kind === 'coincident' || c.kind === 'midpoint' || c.kind === 'symmetric') {
    const p = pts[c.refs[0]]
    if (p) return { x: p.x, y: p.y }
  }

  return null
}

const GLYPH_CHARS: Record<string, string> = {
  horizontal: 'H',
  vertical: 'V',
  coincident: '●',
  tangent: 'T',
  parallel: '//',
  perpendicular: '⊥',
  equal: '=',
  midpoint: 'M',
  symmetric: 'S',
  concentric: '⊙',
}

export function SketchOverlay({
  config,
  project,
  onUpdateConstraint,
  onDeleteConstraint,
  onSelectConstraint,
}: SketchOverlayProps) {
  const { sketch, conflicts } = config
  const { unit } = useUnit()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<number>(0)

  const handleStartEdit = (c: Constraint) => {
    if (c.value !== undefined) {
      setEditingId(c.id)
      setEditValue(c.value)
    }
  }

  const handleValueChange = (id: string, val: number) => {
    setEditValue(val)
    onUpdateConstraint?.(id, val)
    setEditingId(null)
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      {sketch.constraints.map((c) => {
        const planePos = getConstraintPosition(c, sketch)
        if (!planePos) return null

        const screenPos = project(planePos)
        if (!screenPos) return null

        const isConflict = conflicts?.constraints?.includes(c.id)
        const isEditing = editingId === c.id

        // Dimension label
        if (c.kind === 'distance' || c.kind === 'radius' || c.kind === 'angle') {
          return (
            <div
              key={c.id}
              className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 z-20"
              style={{ left: screenPos.x, top: screenPos.y }}
            >
              {isEditing ? (
                <div
                  className="bg-(--color-surface-1) border border-(--color-accent) rounded-(--radius-control) p-1 shadow-(--shadow-float)"
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      setEditingId(null)
                    }
                  }}
                >
                  {c.kind === 'angle' ? (
                    <NumberField
                      label=""
                      value={editValue}
                      onChange={(v) => handleValueChange(c.id, v)}
                      min={0.1}
                      max={359.9}
                      unit="°"
                      digits={1}
                    />
                  ) : (
                    <LengthField
                      label=""
                      value={editValue}
                      onChange={(v) => handleValueChange(c.id, v)}
                      min={0.01}
                      max={10000}
                    />
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStartEdit(c)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onDeleteConstraint?.(c.id)
                  }}
                  className={`px-1.5 py-0.5 text-xs font-mono font-medium rounded-(--radius-xs) border shadow-xs transition-colors cursor-pointer ${
                    isConflict
                      ? 'bg-(--color-error-bg) text-(--color-error-text) border-(--color-error-border)'
                      : 'bg-(--color-surface-2)/90 text-(--color-text) border-(--color-border) hover:border-(--color-accent) hover:text-(--color-accent)'
                  }`}
                  title={`${c.kind}: click to edit, right-click to delete`}
                >
                  {c.kind === 'radius' ? 'R ' : ''}
                  {c.kind === 'angle'
                    ? `${c.value?.toFixed(1)}°`
                    : `${toDisplay(c.value ?? 0, unit).toFixed(unit === 'in' ? 3 : 1)} ${unit}`}
                </button>
              )}
            </div>
          )
        }

        // Geometric constraint glyph badge
        const glyphChar = GLYPH_CHARS[c.kind] ?? '●'
        return (
          <div
            key={c.id}
            className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ left: screenPos.x, top: screenPos.y }}
          >
            <button
              type="button"
              onClick={() => onSelectConstraint?.(c.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                onDeleteConstraint?.(c.id)
              }}
              className={`w-4 h-4 flex items-center justify-center text-[10px] font-bold rounded-[3px] border shadow-xs transition-colors cursor-pointer ${
                isConflict
                  ? 'bg-(--color-error-bg) text-(--color-error-text) border-(--color-error-border)'
                  : 'bg-(--color-surface-2)/85 text-(--color-text-muted) border-(--color-border) hover:text-(--color-accent) hover:border-(--color-accent)'
              }`}
              title={`${c.kind} constraint (right-click to delete)`}
            >
              {glyphChar}
            </button>
          </div>
        )
      })}
    </div>
  )
}
