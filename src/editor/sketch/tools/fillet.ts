import {
  type Sketch,
  type LineCurve,
  addArc,
  newId,
} from '../model'

export interface FilletArgs {
  line1Id: string
  line2Id: string
  cornerPtId: string
  radius: number
}

export interface FilletResult {
  sketch: Sketch
  arcId?: string
  error?: string
  maxRadius?: number
}

export function filletMacro(sketch: Sketch, args: FilletArgs): FilletResult {
  const l1 = sketch.curves[args.line1Id] as LineCurve | undefined
  const l2 = sketch.curves[args.line2Id] as LineCurve | undefined
  if (!l1 || !l2 || l1.kind !== 'line' || l2.kind !== 'line') {
    return { sketch, error: 'sketch.error.invalidSelection' }
  }

  const corner = sketch.points[args.cornerPtId]
  if (!corner) return { sketch, error: 'sketch.error.invalidSelection' }

  // Identify other endpoints of line 1 and line 2
  const other1Id = l1.a === args.cornerPtId ? l1.b : l1.a
  const other2Id = l2.a === args.cornerPtId ? l2.b : l2.a
  const other1 = sketch.points[other1Id]
  const other2 = sketch.points[other2Id]
  if (!other1 || !other2) return { sketch, error: 'sketch.error.invalidSelection' }

  // Vectors from corner towards other endpoints
  const v1x = other1.x - corner.x
  const v1y = other1.y - corner.y
  const len1 = Math.hypot(v1x, v1y)
  const v2x = other2.x - corner.x
  const v2y = other2.y - corner.y
  const len2 = Math.hypot(v2x, v2y)

  if (len1 < 1e-6 || len2 < 1e-6) {
    return { sketch, error: 'sketch.error.degenerateLine' }
  }

  const u1x = v1x / len1
  const u1y = v1y / len1
  const u2x = v2x / len2
  const u2y = v2y / len2

  const dot = u1x * u2x + u1y * u2y
  // Cross product
  const cross = u1x * u2y - u1y * u2x
  if (Math.abs(cross) < 1e-4) {
    // Parallel or anti-parallel lines
    return { sketch, error: 'sketch.error.linesParallel' }
  }

  const angle = Math.acos(Math.max(-1, Math.min(1, dot)))
  // Tangent distance along lines: T = r / tan(angle / 2)
  const tanHalf = Math.tan(angle / 2)
  const maxT = Math.min(len1, len2) * 0.99
  const maxRadius = maxT * tanHalf

  if (args.radius > maxRadius) {
    return {
      sketch,
      error: 'sketch.error.filletTooLarge',
      maxRadius: Math.round(maxRadius * 100) / 100,
    }
  }

  const r = args.radius
  const T = r / tanHalf

  // Tangent points on line1 and line2
  const t1 = { x: corner.x + u1x * T, y: corner.y + u1y * T }
  const t2 = { x: corner.x + u2x * T, y: corner.y + u2y * T }

  // Bisector vector
  const bx = u1x + u2x
  const by = u1y + u2y
  const bLen = Math.hypot(bx, by)
  const ubx = bx / bLen
  const uby = by / bLen
  const centerDist = r / Math.sin(angle / 2)
  const center = { x: corner.x + ubx * centerDist, y: corner.y + uby * centerDist }

  let s = { ...sketch, points: { ...sketch.points }, curves: { ...sketch.curves }, constraints: [...sketch.constraints] }

  // Add tangent points
  const t1Id = newId('pt')
  const t2Id = newId('pt')
  s.points[t1Id] = t1
  s.points[t2Id] = t2

  // Shorten line1: replace corner endpoint with t1Id
  s.curves[args.line1Id] = {
    ...l1,
    a: l1.a === args.cornerPtId ? t1Id : l1.a,
    b: l1.b === args.cornerPtId ? t1Id : l1.b,
  }

  // Shorten line2: replace corner endpoint with t2Id
  s.curves[args.line2Id] = {
    ...l2,
    a: l2.a === args.cornerPtId ? t2Id : l2.a,
    b: l2.b === args.cornerPtId ? t2Id : l2.b,
  }

  // Delete corner point if not used by any other curve
  delete s.points[args.cornerPtId]

  // Add tangent arc: arc goes CCW from start to end
  // Check which orientation is CCW around center
  const cp1x = t1.x - center.x
  const cp1y = t1.y - center.y
  const cp2x = t2.x - center.x
  const cp2y = t2.y - center.y
  const arcCross = cp1x * cp2y - cp1y * cp2x
  const startId = arcCross >= 0 ? t1Id : t2Id
  const endId = arcCross >= 0 ? t2Id : t1Id

  const arc = addArc(s, center, startId, endId)
  s = arc.sketch

  // Add constraints: tangencies to both lines + radius dimension
  s.constraints.push(
    { id: newId('con'), kind: 'tangent', refs: [args.line1Id, arc.curveId] },
    { id: newId('con'), kind: 'tangent', refs: [args.line2Id, arc.curveId] },
    { id: newId('con'), kind: 'radius', refs: [arc.curveId], value: r },
  )

  return { sketch: s, arcId: arc.curveId }
}
