import {
  type Sketch,
  addLine,
  addCircle,
  newId,
} from '../model'

export interface PolygonArgs {
  center: { x: number; y: number }
  radius: number
  sides: number
  inscribed?: boolean
}

export function polygonMacro(sketch: Sketch, args: PolygonArgs): { sketch: Sketch; createdCurves: string[] } {
  let s = sketch
  const createdCurves: string[] = []
  const n = Math.max(3, Math.min(32, Math.round(args.sides)))
  const r = Math.max(0.1, args.radius)

  // Construction circle
  const circ = addCircle(s, args.center, r, true)
  s = circ.sketch
  createdCurves.push(circ.curveId)

  // Vertices around the circle
  const ptIds: string[] = []
  const angleStep = (2 * Math.PI) / n

  for (let i = 0; i < n; i++) {
    const angle = i * angleStep
    const vx = args.center.x + r * Math.cos(angle)
    const vy = args.center.y + r * Math.sin(angle)
    // Add lines directly connecting vertices
    if (i === 0) {
      // First vertex
      const l = addLine(s, { x: vx, y: vy }, { x: args.center.x + r * Math.cos(angleStep), y: args.center.y + r * Math.sin(angleStep) })
      s = l.sketch
      ptIds.push(l.p1Id, l.p2Id)
      createdCurves.push(l.curveId)
    } else if (i < n - 1) {
      const nextX = args.center.x + r * Math.cos((i + 1) * angleStep)
      const nextY = args.center.y + r * Math.sin((i + 1) * angleStep)
      const l = addLine(s, ptIds[ptIds.length - 1], { x: nextX, y: nextY })
      s = l.sketch
      ptIds.push(l.p2Id)
      createdCurves.push(l.curveId)
    } else {
      // Last closing line
      const l = addLine(s, ptIds[ptIds.length - 1], ptIds[0])
      s = l.sketch
      createdCurves.push(l.curveId)
    }
  }

  // Points on circle constraints
  for (const ptId of ptIds) {
    s.constraints.push({
      id: newId('con'),
      kind: 'pointOnCircle',
      refs: [ptId, circ.curveId],
    })
  }

  // Equal length constraints on adjacent lines
  const lineCurves = createdCurves.slice(1) // exclude construction circle
  for (let i = 1; i < lineCurves.length; i++) {
    s.constraints.push({
      id: newId('con'),
      kind: 'equal',
      refs: [lineCurves[0], lineCurves[i]],
    })
  }

  return { sketch: s, createdCurves }
}
