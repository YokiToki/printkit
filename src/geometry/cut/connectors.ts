import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import { getWasm } from '../wasm'
import type { PlaneFrame } from './section'
import type { Vec2, Polygon } from './place'
import { signedDistToPolygon } from './place'
import type { Vec3 } from './plane'

export type CutConnectorKind = 'pegs' | 'pins' | 'magnets' | 'dovetail'

export interface CutConnectorConfig {
  kind: CutConnectorKind
  diameter?: number // for pegs, pins, magnets (default from preset)
  depth?: number // length/depth per side
  height?: number // magnet thickness
  clearance?: number // default 0.2
  tolerance?: number // default 0.1
  neck?: number // dovetail neck
  tip?: number // dovetail tip
  dovetailDepth?: number
  dovetailHeight?: number
  positions: Vec2[] // positions in (u, v) coordinates on the cut plane
}

export interface ConnectorReport {
  index: number
  position: Vec2
  kind: CutConnectorKind
  valid: boolean
  issue?: 'outside' | 'thin' | 'overlap'
  clampedDepth?: number
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/**
 * Measures the available material depth behind the cut starting at p0
 * and going in direction dir (normal or -normal).
 */
export function measureMaterialDepth(
  solid: Manifold,
  p0: Vec3,
  dir: Vec3,
  maxSearch = 500
): number {
  // Shoot from p0 + dir * maxSearch backwards towards p0 with direction -dir
  const farPoint: Vec3 = [
    p0[0] + dir[0] * maxSearch,
    p0[1] + dir[1] * maxSearch,
    p0[2] + dir[2] * maxSearch,
  ]
  const backDir: Vec3 = [-dir[0], -dir[1], -dir[2]]

  const hits = solid.rayCast(farPoint, backDir)
  if (!hits || hits.length === 0) {
    // If no ray hit found, fallback to bounding box span along dir
    const bbox = solid.boundingBox()
    const dx = bbox.max[0] - bbox.min[0]
    const dy = bbox.max[1] - bbox.min[1]
    const dz = bbox.max[2] - bbox.min[2]
    return Math.max(dx, dy, dz)
  }

  const hitPos = hits[0].position
  const depth = Math.hypot(hitPos[0] - p0[0], hitPos[1] - p0[1], hitPos[2] - p0[2])
  return depth
}

/**
 * Builds a 4x4 matrix mapping cylinder local coords (z along normal, centered at p0) to world.
 */
function cylinderToWorldMatrix(frame: PlaneFrame, pos: Vec2): number[] {
  const p0 = frame.toWorld(pos)
  // [ u.x  v.x  n.x  p0.x ]
  // [ u.y  v.y  n.y  p0.y ]
  // [ u.z  v.z  n.z  p0.z ]
  // [  0    0    0    1   ]
  return [
    frame.u[0], frame.u[1], frame.u[2], 0,
    frame.v[0], frame.v[1], frame.v[2], 0,
    frame.normal[0], frame.normal[1], frame.normal[2], 0,
    p0[0], p0[1], p0[2], 1,
  ]
}

export interface ApplyConnectorsResult {
  partA: Manifold
  partB: Manifold
  loosePins?: Manifold[]
  reports: ConnectorReport[]
}

/**
 * Applies connectors (pegs, pin holes, magnets, dovetail) across Part A and Part B.
 * Part A is on the negative normal side (material in direction -normal).
 * Part B is on the positive normal side (material in direction +normal).
 */
export async function applyCutConnectors(
  partA: Manifold,
  partB: Manifold,
  frame: PlaneFrame,
  sectionPolygons: Polygon[],
  config: CutConnectorConfig
): Promise<ApplyConnectorsResult> {
  const w = await getWasm()
  const reports: ConnectorReport[] = []
  let resA = partA
  let resB = partB
  const loosePins: Manifold[] = []

  const clearance = config.clearance ?? 0.2
  const tolerance = config.tolerance ?? 0.1

  if (config.kind === 'dovetail') {
    // Dovetail join
    const neck = config.neck ?? 6
    const tip = config.tip ?? 10
    const depth = config.dovetailDepth ?? 2
    const height = config.dovetailHeight ?? 20

    // Measure material depth at center of cut
    const pCenter = frame.toWorld([0, 0])
    const depthA = measureMaterialDepth(partA, pCenter, [-frame.normal[0], -frame.normal[1], -frame.normal[2]])
    const depthB = measureMaterialDepth(partB, pCenter, frame.normal)

    if (depthA < depth + 1.0 || depthB < depth + 1.0) {
      reports.push({
        index: 0,
        position: [0, 0],
        kind: 'dovetail',
        valid: false,
        issue: 'thin',
      })
      return { partA, partB, reports }
    }

    // Trapezoid CrossSection in (u, normal) plane:
    // Key sits on part A: normal goes from 0 to +depth
    // Base width neck at normal = 0, tip at normal = depth
    const keyPoly: [number, number][] = [
      [-neck / 2, 0],
      [neck / 2, 0],
      [tip / 2, depth],
      [-tip / 2, depth],
    ]
    const keyCs = w.CrossSection.ofPolygons([keyPoly])
    // Extrude along v axis by height
    const keySolid = keyCs.extrude(height, 0, 0, [1, 1])
    // Center in v: translate by -height/2 along z (extrusion axis is Z)
    const centeredKey = keySolid.translate([0, 0, -height / 2])

    // Matrix mapping (u, normal, v) to world:
    // x -> u, y -> normal, z -> v
    const matDovetail: number[] = [
      frame.u[0], frame.u[1], frame.u[2], 0,
      frame.normal[0], frame.normal[1], frame.normal[2], 0,
      frame.v[0], frame.v[1], frame.v[2], 0,
      pCenter[0], pCenter[1], pCenter[2], 1,
    ]
    const keyWorld = centeredKey.transform(matDovetail)

    // Socket on Part B is grown by clearance
    const socketPoly: [number, number][] = [
      [-neck / 2 - clearance, -0.1],
      [neck / 2 + clearance, -0.1],
      [tip / 2 + clearance, depth + clearance],
      [-tip / 2 - clearance, depth + clearance],
    ]
    const socketCs = w.CrossSection.ofPolygons([socketPoly])
    const socketSolid = socketCs.extrude(height + clearance * 2, 0, 0, [1, 1])
    const centeredSocket = socketSolid.translate([0, 0, -(height + clearance * 2) / 2])
    const socketWorld = centeredSocket.transform(matDovetail)

    // Union key on Part A, subtract socket from Part B
    resA = w.Manifold.union(partA, keyWorld)
    resB = w.Manifold.difference(partB, socketWorld)

    reports.push({
      index: 0,
      position: [0, 0],
      kind: 'dovetail',
      valid: true,
    })

    return { partA: resA, partB: resB, reports }
  }

  // Cylindrical connectors: pegs, pins, magnets
  const nominalDiam = config.diameter ?? (config.kind === 'magnets' ? 3.0 : 3.0)
  const nominalDepth = config.depth ?? (config.kind === 'magnets' ? 2.0 : 6.0)

  for (let idx = 0; idx < config.positions.length; idx++) {
    const pos = config.positions[idx]
    const pWorld = frame.toWorld(pos)

    // 1. Check distance to section boundary
    const distToEdge = signedDistToPolygon(pos, sectionPolygons)
    if (distToEdge < nominalDiam / 2) {
      reports.push({
        index: idx,
        position: pos,
        kind: config.kind,
        valid: false,
        issue: distToEdge < 0 ? 'outside' : 'thin',
      })
      continue
    }

    // 2. Measure material depth behind cut in both parts
    const depthA = measureMaterialDepth(partA, pWorld, [-frame.normal[0], -frame.normal[1], -frame.normal[2]])
    const depthB = measureMaterialDepth(partB, pWorld, frame.normal)
    const minMatDepth = Math.min(depthA, depthB)

    if (minMatDepth < 2.0) {
      reports.push({
        index: idx,
        position: pos,
        kind: config.kind,
        valid: false,
        issue: 'thin',
      })
      continue
    }

    // Clamp depth so connector does not breach the opposite wall (keep at least 1.5 mm wall)
    const effectiveDepth = Math.min(nominalDepth, minMatDepth - 1.5)

    const mat = cylinderToWorldMatrix(frame, pos)

    if (config.kind === 'pegs') {
      // Peg on Part A extends from z = 0 to z = +effectiveDepth (into Part B)
      // Tip chamfer: cylinder of height effectiveDepth
      const pegCyl = w.Manifold.cylinder(effectiveDepth, nominalDiam / 2, (nominalDiam / 2) - 0.4, 32, false)
      const pegWorld = pegCyl.transform(mat)

      // Socket in Part B: from z = -0.1 to z = effectiveDepth + 0.3
      const socketDiam = (nominalDiam + clearance) / 2
      const socketLen = effectiveDepth + 0.3
      const socketCyl = w.Manifold.cylinder(socketLen, socketDiam, socketDiam, 32, false)
      // Position socket to start slightly outside plane (at -0.1)
      const socketWorld = socketCyl.translate([0, 0, -0.1]).transform(mat)

      // Collision/containment check
      const insideB = w.Manifold.intersection(partB, socketWorld)
      const socketVol = socketWorld.volume()
      if (socketVol > 0 && insideB.volume() / socketVol < 0.90) {
        reports.push({
          index: idx,
          position: pos,
          kind: 'pegs',
          valid: false,
          issue: 'overlap',
        })
        continue
      }

      resA = w.Manifold.union(resA, pegWorld)
      resB = w.Manifold.difference(resB, socketWorld)

      reports.push({
        index: idx,
        position: pos,
        kind: 'pegs',
        valid: true,
        clampedDepth: effectiveDepth,
      })
    } else if (config.kind === 'pins') {
      // Pin hole in Part A (z = 0 to -effectiveDepth) and Part B (z = 0 to +effectiveDepth)
      const radius = (nominalDiam + clearance) / 2
      const holeA = w.Manifold.cylinder(effectiveDepth, radius, radius, 32, false)
      const holeWorldA = holeA.translate([0, 0, -effectiveDepth]).transform(mat)

      const holeB = w.Manifold.cylinder(effectiveDepth, radius, radius, 32, false)
      const holeWorldB = holeB.transform(mat)

      resA = w.Manifold.difference(resA, holeWorldA)
      resB = w.Manifold.difference(resB, holeWorldB)

      // Loose pin solid (diameter nominalDiam, length 2 * effectiveDepth - 0.4)
      const pinTotalLen = effectiveDepth * 2 - 0.4
      const pinSolid = w.Manifold.cylinder(pinTotalLen, nominalDiam / 2, (nominalDiam / 2) - 0.2, 32, false)
      loosePins.push(pinSolid.translate([0, 0, -pinTotalLen / 2]).transform(mat))

      reports.push({
        index: idx,
        position: pos,
        kind: 'pins',
        valid: true,
        clampedDepth: effectiveDepth,
      })
    } else if (config.kind === 'magnets') {
      // Magnet pocket in both parts
      const radius = (nominalDiam + tolerance) / 2
      const pocketDepth = (config.height ?? 2.0) + tolerance

      const magA = w.Manifold.cylinder(pocketDepth, radius, radius, 32, false)
      const magWorldA = magA.translate([0, 0, -pocketDepth]).transform(mat)

      const magB = w.Manifold.cylinder(pocketDepth, radius, radius, 32, false)
      const magWorldB = magB.transform(mat)

      resA = w.Manifold.difference(resA, magWorldA)
      resB = w.Manifold.difference(resB, magWorldB)

      reports.push({
        index: idx,
        position: pos,
        kind: 'magnets',
        valid: true,
        clampedDepth: pocketDepth,
      })
    }
  }

  return {
    partA: resA,
    partB: resB,
    loosePins: loosePins.length > 0 ? loosePins : undefined,
    reports,
  }
}
