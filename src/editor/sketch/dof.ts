import type { Sketch, Constraint } from './model'
import { solve } from './solver'

export interface DofAnalysis {
  dof: number
  fullyDefined: boolean
  pointStatus: Record<string, boolean> // true = fully defined, false = under-defined
  curveStatus: Record<string, boolean>
  redundantConstraints: string[]
  conflictingConstraints: string[]
}

interface VarMapping {
  pointVars: Record<string, number>
  circleVars: Record<string, number>
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

function computeMatrixRankAndNullSpace(A: number[][], numVars: number): { rank: number; isVarFree: boolean[] } {
  if (A.length === 0 || numVars === 0) {
    return { rank: 0, isVarFree: new Array(numVars).fill(true) }
  }

  // Row echelon form using Gaussian elimination with full pivoting
  const m = A.length
  const n = numVars
  const mat = A.map(row => [...row])

  let rank = 0
  const pivotCols: number[] = []

  let r = 0
  for (let c = 0; c < n && r < m; c++) {
    // Find pivot in submatrix
    let maxVal = 0
    let maxRow = -1
    for (let i = r; i < m; i++) {
      const val = Math.abs(mat[i][c])
      if (val > maxVal) {
        maxVal = val
        maxRow = i
      }
    }

    if (maxVal < 1e-6) continue

    // Swap row r and maxRow
    const tmp = mat[r]
    mat[r] = mat[maxRow]
    mat[maxRow] = tmp

    const div = mat[r][c]
    for (let j = c; j < n; j++) mat[r][j] /= div

    for (let i = 0; i < m; i++) {
      if (i !== r) {
        const factor = mat[i][c]
        if (Math.abs(factor) > 1e-9) {
          for (let j = c; j < n; j++) {
            mat[i][j] -= factor * mat[r][j]
          }
        }
      }
    }

    pivotCols.push(c)
    rank++
    r++
  }

  // A variable is free (has component in null space) if it's not a pivot column,
  // or if a pivot row has non-zero entries for free columns
  const isPivotCol = new Array(n).fill(false)
  for (const col of pivotCols) isPivotCol[col] = true

  const isVarFree = new Array(n).fill(false)
  for (let c = 0; c < n; c++) {
    if (!isPivotCol[c]) {
      isVarFree[c] = true
    }
  }

  // If a pivot variable depends on any free column in the reduced row echelon form:
  for (let i = 0; i < rank; i++) {
    const pCol = pivotCols[i]
    for (let j = 0; j < n; j++) {
      if (!isPivotCol[j] && Math.abs(mat[i][j]) > 1e-6) {
        isVarFree[pCol] = true
        break
      }
    }
  }

  return { rank, isVarFree }
}

function computeRank(rows: number[][], numVars: number): number {
  return computeMatrixRankAndNullSpace(rows, numVars).rank
}

export function analyzeDof(sketch: Sketch): DofAnalysis {
  const { pointVars, circleVars, varCount: n } = buildVarMapping(sketch)

  // First run solve to check convergence and residuals
  const solveRes = solve(sketch)

  // Build Jacobian rows per constraint
  // We evaluate at solved positions (or current if solve failed)
  const pos = solveRes.positions
  const rad = solveRes.circleRadii

  const getPt = (id: string): [number, number] => {
    const p = pos[id] ?? sketch.points[id]
    return p ? [p.x, p.y] : [0, 0]
  }

  const getR = (curveId: string): number => {
    return rad[curveId] ?? (sketch.curves[curveId]?.kind === 'circle' ? (sketch.curves[curveId] as any).r : 0)
  }

  const constraintRows: Record<string, number[][]> = {}

  for (const con of sketch.constraints) {
    const rows: number[][] = []

    const addRow = (derivs: [number, number][]) => {
      const row = new Array(n).fill(0)
      for (const [varIdx, val] of derivs) {
        if (varIdx >= 0 && varIdx < n) row[varIdx] = val
      }
      rows.push(row)
    }

    switch (con.kind) {
      case 'coincident': {
        if (con.refs.length >= 2) {
          const v1 = pointVars[con.refs[0]]
          const v2 = pointVars[con.refs[1]]
          addRow([[v1, 1], [v2, -1]])
          addRow([[v1 + 1, 1], [v2 + 1, -1]])
        }
        break
      }
      case 'horizontal': {
        if (con.refs.length === 1) {
          const c = sketch.curves[con.refs[0]]
          if (c && c.kind === 'line') {
            const v1 = pointVars[c.a]
            const v2 = pointVars[c.b]
            addRow([[v1 + 1, -1], [v2 + 1, 1]])
          }
        } else if (con.refs.length >= 2) {
          const v1 = pointVars[con.refs[0]]
          const v2 = pointVars[con.refs[1]]
          addRow([[v1 + 1, -1], [v2 + 1, 1]])
        }
        break
      }
      case 'vertical': {
        if (con.refs.length === 1) {
          const c = sketch.curves[con.refs[0]]
          if (c && c.kind === 'line') {
            const v1 = pointVars[c.a]
            const v2 = pointVars[c.b]
            addRow([[v1, -1], [v2, 1]])
          }
        } else if (con.refs.length >= 2) {
          const v1 = pointVars[con.refs[0]]
          const v2 = pointVars[con.refs[1]]
          addRow([[v1, -1], [v2, 1]])
        }
        break
      }
      case 'fixed': {
        for (const ref of con.refs) {
          const v = pointVars[ref]
          addRow([[v, 1]])
          addRow([[v + 1, 1]])
        }
        break
      }
      case 'distance': {
        if (con.refs.length === 1) {
          const c = sketch.curves[con.refs[0]]
          if (c && c.kind === 'line') {
            const [x1, y1] = getPt(c.a)
            const [x2, y2] = getPt(c.b)
            const dx = x2 - x1
            const dy = y2 - y1
            const len = Math.hypot(dx, dy) || 1e-9
            const v1 = pointVars[c.a]
            const v2 = pointVars[c.b]
            addRow([
              [v1, -dx / len],
              [v1 + 1, -dy / len],
              [v2, dx / len],
              [v2 + 1, dy / len],
            ])
          }
        } else if (con.refs.length >= 2) {
          const isPt1 = sketch.points[con.refs[0]] !== undefined
          const isPt2 = sketch.points[con.refs[1]] !== undefined
          if (isPt1 && isPt2) {
            const [x1, y1] = getPt(con.refs[0])
            const [x2, y2] = getPt(con.refs[1])
            const v1 = pointVars[con.refs[0]]
            const v2 = pointVars[con.refs[1]]
            if (con.variant === 'dx') {
              const sgn = x2 >= x1 ? 1 : -1
              addRow([[v1, -sgn], [v2, sgn]])
            } else if (con.variant === 'dy') {
              const sgn = y2 >= y1 ? 1 : -1
              addRow([[v1 + 1, -sgn], [v2 + 1, sgn]])
            } else {
              const dx = x2 - x1
              const dy = y2 - y1
              const len = Math.hypot(dx, dy) || 1e-9
              addRow([
                [v1, -dx / len],
                [v1 + 1, -dy / len],
                [v2, dx / len],
                [v2 + 1, dy / len],
              ])
            }
          }
        }
        break
      }
      case 'radius': {
        for (const ref of con.refs) {
          const vr = circleVars[ref]
          if (vr !== undefined && vr >= 0) {
            addRow([[vr, 1]])
          }
        }
        break
      }
      case 'diameter': {
        for (const ref of con.refs) {
          const vr = circleVars[ref]
          if (vr !== undefined && vr >= 0) {
            addRow([[vr, 2]])
          }
        }
        break
      }
      case 'parallel': {
        if (con.refs.length >= 2) {
          const l1 = sketch.curves[con.refs[0]]
          const l2 = sketch.curves[con.refs[1]]
          if (l1?.kind === 'line' && l2?.kind === 'line') {
            const [a1x, a1y] = getPt(l1.a)
            const [b1x, b1y] = getPt(l1.b)
            const [a2x, a2y] = getPt(l2.a)
            const [b2x, b2y] = getPt(l2.b)
            const dx1 = b1x - a1x
            const dy1 = b1y - a1y
            const dx2 = b2x - a2x
            const dy2 = b2y - a2y
            const va1 = pointVars[l1.a]
            const vb1 = pointVars[l1.b]
            const va2 = pointVars[l2.a]
            const vb2 = pointVars[l2.b]
            addRow([
              [va1, -dy2],
              [va1 + 1, dx2],
              [vb1, dy2],
              [vb1 + 1, -dx2],
              [va2, dy1],
              [va2 + 1, -dx1],
              [vb2, -dy1],
              [vb2 + 1, dx1],
            ])
          }
        }
        break
      }
      case 'perpendicular': {
        if (con.refs.length >= 2) {
          const l1 = sketch.curves[con.refs[0]]
          const l2 = sketch.curves[con.refs[1]]
          if (l1?.kind === 'line' && l2?.kind === 'line') {
            const [a1x, a1y] = getPt(l1.a)
            const [b1x, b1y] = getPt(l1.b)
            const [a2x, a2y] = getPt(l2.a)
            const [b2x, b2y] = getPt(l2.b)
            const dx1 = b1x - a1x
            const dy1 = b1y - a1y
            const dx2 = b2x - a2x
            const dy2 = b2y - a2y
            const va1 = pointVars[l1.a]
            const vb1 = pointVars[l1.b]
            const va2 = pointVars[l2.a]
            const vb2 = pointVars[l2.b]
            addRow([
              [va1, -dx2],
              [va1 + 1, -dy2],
              [vb1, dx2],
              [vb1 + 1, dy2],
              [va2, -dx1],
              [va2 + 1, -dy1],
              [vb2, dx1],
              [vb2 + 1, dy1],
            ])
          }
        }
        break
      }
      case 'equal': {
        if (con.refs.length >= 2) {
          const c1 = sketch.curves[con.refs[0]]
          const c2 = sketch.curves[con.refs[1]]
          if (c1?.kind === 'line' && c2?.kind === 'line') {
            const [a1x, a1y] = getPt(c1.a)
            const [b1x, b1y] = getPt(c1.b)
            const [a2x, a2y] = getPt(c2.a)
            const [b2x, b2y] = getPt(c2.b)
            const l1 = Math.hypot(b1x - a1x, b1y - a1y) || 1e-9
            const l2 = Math.hypot(b2x - a2x, b2y - a2y) || 1e-9
            const va1 = pointVars[c1.a]
            const vb1 = pointVars[c1.b]
            const va2 = pointVars[c2.a]
            const vb2 = pointVars[c2.b]
            addRow([
              [va1, -(b1x - a1x) / l1],
              [va1 + 1, -(b1y - a1y) / l1],
              [vb1, (b1x - a1x) / l1],
              [vb1 + 1, (b1y - a1y) / l1],
              [va2, (b2x - a2x) / l2],
              [va2 + 1, (b2y - a2y) / l2],
              [vb2, -(b2x - a2x) / l2],
              [vb2 + 1, -(b2y - a2y) / l2],
            ])
          } else if (c1?.kind === 'circle' && c2?.kind === 'circle') {
            const vr1 = circleVars[c1.id]
            const vr2 = circleVars[c2.id]
            addRow([[vr1, 1], [vr2, -1]])
          }
        }
        break
      }
      case 'midpoint': {
        if (con.refs.length >= 2) {
          const pt = con.refs[0]
          const line = sketch.curves[con.refs[1]]
          if (line?.kind === 'line') {
            const vp = pointVars[pt]
            const va = pointVars[line.a]
            const vb = pointVars[line.b]
            addRow([[vp, 1], [va, -0.5], [vb, -0.5]])
            addRow([[vp + 1, 1], [va + 1, -0.5], [vb + 1, -0.5]])
          }
        }
        break
      }
    }

    constraintRows[con.id] = rows
  }

  // Combine all rows
  const allRows: number[][] = []
  for (const rows of Object.values(constraintRows)) {
    allRows.push(...rows)
  }

  const { rank: totalRank, isVarFree } = computeMatrixRankAndNullSpace(allRows, n)
  const dof = Math.max(0, n - totalRank)
  const fullyDefined = dof === 0 && n > 0

  // Per-point status
  const pointStatus: Record<string, boolean> = {}
  for (const [id, pt] of Object.entries(sketch.points)) {
    if (pt.fixed) {
      pointStatus[id] = true
    } else {
      const idx = pointVars[id]
      if (idx === undefined || idx === -1) {
        pointStatus[id] = true
      } else {
        pointStatus[id] = !isVarFree[idx] && !isVarFree[idx + 1]
      }
    }
  }

  // Per-curve status
  const curveStatus: Record<string, boolean> = {}
  for (const [id, c] of Object.entries(sketch.curves)) {
    if (c.kind === 'line') {
      curveStatus[id] = (pointStatus[c.a] ?? true) && (pointStatus[c.b] ?? true)
    } else if (c.kind === 'circle') {
      const cDefined = pointStatus[c.c] ?? true
      const rIdx = circleVars[id]
      const rDefined = rIdx === undefined || !isVarFree[rIdx]
      curveStatus[id] = cDefined && rDefined
    } else if (c.kind === 'arc') {
      curveStatus[id] = (pointStatus[c.c] ?? true) && (pointStatus[c.a] ?? true) && (pointStatus[c.b] ?? true)
    }
  }

  // Conflict and redundancy analysis
  const conflictingConstraints: string[] = []
  const redundantConstraints: string[] = []

  for (const con of sketch.constraints) {
    const res = solveRes.residuals[con.id] ?? 0
    if (!solveRes.ok && res > 1e-4) {
      conflictingConstraints.push(con.id)
    } else if (solveRes.ok) {
      // Check if removing this constraint leaves the rank unchanged
      const rowsWithout: number[][] = []
      for (const [cId, rows] of Object.entries(constraintRows)) {
        if (cId !== con.id) {
          rowsWithout.push(...rows)
        }
      }
      const rankWithout = computeRank(rowsWithout, n)
      if (rankWithout === totalRank && (constraintRows[con.id]?.length ?? 0) > 0) {
        redundantConstraints.push(con.id)
      }
    }
  }

  return {
    dof,
    fullyDefined,
    pointStatus,
    curveStatus,
    redundantConstraints,
    conflictingConstraints,
  }
}
