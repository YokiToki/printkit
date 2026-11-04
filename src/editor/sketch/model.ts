export type BasePlane = 'XY' | 'XZ' | 'YZ'

export interface PlaneDefinition {
  base: BasePlane
  offset: number
}

export interface PlaneFrame {
  origin: [number, number, number]
  normal: [number, number, number]
  xDir: [number, number, number]
  yDir: [number, number, number]
  toWorld: (p: [number, number]) => [number, number, number]
  toPlane: (p: [number, number, number]) => [number, number]
}

export function planeFrame(def: PlaneDefinition): PlaneFrame {
  let origin: [number, number, number]
  let normal: [number, number, number]
  let xDir: [number, number, number]
  let yDir: [number, number, number]

  if (def.base === 'XY') {
    origin = [0, 0, def.offset]
    normal = [0, 0, 1]
    xDir = [1, 0, 0]
    yDir = [0, 1, 0]
  } else if (def.base === 'XZ') {
    origin = [0, def.offset, 0]
    normal = [0, -1, 0]
    xDir = [1, 0, 0]
    yDir = [0, 0, 1]
  } else {
    // 'YZ'
    origin = [def.offset, 0, 0]
    normal = [1, 0, 0]
    xDir = [0, 1, 0]
    yDir = [0, 0, 1]
  }

  const toWorld = (p: [number, number]): [number, number, number] => [
    origin[0] + p[0] * xDir[0] + p[1] * yDir[0],
    origin[1] + p[0] * xDir[1] + p[1] * yDir[1],
    origin[2] + p[0] * xDir[2] + p[1] * yDir[2],
  ]

  const toPlane = (p: [number, number, number]): [number, number] => {
    const dx = p[0] - origin[0]
    const dy = p[1] - origin[1]
    const dz = p[2] - origin[2]
    return [
      dx * xDir[0] + dy * xDir[1] + dz * xDir[2],
      dx * yDir[0] + dy * yDir[1] + dz * yDir[2],
    ]
  }

  return { origin, normal, xDir, yDir, toWorld, toPlane }
}

export interface SketchPoint {
  x: number
  y: number
  fixed?: boolean
}

export interface LineCurve {
  id: string
  kind: 'line'
  a: string
  b: string
  construction?: boolean
}

export interface CircleCurve {
  id: string
  kind: 'circle'
  c: string
  r: number
  construction?: boolean
}

export interface ArcCurve {
  id: string
  kind: 'arc'
  c: string
  a: string
  b: string
  construction?: boolean
}

export type Curve = LineCurve | CircleCurve | ArcCurve

export type ConstraintKind =
  | 'coincident'
  | 'pointOnLine'
  | 'pointOnCircle'
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'tangent'
  | 'equal'
  | 'symmetric'
  | 'midpoint'
  | 'fixed'
  | 'distance'
  | 'radius'
  | 'diameter'
  | 'angle'

export interface Constraint {
  id: string
  kind: ConstraintKind
  refs: string[] // point IDs or curve IDs
  value?: number // dimension values in mm (or radians for angle)
  variant?: 'dx' | 'dy'
}

export interface Sketch {
  id: string
  name: string
  plane: PlaneDefinition
  visible: boolean
  points: Record<string, SketchPoint>
  curves: Record<string, Curve>
  constraints: Constraint[]
}

let nextIdCounter = 1

export function resetIdCounter(val = 1) {
  nextIdCounter = val
}

export function newId(prefix = 'id'): string {
  return `${prefix}_${nextIdCounter++}_${Math.random().toString(36).slice(2, 7)}`
}

export function createSketch(name: string, plane: PlaneDefinition = { base: 'XY', offset: 0 }): Sketch {
  return {
    id: newId('sketch'),
    name,
    plane,
    visible: true,
    points: {},
    curves: {},
    constraints: [],
  }
}

export function addPoint(sketch: Sketch, x: number, y: number, fixed?: boolean): { sketch: Sketch; pointId: string } {
  const pointId = newId('pt')
  return {
    sketch: {
      ...sketch,
      points: {
        ...sketch.points,
        [pointId]: { x, y, fixed },
      },
    },
    pointId,
  }
}

export function addLine(
  sketch: Sketch,
  p1: { x: number; y: number } | string,
  p2: { x: number; y: number } | string,
  construction = false,
): { sketch: Sketch; curveId: string; p1Id: string; p2Id: string } {
  let s = sketch
  let p1Id: string
  let p2Id: string

  if (typeof p1 === 'string') {
    p1Id = p1
  } else {
    const res = addPoint(s, p1.x, p1.y)
    s = res.sketch
    p1Id = res.pointId
  }

  if (typeof p2 === 'string') {
    p2Id = p2
  } else {
    const res = addPoint(s, p2.x, p2.y)
    s = res.sketch
    p2Id = res.pointId
  }

  const curveId = newId('c')
  const curve: LineCurve = {
    id: curveId,
    kind: 'line',
    a: p1Id,
    b: p2Id,
    construction,
  }

  return {
    sketch: {
      ...s,
      curves: { ...s.curves, [curveId]: curve },
    },
    curveId,
    p1Id,
    p2Id,
  }
}

export function addCircle(
  sketch: Sketch,
  center: { x: number; y: number } | string,
  r: number,
  construction = false,
): { sketch: Sketch; curveId: string; centerId: string } {
  let s = sketch
  let centerId: string

  if (typeof center === 'string') {
    centerId = center
  } else {
    const res = addPoint(s, center.x, center.y)
    s = res.sketch
    centerId = res.pointId
  }

  const curveId = newId('c')
  const curve: CircleCurve = {
    id: curveId,
    kind: 'circle',
    c: centerId,
    r,
    construction,
  }

  return {
    sketch: {
      ...s,
      curves: { ...s.curves, [curveId]: curve },
    },
    curveId,
    centerId,
  }
}

export function addArc(
  sketch: Sketch,
  center: { x: number; y: number } | string,
  start: { x: number; y: number } | string,
  end: { x: number; y: number } | string,
  construction = false,
): { sketch: Sketch; curveId: string; centerId: string; startId: string; endId: string } {
  let s = sketch
  let centerId: string
  let startId: string
  let endId: string

  if (typeof center === 'string') {
    centerId = center
  } else {
    const res = addPoint(s, center.x, center.y)
    s = res.sketch
    centerId = res.pointId
  }

  if (typeof start === 'string') {
    startId = start
  } else {
    const res = addPoint(s, start.x, start.y)
    s = res.sketch
    startId = res.pointId
  }

  if (typeof end === 'string') {
    endId = end
  } else {
    const res = addPoint(s, end.x, end.y)
    s = res.sketch
    endId = res.pointId
  }

  const curveId = newId('c')
  const curve: ArcCurve = {
    id: curveId,
    kind: 'arc',
    c: centerId,
    a: startId,
    b: endId,
    construction,
  }

  return {
    sketch: {
      ...s,
      curves: { ...s.curves, [curveId]: curve },
    },
    curveId,
    centerId,
    startId,
    endId,
  }
}

/**
 * Merges point keepId and dropId, updating all curve and constraint references
 * to use keepId, and deletes dropId.
 */
export function mergePoints(sketch: Sketch, keepId: string, dropId: string): Sketch {
  if (keepId === dropId || !sketch.points[keepId] || !sketch.points[dropId]) return sketch

  const nextPoints = { ...sketch.points }
  delete nextPoints[dropId]

  const nextCurves: Record<string, Curve> = {}
  for (const [id, c] of Object.entries(sketch.curves)) {
    if (c.kind === 'line') {
      nextCurves[id] = {
        ...c,
        a: c.a === dropId ? keepId : c.a,
        b: c.b === dropId ? keepId : c.b,
      }
    } else if (c.kind === 'circle') {
      nextCurves[id] = {
        ...c,
        c: c.c === dropId ? keepId : c.c,
      }
    } else if (c.kind === 'arc') {
      nextCurves[id] = {
        ...c,
        c: c.c === dropId ? keepId : c.c,
        a: c.a === dropId ? keepId : c.a,
        b: c.b === dropId ? keepId : c.b,
      }
    }
  }

  const nextConstraints: Constraint[] = []
  for (const con of sketch.constraints) {
    const replacedRefs = con.refs.map(r => (r === dropId ? keepId : r))
    // Filter duplicate refs if any
    const uniqueRefs = [...new Set(replacedRefs)]
    if (con.kind === 'coincident' && uniqueRefs.length < 2) {
      // Coincident on same point is redundant / satisfied
      continue
    }
    nextConstraints.push({ ...con, refs: replacedRefs })
  }

  return {
    ...sketch,
    points: nextPoints,
    curves: nextCurves,
    constraints: nextConstraints,
  }
}

/**
 * Removes a curve from the sketch, cleans up orphaned points (points not referenced
 * by any other curve) and dangling constraints that reference the removed curve or points.
 */
export function removeCurve(sketch: Sketch, curveId: string): Sketch {
  if (!sketch.curves[curveId]) return sketch

  const nextCurves = { ...sketch.curves }
  delete nextCurves[curveId]

  // Find all points still referenced by remaining curves
  const usedPoints = new Set<string>()
  for (const c of Object.values(nextCurves)) {
    if (c.kind === 'line') {
      usedPoints.add(c.a)
      usedPoints.add(c.b)
    } else if (c.kind === 'circle') {
      usedPoints.add(c.c)
    } else if (c.kind === 'arc') {
      usedPoints.add(c.c)
      usedPoints.add(c.a)
      usedPoints.add(c.b)
    }
  }

  // Remove orphaned points
  const nextPoints: Record<string, SketchPoint> = {}
  const removedPoints = new Set<string>()
  for (const [ptId, pt] of Object.entries(sketch.points)) {
    if (usedPoints.has(ptId)) {
      nextPoints[ptId] = pt
    } else {
      removedPoints.add(ptId)
    }
  }

  // Clean dangling constraints referencing removed curve or removed points
  const nextConstraints = sketch.constraints.filter(con => {
    if (con.refs.includes(curveId)) return false
    for (const ref of con.refs) {
      if (removedPoints.has(ref)) return false
    }
    return true
  })

  return {
    ...sketch,
    points: nextPoints,
    curves: nextCurves,
    constraints: nextConstraints,
  }
}
