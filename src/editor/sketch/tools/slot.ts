import {
  type Sketch,
  addLine,
  addArc,
  newId,
} from '../model'

export interface SlotArgs {
  p1: { x: number; y: number } // center of first arc
  p2: { x: number; y: number } // center of second arc
  width: number // diameter of ends
}

export function slotMacro(sketch: Sketch, args: SlotArgs): { sketch: Sketch; createdCurves: string[] } {
  let s = sketch
  const createdCurves: string[] = []
  const radius = Math.max(0.1, args.width / 2)

  const dx = args.p2.x - args.p1.x
  const dy = args.p2.y - args.p1.y
  const len = Math.hypot(dx, dy) || 1e-6
  const ux = dx / len
  const uy = dy / len
  // Normal vector: (-uy, ux)
  const nx = -uy
  const ny = ux

  // Arc 1 center = p1. Arc 2 center = p2.
  // Top line: from p1 + n*r to p2 + n*r
  // Bottom line: from p2 - n*r to p1 - n*r
  const l1Start = { x: args.p1.x + nx * radius, y: args.p1.y + ny * radius }
  const l1End = { x: args.p2.x + nx * radius, y: args.p2.y + ny * radius }
  const l2Start = { x: args.p2.x - nx * radius, y: args.p2.y - ny * radius }
  const l2End = { x: args.p1.x - nx * radius, y: args.p1.y - ny * radius }

  const top = addLine(s, l1Start, l1End)
  s = top.sketch
  const rightArc = addArc(s, args.p2, top.p2Id, l2Start)
  s = rightArc.sketch
  const bottom = addLine(s, rightArc.endId, l2End)
  s = bottom.sketch
  const leftArc = addArc(s, args.p1, bottom.p2Id, top.p1Id)
  s = leftArc.sketch

  createdCurves.push(top.curveId, rightArc.curveId, bottom.curveId, leftArc.curveId)

  s.constraints.push(
    { id: newId('con'), kind: 'tangent', refs: [top.curveId, rightArc.curveId] },
    { id: newId('con'), kind: 'tangent', refs: [bottom.curveId, rightArc.curveId] },
    { id: newId('con'), kind: 'tangent', refs: [bottom.curveId, leftArc.curveId] },
    { id: newId('con'), kind: 'tangent', refs: [top.curveId, leftArc.curveId] },
    { id: newId('con'), kind: 'equal', refs: [rightArc.curveId, leftArc.curveId] },
    { id: newId('con'), kind: 'radius', refs: [rightArc.curveId], value: radius },
    { id: newId('con'), kind: 'distance', refs: [top.p1Id, top.p2Id], value: len },
  )

  return { sketch: s, createdCurves }
}
