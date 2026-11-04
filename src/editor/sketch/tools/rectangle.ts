import {
  type Sketch,
  addLine,
  addArc,
  newId,
} from '../model'

export interface RectangleArgs {
  p1: { x: number; y: number }
  p2: { x: number; y: number }
  cornerRadius?: number
  widthDim?: number
  heightDim?: number
  isCenter?: boolean
}

export function rectangleMacro(sketch: Sketch, args: RectangleArgs): { sketch: Sketch; createdCurves: string[] } {
  let s = sketch
  const createdCurves: string[] = []

  let minX: number, maxX: number, minY: number, maxY: number
  if (args.isCenter) {
    const halfW = Math.abs(args.p2.x - args.p1.x)
    const halfH = Math.abs(args.p2.y - args.p1.y)
    minX = args.p1.x - halfW
    maxX = args.p1.x + halfW
    minY = args.p1.y - halfH
    maxY = args.p1.y + halfH
  } else {
    minX = Math.min(args.p1.x, args.p2.x)
    maxX = Math.max(args.p1.x, args.p2.x)
    minY = Math.min(args.p1.y, args.p2.y)
    maxY = Math.max(args.p1.y, args.p2.y)
  }

  const r = args.cornerRadius ?? 0
  const maxAllowedR = Math.min((maxX - minX) / 2, (maxY - minY) / 2)
  const radius = r > 0 ? Math.min(r, maxAllowedR * 0.999) : 0

  if (radius <= 0) {
    // Sharp rectangle
    // Corners: bottom-left (p0), bottom-right (p1), top-right (p2), top-left (p3)
    const l1 = addLine(s, { x: minX, y: minY }, { x: maxX, y: minY })
    s = l1.sketch
    const l2 = addLine(s, l1.p2Id, { x: maxX, y: maxY })
    s = l2.sketch
    const l3 = addLine(s, l2.p2Id, { x: minX, y: maxY })
    s = l3.sketch
    const l4 = addLine(s, l3.p2Id, l1.p1Id)
    s = l4.sketch

    createdCurves.push(l1.curveId, l2.curveId, l3.curveId, l4.curveId)

    s.constraints.push(
      { id: newId('con'), kind: 'horizontal', refs: [l1.curveId] },
      { id: newId('con'), kind: 'vertical', refs: [l2.curveId] },
      { id: newId('con'), kind: 'horizontal', refs: [l3.curveId] },
      { id: newId('con'), kind: 'vertical', refs: [l4.curveId] },
    )

    if (args.widthDim !== undefined) {
      s.constraints.push({ id: newId('con'), kind: 'distance', refs: [l1.curveId], value: args.widthDim })
    }
    if (args.heightDim !== undefined) {
      s.constraints.push({ id: newId('con'), kind: 'distance', refs: [l2.curveId], value: args.heightDim })
    }

    return { sketch: s, createdCurves }
  }

  // Rounded rectangle with 4 lines and 4 tangent corner arcs
  // Bottom line
  const lBottom = addLine(s, { x: minX + radius, y: minY }, { x: maxX - radius, y: minY })
  s = lBottom.sketch
  // Bottom-right arc
  const arcBR = addArc(s, { x: maxX - radius, y: minY + radius }, lBottom.p2Id, { x: maxX, y: minY + radius })
  s = arcBR.sketch

  // Right line
  const lRight = addLine(s, arcBR.endId, { x: maxX, y: maxY - radius })
  s = lRight.sketch
  // Top-right arc
  const arcTR = addArc(s, { x: maxX - radius, y: maxY - radius }, lRight.p2Id, { x: maxX - radius, y: maxY })
  s = arcTR.sketch

  // Top line
  const lTop = addLine(s, arcTR.endId, { x: minX + radius, y: maxY })
  s = lTop.sketch
  // Top-left arc
  const arcTL = addArc(s, { x: minX + radius, y: maxY - radius }, lTop.p2Id, { x: minX, y: maxY - radius })
  s = arcTL.sketch

  // Left line
  const lLeft = addLine(s, arcTL.endId, { x: minX, y: minY + radius })
  s = lLeft.sketch
  // Bottom-left arc
  const arcBL = addArc(s, { x: minX + radius, y: minY + radius }, lLeft.p2Id, lBottom.p1Id)
  s = arcBL.sketch

  createdCurves.push(
    lBottom.curveId,
    arcBR.curveId,
    lRight.curveId,
    arcTR.curveId,
    lTop.curveId,
    arcTL.curveId,
    lLeft.curveId,
    arcBL.curveId,
  )

  // Tangencies
  s.constraints.push(
    { id: newId('con'), kind: 'horizontal', refs: [lBottom.curveId] },
    { id: newId('con'), kind: 'vertical', refs: [lRight.curveId] },
    { id: newId('con'), kind: 'horizontal', refs: [lTop.curveId] },
    { id: newId('con'), kind: 'vertical', refs: [lLeft.curveId] },
    { id: newId('con'), kind: 'tangent', refs: [lBottom.curveId, arcBR.curveId] },
    { id: newId('con'), kind: 'tangent', refs: [lRight.curveId, arcBR.curveId] },
    { id: newId('con'), kind: 'tangent', refs: [lRight.curveId, arcTR.curveId] },
    { id: newId('con'), kind: 'tangent', refs: [lTop.curveId, arcTR.curveId] },
    { id: newId('con'), kind: 'tangent', refs: [lTop.curveId, arcTL.curveId] },
    { id: newId('con'), kind: 'tangent', refs: [lLeft.curveId, arcTL.curveId] },
    { id: newId('con'), kind: 'tangent', refs: [lLeft.curveId, arcBL.curveId] },
    { id: newId('con'), kind: 'tangent', refs: [lBottom.curveId, arcBL.curveId] },
    // Radius driving dimension on one arc, and equal radius on other 3
    { id: newId('con'), kind: 'radius', refs: [arcBR.curveId], value: radius },
    { id: newId('con'), kind: 'equal', refs: [arcBR.curveId, arcTR.curveId] },
    { id: newId('con'), kind: 'equal', refs: [arcBR.curveId, arcTL.curveId] },
    { id: newId('con'), kind: 'equal', refs: [arcBR.curveId, arcBL.curveId] },
  )

  if (args.widthDim !== undefined) {
    s.constraints.push({ id: newId('con'), kind: 'distance', refs: [lBottom.p1Id, lBottom.p2Id], value: args.widthDim - 2 * radius })
  }
  if (args.heightDim !== undefined) {
    s.constraints.push({ id: newId('con'), kind: 'distance', refs: [lRight.p1Id, lRight.p2Id], value: args.heightDim - 2 * radius })
  }

  return { sketch: s, createdCurves }
}
