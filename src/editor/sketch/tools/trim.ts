import {
  type Sketch,
  type LineCurve,
  addLine,
  removeCurve,
} from '../model'

export interface TrimArgs {
  curveId: string
  clickPt: { x: number; y: number }
}

export function trimMacro(sketch: Sketch, args: TrimArgs): { sketch: Sketch; trimmed: boolean } {
  const targetCurve = sketch.curves[args.curveId]
  if (!targetCurve || targetCurve.kind !== 'line') {
    return { sketch, trimmed: false }
  }

  const pA = sketch.points[targetCurve.a]
  const pB = sketch.points[targetCurve.b]
  if (!pA || !pB) return { sketch, trimmed: false }

  const dx = pB.x - pA.x
  const dy = pB.y - pA.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return { sketch, trimmed: false }

  // Find intersections with all other curves
  const cutParams: number[] = [0, 1]

  for (const [id, c] of Object.entries(sketch.curves)) {
    if (id === args.curveId) continue

    if (c.kind === 'line') {
      const cA = sketch.points[c.a]
      const cB = sketch.points[c.b]
      if (cA && cB) {
        // Line-line intersection
        const cdx = cB.x - cA.x
        const cdy = cB.y - cA.y
        const denom = dx * cdy - dy * cdx
        if (Math.abs(denom) > 1e-6) {
          const t1 = ((cA.x - pA.x) * cdy - (cA.y - pA.y) * cdx) / denom
          const t2 = ((cA.x - pA.x) * dy - (cA.y - pA.y) * dx) / denom
          if (t1 > 1e-4 && t1 < 1 - 1e-4 && t2 > -1e-4 && t2 < 1 + 1e-4) {
            cutParams.push(t1)
          }
        }
      }
    } else if (c.kind === 'circle') {
      const center = sketch.points[c.c]
      if (center) {
        // Line-circle intersection
        // p(t) = pA + t * D. |p(t) - center|^2 = r^2
        const fx = pA.x - center.x
        const fy = pA.y - center.y
        const a = lenSq
        const b = 2 * (fx * dx + fy * dy)
        const dConst = fx * fx + fy * fy - c.r * c.r
        const discr = b * b - 4 * a * dConst
        if (discr >= 0) {
          const sqrtD = Math.sqrt(discr)
          const t1 = (-b - sqrtD) / (2 * a)
          const t2 = (-b + sqrtD) / (2 * a)
          if (t1 > 1e-4 && t1 < 1 - 1e-4) cutParams.push(t1)
          if (t2 > 1e-4 && t2 < 1 - 1e-4) cutParams.push(t2)
        }
      }
    }
  }

  cutParams.sort((a, b) => a - b)
  // Deduplicate
  const uniqueParams: number[] = []
  for (const t of cutParams) {
    if (uniqueParams.length === 0 || Math.abs(t - uniqueParams[uniqueParams.length - 1]) > 1e-4) {
      uniqueParams.push(t)
    }
  }

  if (uniqueParams.length <= 2) {
    // No internal intersections -> trim deletes the whole line
    return { sketch: removeCurve(sketch, args.curveId), trimmed: true }
  }

  // Click parameter
  const clickT = ((args.clickPt.x - pA.x) * dx + (args.clickPt.y - pA.y) * dy) / lenSq

  // Find which segment [t_i, t_{i+1}] contains clickT
  let clickedSegIdx = -1
  for (let i = 0; i < uniqueParams.length - 1; i++) {
    if (clickT >= uniqueParams[i] - 1e-4 && clickT <= uniqueParams[i + 1] + 1e-4) {
      clickedSegIdx = i
      break
    }
  }

  if (clickedSegIdx === -1) {
    return { sketch, trimmed: false }
  }

  // Remove the original curve
  let s = removeCurve(sketch, args.curveId)

  // Re-add kept segments
  for (let i = 0; i < uniqueParams.length - 1; i++) {
    if (i === clickedSegIdx) continue // drop clicked segment
    const tStart = uniqueParams[i]
    const tEnd = uniqueParams[i + 1]
    const pStart = { x: pA.x + tStart * dx, y: pA.y + tStart * dy }
    const pEnd = { x: pA.x + tEnd * dx, y: pA.y + tEnd * dy }
    const l = addLine(s, pStart, pEnd)
    s = l.sketch
  }

  return { sketch: s, trimmed: true }
}
