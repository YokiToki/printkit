import {
  type Sketch,
  type LineCurve,
  type CircleCurve,
  type ArcCurve,
  addLine,
  addCircle,
  addArc,
  newId,
} from '../model'

export interface MirrorArgs {
  curveIds: string[]
  axisLineId: string
}

export function mirrorMacro(sketch: Sketch, args: MirrorArgs): { sketch: Sketch; mirroredCurves: string[] } {
  const axis = sketch.curves[args.axisLineId] as LineCurve | undefined
  if (!axis || axis.kind !== 'line') {
    return { sketch, mirroredCurves: [] }
  }

  const axPtA = sketch.points[axis.a]
  const axPtB = sketch.points[axis.b]
  if (!axPtA || !axPtB) return { sketch, mirroredCurves: [] }

  const dx = axPtB.x - axPtA.x
  const dy = axPtB.y - axPtA.y
  const len = Math.hypot(dx, dy) || 1e-9
  const ux = dx / len
  const uy = dy / len
  // Normal to axis
  const nx = -uy
  const ny = ux

  // Reflection formula: P' = P - 2 * ((P - A) . n) * n
  function reflectPoint(p: { x: number; y: number }): { x: number; y: number } {
    const vX = p.x - axPtA.x
    const vY = p.y - axPtA.y
    const dot = vX * nx + vY * ny
    return {
      x: p.x - 2 * dot * nx,
      y: p.y - 2 * dot * ny,
    }
  }

  let s = sketch
  const mirroredCurves: string[] = []
  const oldToNewPtMap = new Map<string, string>()

  function getMirroredPointId(origPtId: string): string {
    if (oldToNewPtMap.has(origPtId)) return oldToNewPtMap.get(origPtId)!
    const origPt = s.points[origPtId]
    const refPt = reflectPoint(origPt)
    const newPtId = newId('pt')
    s = {
      ...s,
      points: {
        ...s.points,
        [newPtId]: refPt,
      },
    }
    oldToNewPtMap.set(origPtId, newPtId)

    // Add symmetric constraint about axis line
    s.constraints.push({
      id: newId('con'),
      kind: 'symmetric',
      refs: [origPtId, newPtId, args.axisLineId],
    })

    return newPtId
  }

  for (const cId of args.curveIds) {
    if (cId === args.axisLineId) continue
    const c = s.curves[cId]
    if (!c) continue

    if (c.kind === 'line') {
      const p1 = getMirroredPointId(c.a)
      const p2 = getMirroredPointId(c.b)
      const ml = addLine(s, p1, p2, c.construction)
      s = ml.sketch
      mirroredCurves.push(ml.curveId)
    } else if (c.kind === 'circle') {
      const center = getMirroredPointId(c.c)
      const mc = addCircle(s, center, c.r, c.construction)
      s = mc.sketch
      mirroredCurves.push(mc.curveId)
    } else if (c.kind === 'arc') {
      const center = getMirroredPointId(c.c)
      // Note: reflection reverses winding direction, so start and end are swapped
      const pA = getMirroredPointId(c.b)
      const pB = getMirroredPointId(c.a)
      const ma = addArc(s, center, pA, pB, c.construction)
      s = ma.sketch
      mirroredCurves.push(ma.curveId)
    }
  }

  return { sketch: s, mirroredCurves }
}
