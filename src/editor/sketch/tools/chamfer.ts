import {
  type Sketch,
  type LineCurve,
  addLine,
  newId,
} from '../model'

export interface ChamferArgs {
  line1Id: string
  line2Id: string
  cornerPtId: string
  distance: number
}

export interface ChamferResult {
  sketch: Sketch
  chamferLineId?: string
  error?: string
  maxDistance?: number
}

export function chamferMacro(sketch: Sketch, args: ChamferArgs): ChamferResult {
  const l1 = sketch.curves[args.line1Id] as LineCurve | undefined
  const l2 = sketch.curves[args.line2Id] as LineCurve | undefined
  if (!l1 || !l2 || l1.kind !== 'line' || l2.kind !== 'line') {
    return { sketch, error: 'sketch.error.invalidSelection' }
  }

  const corner = sketch.points[args.cornerPtId]
  if (!corner) return { sketch, error: 'sketch.error.invalidSelection' }

  const other1Id = l1.a === args.cornerPtId ? l1.b : l1.a
  const other2Id = l2.a === args.cornerPtId ? l2.b : l2.a
  const other1 = sketch.points[other1Id]
  const other2 = sketch.points[other2Id]
  if (!other1 || !other2) return { sketch, error: 'sketch.error.invalidSelection' }

  const v1x = other1.x - corner.x
  const v1y = other1.y - corner.y
  const len1 = Math.hypot(v1x, v1y)
  const v2x = other2.x - corner.x
  const v2y = other2.y - corner.y
  const len2 = Math.hypot(v2x, v2y)

  const maxDist = Math.min(len1, len2) * 0.99
  if (args.distance > maxDist) {
    return {
      sketch,
      error: 'sketch.error.chamferTooLarge',
      maxDistance: Math.round(maxDist * 100) / 100,
    }
  }

  const d = args.distance
  const u1x = v1x / len1
  const u1y = v1y / len1
  const u2x = v2x / len2
  const u2y = v2y / len2

  const t1 = { x: corner.x + u1x * d, y: corner.y + u1y * d }
  const t2 = { x: corner.x + u2x * d, y: corner.y + u2y * d }

  let s = { ...sketch, points: { ...sketch.points }, curves: { ...sketch.curves }, constraints: [...sketch.constraints] }

  const t1Id = newId('pt')
  const t2Id = newId('pt')
  s.points[t1Id] = t1
  s.points[t2Id] = t2

  // Shorten lines
  s.curves[args.line1Id] = {
    ...l1,
    a: l1.a === args.cornerPtId ? t1Id : l1.a,
    b: l1.b === args.cornerPtId ? t1Id : l1.b,
  }
  s.curves[args.line2Id] = {
    ...l2,
    a: l2.a === args.cornerPtId ? t2Id : l2.a,
    b: l2.b === args.cornerPtId ? t2Id : l2.b,
  }

  delete s.points[args.cornerPtId]

  // Add chamfer line
  const ch = addLine(s, t1Id, t2Id)
  s = ch.sketch

  // Add distance constraints for the chamfer setbacks
  s.constraints.push(
    { id: newId('con'), kind: 'distance', refs: [t1Id, t2Id], value: Math.hypot(t2.x - t1.x, t2.y - t1.y) },
  )

  return { sketch: s, chamferLineId: ch.curveId }
}
