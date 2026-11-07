import type { CrossSection, Manifold, ManifoldToplevel, Mat4 } from 'manifold-3d'
import { crossSectionFromPolygons, type Pt } from '../../textShapes'

export type TextOpMode = 'emboss' | 'engrave'

export interface TextOpParams {
  point: [number, number, number] // in object-local space (surface anchor)
  normal: [number, number, number] // outward normal of the face
  up?: [number, number, number] // alignment axis
  text: string
  font?: string
  size: number // text height (capital letters), mm
  spacing?: number // letter spacing, mm (default 0)
  lineSpacing?: number // multiplier (default 1)
  align?: 'left' | 'center' | 'right'
  mode: TextOpMode
  height?: number // for emboss, mm (default 0.6)
  depth?: number // for engrave, mm (default 0.5)
  rotation?: number // deg
  polygons?: Pt[][] // precomputed outline loops (centered at origin)
}

function normalize3(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2])
  if (len < 1e-9) return [0, 0, 1]
  return [v[0] / len, v[1] / len, v[2] / len]
}

function cross3(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function dot3(
  a: [number, number, number],
  b: [number, number, number]
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/**
 * Builds a 4x4 matrix mapping local text coordinates (x along text baseline, y along text height, z along normal)
 * to object-local space.
 */
export function textToWorldMatrix(
  point: [number, number, number],
  normal: [number, number, number],
  suggestedUp?: [number, number, number],
  rotationDeg = 0
): Mat4 {
  const n = normalize3(normal)
  const ref: [number, number, number] =
    suggestedUp ?? (Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0])

  // Initial tangent axes: x along text baseline, y along text height
  let x0 = normalize3(cross3(ref, n))
  let y0 = normalize3(cross3(n, x0))

  if (Math.abs(rotationDeg) > 1e-6) {
    const rad = (rotationDeg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const xRot: [number, number, number] = [
      x0[0] * cos + y0[0] * sin,
      x0[1] * cos + y0[1] * sin,
      x0[2] * cos + y0[2] * sin,
    ]
    const yRot: [number, number, number] = [
      -x0[0] * sin + y0[0] * cos,
      -x0[1] * sin + y0[1] * cos,
      -x0[2] * sin + y0[2] * cos,
    ]
    x0 = xRot
    y0 = yRot
  }

  // 4x4 column-major matrix
  return [
    x0[0], x0[1], x0[2], 0,
    y0[0], y0[1], y0[2], 0,
    n[0], n[1], n[2], 0,
    point[0], point[1], point[2], 1,
  ]
}

/**
 * Generates simple fallback rectangular glyphs when polygons are not provided.
 */
function fallbackGlyphs(text: string, size: number, spacing = 0): Pt[][] {
  const chars = text.length > 0 ? text : ' '
  const glyphW = size * 0.6
  const glyphH = size
  const totalW = chars.length * glyphW + (chars.length - 1) * spacing
  const startX = -totalW / 2
  const startY = -glyphH / 2

  const polygons: Pt[][] = []
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === ' ') continue
    const x0 = startX + i * (glyphW + spacing)
    const y0 = startY
    polygons.push([
      [x0, y0],
      [x0 + glyphW, y0],
      [x0 + glyphW, y0 + glyphH],
      [x0, y0 + glyphH],
    ])
  }
  return polygons
}

/**
 * Builds the 3D tool solid for text emboss or engrave.
 * In local space:
 * - for emboss: starts -0.05 mm inside surface (z = -0.05) to z = height (thickness = height + 0.05)
 * - for engrave: starts 0.05 mm above surface (z = 0.05) to z = -depth (thickness = depth + 0.05)
 */
export function buildTextTool(
  w: ManifoldToplevel,
  params: TextOpParams
): { tool: Manifold; polygons: Pt[][]; area: number } {
  const polys =
    params.polygons && params.polygons.length > 0
      ? params.polygons
      : fallbackGlyphs(params.text, params.size, params.spacing)

  const cs = crossSectionFromPolygons(w, polys)
  const area = cs.area()

  const OVERLAP = 0.05 // mm overlap to avoid non-manifold coplanar faces
  let solid: Manifold

  if (params.mode === 'emboss') {
    const h = params.height ?? 0.6
    const totalH = h + OVERLAP
    const extr = w.Manifold.extrude(cs, totalH)
    solid = extr.translate([0, 0, -OVERLAP])
  } else {
    // engrave: cutter penetrates into material from z = OVERLAP down to z = -depth
    const d = params.depth ?? 0.5
    const totalD = d + OVERLAP
    const extr = w.Manifold.extrude(cs, totalD)
    solid = extr.translate([0, 0, -d])
  }

  const mat = textToWorldMatrix(
    params.point,
    params.normal,
    params.up,
    params.rotation ?? 0
  )
  const tool = solid.transform(mat)
  solid.delete()
  cs.delete()

  return { tool, polygons: polys, area }
}

/**
 * Checks whether the underlying target surface deviates significantly from the flat tangent plane
 * over the extent of the text.
 */
export function checkCurvedSurface(
  target: Manifold,
  params: TextOpParams,
  polygons: Pt[][]
): boolean {
  if (polygons.length === 0) return false

  // Find 2D bounds of text
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  for (const poly of polygons) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  const mat = textToWorldMatrix(
    params.point,
    params.normal,
    params.up,
    params.rotation ?? 0
  )
  const xAxis: [number, number, number] = [mat[0], mat[1], mat[2]]
  const yAxis: [number, number, number] = [mat[4], mat[5], mat[6]]
  const n: [number, number, number] = [mat[8], mat[9], mat[10]]

  const maxTolerance =
    params.mode === 'engrave' ? (params.depth ?? 0.5) : (params.height ?? 0.6)

  // Sample points: corners and center
  const samplePts: [number, number][] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [0, 0],
    [(minX + maxX) / 2, minY],
    [(minX + maxX) / 2, maxY],
  ]

  const RAY_OFFSET = 5.0 // shoot from 5 mm above the surface towards -n
  for (const [u, v] of samplePts) {
    const pOnPlane: [number, number, number] = [
      params.point[0] + u * xAxis[0] + v * yAxis[0],
      params.point[1] + u * xAxis[1] + v * yAxis[1],
      params.point[2] + u * xAxis[2] + v * yAxis[2],
    ]
    const rayOrigin: [number, number, number] = [
      pOnPlane[0] + n[0] * RAY_OFFSET,
      pOnPlane[1] + n[1] * RAY_OFFSET,
      pOnPlane[2] + n[2] * RAY_OFFSET,
    ]
    const rayDir: [number, number, number] = [-n[0], -n[1], -n[2]]

    const hits = target.rayCast(rayOrigin, rayDir)
    if (hits && hits.length > 0) {
      const hitPos = hits[0].position
      // Distance from hit position to tangent plane along normal n
      const dev = dot3([hitPos[0] - pOnPlane[0], hitPos[1] - pOnPlane[1], hitPos[2] - pOnPlane[2]], n)
      if (Math.abs(dev) > maxTolerance) {
        return true
      }
    }
  }

  return false
}

/**
 * Applies a text emboss or engrave operation to target solid.
 */
export function applyText(
  w: ManifoldToplevel,
  target: Manifold,
  params: TextOpParams
): { solid?: Manifold; error?: string; warning?: string; area?: number } {
  if (target.isEmpty() || target.status() !== 'NoError') {
    return { error: 'stack.error.notSolid' }
  }

  const { tool, polygons, area } = buildTextTool(w, params)
  const isCurved = checkCurvedSurface(target, params, polygons)
  const warning = isCurved ? 'text.warning.curved' : undefined

  let result: Manifold
  if (params.mode === 'emboss') {
    result = target.add(tool)
  } else {
    result = target.subtract(tool)
  }
  tool.delete()

  if (result.status() !== 'NoError') {
    result.delete()
    return { error: 'text.error.failed' }
  }

  return { solid: result, warning, area }
}
