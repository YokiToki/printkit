import type { Manifold, Mat4 } from 'manifold-3d'
import { getWasm } from '../wasm'
import { planeFrame, type Sketch } from '../../editor/sketch/model'
import { extractProfiles, type ProfileRegion } from './profile'

export type EdgeBreak = {
  kind: 'chamfer' | 'fillet'
  size: number
}

export interface ExtrudeParams {
  sketchId?: string
  regions?: 'all' | string[]
  side: 'one' | 'symmetric' | 'two'
  d1: number
  d2?: number
  op: 'new' | 'join' | 'cut' | 'intersect'
  top?: EdgeBreak
  bottom?: EdgeBreak
}

import { applyEdgeBreaks } from './edgeBreak'

export interface ExtrudeResult {
  solid?: Manifold
  error?: string
  warning?: string
}

export function localToWorldMatrix(sketch: Sketch): Mat4 {
  const frame = planeFrame(sketch.plane)
  return [
    frame.xDir[0], frame.xDir[1], frame.xDir[2], 0,
    frame.yDir[0], frame.yDir[1], frame.yDir[2], 0,
    frame.normal[0], frame.normal[1], frame.normal[2], 0,
    frame.origin[0], frame.origin[1], frame.origin[2], 1,
  ]
}

export async function buildExtrude(
  sketch: Sketch,
  params: ExtrudeParams,
  options: { chordTolerance?: number } = {},
): Promise<ExtrudeResult> {
  const wasm = await getWasm()

  if (params.d1 <= 0 || (params.side === 'two' && (params.d2 ?? 0) <= 0)) {
    return { error: 'sketch.error.invalidDistance' }
  }

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

  // Combine cross-sections of selected regions
  let combinedCs: any = null
  for (const reg of selectedRegions) {
    const polyList = [reg.outerLoop, ...reg.holes]
    const cs = wasm.CrossSection.ofPolygons(polyList)
    combinedCs = combinedCs ? combinedCs.add(cs) : cs
  }
  if (!combinedCs) {
    return { error: 'sketch.error.noProfiles' }
  }

  let localSolid: Manifold
  let zMin = 0
  let zMax = params.d1
  if (params.side === 'one') {
    localSolid = combinedCs.extrude(params.d1)
    zMin = 0
    zMax = params.d1
  } else if (params.side === 'symmetric') {
    localSolid = combinedCs.extrude(params.d1).translate([0, 0, -params.d1 / 2])
    zMin = -params.d1 / 2
    zMax = params.d1 / 2
  } else {
    // 'two'
    const d2 = params.d2 ?? 0
    localSolid = combinedCs.extrude(params.d1 + d2).translate([0, 0, -d2])
    zMin = -d2
    zMax = params.d1
  }

  let warning: string | undefined
  if (params.top || params.bottom) {
    const breakRes = await applyEdgeBreaks({
      regions: selectedRegions,
      solid: localSolid,
      zMin,
      zMax,
      top: params.top,
      bottom: params.bottom,
    })
    localSolid = breakRes.solid
    warning = breakRes.warning
  }

  // Transform from sketch local coordinates to 3D world
  const mat = localToWorldMatrix(sketch)
  const worldSolid = localSolid.transform(mat)

  return { solid: worldSolid, warning }
}
