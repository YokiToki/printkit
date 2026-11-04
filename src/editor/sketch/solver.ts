import type { Sketch, Constraint, Curve, LineCurve, CircleCurve, ArcCurve } from './model'

export interface DragTarget {
  pointId: string
  x: number
  y: number
  weight?: number
}

export interface SolveOptions {
  drag?: DragTarget
  maxIter?: number
  tol?: number
  stayWeight?: number
}

export interface SolveResult {
  positions: Record<string, { x: number; y: number }>
  circleRadii: Record<string, number>
  ok: boolean
  reason?: 'noSolution' | 'maxIterations'
  residuals: Record<string, number>
  timeMs: number
}

interface VarMapping {
  pointVars: Record<string, number> // pointId -> startIndex in vector (x at idx, y at idx + 1), or -1 if fixed
  circleVars: Record<string, number> // curveId -> index in vector for radius r
  varCount: number
}

function buildVarMapping(sketch: Sketch): VarMapping {
  const pointVars: Record<string, number> = {}
  const circleVars: Record<string, number> = {}
  let varCount = 0

  for (const [id, pt] of Object.entries(sketch.points)) {
    if (pt.fixed) {
      pointVars[id] = -1
    } else {
      pointVars[id] = varCount
      varCount += 2
    }
  }

  for (const [id, c] of Object.entries(sketch.curves)) {
    if (c.kind === 'circle') {
      circleVars[id] = varCount
      varCount += 1
    }
  }

  return { pointVars, circleVars, varCount }
}

export function solve(sketch: Sketch, options: SolveOptions = {}): SolveResult {
  const startT = performance.now()
  const maxIter = options.maxIter ?? 50
  const tol = options.tol ?? 1e-7
  const stayWeight = options.stayWeight ?? 1e-5
  const drag = options.drag

  // Initial copy of positions and radii to fall back to if solving fails
  const initialPositions: Record<string, { x: number; y: number }> = {}
  for (const [id, pt] of Object.entries(sketch.points)) {
    initialPositions[id] = { x: pt.x, y: pt.y }
  }
  const initialRadii: Record<string, number> = {}
  for (const [id, c] of Object.entries(sketch.curves)) {
    if (c.kind === 'circle') {
      initialRadii[id] = c.r
    }
  }

  const { pointVars, circleVars, varCount: n } = buildVarMapping(sketch)

  const p0 = new Float64Array(n)
  const p = new Float64Array(n)
  for (const [id, idx] of Object.entries(pointVars)) {
    if (idx >= 0) {
      const pt = sketch.points[id]
      p[idx] = pt.x
      p[idx + 1] = pt.y
      p0[idx] = pt.x
      p0[idx + 1] = pt.y
    }
  }
  for (const [id, idx] of Object.entries(circleVars)) {
    const c = sketch.curves[id] as CircleCurve
    p[idx] = c.r
    p0[idx] = c.r
  }

  const getPoint = (id: string, vec: Float64Array): [number, number] => {
    const idx = pointVars[id]
    if (idx === undefined || idx === -1) {
      const pt = sketch.points[id]
      return pt ? [pt.x, pt.y] : [0, 0]
    }
    return [vec[idx], vec[idx + 1]]
  }

  const getRadius = (curveId: string, vec: Float64Array): number => {
    const idx = circleVars[curveId]
    if (idx === undefined) {
      const c = sketch.curves[curveId]
      return c && c.kind === 'circle' ? c.r : 0
    }
    return vec[idx]
  }

  if (n === 0) {
    // Check if constraints are satisfied with 0 free variables
    const checkEval = evaluate(p, () => {})
    const ok = checkEval.maxHardR < tol
    return {
      positions: initialPositions,
      circleRadii: initialRadii,
      ok,
      reason: ok ? undefined : 'noSolution',
      residuals: checkEval.perConstraintR,
      timeMs: performance.now() - startT,
    }
  }

  const JTJ = new Float64Array(n * n)
  const JTr = new Float64Array(n)
  const L = new Float64Array(n * n)
  const step = new Float64Array(n)
  const yVec = new Float64Array(n)
  const pNext = new Float64Array(n)

  function choleskySolve(): boolean {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = JTJ[i * n + j]
        for (let k = 0; k < j; k++) {
          sum -= L[i * n + k] * L[j * n + k]
        }
        if (i === j) {
          if (sum <= 1e-14) return false
          L[i * n + j] = Math.sqrt(sum)
        } else {
          L[i * n + j] = sum / L[j * n + j]
        }
      }
    }
    for (let i = 0; i < n; i++) {
      let sum = JTr[i]
      for (let k = 0; k < i; k++) {
        sum -= L[i * n + k] * yVec[k]
      }
      yVec[i] = sum / L[i * n + i]
    }
    for (let i = n - 1; i >= 0; i--) {
      let sum = yVec[i]
      for (let k = i + 1; k < n; k++) {
        sum -= L[k * n + i] * step[k]
      }
      step[i] = sum / L[i * n + i]
    }
    return true
  }

  type RowCallback = (res: number, derivs: [number, number][], conId?: string, isHard?: boolean) => void

  function evaluate(vec: Float64Array, onRow: RowCallback): { maxHardR: number; sumSq: number; perConstraintR: Record<string, number> } {
    let maxHardR = 0
    let sumSq = 0
    const perConstraintR: Record<string, number> = {}

    const add = (res: number, derivs: [number, number][], conId?: string, isHard = true) => {
      onRow(res, derivs, conId, isHard)
      sumSq += res * res
      if (isHard) {
        const absVal = Math.abs(res)
        if (absVal > maxHardR) maxHardR = absVal
        if (conId) {
          perConstraintR[conId] = Math.max(perConstraintR[conId] ?? 0, absVal)
        }
      }
    }

    // Internal constraint: for any arc curve, endpoints |ca| = |cb|
    for (const c of Object.values(sketch.curves)) {
      if (c.kind === 'arc') {
        const [cx, cy] = getPoint(c.c, vec)
        const [ax, ay] = getPoint(c.a, vec)
        const [bx, by] = getPoint(c.b, vec)
        const ra = Math.hypot(ax - cx, ay - cy) || 1e-9
        const rb = Math.hypot(bx - cx, by - cy) || 1e-9
        const vC = pointVars[c.c]
        const vA = pointVars[c.a]
        const vB = pointVars[c.b]
        add(ra - rb, [
          [vA, (ax - cx) / ra],
          [vA + 1, (ay - cy) / ra],
          [vB, -(bx - cx) / rb],
          [vB + 1, -(by - cy) / rb],
          [vC, -(ax - cx) / ra + (bx - cx) / rb],
          [vC + 1, -(ay - cy) / ra + (by - cy) / rb],
        ], `_internal_arc_${c.id}`, true)
      }
    }

    for (const con of sketch.constraints) {
      const conId = con.id
      switch (con.kind) {
        case 'coincident': {
          if (con.refs.length >= 2) {
            const p1 = con.refs[0]
            const p2 = con.refs[1]
            const [x1, y1] = getPoint(p1, vec)
            const [x2, y2] = getPoint(p2, vec)
            const v1 = pointVars[p1]
            const v2 = pointVars[p2]
            add(x1 - x2, [[v1, 1], [v2, -1]], conId)
            add(y1 - y2, [[v1 + 1, 1], [v2 + 1, -1]], conId)
          }
          break
        }
        case 'horizontal': {
          if (con.refs.length === 1) {
            const c = sketch.curves[con.refs[0]]
            if (c && c.kind === 'line') {
              const [, y1] = getPoint(c.a, vec)
              const [, y2] = getPoint(c.b, vec)
              const v1 = pointVars[c.a]
              const v2 = pointVars[c.b]
              add(y2 - y1, [[v1 + 1, -1], [v2 + 1, 1]], conId)
            }
          } else if (con.refs.length >= 2) {
            const [, y1] = getPoint(con.refs[0], vec)
            const [, y2] = getPoint(con.refs[1], vec)
            const v1 = pointVars[con.refs[0]]
            const v2 = pointVars[con.refs[1]]
            add(y2 - y1, [[v1 + 1, -1], [v2 + 1, 1]], conId)
          }
          break
        }
        case 'vertical': {
          if (con.refs.length === 1) {
            const c = sketch.curves[con.refs[0]]
            if (c && c.kind === 'line') {
              const [x1] = getPoint(c.a, vec)
              const [x2] = getPoint(c.b, vec)
              const v1 = pointVars[c.a]
              const v2 = pointVars[c.b]
              add(x2 - x1, [[v1, -1], [v2, 1]], conId)
            }
          } else if (con.refs.length >= 2) {
            const [x1] = getPoint(con.refs[0], vec)
            const [x2] = getPoint(con.refs[1], vec)
            const v1 = pointVars[con.refs[0]]
            const v2 = pointVars[con.refs[1]]
            add(x2 - x1, [[v1, -1], [v2, 1]], conId)
          }
          break
        }
        case 'fixed': {
          for (const ref of con.refs) {
            const orig = sketch.points[ref]
            if (orig) {
              const [x, y] = getPoint(ref, vec)
              const v = pointVars[ref]
              add(x - orig.x, [[v, 1]], conId)
              add(y - orig.y, [[v + 1, 1]], conId)
            }
          }
          break
        }
        case 'distance': {
          const dVal = con.value ?? 0
          if (con.refs.length === 1) {
            // Line length
            const c = sketch.curves[con.refs[0]]
            if (c && c.kind === 'line') {
              const [x1, y1] = getPoint(c.a, vec)
              const [x2, y2] = getPoint(c.b, vec)
              const dx = x2 - x1
              const dy = y2 - y1
              const len = Math.hypot(dx, dy) || 1e-9
              const v1 = pointVars[c.a]
              const v2 = pointVars[c.b]
              add(len - dVal, [
                [v1, -dx / len],
                [v1 + 1, -dy / len],
                [v2, dx / len],
                [v2 + 1, dy / len],
              ], conId)
            }
          } else if (con.refs.length >= 2) {
            const ref1 = con.refs[0]
            const ref2 = con.refs[1]
            const isPt1 = sketch.points[ref1] !== undefined
            const isPt2 = sketch.points[ref2] !== undefined

            if (isPt1 && isPt2) {
              const [x1, y1] = getPoint(ref1, vec)
              const [x2, y2] = getPoint(ref2, vec)
              const v1 = pointVars[ref1]
              const v2 = pointVars[ref2]
              if (con.variant === 'dx') {
                const sgn = x2 >= x1 ? 1 : -1
                add((x2 - x1) * sgn - dVal, [[v1, -sgn], [v2, sgn]], conId)
              } else if (con.variant === 'dy') {
                const sgn = y2 >= y1 ? 1 : -1
                add((y2 - y1) * sgn - dVal, [[v1 + 1, -sgn], [v2 + 1, sgn]], conId)
              } else {
                const dx = x2 - x1
                const dy = y2 - y1
                const len = Math.hypot(dx, dy) || 1e-9
                add(len - dVal, [
                  [v1, -dx / len],
                  [v1 + 1, -dy / len],
                  [v2, dx / len],
                  [v2 + 1, dy / len],
                ], conId)
              }
            } else if (isPt1 && !isPt2) {
              // Point to line
              const line = sketch.curves[ref2] as LineCurve | undefined
              if (line && line.kind === 'line') {
                const [px, py] = getPoint(ref1, vec)
                const [ax, ay] = getPoint(line.a, vec)
                const [bx, by] = getPoint(line.b, vec)
                const dx = bx - ax
                const dy = by - ay
                const len = Math.hypot(dx, dy) || 1e-9
                const cross = dx * (py - ay) - dy * (px - ax)
                const dist = Math.abs(cross) / len
                const sgn = cross >= 0 ? 1 : -1
                const vp = pointVars[ref1]
                const va = pointVars[line.a]
                const vb = pointVars[line.b]
                const d_px = -sgn * dy / len
                const d_py = sgn * dx / len
                const d_ax = sgn * ((by - py) / len + (cross * dx) / (len * len * len))
                const d_ay = sgn * ((px - bx) / len + (cross * dy) / (len * len * len))
                const d_bx = sgn * ((py - ay) / len - (cross * dx) / (len * len * len))
                const d_by = sgn * ((ax - px) / len - (cross * dy) / (len * len * len))
                add(dist - dVal, [
                  [vp, d_px],
                  [vp + 1, d_py],
                  [va, d_ax],
                  [va + 1, d_ay],
                  [vb, d_bx],
                  [vb + 1, d_by],
                ], conId)
              }
            }
          }
          break
        }
        case 'radius': {
          const rVal = con.value ?? 0
          for (const ref of con.refs) {
            const c = sketch.curves[ref]
            if (c && c.kind === 'circle') {
              const r = getRadius(ref, vec)
              const vr = circleVars[ref]
              add(r - rVal, [[vr, 1]], conId)
            } else if (c && c.kind === 'arc') {
              const [cx, cy] = getPoint(c.c, vec)
              const [ax, ay] = getPoint(c.a, vec)
              const dist = Math.hypot(ax - cx, ay - cy) || 1e-9
              const vc = pointVars[c.c]
              const va = pointVars[c.a]
              add(dist - rVal, [
                [va, (ax - cx) / dist],
                [va + 1, (ay - cy) / dist],
                [vc, -(ax - cx) / dist],
                [vc + 1, -(ay - cy) / dist],
              ], conId)
            }
          }
          break
        }
        case 'diameter': {
          const dVal = con.value ?? 0
          for (const ref of con.refs) {
            const c = sketch.curves[ref]
            if (c && c.kind === 'circle') {
              const r = getRadius(ref, vec)
              const vr = circleVars[ref]
              add(2 * r - dVal, [[vr, 2]], conId)
            }
          }
          break
        }
        case 'parallel': {
          if (con.refs.length >= 2) {
            const l1 = sketch.curves[con.refs[0]] as LineCurve | undefined
            const l2 = sketch.curves[con.refs[1]] as LineCurve | undefined
            if (l1 && l2 && l1.kind === 'line' && l2.kind === 'line') {
              const [a1x, a1y] = getPoint(l1.a, vec)
              const [b1x, b1y] = getPoint(l1.b, vec)
              const [a2x, a2y] = getPoint(l2.a, vec)
              const [b2x, b2y] = getPoint(l2.b, vec)
              const dx1 = b1x - a1x
              const dy1 = b1y - a1y
              const dx2 = b2x - a2x
              const dy2 = b2y - a2y
              const cross = dx1 * dy2 - dy1 * dx2
              const va1 = pointVars[l1.a]
              const vb1 = pointVars[l1.b]
              const va2 = pointVars[l2.a]
              const vb2 = pointVars[l2.b]
              add(cross, [
                [va1, -dy2],
                [va1 + 1, dx2],
                [vb1, dy2],
                [vb1 + 1, -dx2],
                [va2, dy1],
                [va2 + 1, -dx1],
                [vb2, -dy1],
                [vb2 + 1, dx1],
              ], conId)
            }
          }
          break
        }
        case 'perpendicular': {
          if (con.refs.length >= 2) {
            const l1 = sketch.curves[con.refs[0]] as LineCurve | undefined
            const l2 = sketch.curves[con.refs[1]] as LineCurve | undefined
            if (l1 && l2 && l1.kind === 'line' && l2.kind === 'line') {
              const [a1x, a1y] = getPoint(l1.a, vec)
              const [b1x, b1y] = getPoint(l1.b, vec)
              const [a2x, a2y] = getPoint(l2.a, vec)
              const [b2x, b2y] = getPoint(l2.b, vec)
              const dx1 = b1x - a1x
              const dy1 = b1y - a1y
              const dx2 = b2x - a2x
              const dy2 = b2y - a2y
              const dot = dx1 * dx2 + dy1 * dy2
              const va1 = pointVars[l1.a]
              const vb1 = pointVars[l1.b]
              const va2 = pointVars[l2.a]
              const vb2 = pointVars[l2.b]
              add(dot, [
                [va1, -dx2],
                [va1 + 1, -dy2],
                [vb1, dx2],
                [vb1 + 1, dy2],
                [va2, -dx1],
                [va2 + 1, -dy1],
                [vb2, dx1],
                [vb2 + 1, dy1],
              ], conId)
            }
          }
          break
        }
        case 'tangent': {
          if (con.refs.length >= 2) {
            const c1 = sketch.curves[con.refs[0]]
            const c2 = sketch.curves[con.refs[1]]
            let line: LineCurve | undefined
            let circ: CircleCurve | ArcCurve | undefined
            if (c1?.kind === 'line' && (c2?.kind === 'circle' || c2?.kind === 'arc')) {
              line = c1
              circ = c2
            } else if (c2?.kind === 'line' && (c1?.kind === 'circle' || c1?.kind === 'arc')) {
              line = c2
              circ = c1
            }

            if (line && circ) {
              const [cx, cy] = getPoint(circ.c, vec)
              const [ax, ay] = getPoint(line.a, vec)
              const [bx, by] = getPoint(line.b, vec)
              const rVal = circ.kind === 'circle' ? getRadius(circ.id, vec) : Math.hypot(getPoint(circ.a, vec)[0] - cx, getPoint(circ.a, vec)[1] - cy)
              const dx = bx - ax
              const dy = by - ay
              const len = Math.hypot(dx, dy) || 1e-9
              const cross = dx * (cy - ay) - dy * (cx - ax)
              const dist = Math.abs(cross) / len
              const sgn = cross >= 0 ? 1 : -1
              const vc = pointVars[circ.c]
              const va = pointVars[line.a]
              const vb = pointVars[line.b]
              const vr = circ.kind === 'circle' ? circleVars[circ.id] : -1

              const d_cx = -sgn * dy / len
              const d_cy = sgn * dx / len
              const d_ax = sgn * ((by - cy) / len + (cross * dx) / (len * len * len))
              const d_ay = sgn * ((cx - bx) / len + (cross * dy) / (len * len * len))
              const d_bx = sgn * ((cy - ay) / len - (cross * dx) / (len * len * len))
              const d_by = sgn * ((ax - cx) / len - (cross * dy) / (len * len * len))

              const derivs: [number, number][] = [
                [vc, d_cx],
                [vc + 1, d_cy],
                [va, d_ax],
                [va + 1, d_ay],
                [vb, d_bx],
                [vb + 1, d_by],
              ]
              if (vr >= 0) {
                derivs.push([vr, -1])
              } else if (circ.kind === 'arc') {
                const [arcAx, arcAy] = getPoint(circ.a, vec)
                const vArcA = pointVars[circ.a]
                const dArcAx = (arcAx - cx) / rVal
                const dArcAy = (arcAy - cy) / rVal
                derivs.push(
                  [vArcA, -dArcAx],
                  [vArcA + 1, -dArcAy],
                  [vc, dArcAx],
                  [vc + 1, dArcAy],
                )
              }
              add(dist - rVal, derivs, conId)
            }
          }
          break
        }
        case 'equal': {
          if (con.refs.length >= 2) {
            const c1 = sketch.curves[con.refs[0]]
            const c2 = sketch.curves[con.refs[1]]
            if (c1?.kind === 'line' && c2?.kind === 'line') {
              const [a1x, a1y] = getPoint(c1.a, vec)
              const [b1x, b1y] = getPoint(c1.b, vec)
              const [a2x, a2y] = getPoint(c2.a, vec)
              const [b2x, b2y] = getPoint(c2.b, vec)
              const l1 = Math.hypot(b1x - a1x, b1y - a1y) || 1e-9
              const l2 = Math.hypot(b2x - a2x, b2y - a2y) || 1e-9
              const va1 = pointVars[c1.a]
              const vb1 = pointVars[c1.b]
              const va2 = pointVars[c2.a]
              const vb2 = pointVars[c2.b]
              add(l1 - l2, [
                [va1, -(b1x - a1x) / l1],
                [va1 + 1, -(b1y - a1y) / l1],
                [vb1, (b1x - a1x) / l1],
                [vb1 + 1, (b1y - a1y) / l1],
                [va2, (b2x - a2x) / l2],
                [va2 + 1, (b2y - a2y) / l2],
                [vb2, -(b2x - a2x) / l2],
                [vb2 + 1, -(b2y - a2y) / l2],
              ], conId)
            } else if ((c1?.kind === 'circle' || c1?.kind === 'arc') && (c2?.kind === 'circle' || c2?.kind === 'arc')) {
              let r1 = 0
              const derivs1: [number, number][] = []
              if (c1.kind === 'circle') {
                r1 = getRadius(c1.id, vec)
                const vr1 = circleVars[c1.id]
                derivs1.push([vr1, 1])
              } else {
                const [c1x, c1y] = getPoint(c1.c, vec)
                const [a1x, a1y] = getPoint(c1.a, vec)
                r1 = Math.hypot(a1x - c1x, a1y - c1y) || 1e-9
                const vc1 = pointVars[c1.c]
                const va1 = pointVars[c1.a]
                derivs1.push(
                  [va1, (a1x - c1x) / r1],
                  [va1 + 1, (a1y - c1y) / r1],
                  [vc1, -(a1x - c1x) / r1],
                  [vc1 + 1, -(a1y - c1y) / r1],
                )
              }

              let r2 = 0
              const derivs2: [number, number][] = []
              if (c2.kind === 'circle') {
                r2 = getRadius(c2.id, vec)
                const vr2 = circleVars[c2.id]
                derivs2.push([vr2, -1])
              } else {
                const [c2x, c2y] = getPoint(c2.c, vec)
                const [a2x, a2y] = getPoint(c2.a, vec)
                r2 = Math.hypot(a2x - c2x, a2y - c2y) || 1e-9
                const vc2 = pointVars[c2.c]
                const va2 = pointVars[c2.a]
                derivs2.push(
                  [va2, -(a2x - c2x) / r2],
                  [va2 + 1, -(a2y - c2y) / r2],
                  [vc2, (a2x - c2x) / r2],
                  [vc2 + 1, (a2y - c2y) / r2],
                )
              }

              add(r1 - r2, [...derivs1, ...derivs2], conId)
            }
          }
          break
        }
        case 'symmetric': {
          if (con.refs.length >= 3) {
            const p1 = con.refs[0]
            const p2 = con.refs[1]
            const line = sketch.curves[con.refs[2]] as LineCurve | undefined
            if (line && line.kind === 'line') {
              const [x1, y1] = getPoint(p1, vec)
              const [x2, y2] = getPoint(p2, vec)
              const [ax, ay] = getPoint(line.a, vec)
              const [bx, by] = getPoint(line.b, vec)
              const mx = (x1 + x2) / 2
              const my = (y1 + y2) / 2
              const dx = bx - ax
              const dy = by - ay
              const len = Math.hypot(dx, dy) || 1e-9

              // 1. Midpoint on line
              const cross = (dx * (my - ay) - dy * (mx - ax)) / len
              const v1 = pointVars[p1]
              const v2 = pointVars[p2]
              const va = pointVars[line.a]
              const vb = pointVars[line.b]
              const s_ax = (by - my) / len + (cross * dx) / (len * len * len)
              const s_ay = (mx - bx) / len + (cross * dy) / (len * len * len)
              const s_bx = (my - ay) / len - (cross * dx) / (len * len * len)
              const s_by = (ax - mx) / len - (cross * dy) / (len * len * len)
              add(cross, [
                [v1, -dy / (2 * len)],
                [v1 + 1, dx / (2 * len)],
                [v2, -dy / (2 * len)],
                [v2 + 1, dx / (2 * len)],
                [va, s_ax],
                [va + 1, s_ay],
                [vb, s_bx],
                [vb + 1, s_by],
              ], conId)

              // 2. Vector p2 - p1 perpendicular to line
              const dot = (x2 - x1) * dx + (y2 - y1) * dy
              add(dot, [
                [v1, -dx],
                [v1 + 1, -dy],
                [v2, dx],
                [v2 + 1, dy],
                [va, -(x2 - x1)],
                [va + 1, -(y2 - y1)],
                [vb, (x2 - x1)],
                [vb + 1, (y2 - y1)],
              ], conId)
            }
          }
          break
        }
        case 'midpoint': {
          if (con.refs.length >= 2) {
            const pt = con.refs[0]
            const line = sketch.curves[con.refs[1]] as LineCurve | undefined
            if (line && line.kind === 'line') {
              const [px, py] = getPoint(pt, vec)
              const [ax, ay] = getPoint(line.a, vec)
              const [bx, by] = getPoint(line.b, vec)
              const vp = pointVars[pt]
              const va = pointVars[line.a]
              const vb = pointVars[line.b]
              add(px - (ax + bx) / 2, [[vp, 1], [va, -0.5], [vb, -0.5]], conId)
              add(py - (ay + by) / 2, [[vp + 1, 1], [va + 1, -0.5], [vb + 1, -0.5]], conId)
            }
          }
          break
        }
        case 'pointOnLine': {
          if (con.refs.length >= 2) {
            const pt = con.refs[0]
            const line = sketch.curves[con.refs[1]] as LineCurve | undefined
            if (line && line.kind === 'line') {
              const [px, py] = getPoint(pt, vec)
              const [ax, ay] = getPoint(line.a, vec)
              const [bx, by] = getPoint(line.b, vec)
              const dx = bx - ax
              const dy = by - ay
              const len = Math.hypot(dx, dy) || 1e-9
              const cross = (dx * (py - ay) - dy * (px - ax)) / len
              const vp = pointVars[pt]
              const va = pointVars[line.a]
              const vb = pointVars[line.b]
              const d_px = -dy / len
              const d_py = dx / len
              const d_ax = (by - py) / len + (cross * dx) / (len * len * len)
              const d_ay = (px - bx) / len + (cross * dy) / (len * len * len)
              const d_bx = (py - ay) / len - (cross * dx) / (len * len * len)
              const d_by = (ax - px) / len - (cross * dy) / (len * len * len)
              add(cross, [
                [vp, d_px],
                [vp + 1, d_py],
                [va, d_ax],
                [va + 1, d_ay],
                [vb, d_bx],
                [vb + 1, d_by],
              ], conId)
            }
          }
          break
        }
        case 'pointOnCircle': {
          if (con.refs.length >= 2) {
            const pt = con.refs[0]
            const circ = sketch.curves[con.refs[1]] as CircleCurve | ArcCurve | undefined
            if (circ) {
              const [px, py] = getPoint(pt, vec)
              const [cx, cy] = getPoint(circ.c, vec)
              const dist = Math.hypot(px - cx, py - cy) || 1e-9
              const rVal = circ.kind === 'circle' ? getRadius(circ.id, vec) : Math.hypot(getPoint(circ.a, vec)[0] - cx, getPoint(circ.a, vec)[1] - cy)
              const vp = pointVars[pt]
              const vc = pointVars[circ.c]
              const vr = circ.kind === 'circle' ? circleVars[circ.id] : -1
              const derivs: [number, number][] = [
                [vp, (px - cx) / dist],
                [vp + 1, (py - cy) / dist],
                [vc, -(px - cx) / dist],
                [vc + 1, -(py - cy) / dist],
              ]
              if (vr >= 0) derivs.push([vr, -1])
              add(dist - rVal, derivs, conId)
            }
          }
          break
        }
        case 'angle': {
          if (con.refs.length >= 2 && con.value !== undefined) {
            const l1 = sketch.curves[con.refs[0]] as LineCurve | undefined
            const l2 = sketch.curves[con.refs[1]] as LineCurve | undefined
            if (l1 && l2 && l1.kind === 'line' && l2.kind === 'line') {
              const [a1x, a1y] = getPoint(l1.a, vec)
              const [b1x, b1y] = getPoint(l1.b, vec)
              const [a2x, a2y] = getPoint(l2.a, vec)
              const [b2x, b2y] = getPoint(l2.b, vec)
              const a1 = Math.atan2(b1y - a1y, b1x - a1x)
              const a2 = Math.atan2(b2y - a2y, b2x - a2x)
              let diff = (a2 - a1) - con.value
              while (diff > Math.PI) diff -= 2 * Math.PI
              while (diff < -Math.PI) diff += 2 * Math.PI
              const va1 = pointVars[l1.a]
              const vb1 = pointVars[l1.b]
              const va2 = pointVars[l2.a]
              const vb2 = pointVars[l2.b]
              const l1sq = (b1x - a1x) ** 2 + (b1y - a1y) ** 2 || 1e-9
              const l2sq = (b2x - a2x) ** 2 + (b2y - a2y) ** 2 || 1e-9
              add(diff, [
                [va1, -(b1y - a1y) / l1sq],
                [va1 + 1, (b1x - a1x) / l1sq],
                [vb1, (b1y - a1y) / l1sq],
                [vb1 + 1, -(b1x - a1x) / l1sq],
                [va2, (b2y - a2y) / l2sq],
                [va2 + 1, -(b2x - a2x) / l2sq],
                [vb2, -(b2y - a2y) / l2sq],
                [vb2 + 1, (b2x - a2x) / l2sq],
              ], conId)
            }
          }
          break
        }
      }
    }

    // Drag residual
    if (drag) {
      const v = pointVars[drag.pointId]
      if (v !== undefined && v >= 0) {
        const [x, y] = getPoint(drag.pointId, vec)
        const w = drag.weight ?? 100
        add((x - drag.x) * w, [[v, w]], undefined, false)
        add((y - drag.y) * w, [[v + 1, w]], undefined, false)
      }
    }

    // Nearest-solution regularization
    if (stayWeight > 0) {
      for (let i = 0; i < n; i++) {
        add((vec[i] - p0[i]) * stayWeight, [[i, stayWeight]], undefined, false)
      }
    }

    return { maxHardR, sumSq, perConstraintR }
  }

  let lambda = 1e-4
  let iter = 0

  while (iter < maxIter) {
    JTJ.fill(0)
    JTr.fill(0)

    const evalRes = evaluate(p, (res, derivs) => {
      for (const [v, d] of derivs) {
        if (v >= 0) JTr[v] -= d * res
      }
      for (let a = 0; a < derivs.length; a++) {
        const vA = derivs[a][0]
        if (vA < 0) continue
        const dA = derivs[a][1]
        for (let b = 0; b < derivs.length; b++) {
          const vB = derivs[b][0]
          if (vB < 0) continue
          const dB = derivs[b][1]
          JTJ[vA * n + vB] += dA * dB
        }
      }
    })

    if (evalRes.maxHardR < tol) break

    for (let j = 0; j < n; j++) {
      JTJ[j * n + j] += lambda * (JTJ[j * n + j] + 1)
    }

    const ok = choleskySolve()
    if (!ok) {
      lambda *= 10
      iter++
      continue
    }

    for (let j = 0; j < n; j++) pNext[j] = p[j] + step[j]

    const nextEval = evaluate(pNext, () => {})
    if (nextEval.sumSq < evalRes.sumSq) {
      p.set(pNext)
      lambda = Math.max(1e-7, lambda / 10)
    } else {
      lambda *= 10
    }
    iter++
  }

  const finalEval = evaluate(p, () => {})
  const timeMs = performance.now() - startT
  const converged = finalEval.maxHardR < 1e-4

  if (!converged) {
    return {
      positions: initialPositions,
      circleRadii: initialRadii,
      ok: false,
      reason: iter >= maxIter ? 'maxIterations' : 'noSolution',
      residuals: finalEval.perConstraintR,
      timeMs,
    }
  }

  const resultPositions: Record<string, { x: number; y: number }> = {}
  for (const [id, idx] of Object.entries(pointVars)) {
    if (idx === -1) {
      resultPositions[id] = { ...sketch.points[id] }
    } else {
      resultPositions[id] = { x: p[idx], y: p[idx + 1] }
    }
  }

  const resultRadii: Record<string, number> = {}
  for (const [id, idx] of Object.entries(circleVars)) {
    resultRadii[id] = p[idx]
  }

  return {
    positions: resultPositions,
    circleRadii: resultRadii,
    ok: true,
    residuals: finalEval.perConstraintR,
    timeMs,
  }
}
