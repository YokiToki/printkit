import type { Manifold, Mat4 } from 'manifold-3d'
import { getWasm } from '../wasm'
import { planeFrame, type Sketch, type LineCurve } from '../../editor/sketch/model'
import { extractProfiles, type ProfileRegion } from './profile'

export interface RevolveParams {
  sketchId?: string
  regions?: 'all' | string[]
  axis:
    | { kind: 'line'; curveId: string }
    | { kind: 'planeAxis'; axis: 'x' | 'y' }
  angle: number // degrees (1 to 360)
  op: 'new' | 'join' | 'cut' | 'intersect'
}

export interface RevolveResult {
  solid?: Manifold
  error?: string
}

export async function buildRevolve(
  sketch: Sketch,
  params: RevolveParams,
  options: { chordTolerance?: number; segments?: number } = {},
): Promise<RevolveResult> {
  const wasm = await getWasm()

  if (params.angle <= 0 || params.angle > 360) {
    return { error: 'sketch.error.invalidAngle' }
  }

  // 1. Determine axis base point and unit vector in 2D sketch plane
  let pAx: [number, number] = [0, 0]
  let uAx: [number, number] = [0, 1] // along axis
  let nAx: [number, number] = [1, 0] // normal to axis

  if (params.axis.kind === 'planeAxis') {
    if (params.axis.axis === 'y') {
      pAx = [0, 0]
      uAx = [0, 1]
      nAx = [1, 0]
    } else {
      pAx = [0, 0]
      uAx = [1, 0]
      nAx = [0, 1]
    }
  } else {
    const c = sketch.curves[params.axis.curveId] as LineCurve | undefined
    if (!c || c.kind !== 'line') {
      return { error: 'sketch.error.invalidAxis' }
    }
    const ptA = sketch.points[c.a]
    const ptB = sketch.points[c.b]
    if (!ptA || !ptB) {
      return { error: 'sketch.error.invalidAxis' }
    }
    const dx = ptB.x - ptA.x
    const dy = ptB.y - ptA.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) return { error: 'sketch.error.invalidAxis' }
    pAx = [ptA.x, ptA.y]
    uAx = [dx / len, dy / len]
    nAx = [-dy / len, dx / len]
  }

  // 2. Extract profiles
  const profileRes = extractProfiles(sketch, options)
  if (profileRes.errors && profileRes.errors.length > 0) {
    return { error: profileRes.errors[0].code }
  }

  let selectedRegions: ProfileRegion[] = profileRes.regions
  if (params.regions && params.regions !== 'all') {
    const ids = new Set(params.regions)
    selectedRegions = profileRes.regions.filter(r => ids.has(r.id))
  }

  if (selectedRegions.length === 0) {
    return { error: 'sketch.error.noProfiles' }
  }

  // 3. Project profile vertices to (radial distance, axial position)
  // Check if profile crosses axis
  let minR = Infinity
  let maxR = -Infinity

  for (const reg of selectedRegions) {
    for (const poly of [reg.outerLoop, ...reg.holes]) {
      for (const [x, y] of poly) {
        const vX = x - pAx[0]
        const vY = y - pAx[1]
        const r = vX * nAx[0] + vY * nAx[1]
        if (r < minR) minR = r
        if (r > maxR) maxR = r
      }
    }
  }

  if (minR < -1e-4 && maxR > 1e-4) {
    return { error: 'sketch.error.revolveCrossesAxis' }
  }

  // If on negative side, flip normal
  if (maxR <= 1e-4) {
    nAx = [-nAx[0], -nAx[1]]
  }

  // Build 2D cross-sections in (X = r, Y = z_ax)
  function toAxial(poly: [number, number][]): [number, number][] {
    return poly.map(([x, y]) => {
      const vX = x - pAx[0]
      const vY = y - pAx[1]
      const r = Math.max(0, vX * nAx[0] + vY * nAx[1])
      const zAx = vX * uAx[0] + vY * uAx[1]
      return [r, zAx]
    })
  }

  let combinedCs: any = null
  for (const reg of selectedRegions) {
    const polyList = [toAxial(reg.outerLoop), ...reg.holes.map(toAxial)]
    const cs = wasm.CrossSection.ofPolygons(polyList)
    combinedCs = combinedCs ? combinedCs.add(cs) : cs
  }
  if (!combinedCs) {
    return { error: 'sketch.error.noProfiles' }
  }

  const segments = options.segments ?? 48
  // In Manifold revolve: X in cs becomes radius, Y in cs becomes Z in solid!
  const localSolid = wasm.Manifold.revolve(combinedCs, segments, params.angle)

  // 4. Transform to 3D world space
  const frame = planeFrame(sketch.plane)

  // World vector for X in localSolid (radial direction at angle 0 = nAx)
  const dirX: [number, number, number] = [
    frame.xDir[0] * nAx[0] + frame.yDir[0] * nAx[1],
    frame.xDir[1] * nAx[0] + frame.yDir[1] * nAx[1],
    frame.xDir[2] * nAx[0] + frame.yDir[2] * nAx[1],
  ]

  // World vector for Y in localSolid (out of plane = normal)
  const dirY = frame.normal

  // World vector for Z in localSolid (axis direction = uAx)
  const dirZ: [number, number, number] = [
    frame.xDir[0] * uAx[0] + frame.yDir[0] * uAx[1],
    frame.xDir[1] * uAx[0] + frame.yDir[1] * uAx[1],
    frame.xDir[2] * uAx[0] + frame.yDir[2] * uAx[1],
  ]

  // Origin in world
  const originWorld = frame.toWorld(pAx)

  const mat: Mat4 = [
    dirX[0], dirX[1], dirX[2], 0,
    dirY[0], dirY[1], dirY[2], 0,
    dirZ[0], dirZ[1], dirZ[2], 0,
    originWorld[0], originWorld[1], originWorld[2], 1,
  ]

  const worldSolid = localSolid.transform(mat)
  return { solid: worldSolid }
}
