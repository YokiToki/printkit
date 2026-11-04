import { useState, useRef, useEffect } from 'react'
import type { ViewportSketchConfig } from './sketchMesh'
import type { Constraint, LineCurve, CircleCurve, ArcCurve } from '../../editor/sketch/model'
import {
  measureCurve,
  hasDimension,
  entityRef,
} from '../../editor/sketch/measure'
import { LengthField } from '../../ui/LengthField'
import { NumberField } from '../../ui/NumberField'
import { useUnit, toDisplay, formatLength } from '../../ui/units'

export interface SketchOverlayProps {
  config: ViewportSketchConfig
  project: (planePt: { x: number; y: number }) => { x: number; y: number } | null
  onUpdateConstraint?: (id: string, value: number) => void
  onDeleteConstraint?: (id: string) => void
  onSelectConstraint?: (id: string) => void
  onHoverConstraint?: (id: string | null) => void
  onPinDimension?: (curveId: string) => void
  onSubmitDraftInput?: (val1: number, val2: number) => void
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
  onHoverConstraint,
  onPinDimension,
  onSubmitDraftInput,
}: SketchOverlayProps) {
  const { sketch, conflicts, selection } = config
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

  // Selected curves without dimensions: render live dimension badge on canvas!
  const unpinnedCurves = (selection?.curves ?? []).filter((cid) => {
    return sketch.curves[cid] && !hasDimension(sketch, cid)
  })

  // CAD Interactive guidelines and floating HUD inputs
  const isRectTool = config.tool === 'rect-2pt' || config.tool === 'rect-center'
  const isLineTool = config.tool === 'line'
  const isInteractiveDrawing = isRectTool || isLineTool
  const stage = config.toolStage ?? 0

  const [field1, setField1] = useState('')
  const [field2, setField2] = useState('')
  const [userTyped, setUserTyped] = useState(false)

  const input1Ref = useRef<HTMLInputElement>(null)
  const input2Ref = useRef<HTMLInputElement>(null)

  // Keep fields synced with cursor when user hasn't explicitly typed
  useEffect(() => {
    if (userTyped) return
    if (!isInteractiveDrawing) return

    if (stage === 0) {
      const pos = config.cursorPlanePos ?? { x: 0, y: 0 }
      setField1(pos.x.toFixed(1))
      setField2(pos.y.toFixed(1))
    } else if (stage === 1 && config.toolStartPt) {
      const p1 = config.toolStartPt
      const pos = config.cursorPlanePos ?? p1
      const w = Math.abs(pos.x - p1.x)
      const h = Math.abs(pos.y - p1.y)
      setField1(w.toFixed(1))
      setField2(h.toFixed(1))
    }
  }, [config.cursorPlanePos, config.toolStartPt, stage, isInteractiveDrawing, userTyped])

  // When stage changes, reset typed flag and auto-focus the first input
  useEffect(() => {
    setUserTyped(false)
    if (isInteractiveDrawing) {
      input1Ref.current?.focus()
      input1Ref.current?.select()
    }
  }, [stage, config.tool, isInteractiveDrawing])

  const handleCommitDraft = () => {
    const v1 = parseFloat(field1)
    const v2 = parseFloat(field2)
    if (!isNaN(v1) && !isNaN(v2)) {
      onSubmitDraftInput?.(v1, v2)
      setUserTyped(false)
    }
  }

  const handleInputKeyDown = (e: React.KeyboardEvent, field: 1 | 2) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      if (field === 1) {
        input2Ref.current?.focus()
        input2Ref.current?.select()
      } else {
        input1Ref.current?.focus()
        input1Ref.current?.select()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleCommitDraft()
    }
  }

  // Calculate guideline projection points
  let stage0Points: { cur: { x: number; y: number }; yAx: { x: number; y: number }; xAx: { x: number; y: number } } | null = null
  if (isInteractiveDrawing && stage === 0 && config.cursorPlanePos) {
    const cur = project(config.cursorPlanePos)
    const yAx = project({ x: 0, y: config.cursorPlanePos.y })
    const xAx = project({ x: config.cursorPlanePos.x, y: 0 })
    if (cur && yAx && xAx) {
      stage0Points = { cur, yAx, xAx }
    }
  }

  let stage1Points: {
    p1: { x: number; y: number }
    p2: { x: number; y: number }
    c1: { x: number; y: number }
    c2: { x: number; y: number }
  } | null = null
  if (isRectTool && stage === 1 && config.toolStartPt) {
    const p1 = project(config.toolStartPt)
    const curPos = config.cursorPlanePos ?? config.toolStartPt
    const p2 = project(curPos)
    const c1 = project({ x: curPos.x, y: config.toolStartPt.y })
    const c2 = project({ x: config.toolStartPt.x, y: curPos.y })
    if (p1 && p2 && c1 && c2) {
      stage1Points = { p1, p2, c1, c2 }
    }
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      {/* SVG Guidelines and Dimension Projections */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {/* Stage 0: Guidelines from X and Y axes to cursor */}
        {stage0Points && (
          <g>
            {/* Guide line from Y axis (X distance) */}
            <line
              x1={stage0Points.yAx.x}
              y1={stage0Points.yAx.y}
              x2={stage0Points.cur.x}
              y2={stage0Points.cur.y}
              stroke="#f05060"
              strokeDasharray="4 3"
              strokeWidth="1.5"
              strokeOpacity="0.85"
            />
            {/* Guide line from X axis (Y distance) */}
            <line
              x1={stage0Points.xAx.x}
              y1={stage0Points.xAx.y}
              x2={stage0Points.cur.x}
              y2={stage0Points.cur.y}
              stroke="#2ecc71"
              strokeDasharray="4 3"
              strokeWidth="1.5"
              strokeOpacity="0.85"
            />
            {/* Axis projection anchor ticks */}
            <circle cx={stage0Points.yAx.x} cy={stage0Points.yAx.y} r="3" fill="#f05060" />
            <circle cx={stage0Points.xAx.x} cy={stage0Points.xAx.y} r="3" fill="#2ecc71" />
          </g>
        )}

        {/* Stage 1: Dimension guidelines along the rectangle sides */}
        {stage1Points && (
          <g>
            <line
              x1={stage1Points.p1.x}
              y1={stage1Points.p1.y}
              x2={stage1Points.c1.x}
              y2={stage1Points.c1.y}
              stroke="#7c9cff"
              strokeDasharray="4 3"
              strokeWidth="1.5"
              strokeOpacity="0.8"
            />
            <line
              x1={stage1Points.c1.x}
              y1={stage1Points.c1.y}
              x2={stage1Points.p2.x}
              y2={stage1Points.p2.y}
              stroke="#7c9cff"
              strokeDasharray="4 3"
              strokeWidth="1.5"
              strokeOpacity="0.8"
            />
          </g>
        )}
      </svg>

      {/* Stage 0: Floating HUD input for Point 1 (relative to origin axes) */}
      {stage0Points && (
        <div
          data-testid="sketch-draft-hud-stage0"
          className="absolute pointer-events-auto flex flex-col gap-1 p-2 rounded-control bg-surface-1/95 border border-border shadow-float text-xs font-mono backdrop-blur-xs z-30"
          style={{
            left: Math.min(stage0Points.cur.x + 16, typeof window !== 'undefined' ? window.innerWidth - 180 : 600),
            top: Math.max(stage0Points.cur.y - 38, 10),
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 text-center font-bold text-[#f05060]">X</span>
            <input
              ref={input1Ref}
              type="text"
              value={field1}
              onChange={(e) => {
                setUserTyped(true)
                setField1(e.target.value)
              }}
              onKeyDown={(e) => handleInputKeyDown(e, 1)}
              className="w-16 px-1.5 py-0.5 text-xs font-mono rounded bg-surface-2 border border-border text-text focus:border-[#f05060] focus:outline-none"
            />
            <span className="text-[10px] text-text-muted">{unit}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 text-center font-bold text-[#2ecc71]">Y</span>
            <input
              ref={input2Ref}
              type="text"
              value={field2}
              onChange={(e) => {
                setUserTyped(true)
                setField2(e.target.value)
              }}
              onKeyDown={(e) => handleInputKeyDown(e, 2)}
              className="w-16 px-1.5 py-0.5 text-xs font-mono rounded bg-surface-2 border border-border text-text focus:border-[#2ecc71] focus:outline-none"
            />
            <span className="text-[10px] text-text-muted">{unit}</span>
          </div>
          <div className="text-[9px] text-text-muted flex justify-between px-0.5 pt-0.5 border-t border-border">
            <span>Tab: ⇄</span>
            <span>↵ Enter</span>
          </div>
        </div>
      )}

      {/* Stage 1: Floating HUD input for Width and Height along the rectangle sides */}
      {stage1Points && (
        <div
          data-testid="sketch-draft-hud-stage1"
          className="absolute pointer-events-auto flex flex-col gap-1 p-2 rounded-control bg-surface-1/95 border border-accent shadow-float text-xs font-mono backdrop-blur-xs z-30"
          style={{
            left: Math.min(stage1Points.p2.x + 16, typeof window !== 'undefined' ? window.innerWidth - 180 : 600),
            top: Math.max(stage1Points.p2.y - 38, 10),
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 text-center font-bold text-accent">W</span>
            <input
              ref={input1Ref}
              type="text"
              value={field1}
              onChange={(e) => {
                setUserTyped(true)
                setField1(e.target.value)
              }}
              onKeyDown={(e) => handleInputKeyDown(e, 1)}
              className="w-16 px-1.5 py-0.5 text-xs font-mono rounded bg-surface-2 border border-border text-text focus:border-accent focus:outline-none"
            />
            <span className="text-[10px] text-text-muted">{unit}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 text-center font-bold text-accent">H</span>
            <input
              ref={input2Ref}
              type="text"
              value={field2}
              onChange={(e) => {
                setUserTyped(true)
                setField2(e.target.value)
              }}
              onKeyDown={(e) => handleInputKeyDown(e, 2)}
              className="w-16 px-1.5 py-0.5 text-xs font-mono rounded bg-surface-2 border border-border text-text focus:border-accent focus:outline-none"
            />
            <span className="text-[10px] text-text-muted">{unit}</span>
          </div>
          <div className="text-[9px] text-text-muted flex justify-between px-0.5 pt-0.5 border-t border-border">
            <span>Tab: ⇄</span>
            <span>↵ Enter</span>
          </div>
        </div>
      )}

      {/* Existing constraints */}
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
              onMouseEnter={() => onHoverConstraint?.(c.id)}
              onMouseLeave={() => onHoverConstraint?.(null)}
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
        const refNames = c.refs
          .map((r) => {
            const ref = entityRef(sketch, r)
            return ref ? `${ref.kind} ${ref.index}` : r
          })
          .join(', ')

        return (
          <div
            key={c.id}
            className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ left: screenPos.x, top: screenPos.y }}
            onMouseEnter={() => onHoverConstraint?.(c.id)}
            onMouseLeave={() => onHoverConstraint?.(null)}
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
              title={`${c.kind} (${refNames}): right-click to delete`}
            >
              {glyphChar}
            </button>
          </div>
        )
      })}

      {/* Live dimension badges for selected unpinned curves */}
      {unpinnedCurves.map((cid) => {
        const curve = sketch.curves[cid]
        if (!curve) return null
        const m = measureCurve(sketch, cid)
        if (!m) return null

        let planePos: { x: number; y: number } | null = null
        let labelText = ''

        if (curve.kind === 'line') {
          const p1 = sketch.points[curve.a]
          const p2 = sketch.points[curve.b]
          if (p1 && p2) planePos = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
          labelText = formatLength((m as { length: number }).length, unit)
        } else if (curve.kind === 'circle') {
          const center = sketch.points[curve.c]
          if (center) planePos = { x: center.x + curve.r * 0.707, y: center.y + curve.r * 0.707 }
          labelText = `R ${formatLength((m as { radius: number }).radius, unit)}`
        } else if (curve.kind === 'arc') {
          const center = sketch.points[curve.c]
          const p1 = sketch.points[curve.a]
          if (center && p1) {
            const r = Math.hypot(p1.x - center.x, p1.y - center.y)
            planePos = { x: center.x + r * 0.707, y: center.y + r * 0.707 }
            labelText = `R ${formatLength(r, unit)}`
          }
        }

        if (!planePos) return null
        const screenPos = project(planePos)
        if (!screenPos) return null

        return (
          <div
            key={`unpinned-${cid}`}
            className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 z-20"
            style={{ left: screenPos.x, top: screenPos.y }}
          >
            <button
              type="button"
              onClick={() => onPinDimension?.(cid)}
              className="px-1.5 py-0.5 text-xs font-mono font-medium rounded-(--radius-xs) border border-accent/70 bg-surface-1/95 text-accent shadow-xs hover:bg-accent hover:text-white transition-colors cursor-pointer flex items-center gap-1 backdrop-blur-xs"
              title="Click to pin dimension"
            >
              <span>{labelText}</span>
              <span className="text-[10px] font-bold opacity-80">+</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
