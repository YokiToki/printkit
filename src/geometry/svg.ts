import {
  type Sketch,
  type Curve,
  type LineCurve,
  type CircleCurve,
  type ArcCurve,
  createSketch,
  addPoint,
  addLine,
  addCircle,
  addArc,
  newId,
  type PlaneDefinition,
} from '../editor/sketch/model'

export interface SvgImportOptions {
  existingSketch?: Sketch
  plane?: PlaneDefinition
  scaleMode?: 'dpi' | 'fitWidth' | 'scale'
  dpi?: number // default 96
  fitWidthMm?: number
  scale?: number
  tolerance?: number // chord tolerance in mm, default 0.02
  sketchName?: string
}

export interface SvgParseResult {
  sketch: Sketch
  segmentCount: number
  notices: string[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

type Matrix2D = [number, number, number, number, number, number] // [a, b, c, d, e, f]
// x' = a*x + c*y + e
// y' = b*x + d*y + f

function identityMatrix(): Matrix2D {
  return [1, 0, 0, 1, 0, 0]
}

function multiplyMatrix(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  const [a1, b1, c1, d1, e1, f1] = m1
  const [a2, b2, c2, d2, e2, f2] = m2
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

function applyMatrix(m: Matrix2D, p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5],
  }
}

function isSimilarityTransform(m: Matrix2D): boolean {
  // m is similarity if columns are orthogonal and have equal length
  const [a, b, c, d] = m
  const dot = a * c + b * d
  if (Math.abs(dot) > 1e-6) return false
  const len1 = a * a + b * b
  const len2 = c * c + d * d
  return Math.abs(len1 - len2) < 1e-6
}

function parseTransform(str: string): Matrix2D {
  let result = identityMatrix()
  const regex = /([a-zA-Z]+)\s*\(([^)]+)\)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(str)) !== null) {
    const type = match[1]
    const args = match[2]
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => !isNaN(n))

    let m: Matrix2D = identityMatrix()
    switch (type) {
      case 'matrix':
        if (args.length >= 6) {
          m = [args[0], args[1], args[2], args[3], args[4], args[5]]
        }
        break
      case 'translate':
        m = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0]
        break
      case 'scale': {
        const sx = args[0] ?? 1
        const sy = args[1] ?? sx
        m = [sx, 0, 0, sy, 0, 0]
        break
      }
      case 'rotate': {
        const rad = ((args[0] ?? 0) * Math.PI) / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        if (args.length >= 3) {
          const cx = args[1]
          const cy = args[2]
          m = multiplyMatrix([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0])
          m = multiplyMatrix(m, [1, 0, 0, 1, -cx, -cy])
        } else {
          m = [cos, sin, -sin, cos, 0, 0]
        }
        break
      }
      case 'skewX': {
        const rad = ((args[0] ?? 0) * Math.PI) / 180
        m = [1, 0, Math.tan(rad), 1, 0, 0]
        break
      }
      case 'skewY': {
        const rad = ((args[0] ?? 0) * Math.PI) / 180
        m = [1, Math.tan(rad), 0, 1, 0, 0]
        break
      }
    }
    result = multiplyMatrix(result, m)
  }

  return result
}

// Flat curve representation prior to sketch creation
type RawCurve =
  | { kind: 'line'; p1: { x: number; y: number }; p2: { x: number; y: number } }
  | { kind: 'circle'; center: { x: number; y: number }; r: number }
  | { kind: 'arc'; center: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number } }

function flattenCubicBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  tol: number,
  out: { x: number; y: number }[],
) {
  // Distance from control points to line p0-p3
  const dx = p3.x - p0.x
  const dy = p3.y - p0.y
  const dSq = dx * dx + dy * dy
  let isFlat = true

  if (dSq > 1e-9) {
    const invD = 1 / Math.sqrt(dSq)
    const dist1 = Math.abs((p1.x - p0.x) * dy - (p1.y - p0.y) * dx) * invD
    const dist2 = Math.abs((p2.x - p0.x) * dy - (p2.y - p0.y) * dx) * invD
    if (dist1 > tol || dist2 > tol) {
      isFlat = false
    }
  }

  if (isFlat) {
    out.push(p3)
  } else {
    // Subdivide
    const p01 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
    const p12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    const p23 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 }
    const p012 = { x: (p01.x + p12.x) / 2, y: (p01.y + p12.y) / 2 }
    const p123 = { x: (p12.x + p23.x) / 2, y: (p12.y + p23.y) / 2 }
    const p0123 = { x: (p012.x + p123.x) / 2, y: (p012.y + p123.y) / 2 }

    flattenCubicBezier(p0, p01, p012, p0123, tol, out)
    flattenCubicBezier(p0123, p123, p23, p3, tol, out)
  }
}

function flattenQuadraticBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  tol: number,
  out: { x: number; y: number }[],
) {
  const dx = p2.x - p0.x
  const dy = p2.y - p0.y
  const dSq = dx * dx + dy * dy
  let isFlat = true

  if (dSq > 1e-9) {
    const dist = Math.abs((p1.x - p0.x) * dy - (p1.y - p0.y) * dx) / Math.sqrt(dSq)
    if (dist > tol) {
      isFlat = false
    }
  }

  if (isFlat) {
    out.push(p2)
  } else {
    const p01 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
    const p12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    const p012 = { x: (p01.x + p12.x) / 2, y: (p01.y + p12.y) / 2 }

    flattenQuadraticBezier(p0, p01, p012, tol, out)
    flattenQuadraticBezier(p012, p12, p2, tol, out)
  }
}

// Parse SVG path "d" attribute
function parsePathData(d: string, matrix: Matrix2D, tol: number): RawCurve[] {
  const curves: RawCurve[] = []
  const tokenRegex = /([a-df-z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/gi
  const tokens: string[] = []
  let tMatch: RegExpExecArray | null
  while ((tMatch = tokenRegex.exec(d)) !== null) {
    tokens.push(tMatch[1])
  }

  let i = 0
  let cur = { x: 0, y: 0 }
  let startSubpath = { x: 0, y: 0 }
  let lastCtrl: { x: number; y: number } | null = null
  let lastCmd = ''

  const nextNum = (): number => {
    if (i >= tokens.length) return 0
    return parseFloat(tokens[i++])
  }

  while (i < tokens.length) {
    let token = tokens[i]
    if (/^[a-df-z]$/i.test(token)) {
      lastCmd = token
      i++
    } else {
      // Repeat command
      if (lastCmd === 'M') lastCmd = 'L'
      else if (lastCmd === 'm') lastCmd = 'l'
    }

    const isRel = lastCmd === lastCmd.toLowerCase()
    const cmd = lastCmd.toUpperCase()

    switch (cmd) {
      case 'M': {
        const x = nextNum() + (isRel ? cur.x : 0)
        const y = nextNum() + (isRel ? cur.y : 0)
        cur = { x, y }
        startSubpath = { x, y }
        lastCtrl = null
        break
      }
      case 'L': {
        const x = nextNum() + (isRel ? cur.x : 0)
        const y = nextNum() + (isRel ? cur.y : 0)
        const target = { x, y }
        curves.push({
          kind: 'line',
          p1: applyMatrix(matrix, cur),
          p2: applyMatrix(matrix, target),
        })
        cur = target
        lastCtrl = null
        break
      }
      case 'H': {
        const x = nextNum() + (isRel ? cur.x : 0)
        const target = { x, y: cur.y }
        curves.push({
          kind: 'line',
          p1: applyMatrix(matrix, cur),
          p2: applyMatrix(matrix, target),
        })
        cur = target
        lastCtrl = null
        break
      }
      case 'V': {
        const y = nextNum() + (isRel ? cur.y : 0)
        const target = { x: cur.x, y }
        curves.push({
          kind: 'line',
          p1: applyMatrix(matrix, cur),
          p2: applyMatrix(matrix, target),
        })
        cur = target
        lastCtrl = null
        break
      }
      case 'C': {
        const x1 = nextNum() + (isRel ? cur.x : 0)
        const y1 = nextNum() + (isRel ? cur.y : 0)
        const x2 = nextNum() + (isRel ? cur.x : 0)
        const y2 = nextNum() + (isRel ? cur.y : 0)
        const x = nextNum() + (isRel ? cur.x : 0)
        const y = nextNum() + (isRel ? cur.y : 0)

        const pts: { x: number; y: number }[] = []
        flattenCubicBezier(cur, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y }, tol, pts)

        let prevPt = cur
        for (const pt of pts) {
          curves.push({
            kind: 'line',
            p1: applyMatrix(matrix, prevPt),
            p2: applyMatrix(matrix, pt),
          })
          prevPt = pt
        }
        cur = { x, y }
        lastCtrl = { x: x2, y: y2 }
        break
      }
      case 'S': {
        let x1 = cur.x
        let y1 = cur.y
        if (lastCtrl) {
          x1 = 2 * cur.x - lastCtrl.x
          y1 = 2 * cur.y - lastCtrl.y
        }
        const x2 = nextNum() + (isRel ? cur.x : 0)
        const y2 = nextNum() + (isRel ? cur.y : 0)
        const x = nextNum() + (isRel ? cur.x : 0)
        const y = nextNum() + (isRel ? cur.y : 0)

        const pts: { x: number; y: number }[] = []
        flattenCubicBezier(cur, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y }, tol, pts)

        let prevPt = cur
        for (const pt of pts) {
          curves.push({
            kind: 'line',
            p1: applyMatrix(matrix, prevPt),
            p2: applyMatrix(matrix, pt),
          })
          prevPt = pt
        }
        cur = { x, y }
        lastCtrl = { x: x2, y: y2 }
        break
      }
      case 'Q': {
        const x1 = nextNum() + (isRel ? cur.x : 0)
        const y1 = nextNum() + (isRel ? cur.y : 0)
        const x = nextNum() + (isRel ? cur.x : 0)
        const y = nextNum() + (isRel ? cur.y : 0)

        const pts: { x: number; y: number }[] = []
        flattenQuadraticBezier(cur, { x: x1, y: y1 }, { x, y }, tol, pts)

        let prevPt = cur
        for (const pt of pts) {
          curves.push({
            kind: 'line',
            p1: applyMatrix(matrix, prevPt),
            p2: applyMatrix(matrix, pt),
          })
          prevPt = pt
        }
        cur = { x, y }
        lastCtrl = { x: x1, y: y1 }
        break
      }
      case 'T': {
        let x1 = cur.x
        let y1 = cur.y
        if (lastCtrl) {
          x1 = 2 * cur.x - lastCtrl.x
          y1 = 2 * cur.y - lastCtrl.y
        }
        const x = nextNum() + (isRel ? cur.x : 0)
        const y = nextNum() + (isRel ? cur.y : 0)

        const pts: { x: number; y: number }[] = []
        flattenQuadraticBezier(cur, { x: x1, y: y1 }, { x, y }, tol, pts)

        let prevPt = cur
        for (const pt of pts) {
          curves.push({
            kind: 'line',
            p1: applyMatrix(matrix, prevPt),
            p2: applyMatrix(matrix, pt),
          })
          prevPt = pt
        }
        cur = { x, y }
        lastCtrl = { x: x1, y: y1 }
        break
      }
      case 'A': {
        const rx = Math.abs(nextNum())
        const ry = Math.abs(nextNum())
        const rot = (nextNum() * Math.PI) / 180
        const largeArc = nextNum() !== 0
        const sweep = nextNum() !== 0
        const endX = nextNum() + (isRel ? cur.x : 0)
        const endY = nextNum() + (isRel ? cur.y : 0)

        // Arc endpoints
        const p1 = cur
        const p2 = { x: endX, y: endY }

        // Standard SVG arc conversion to center parameterization
        if (rx > 1e-6 && ry > 1e-6) {
          const dx2 = (p1.x - p2.x) / 2
          const dy2 = (p1.y - p2.y) / 2
          const cosRot = Math.cos(rot)
          const sinRot = Math.sin(rot)
          const x1p = cosRot * dx2 + sinRot * dy2
          const y1p = -sinRot * dx2 + cosRot * dy2

          let rxSq = rx * rx
          let rySq = ry * ry
          const x1pSq = x1p * x1p
          const y1pSq = y1p * y1p

          const radCheck = x1pSq / rxSq + y1pSq / rySq
          let actualRx = rx
          let actualRy = ry
          if (radCheck > 1) {
            actualRx = Math.sqrt(radCheck) * rx
            actualRy = Math.sqrt(radCheck) * ry
            rxSq = actualRx * actualRx
            rySq = actualRy * actualRy
          }

          let sq = (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq)
          sq = Math.max(0, sq)
          const sign = largeArc === sweep ? -1 : 1
          const coef = sign * Math.sqrt(sq)
          const cxp = coef * ((actualRx * y1p) / actualRy)
          const cyp = coef * (-(actualRy * x1p) / actualRx)

          const cx = cosRot * cxp - sinRot * cyp + (p1.x + p2.x) / 2
          const cy = sinRot * cxp + cosRot * cyp + (p1.y + p2.y) / 2

          // If circular and similarity transform, keep as ArcCurve
          if (Math.abs(actualRx - actualRy) < 1e-4 && isSimilarityTransform(matrix)) {
            const centerTrans = applyMatrix(matrix, { x: cx, y: cy })
            const p1Trans = applyMatrix(matrix, p1)
            const p2Trans = applyMatrix(matrix, p2)
            curves.push({
              kind: 'arc',
              center: centerTrans,
              p1: sweep ? p1Trans : p2Trans,
              p2: sweep ? p2Trans : p1Trans,
            })
          } else {
            // Flatten arc
            const theta1 = Math.atan2((y1p - cyp) / actualRy, (x1p - cxp) / actualRx)
            let dTheta = Math.atan2((-y1p - cyp) / actualRy, (-x1p - cxp) / actualRx) - theta1
            if (sweep && dTheta < 0) dTheta += 2 * Math.PI
            else if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI

            const numSteps = Math.max(8, Math.ceil(Math.abs(dTheta) / 0.15))
            let prevPt = p1
            for (let step = 1; step <= numSteps; step++) {
              const th = theta1 + (dTheta * step) / numSteps
              const arcXp = actualRx * Math.cos(th)
              const arcYp = actualRy * Math.sin(th)
              const pt = {
                x: cosRot * arcXp - sinRot * arcYp + cx,
                y: sinRot * arcXp + cosRot * arcYp + cy,
              }
              curves.push({
                kind: 'line',
                p1: applyMatrix(matrix, prevPt),
                p2: applyMatrix(matrix, pt),
              })
              prevPt = pt
            }
          }
        }
        cur = { x: endX, y: endY }
        lastCtrl = null
        break
      }
      case 'Z': {
        if (Math.hypot(cur.x - startSubpath.x, cur.y - startSubpath.y) > 1e-5) {
          curves.push({
            kind: 'line',
            p1: applyMatrix(matrix, cur),
            p2: applyMatrix(matrix, startSubpath),
          })
        }
        cur = startSubpath
        lastCtrl = null
        break
      }
    }
  }

  return curves
}

export function parseSvg(svgText: string, options: SvgImportOptions = {}): SvgParseResult {
  if (svgText.length > 5 * 1024 * 1024) {
    throw new Error('sketch.error.fileTooLarge')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error('sketch.error.invalidSvg')
  }

  const svg = doc.querySelector('svg')
  if (!svg) {
    throw new Error('sketch.error.invalidSvg')
  }

  const notices: string[] = []
  const unsupportedTags = ['text', 'image', 'filter', 'use', 'clipPath', 'mask']
  for (const tag of unsupportedTags) {
    if (doc.querySelector(tag)) {
      notices.push(tag)
    }
  }

  const tol = options.tolerance ?? 0.02
  const rawCurves: RawCurve[] = []

  function walk(node: Element, currentMatrix: Matrix2D) {
    const transformAttr = node.getAttribute('transform')
    const matrix = transformAttr
      ? multiplyMatrix(currentMatrix, parseTransform(transformAttr))
      : currentMatrix

    const tag = node.tagName.toLowerCase()

    if (tag === 'path') {
      const d = node.getAttribute('d')
      if (d) {
        rawCurves.push(...parsePathData(d, matrix, tol))
      }
    } else if (tag === 'line') {
      const x1 = parseFloat(node.getAttribute('x1') ?? '0')
      const y1 = parseFloat(node.getAttribute('y1') ?? '0')
      const x2 = parseFloat(node.getAttribute('x2') ?? '0')
      const y2 = parseFloat(node.getAttribute('y2') ?? '0')
      rawCurves.push({
        kind: 'line',
        p1: applyMatrix(matrix, { x: x1, y: y1 }),
        p2: applyMatrix(matrix, { x: x2, y: y2 }),
      })
    } else if (tag === 'polyline' || tag === 'polygon') {
      const pointsAttr = node.getAttribute('points') ?? ''
      const pts = pointsAttr
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => !isNaN(n))
      for (let i = 0; i + 3 < pts.length; i += 2) {
        rawCurves.push({
          kind: 'line',
          p1: applyMatrix(matrix, { x: pts[i], y: pts[i + 1] }),
          p2: applyMatrix(matrix, { x: pts[i + 2], y: pts[i + 3] }),
        })
      }
      if (tag === 'polygon' && pts.length >= 4) {
        rawCurves.push({
          kind: 'line',
          p1: applyMatrix(matrix, { x: pts[pts.length - 2], y: pts[pts.length - 1] }),
          p2: applyMatrix(matrix, { x: pts[0], y: pts[1] }),
        })
      }
    } else if (tag === 'circle') {
      const cx = parseFloat(node.getAttribute('cx') ?? '0')
      const cy = parseFloat(node.getAttribute('cy') ?? '0')
      const r = parseFloat(node.getAttribute('r') ?? '0')
      if (r > 0) {
        if (isSimilarityTransform(matrix)) {
          const center = applyMatrix(matrix, { x: cx, y: cy })
          const scale = Math.hypot(matrix[0], matrix[1])
          rawCurves.push({
            kind: 'circle',
            center,
            r: r * scale,
          })
        } else {
          // Flatten circle into polygon
          const numSteps = 48
          let prevPt = applyMatrix(matrix, { x: cx + r, y: cy })
          for (let step = 1; step <= numSteps; step++) {
            const angle = (2 * Math.PI * step) / numSteps
            const pt = applyMatrix(matrix, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
            rawCurves.push({ kind: 'line', p1: prevPt, p2: pt })
            prevPt = pt
          }
        }
      }
    } else if (tag === 'ellipse') {
      const cx = parseFloat(node.getAttribute('cx') ?? '0')
      const cy = parseFloat(node.getAttribute('cy') ?? '0')
      const rx = parseFloat(node.getAttribute('rx') ?? '0')
      const ry = parseFloat(node.getAttribute('ry') ?? '0')
      if (rx > 0 && ry > 0) {
        const numSteps = 48
        let prevPt = applyMatrix(matrix, { x: cx + rx, y: cy })
        for (let step = 1; step <= numSteps; step++) {
          const angle = (2 * Math.PI * step) / numSteps
          const pt = applyMatrix(matrix, { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
          rawCurves.push({ kind: 'line', p1: prevPt, p2: pt })
          prevPt = pt
        }
      }
    } else if (tag === 'rect') {
      const x = parseFloat(node.getAttribute('x') ?? '0')
      const y = parseFloat(node.getAttribute('y') ?? '0')
      const w = parseFloat(node.getAttribute('width') ?? '0')
      const h = parseFloat(node.getAttribute('height') ?? '0')
      const rx = parseFloat(node.getAttribute('rx') ?? '0')
      const ry = parseFloat(node.getAttribute('ry') ?? String(rx))

      if (w > 0 && h > 0) {
        if (rx <= 0 && ry <= 0) {
          const p1 = applyMatrix(matrix, { x, y })
          const p2 = applyMatrix(matrix, { x: x + w, y })
          const p3 = applyMatrix(matrix, { x: x + w, y: y + h })
          const p4 = applyMatrix(matrix, { x, y: y + h })
          rawCurves.push({ kind: 'line', p1, p2 })
          rawCurves.push({ kind: 'line', p1: p2, p2: p3 })
          rawCurves.push({ kind: 'line', p1: p3, p2: p4 })
          rawCurves.push({ kind: 'line', p1: p4, p2: p1 })
        } else {
          // Rounded rect: draw 4 lines and 4 arcs/corners
          const rEffective = Math.min(rx, w / 2, h / 2)
          const pTopLeft = applyMatrix(matrix, { x: x + rEffective, y })
          const pTopRight = applyMatrix(matrix, { x: x + w - rEffective, y })
          const pRightTop = applyMatrix(matrix, { x: x + w, y: y + rEffective })
          const pRightBottom = applyMatrix(matrix, { x: x + w, y: y + h - rEffective })
          const pBottomRight = applyMatrix(matrix, { x: x + w - rEffective, y: y + h })
          const pBottomLeft = applyMatrix(matrix, { x: x + rEffective, y: y + h })
          const pLeftBottom = applyMatrix(matrix, { x, y: y + h - rEffective })
          const pLeftTop = applyMatrix(matrix, { x, y: y + rEffective })

          rawCurves.push({ kind: 'line', p1: pTopLeft, p2: pTopRight })
          rawCurves.push({ kind: 'line', p1: pRightTop, p2: pRightBottom })
          rawCurves.push({ kind: 'line', p1: pBottomRight, p2: pBottomLeft })
          rawCurves.push({ kind: 'line', p1: pLeftBottom, p2: pLeftTop })

          // Connect corners
          rawCurves.push({ kind: 'line', p1: pTopRight, p2: pRightTop })
          rawCurves.push({ kind: 'line', p1: pRightBottom, p2: pBottomRight })
          rawCurves.push({ kind: 'line', p1: pBottomLeft, p2: pLeftBottom })
          rawCurves.push({ kind: 'line', p1: pLeftTop, p2: pTopLeft })
        }
      }
    }

    // Children
    for (let c = 0; c < node.children.length; c++) {
      walk(node.children[c], matrix)
    }
  }

  walk(svg, identityMatrix())

  if (rawCurves.length > 50000) {
    throw new Error('sketch.error.tooManySegments')
  }

  // Calculate raw bounds in SVG space
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const c of rawCurves) {
    if (c.kind === 'line') {
      minX = Math.min(minX, c.p1.x, c.p2.x)
      maxX = Math.max(maxX, c.p1.x, c.p2.x)
      minY = Math.min(minY, c.p1.y, c.p2.y)
      maxY = Math.max(maxY, c.p1.y, c.p2.y)
    } else if (c.kind === 'circle') {
      minX = Math.min(minX, c.center.x - c.r)
      maxX = Math.max(maxX, c.center.x + c.r)
      minY = Math.min(minY, c.center.y - c.r)
      maxY = Math.max(maxY, c.center.y + c.r)
    } else if (c.kind === 'arc') {
      minX = Math.min(minX, c.center.x, c.p1.x, c.p2.x)
      maxX = Math.max(maxX, c.center.x, c.p1.x, c.p2.x)
      minY = Math.min(minY, c.center.y, c.p1.y, c.p2.y)
      maxY = Math.max(maxY, c.center.y, c.p1.y, c.p2.y)
    }
  }

  if (rawCurves.length === 0 || !isFinite(minX)) {
    minX = 0; maxX = 0; minY = 0; maxY = 0
  }

  const rawWidth = maxX - minX

  // Scale factor
  let scale = 25.4 / (options.dpi ?? 96)
  if (options.scaleMode === 'fitWidth' && options.fitWidthMm && rawWidth > 1e-6) {
    scale = options.fitWidthMm / rawWidth
  } else if (options.scaleMode === 'scale' && options.scale) {
    scale = options.scale
  }

  // Y is flipped: sketch Y = -SVG Y, centered at origin
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  const mapPoint = (p: { x: number; y: number }): { x: number; y: number } => {
    return {
      x: (p.x - centerX) * scale,
      y: -(p.y - centerY) * scale,
    }
  }

  // Build Sketch with shared points
  const plane: PlaneDefinition = options.existingSketch
    ? options.existingSketch.plane
    : (options.plane ?? { base: 'XY', offset: 0 })
  let sketch = options.existingSketch ?? createSketch(options.sketchName ?? 'SVG Import', plane)

  // Map of spatial points to pointIds for point merging (< 0.001 mm)
  const pointIds: { x: number; y: number; id: string }[] = options.existingSketch
    ? Object.entries(options.existingSketch.points).map(([id, pt]) => ({ x: pt.x, y: pt.y, id }))
    : []
  const getOrCreatePoint = (pt: { x: number; y: number }): string => {
    for (const ep of pointIds) {
      if (Math.hypot(ep.x - pt.x, ep.y - pt.y) < 0.001) {
        return ep.id
      }
    }
    const res = addPoint(sketch, pt.x, pt.y)
    sketch = res.sketch
    pointIds.push({ x: pt.x, y: pt.y, id: res.pointId })
    return res.pointId
  }

  for (const c of rawCurves) {
    if (c.kind === 'line') {
      const p1Mapped = mapPoint(c.p1)
      const p2Mapped = mapPoint(c.p2)
      if (Math.hypot(p2Mapped.x - p1Mapped.x, p2Mapped.y - p1Mapped.y) > 1e-5) {
        const id1 = getOrCreatePoint(p1Mapped)
        const id2 = getOrCreatePoint(p2Mapped)
        if (id1 !== id2) {
          const lRes = addLine(sketch, id1, id2, false)
          sketch = lRes.sketch
        }
      }
    } else if (c.kind === 'circle') {
      const centerMapped = mapPoint(c.center)
      const rMapped = c.r * scale
      if (rMapped > 1e-5) {
        const cId = getOrCreatePoint(centerMapped)
        const cRes = addCircle(sketch, cId, rMapped, false)
        sketch = cRes.sketch
      }
    } else if (c.kind === 'arc') {
      const centerMapped = mapPoint(c.center)
      const p1Mapped = mapPoint(c.p1)
      const p2Mapped = mapPoint(c.p2)
      // Note: Y flip reverses winding direction, so p1 and p2 swap
      const cId = getOrCreatePoint(centerMapped)
      const aId = getOrCreatePoint(p2Mapped)
      const bId = getOrCreatePoint(p1Mapped)
      if (aId !== bId && aId !== cId && bId !== cId) {
        const arcRes = addArc(sketch, cId, aId, bId, false)
        sketch = arcRes.sketch
      }
    }
  }

  // Calculate final bounds in sketch coordinates
  let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity
  for (const p of Object.values(sketch.points)) {
    sMinX = Math.min(sMinX, p.x)
    sMaxX = Math.max(sMaxX, p.x)
    sMinY = Math.min(sMinY, p.y)
    sMaxY = Math.max(sMaxY, p.y)
  }
  if (!isFinite(sMinX)) {
    sMinX = 0; sMaxX = 0; sMinY = 0; sMaxY = 0
  }

  return {
    sketch,
    segmentCount: Object.keys(sketch.curves).length,
    notices,
    bounds: { minX: sMinX, maxX: sMaxX, minY: sMinY, maxY: sMaxY },
  }
}
