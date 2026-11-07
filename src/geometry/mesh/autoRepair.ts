import type { ManifoldToplevel } from 'manifold-3d'
import type { IndexedMesh, TriSoup } from '../stl-import'
import { weld } from './weld'
import { removeDegenerate } from './removeDegenerate'
import { fixOrientation } from './orient'
import { fillHoles } from './fillHoles'
import { removeShells } from './shells'
import { analyze, type MeshAnalysis } from './analyze'
import { makeSolid } from './makeSolid'

export interface AutoRepairOptions {
  w?: ManifoldToplevel
  maxHolePerimeter?: number
  allowMakeSolid?: boolean
}

export interface AutoRepairStepSummary {
  weldedVertices: number
  removedDegenerate: number
  removedDuplicates: number
  flippedTriangles: number
  invertedShells: number
  filledLoops: number
  removedTinyShells: number
  usedMakeSolid: boolean
}

export interface AutoRepairResult {
  mesh: IndexedMesh
  steps: AutoRepairStepSummary
  beforeAnalysis: MeshAnalysis
  afterAnalysis: MeshAnalysis
  isSolid: boolean
}

/**
 * Executes standard automatic repair sequence:
 * weld -> remove degenerate/duplicates -> fix orientation -> fill holes -> remove tiny shells -> re-analyze.
 * If problems remain and allowMakeSolid is enabled, runs Make Solid.
 */
export function autoRepair(
  mesh: TriSoup | IndexedMesh,
  options: AutoRepairOptions = {}
): AutoRepairResult {
  const beforeAnalysis = analyze(mesh)

  // 1. Weld
  const weldRes = weld(mesh)
  let curMesh = weldRes.mesh

  // 2. Remove degenerate / duplicate
  const degenRes = removeDegenerate(curMesh)
  curMesh = degenRes.mesh

  // 3. Fix orientation
  const orientRes = fixOrientation(curMesh)
  curMesh = orientRes.mesh

  // 4. Fill holes (default 20 mm perimeter limit)
  const holeRes = fillHoles(curMesh, {
    maxPerimeter: options.maxHolePerimeter ?? 20.0,
    mode: 'flat',
  })
  curMesh = holeRes.mesh

  // 5. Remove tiny shells (< 0.1% volume of largest)
  let removedTinyShells = 0
  const curAnalysis = analyze(curMesh)
  if (curAnalysis.shells.length > 1) {
    let maxVol = 0
    for (const s of curAnalysis.shells) {
      if (Math.abs(s.volume) > maxVol) maxVol = Math.abs(s.volume)
    }
    const tinyThreshold = maxVol * 0.001
    const shellRes = removeShells(curMesh, { maxVolume: tinyThreshold })
    curMesh = shellRes.mesh
    removedTinyShells = shellRes.report.removedShells
  }

  // 6. Re-analyze
  let afterAnalysis = analyze(curMesh)
  let usedMakeSolid = false

  // 7. Make Solid if needed and allowed
  if (!afterAnalysis.isSolid && options.allowMakeSolid && options.w) {
    try {
      const solidRes = makeSolid(options.w, curMesh)
      curMesh = solidRes.mesh
      afterAnalysis = analyze(curMesh)
      usedMakeSolid = true
    } catch {
      // If Make Solid fails (e.g. over budget), keep current repair
    }
  }

  return {
    mesh: curMesh,
    steps: {
      weldedVertices: weldRes.report.mergedVertices,
      removedDegenerate: degenRes.report.removedDegenerate,
      removedDuplicates: degenRes.report.removedDuplicates,
      flippedTriangles: orientRes.report.flippedTriangles,
      invertedShells: orientRes.report.invertedShells,
      filledLoops: holeRes.report.filledLoops,
      removedTinyShells,
      usedMakeSolid,
    },
    beforeAnalysis,
    afterAnalysis,
    isSolid: afterAnalysis.isSolid,
  }
}
