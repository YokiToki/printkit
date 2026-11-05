import type { ExtrudeParams } from '../geometry/features/extrude'
import type { RevolveParams } from '../geometry/features/revolve'

export type OpKind =
  | 'extrude'
  | 'revolve'
  | 'boolean'
  | 'mirror'
  | 'linearPattern'
  | 'circularPattern'
  | 'offset'
  | 'hollow'
  | (string & {})

export interface BaseOp<K extends string = OpKind, P = Record<string, unknown>> {
  id: string
  kind: K
  params: P
  enabled: boolean
  label?: string
}

export type ExtrudeOp = BaseOp<'extrude', ExtrudeParams>
export type RevolveOp = BaseOp<'revolve', RevolveParams>

export type BooleanMode = 'union' | 'subtract' | 'intersect'

export interface BooleanParams {
  mode: BooleanMode
  tools: string[]
}
export type BooleanOp = BaseOp<'boolean', BooleanParams>

export type MirrorPlane = 'XY' | 'YZ' | 'XZ'
export type MirrorOrigin = 'object' | 'bbox' | number

export interface MirrorParams {
  plane: MirrorPlane
  origin: MirrorOrigin
  merge: boolean
}
export type MirrorOp = BaseOp<'mirror', MirrorParams>

export type Axis3D = 'x' | 'y' | 'z'

export interface LinearPatternParams {
  axis: Axis3D
  count: number
  mode: 'spacing' | 'total'
  step: number
  symmetric: boolean
  merge: boolean
}
export type LinearPatternOp = BaseOp<'linearPattern', LinearPatternParams>

export interface CircularPatternParams {
  axis: Axis3D
  count: number
  angle: number
  merge: boolean
}
export type CircularPatternOp = BaseOp<'circularPattern', CircularPatternParams>

export interface OffsetParams {
  distance: number
}
export type OffsetOp = BaseOp<'offset', OffsetParams>

export interface DrainHole {
  point: [number, number, number]
  normal: [number, number, number]
  diameter: number
}

export interface HollowParams {
  wall: number
  drains?: DrainHole[]
}
export type HollowOp = BaseOp<'hollow', HollowParams>

export interface UnknownOp extends BaseOp<string, Record<string, unknown>> {}

export type Op =
  | ExtrudeOp
  | RevolveOp
  | BooleanOp
  | MirrorOp
  | LinearPatternOp
  | CircularPatternOp
  | OffsetOp
  | HollowOp
  | UnknownOp

export const DEFAULT_BOOLEAN_PARAMS: BooleanParams = {
  mode: 'union',
  tools: [],
}

export const DEFAULT_MIRROR_PARAMS: MirrorParams = {
  plane: 'YZ',
  origin: 'object',
  merge: true,
}

export const DEFAULT_LINEAR_PATTERN_PARAMS: LinearPatternParams = {
  axis: 'x',
  count: 2,
  mode: 'spacing',
  step: 20,
  symmetric: false,
  merge: true,
}

export const DEFAULT_CIRCULAR_PATTERN_PARAMS: CircularPatternParams = {
  axis: 'z',
  count: 4,
  angle: 360,
  merge: true,
}

export const DEFAULT_OFFSET_PARAMS: OffsetParams = {
  distance: 0.2,
}

export const DEFAULT_HOLLOW_PARAMS: HollowParams = {
  wall: 2,
  drains: [],
}

export function emptyStack(): Op[] {
  return []
}

export function normalizeOp(raw: unknown): Op {
  if (!raw || typeof raw !== 'object') {
    return {
      id: crypto.randomUUID(),
      kind: 'unknown',
      params: {},
      enabled: false,
    }
  }

  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' && obj.id ? obj.id : crypto.randomUUID()
  const kind = typeof obj.kind === 'string' ? obj.kind : 'unknown'
  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : true
  const label = typeof obj.label === 'string' ? obj.label : undefined
  const p = obj.params && typeof obj.params === 'object' ? (obj.params as Record<string, unknown>) : {}

  switch (kind) {
    case 'boolean': {
      const mode = p.mode === 'subtract' || p.mode === 'intersect' ? p.mode : 'union'
      const tools = Array.isArray(p.tools) ? p.tools.filter((t): t is string => typeof t === 'string') : []
      return { id, kind, enabled, label, params: { mode, tools } }
    }
    case 'mirror': {
      const plane = p.plane === 'XY' || p.plane === 'XZ' ? p.plane : 'YZ'
      let origin: MirrorOrigin = 'object'
      if (p.origin === 'bbox') origin = 'bbox'
      else if (typeof p.origin === 'number' && Number.isFinite(p.origin)) origin = p.origin
      const merge = typeof p.merge === 'boolean' ? p.merge : true
      return { id, kind, enabled, label, params: { plane, origin, merge } }
    }
    case 'linearPattern': {
      const axis = p.axis === 'y' || p.axis === 'z' ? p.axis : 'x'
      const count = typeof p.count === 'number' && Number.isFinite(p.count) ? Math.max(2, Math.min(200, Math.round(p.count))) : 2
      const mode = p.mode === 'total' ? 'total' : 'spacing'
      const step = typeof p.step === 'number' && Number.isFinite(p.step) ? p.step : 20
      const symmetric = typeof p.symmetric === 'boolean' ? p.symmetric : false
      const merge = typeof p.merge === 'boolean' ? p.merge : true
      return { id, kind, enabled, label, params: { axis, count, mode, step, symmetric, merge } }
    }
    case 'circularPattern': {
      const axis = p.axis === 'x' || p.axis === 'y' ? p.axis : 'z'
      const count = typeof p.count === 'number' && Number.isFinite(p.count) ? Math.max(2, Math.min(200, Math.round(p.count))) : 4
      const angle = typeof p.angle === 'number' && Number.isFinite(p.angle) ? p.angle : 360
      const merge = typeof p.merge === 'boolean' ? p.merge : true
      return { id, kind, enabled, label, params: { axis, count, angle, merge } }
    }
    case 'offset': {
      const distance = typeof p.distance === 'number' && Number.isFinite(p.distance) ? p.distance : 0.2
      return { id, kind, enabled, label, params: { distance } }
    }
    case 'hollow': {
      const wall = typeof p.wall === 'number' && Number.isFinite(p.wall) ? Math.max(0.1, p.wall) : 2
      const drains: DrainHole[] = []
      if (Array.isArray(p.drains)) {
        for (const d of p.drains) {
          if (d && typeof d === 'object') {
            const rawD = d as Record<string, unknown>
            const point: [number, number, number] =
              Array.isArray(rawD.point) && rawD.point.length === 3
                ? [Number(rawD.point[0]), Number(rawD.point[1]), Number(rawD.point[2])]
                : [0, 0, 0]
            const normal: [number, number, number] =
              Array.isArray(rawD.normal) && rawD.normal.length === 3
                ? [Number(rawD.normal[0]), Number(rawD.normal[1]), Number(rawD.normal[2])]
                : [0, 0, 1]
            const diameter = typeof rawD.diameter === 'number' && Number.isFinite(rawD.diameter) ? rawD.diameter : 3
            drains.push({ point, normal, diameter })
          }
        }
      }
      return { id, kind, enabled, label, params: { wall, drains } }
    }
    case 'extrude':
    case 'revolve': {
      return { id, kind, enabled, label, params: p as any }
    }
    default: {
      return { id, kind, enabled, label, params: p }
    }
  }
}

export function addOp(stack: Op[], op: Op, index?: number): Op[] {
  const norm = normalizeOp(op)
  const next = [...stack]
  if (index === undefined || index < 0 || index >= next.length) {
    next.push(norm)
  } else {
    next.splice(index, 0, norm)
  }
  return next
}

export function removeOp(stack: Op[], opId: string): Op[] {
  return stack.filter((op) => op.id !== opId)
}

export function updateOp(stack: Op[], opId: string, patch: Partial<Op>): Op[] {
  return stack.map((op) => {
    if (op.id !== opId) return op
    const merged = { ...op, ...patch }
    if (patch.params) {
      merged.params = { ...op.params, ...patch.params }
    }
    return normalizeOp(merged)
  })
}

export function moveOp(stack: Op[], fromIndex: number, toIndex: number): Op[] {
  if (fromIndex < 0 || fromIndex >= stack.length || toIndex < 0 || toIndex >= stack.length) {
    return stack
  }
  if (fromIndex === toIndex) return stack
  const next = [...stack]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export function toggleOp(stack: Op[], opId: string, enabled?: boolean): Op[] {
  return stack.map((op) => (op.id === opId ? { ...op, enabled: enabled ?? !op.enabled } : op))
}

export function clampRollback(stackLength: number, rollback: number | null | undefined): number | null {
  if (rollback === null || rollback === undefined) return null
  if (rollback <= 0) return 0
  if (rollback >= stackLength) return null
  return rollback
}

export function isKnownOpKind(kind: string): boolean {
  return (
    kind === 'extrude' ||
    kind === 'revolve' ||
    kind === 'boolean' ||
    kind === 'mirror' ||
    kind === 'linearPattern' ||
    kind === 'circularPattern' ||
    kind === 'offset' ||
    kind === 'hollow'
  )
}

export function featureToOp(f: any): Op {
  const id = typeof f.id === 'string' && f.id ? f.id : crypto.randomUUID()
  const sketchId = typeof f.sketch === 'string' ? f.sketch : (typeof f.sketchId === 'string' ? f.sketchId : '')
  if (f.kind === 'extrude') {
    return {
      id,
      kind: 'extrude',
      enabled: true,
      params: {
        sketchId,
        regions: f.regions,
        side: f.side ?? 'one',
        d1: typeof f.d1 === 'number' ? f.d1 : 10,
        d2: f.d2,
        op: f.op ?? 'new',
        top: f.top,
        bottom: f.bottom,
      },
    }
  }
  if (f.kind === 'revolve') {
    const axis =
      f.axis && f.axis.kind === 'line'
        ? { kind: 'line' as const, curveId: f.axis.curveId || f.axis.curve || '' }
        : f.axis ?? { kind: 'planeAxis', axis: 'y' }
    return {
      id,
      kind: 'revolve',
      enabled: true,
      params: {
        sketchId,
        regions: f.regions,
        axis,
        angle: typeof f.angle === 'number' ? f.angle : 360,
        op: f.op ?? 'new',
      },
    }
  }
  return {
    id,
    kind: f.kind ?? 'unknown',
    enabled: false,
    params: f.params ?? {},
  }
}

export function migrateStack(raw: unknown): Op[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const op = normalizeOp(item)
    if (!isKnownOpKind(op.kind)) {
      return { ...op, enabled: false }
    }
    return op
  })
}


export interface OpSummary {
  key: string
  params?: Record<string, string | number>
}

export function opSummary(op: Op): OpSummary {
  switch (op.kind) {
    case 'extrude':
      return { key: 'stack.summary.extrude', params: { d: (op as ExtrudeOp).params.d1 } }
    case 'revolve':
      return { key: 'stack.summary.revolve', params: { angle: (op as RevolveOp).params.angle } }
    case 'boolean': {
      const p = (op as BooleanOp).params
      const count = p.tools.length
      return { key: `stack.summary.boolean.${p.mode}`, params: { count } }
    }
    case 'mirror': {
      const p = (op as MirrorOp).params
      return { key: 'stack.summary.mirror', params: { plane: p.plane } }
    }
    case 'linearPattern': {
      const p = (op as LinearPatternOp).params
      return { key: 'stack.summary.linearPattern', params: { count: p.count, axis: p.axis.toUpperCase() } }
    }
    case 'circularPattern': {
      const p = (op as CircularPatternOp).params
      return { key: 'stack.summary.circularPattern', params: { count: p.count, axis: p.axis.toUpperCase() } }
    }
    case 'offset': {
      const p = (op as OffsetOp).params
      const sign = p.distance >= 0 ? `+${p.distance}` : `${p.distance}`
      return { key: 'stack.summary.offset', params: { distance: `${sign} mm` } }
    }
    case 'hollow': {
      const p = (op as HollowOp).params
      return { key: 'stack.summary.hollow', params: { wall: `${p.wall} mm` } }
    }
    default:
      return { key: 'stack.summary.unknown', params: { kind: op.kind } }
  }
}
