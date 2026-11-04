import type { Sketch, ConstraintKind } from './model'

export type InferGlyph =
  | 'coincident'
  | 'tangent'
  | 'midpoint'
  | 'pointOnCurve'
  | 'horizontal'
  | 'vertical'
  | 'grid'

export interface ConstraintDraft {
  kind: ConstraintKind
  refs: string[]
  value?: number
}

export interface SnapOptions {
  previousPoint?: { x: number; y: number }
  lastCurveId?: string // if previousPoint was the end of a curve, for tangent inference
  pixelsPerMm?: number
  ctrlKey?: boolean
  shiftKey?: boolean
  gridStep?: number
  thresholdPx?: number
}

export interface SnapResult {
  pos: { x: number; y: number }
  glyph?: InferGlyph
  targetId?: string
  constraints: ConstraintDraft[]
}

export function inferSnap(
  sketch: Sketch,
  cursor: { x: number; y: number },
  options: SnapOptions = {},
): SnapResult {
  const {
    previousPoint,
    lastCurveId,
    pixelsPerMm = 5,
    ctrlKey = false,
    shiftKey = false,
    gridStep = 1,
    thresholdPx = 8,
  } = options

  // Ctrl disables inference completely
  if (ctrlKey) {
    return { pos: { ...cursor }, constraints: [] }
  }

  const tolMm = thresholdPx / pixelsPerMm

  // Shift locks horizontal or vertical axis from previousPoint
  if (shiftKey && previousPoint) {
    const dx = Math.abs(cursor.x - previousPoint.x)
    const dy = Math.abs(cursor.y - previousPoint.y)
    if (dx >= dy) {
      return {
        pos: { x: cursor.x, y: previousPoint.y },
        glyph: 'horizontal',
        constraints: [{ kind: 'horizontal', refs: [] }],
      }
    } else {
      return {
        pos: { x: previousPoint.x, y: cursor.y },
        glyph: 'vertical',
        constraints: [{ kind: 'vertical', refs: [] }],
      }
    }
  }

  // 1. Existing point (coincident)
  let bestPtDist = Infinity
  let bestPtId: string | undefined
  let bestPtPos: { x: number; y: number } | undefined

  for (const [id, pt] of Object.entries(sketch.points)) {
    const d = Math.hypot(cursor.x - pt.x, cursor.y - pt.y)
    if (d <= tolMm && d < bestPtDist) {
      bestPtDist = d
      bestPtId = id
      bestPtPos = { x: pt.x, y: pt.y }
    }
  }

  if (bestPtId && bestPtPos) {
    return {
      pos: bestPtPos,
      glyph: 'coincident',
      targetId: bestPtId,
      constraints: [{ kind: 'coincident', refs: [bestPtId] }],
    }
  }

  // 1b. Origin snap (0, 0)
  const distToOrigin = Math.hypot(cursor.x, cursor.y)
  if (distToOrigin <= tolMm) {
    return {
      pos: { x: 0, y: 0 },
      glyph: 'coincident',
      constraints: [],
    }
  }

  // 2. Tangent to previous curve end
  if (previousPoint && lastCurveId) {
    const lastCurve = sketch.curves[lastCurveId]
    if (lastCurve) {
      let tangentDir: { x: number; y: number } | null = null
      if (lastCurve.kind === 'line') {
        const a = sketch.points[lastCurve.a]
        const b = sketch.points[lastCurve.b]
        if (a && b) {
          const ldx = b.x - a.x
          const ldy = b.y - a.y
          const len = Math.hypot(ldx, ldy) || 1
          tangentDir = { x: ldx / len, y: ldy / len }
        }
      } else if (lastCurve.kind === 'arc') {
        const c = sketch.points[lastCurve.c]
        const b = sketch.points[lastCurve.b]
        if (c && b) {
          // Tangent at CCW arc endpoint b: perpendicular to (b - c)
          const rx = b.x - c.x
          const ry = b.y - c.y
          const r = Math.hypot(rx, ry) || 1
          tangentDir = { x: -ry / r, y: rx / r }
        }
      }

      if (tangentDir) {
        const vX = cursor.x - previousPoint.x
        const vY = cursor.y - previousPoint.y
        const proj = vX * tangentDir.x + vY * tangentDir.y
        if (proj > 0) {
          const perpX = vX - proj * tangentDir.x
          const perpY = vY - proj * tangentDir.y
          const perpDist = Math.hypot(perpX, perpY)
          if (perpDist <= tolMm) {
            return {
              pos: {
                x: previousPoint.x + proj * tangentDir.x,
                y: previousPoint.y + proj * tangentDir.y,
              },
              glyph: 'tangent',
              targetId: lastCurveId,
              constraints: [{ kind: 'tangent', refs: [lastCurveId] }],
            }
          }
        }
      }
    }
  }

  // 3. Midpoint of existing curves
  for (const [id, c] of Object.entries(sketch.curves)) {
    if (c.kind === 'line') {
      const a = sketch.points[c.a]
      const b = sketch.points[c.b]
      if (a && b) {
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const d = Math.hypot(cursor.x - mx, cursor.y - my)
        if (d <= tolMm) {
          return {
            pos: { x: mx, y: my },
            glyph: 'midpoint',
            targetId: id,
            constraints: [{ kind: 'midpoint', refs: [id] }],
          }
        }
      }
    }
  }

  // 4. Point on curve
  for (const [id, c] of Object.entries(sketch.curves)) {
    if (c.kind === 'line') {
      const a = sketch.points[c.a]
      const b = sketch.points[c.b]
      if (a && b) {
        const dx = b.x - a.x
        const dy = b.y - a.y
        const lenSq = dx * dx + dy * dy
        if (lenSq > 1e-9) {
          const t = Math.max(0, Math.min(1, ((cursor.x - a.x) * dx + (cursor.y - a.y) * dy) / lenSq))
          const projX = a.x + t * dx
          const projY = a.y + t * dy
          const d = Math.hypot(cursor.x - projX, cursor.y - projY)
          if (d <= tolMm) {
            return {
              pos: { x: projX, y: projY },
              glyph: 'pointOnCurve',
              targetId: id,
              constraints: [{ kind: 'pointOnLine', refs: [id] }],
            }
          }
        }
      }
    } else if (c.kind === 'circle') {
      const center = sketch.points[c.c]
      if (center) {
        const dx = cursor.x - center.x
        const dy = cursor.y - center.y
        const dist = Math.hypot(dx, dy)
        if (Math.abs(dist - c.r) <= tolMm && dist > 1e-9) {
          const factor = c.r / dist
          return {
            pos: { x: center.x + dx * factor, y: center.y + dy * factor },
            glyph: 'pointOnCurve',
            targetId: id,
            constraints: [{ kind: 'pointOnCircle', refs: [id] }],
          }
        }
      }
    }
  }

  // 5. Horizontal / Vertical alignment with previousPoint
  if (previousPoint) {
    const dx = Math.abs(cursor.x - previousPoint.x)
    const dy = Math.abs(cursor.y - previousPoint.y)

    // Horizontal alignment
    if (dy <= tolMm || (dx > 0 && Math.atan2(dy, dx) <= (3 * Math.PI) / 180)) {
      return {
        pos: { x: cursor.x, y: previousPoint.y },
        glyph: 'horizontal',
        constraints: [{ kind: 'horizontal', refs: [] }],
      }
    }

    // Vertical alignment
    if (dx <= tolMm || (dy > 0 && Math.atan2(dx, dy) <= (3 * Math.PI) / 180)) {
      return {
        pos: { x: previousPoint.x, y: cursor.y },
        glyph: 'vertical',
        constraints: [{ kind: 'vertical', refs: [] }],
      }
    }
  }

  // 6. Grid snap
  if (gridStep > 0) {
    const gx = Math.round(cursor.x / gridStep) * gridStep
    const gy = Math.round(cursor.y / gridStep) * gridStep
    const d = Math.hypot(cursor.x - gx, cursor.y - gy)
    if (d <= tolMm) {
      return {
        pos: { x: gx, y: gy },
        glyph: 'grid',
        constraints: [],
      }
    }
  }

  return { pos: { ...cursor }, constraints: [] }
}
