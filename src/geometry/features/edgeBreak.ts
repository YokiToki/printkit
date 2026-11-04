import type { Manifold } from 'manifold-3d'
import { getWasm } from '../wasm'
import type { EdgeBreak } from './extrude'
import type { ProfileRegion } from './profile'
import { polygonArea } from './profile'

interface Vec2 {
  x: number
  y: number
}

function computeNormals(pts: [number, number][]): Vec2[] {
  const n = pts.length
  const normals: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const next = pts[(i + 1) % n]
    const dx = next[0] - pts[i][0]
    const dy = next[1] - pts[i][1]
    const len = Math.hypot(dx, dy) || 1e-9
    normals.push({ x: -dy / len, y: dx / len })
  }
  return normals
}

export function offsetLoop(rawPoly: [number, number][], inset: number): [number, number][] | null {
  // Deduplicate consecutive identical points
  const poly: [number, number][] = []
  for (let i = 0; i < rawPoly.length; i++) {
    const pt = rawPoly[i]
    if (poly.length === 0) {
      poly.push(pt)
    } else {
      const prev = poly[poly.length - 1]
      if (Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 1e-5) {
        poly.push(pt)
      }
    }
  }
  // Also check last with first
  if (poly.length > 2) {
    const first = poly[0]
    const last = poly[poly.length - 1]
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-5) {
      poly.pop()
    }
  }

  const n = poly.length
  if (n < 3) return null
  const normals = computeNormals(poly)
  const result: [number, number][] = []

  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n
    const n1 = normals[prev]
    const n2 = normals[i]
    const bx = n1.x + n2.x
    const by = n1.y + n2.y
    const bLen = Math.hypot(bx, by)
    if (bLen < 1e-6) {
      result.push([poly[i][0] + n2.x * inset, poly[i][1] + n2.y * inset])
      continue
    }
    const cosHalf = (n1.x * bx + n1.y * by) / bLen
    if (cosHalf < 0.15) {
      return null
    }
    const scale = inset / cosHalf
    result.push([
      poly[i][0] + (bx / bLen) * scale,
      poly[i][1] + (by / bLen) * scale,
    ])
  }

  // Collapse check: area must retain the same sign and not collapse below 5%
  const origArea = polygonArea(poly)
  const newArea = polygonArea(result)
  if (origArea > 0 && (newArea <= 0 || newArea < origArea * 0.05)) return null
  if (origArea < 0 && (newArea >= 0 || Math.abs(newArea) < Math.abs(origArea) * 0.05)) return null

  return result
}

export interface ApplyEdgeBreaksOptions {
  regions: ProfileRegion[]
  solid: Manifold
  zMin: number
  zMax: number
  top?: EdgeBreak
  bottom?: EdgeBreak
}

export async function applyEdgeBreaks(
  options: ApplyEdgeBreaksOptions,
): Promise<{ solid: Manifold; warning?: string }> {
  const { regions, solid, zMin, zMax, top, bottom } = options
  const wasm = await getWasm()
  let currentSolid = solid
  let warning: string | undefined

  const totalHeight = zMax - zMin

  // Apply top edge break
  if (top && top.size > 0) {
    if (top.size >= totalHeight * 0.49) {
      warning = 'sketch.warning.edgeBreakTooLarge'
    } else {
      let canApply = true
      const insetRegionsList: [number, number][][][] = []

      for (const reg of regions) {
        const insetOuter = offsetLoop(reg.outerLoop, top.size)
        if (!insetOuter) {
          canApply = false
          break
        }
        const insetHoles: [number, number][][] = []
        for (const hole of reg.holes) {
          const insetHole = offsetLoop(hole, top.size)
          if (!insetHole) {
            canApply = false
            break
          }
          insetHoles.push(insetHole)
        }
        if (!canApply) break
        insetRegionsList.push([insetOuter, ...insetHoles])
      }

      if (!canApply) {
        warning = 'sketch.warning.edgeBreakTooLarge'
      } else {
        // Build chamfer/fillet
        const basePolyList = regions.flatMap(reg => [reg.outerLoop, ...reg.holes])
        const insetPolyList = insetRegionsList.flat()

        const csBase = wasm.CrossSection.ofPolygons(basePolyList)
        const csTop = wasm.CrossSection.ofPolygons(insetPolyList)

        if (top.kind === 'chamfer') {
          const slabBase = csBase.extrude(0.001).translate([0, 0, zMax - top.size])
          const slabTop = csTop.extrude(0.001).translate([0, 0, zMax - 0.001])
          const collar = wasm.Manifold.hull([slabBase, slabTop])
          slabBase.delete()
          slabTop.delete()
          const fullExtrusionCap = csBase.extrude(top.size).translate([0, 0, zMax - top.size])
          const cutter = fullExtrusionCap.subtract(collar)
          fullExtrusionCap.delete()
          collar.delete()
          const next = currentSolid.subtract(cutter)
          currentSolid.delete()
          cutter.delete()
          currentSolid = next
        } else {
          // Fillet via 4 lofted bands following circular profile
          const K = 4
          const fullExtrusionCap = csBase.extrude(top.size).translate([0, 0, zMax - top.size])
          let combinedCollar: Manifold | null = null

          for (let k = 0; k < K; k++) {
            const phi1 = (Math.PI / 2) * (k / K)
            const phi2 = (Math.PI / 2) * ((k + 1) / K)

            const inset1 = top.size * (1 - Math.cos(phi1))
            const inset2 = top.size * (1 - Math.cos(phi2))
            const z1 = zMax - top.size + top.size * Math.sin(phi1)
            const z2 = zMax - top.size + top.size * Math.sin(phi2)

            const polys1 = regions.flatMap(reg => {
              const o = offsetLoop(reg.outerLoop, inset1) ?? reg.outerLoop
              const h = reg.holes.map(hole => offsetLoop(hole, inset1) ?? hole)
              return [o, ...h]
            })
            const polys2 = regions.flatMap(reg => {
              const o = offsetLoop(reg.outerLoop, inset2) ?? reg.outerLoop
              const h = reg.holes.map(hole => offsetLoop(hole, inset2) ?? hole)
              return [o, ...h]
            })

            const cs1 = wasm.CrossSection.ofPolygons(polys1)
            const cs2 = wasm.CrossSection.ofPolygons(polys2)
            const s1 = cs1.extrude(0.001).translate([0, 0, z1])
            const s2 = cs2.extrude(0.001).translate([0, 0, Math.max(z1 + 0.001, z2 - 0.001)])
            const band = wasm.Manifold.hull([s1, s2])
            s1.delete()
            s2.delete()
            combinedCollar = combinedCollar ? combinedCollar.add(band) : band
          }

          if (combinedCollar) {
            const cutter = fullExtrusionCap.subtract(combinedCollar)
            fullExtrusionCap.delete()
            combinedCollar.delete()
            const next = currentSolid.subtract(cutter)
            currentSolid.delete()
            cutter.delete()
            currentSolid = next
          }
        }
      }
    }
  }

  // Apply bottom edge break
  if (bottom && bottom.size > 0) {
    if (bottom.size >= totalHeight * 0.49) {
      warning = 'sketch.warning.edgeBreakTooLarge'
    } else {
      let canApply = true
      const insetRegionsList: [number, number][][][] = []

      for (const reg of regions) {
        const insetOuter = offsetLoop(reg.outerLoop, bottom.size)
        if (!insetOuter) {
          canApply = false
          break
        }
        const insetHoles: [number, number][][] = []
        for (const hole of reg.holes) {
          const insetHole = offsetLoop(hole, bottom.size)
          if (!insetHole) {
            canApply = false
            break
          }
          insetHoles.push(insetHole)
        }
        if (!canApply) break
        insetRegionsList.push([insetOuter, ...insetHoles])
      }

      if (!canApply) {
        warning = 'sketch.warning.edgeBreakTooLarge'
      } else {
        const basePolyList = regions.flatMap(reg => [reg.outerLoop, ...reg.holes])
        const insetPolyList = insetRegionsList.flat()

        const csBase = wasm.CrossSection.ofPolygons(basePolyList)
        const csBot = wasm.CrossSection.ofPolygons(insetPolyList)

        if (bottom.kind === 'chamfer') {
          const slabBase = csBase.extrude(0.001).translate([0, 0, zMin + bottom.size - 0.001])
          const slabBot = csBot.extrude(0.001).translate([0, 0, zMin])
          const collar = wasm.Manifold.hull([slabBase, slabBot])
          slabBase.delete()
          slabBot.delete()
          const fullExtrusionCap = csBase.extrude(bottom.size).translate([0, 0, zMin])
          const cutter = fullExtrusionCap.subtract(collar)
          fullExtrusionCap.delete()
          collar.delete()
          const next = currentSolid.subtract(cutter)
          currentSolid.delete()
          cutter.delete()
          currentSolid = next
        }
      }
    }
  }

  return { solid: currentSolid, warning }
}
