import { log } from '../../app/activityLog'
import type { Sketch, SketchPoint, Curve, Constraint } from './model'
import { normalizeFaceFrame, type PlaneDefinition } from './plane'
import { normalizeFaceRef } from '../../geometry/topology/reference'
import { solve } from './solver'

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const KNOWN_PLANES = new Set(['XY', 'XZ', 'YZ'])

export function migrateSketch(raw: unknown): Sketch | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const s = raw as Record<string, unknown>
  const id = typeof s.id === 'string' && s.id ? s.id : crypto.randomUUID()
  const name = typeof s.name === 'string' && s.name ? s.name : 'Sketch'
  const visible = typeof s.visible === 'boolean' ? s.visible : true

  // Normalise plane: either a base plane or a plane attached to a face.
  const rawPlane = (s.plane && typeof s.plane === 'object' ? s.plane : {}) as Record<string, unknown>
  let plane: PlaneDefinition
  const faceRef = normalizeFaceRef(rawPlane.face)
  const faceFrame = normalizeFaceFrame(rawPlane.frame)
  if (faceRef && faceFrame) {
    plane = { face: faceRef, frame: faceFrame }
  } else {
    const basePlane = KNOWN_PLANES.has(rawPlane.base as string)
      ? (rawPlane.base as 'XY' | 'XZ' | 'YZ')
      : 'XY'
    plane = { base: basePlane, offset: num(rawPlane.offset, 0) }
  }

  // Normalise points
  const rawPoints = (s.points && typeof s.points === 'object' ? s.points : {}) as Record<string, unknown>
  const points: Record<string, SketchPoint> = {}
  for (const [ptId, ptRaw] of Object.entries(rawPoints)) {
    if (!ptRaw || typeof ptRaw !== 'object') continue
    const p = ptRaw as Record<string, unknown>
    points[ptId] = {
      x: num(p.x, 0),
      y: num(p.y, 0),
      fixed: typeof p.fixed === 'boolean' ? p.fixed : undefined,
    }
  }

  // Normalise curves
  const rawCurves = (s.curves && typeof s.curves === 'object' ? s.curves : {}) as Record<string, unknown>
  const curves: Record<string, Curve> = {}
  for (const [cId, cRaw] of Object.entries(rawCurves)) {
    if (!cRaw || typeof cRaw !== 'object') continue
    const c = cRaw as Record<string, unknown>
    const construction = typeof c.construction === 'boolean' ? c.construction : undefined

    if (c.kind === 'line') {
      if (typeof c.a === 'string' && points[c.a] && typeof c.b === 'string' && points[c.b]) {
        curves[cId] = {
          id: cId,
          kind: 'line',
          a: c.a,
          b: c.b,
          construction,
        }
      }
    } else if (c.kind === 'circle') {
      if (typeof c.c === 'string' && points[c.c]) {
        curves[cId] = {
          id: cId,
          kind: 'circle',
          c: c.c,
          r: Math.max(1e-4, num(c.r, 1)),
          construction,
        }
      }
    } else if (c.kind === 'arc') {
      if (
        typeof c.c === 'string' &&
        points[c.c] &&
        typeof c.a === 'string' &&
        points[c.a] &&
        typeof c.b === 'string' &&
        points[c.b]
      ) {
        curves[cId] = {
          id: cId,
          kind: 'arc',
          c: c.c,
          a: c.a,
          b: c.b,
          construction,
        }
      }
    }
  }

  // Normalise constraints: drop constraints referencing missing point or curve IDs
  const rawConstraints = Array.isArray(s.constraints) ? s.constraints : []
  const constraints: Constraint[] = []

  for (const conRaw of rawConstraints) {
    if (!conRaw || typeof conRaw !== 'object') continue
    const con = conRaw as Record<string, unknown>
    const conId = typeof con.id === 'string' && con.id ? con.id : crypto.randomUUID()
    const kind = typeof con.kind === 'string' ? (con.kind as Constraint['kind']) : null
    if (!kind) continue

    const rawRefs = Array.isArray(con.refs) ? con.refs : []
    const validRefs: string[] = []
    let hasMissingRef = false

    for (const ref of rawRefs) {
      if (typeof ref === 'string' && (points[ref] || curves[ref])) {
        validRefs.push(ref)
      } else {
        hasMissingRef = true
        log.warn('storage', 'log.editor.sketch.missingConstraintRef', { constraintId: conId, ref: String(ref) })
      }
    }

    if (hasMissingRef || validRefs.length === 0) {
      continue
    }

    const value = con.value !== undefined ? num(con.value, 0) : undefined
    const variant = con.variant === 'dx' || con.variant === 'dy' ? con.variant : undefined

    constraints.push({
      id: conId,
      kind,
      refs: validRefs,
      value,
      variant,
    })
  }

  let sketch: Sketch = {
    id,
    name,
    plane,
    visible,
    points,
    curves,
    constraints,
  }

  // Re-solve on load when positions disagree with constraints by > 1e-6
  const solveRes = solve(sketch)
  if (solveRes.ok) {
    let moved = false
    for (const [ptId, pos] of Object.entries(solveRes.positions)) {
      const orig = sketch.points[ptId]
      if (orig && Math.hypot(pos.x - orig.x, pos.y - orig.y) > 1e-6) {
        moved = true
        break
      }
    }
    if (!moved) {
      for (const [cId, r] of Object.entries(solveRes.circleRadii)) {
        const c = sketch.curves[cId]
        if (c && c.kind === 'circle' && Math.abs(r - c.r) > 1e-6) {
          moved = true
          break
        }
      }
    }

    if (moved) {
      const nextPoints = { ...sketch.points }
      for (const [ptId, pos] of Object.entries(solveRes.positions)) {
        if (nextPoints[ptId]) {
          nextPoints[ptId] = { ...nextPoints[ptId], x: pos.x, y: pos.y }
        }
      }
      const nextCurves = { ...sketch.curves }
      for (const [cId, r] of Object.entries(solveRes.circleRadii)) {
        const c = nextCurves[cId]
        if (c && c.kind === 'circle') {
          nextCurves[cId] = { ...c, r }
        }
      }
      sketch = {
        ...sketch,
        points: nextPoints,
        curves: nextCurves,
      }
    }
  }

  return sketch
}

export function migrateSketches(raw: unknown): Sketch[] {
  if (!Array.isArray(raw)) return []
  const sketches: Sketch[] = []
  for (const item of raw) {
    const s = migrateSketch(item)
    if (s) sketches.push(s)
  }
  return sketches
}
