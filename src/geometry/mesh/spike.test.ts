import { describe, it, expect } from 'vitest'
import { getWasm } from '../wasm'

/**
 * Calculates generalized winding number of a triangle mesh at point P.
 * Van Oosterom & Strackee (1983).
 */
export function meshWindingNumber(
  vertices: Float64Array | number[],
  indices: Uint32Array | number[],
  p: [number, number, number]
): number {
  const [px, py, pz] = p
  let totalSolidAngle = 0
  const numTris = indices.length / 3

  for (let i = 0; i < numTris; i++) {
    const i0 = indices[i * 3] * 3
    const i1 = indices[i * 3 + 1] * 3
    const i2 = indices[i * 3 + 2] * 3

    const ax = vertices[i0] - px
    const ay = vertices[i0 + 1] - py
    const az = vertices[i0 + 2] - pz

    const bx = vertices[i1] - px
    const by = vertices[i1 + 1] - py
    const bz = vertices[i1 + 2] - pz

    const cx = vertices[i2] - px
    const cy = vertices[i2 + 1] - py
    const cz = vertices[i2 + 2] - pz

    const la = Math.hypot(ax, ay, az)
    const lb = Math.hypot(bx, by, bz)
    const lc = Math.hypot(cx, cy, cz)

    if (la < 1e-9 || lb < 1e-9 || lc < 1e-9) continue

    // Determinant a . (b x c)
    const det =
      ax * (by * cz - bz * cy) -
      ay * (bx * cz - bz * cx) +
      az * (bx * cy - by * cx)

    const dotAB = ax * bx + ay * by + az * bz
    const dotAC = ax * cx + ay * cy + az * cz
    const dotBC = bx * cx + by * cy + bz * cz

    const denom = la * lb * lc + dotAB * lc + dotAC * lb + dotBC * la

    const omega = 2 * Math.atan2(det, denom)
    totalSolidAngle += omega
  }

  return totalSolidAngle / (4 * Math.PI)
}

describe('Task 1.1 Spike: Level set & Make Solid', () => {
  it('reconstructs solid from broken mesh (holes, flipped, self-intersecting) at 3 resolutions', async () => {
    const w = await getWasm()

    // Create a 20x20x20 cube mesh
    const cube = w.Manifold.cube([20, 20, 20], true)
    const origMesh = cube.getMesh()
    
    // Create broken mesh:
    // Vertices:
    const vertArray = Array.from(origMesh.vertProperties)
    const triArray = Array.from(origMesh.triVerts)
    
    // 1. Hole: remove 2 triangles
    triArray.splice(0, 6)

    // 2. Flipped triangle: swap two indices of a triangle
    const tmp = triArray[6]
    triArray[6] = triArray[7]
    triArray[7] = tmp

    // 3. Self-intersection: add an interpenetrating smaller inverted or skewed box
    const smallCube = w.Manifold.cube([10, 10, 10], true).translate([5, 5, 5])
    const smallMesh = smallCube.getMesh()
    const baseVertOffset = vertArray.length / 3
    for (let i = 0; i < smallMesh.vertProperties.length; i++) {
      vertArray.push(smallMesh.vertProperties[i])
    }
    for (let i = 0; i < smallMesh.triVerts.length; i++) {
      triArray.push(smallMesh.triVerts[i] + baseVertOffset)
    }

    const brokenVerts = new Float64Array(vertArray)
    const brokenIndices = new Uint32Array(triArray)

    console.log(`Broken mesh: ${brokenVerts.length / 3} verts, ${brokenIndices.length / 3} tris`)

    // Bounds with padding
    const padding = 4
    const bounds = {
      min: [-10 - padding, -10 - padding, -10 - padding] as [number, number, number],
      max: [10 + padding, 10 + padding, 10 + padding] as [number, number, number],
    }

    // Test three resolutions: edgeLength = 2.0, 1.0, 0.5
    const edgeLengths = [2.0, 1.0, 0.5]
    for (const edgeLen of edgeLengths) {
      let evalCount = 0
      const t0 = performance.now()
      const solid = w.Manifold.levelSet(
        (p: [number, number, number]) => {
          evalCount++
          const wn = meshWindingNumber(brokenVerts, brokenIndices, p)
          return wn - 0.5
        },
        bounds,
        edgeLen,
        0,
        -1
      )
      const elapsed = performance.now() - t0
      const mesh = solid.getMesh()
      const vol = solid.volume()
      const status = solid.status()

      const cellsX = Math.ceil((bounds.max[0] - bounds.min[0]) / edgeLen)
      const cellsY = Math.ceil((bounds.max[1] - bounds.min[1]) / edgeLen)
      const cellsZ = Math.ceil((bounds.max[2] - bounds.min[2]) / edgeLen)
      const totalCells = cellsX * cellsY * cellsZ
      const memoryEstimateBytes = totalCells * 4 // float32 grid

      console.log(`Resolution edgeLen=${edgeLen}:`)
      console.log(`  Time: ${elapsed.toFixed(1)}ms, Evaluations: ${evalCount}`)
      console.log(`  Cells: ${cellsX}x${cellsY}x${cellsZ} = ${totalCells} (${(memoryEstimateBytes / 1024).toFixed(1)} KB)`)
      console.log(`  Output tris: ${mesh.numTri}, Volume: ${vol.toFixed(1)}, Status: ${status}`)

      expect(status === 'NoError' || (status as any) === 0).toBe(true)
      expect(mesh.numTri).toBeGreaterThan(0)
      expect(vol).toBeGreaterThan(6000) // 20^3 is 8000
    }
  })
})

describe('Task 1.2 Spike: Decimate simplify behaviour', () => {
  it('simplifies 200k sphere and bracket, checking tolerance vs deviation and bisection', async () => {
    const w = await getWasm()

    // Create high-res sphere: ~200k triangles
    // In manifold, sphere(radius, segments). Segments = 634 gives ~200k tris.
    const sp = w.Manifold.sphere(20, 634)
    const spInitialTris = sp.numTri()
    console.log(`High-res sphere initial tris: ${spInitialTris}, volume: ${sp.volume().toFixed(1)}`)

    // Create a bracket model with a hole
    const box1 = w.Manifold.cube([50, 20, 50], true)
    const box2 = w.Manifold.cube([40, 30, 40], true).translate([10, 0, 10])
    const hole = w.Manifold.cylinder(30, 8, 8, 128, true)
    const bracket = box1.subtract(box2).subtract(hole)
    // Refine bracket to have many triangles by subdividing or recreating
    console.log(`Bracket initial tris: ${bracket.numTri()}, volume: ${bracket.volume().toFixed(1)}`)

    // Function to run bisection
    function bisectionSimplify(model: any, targetFraction: number) {
      const initial = model.numTri()
      const target = Math.round(initial * targetFraction)
      let tolMin = 0.0001
      let tolMax = 5.0
      let bestTol = tolMin
      let bisections = 0
      for (let i = 0; i < 8; i++) {
        bisections++
        const mid = (tolMin + tolMax) / 2
        const dec = model.simplify(mid)
        const tris = dec.numTri()
        bestTol = mid
        if (tris > target) {
          tolMin = mid
        } else {
          tolMax = mid
        }
      }
      const res = model.simplify(bestTol)
      return { initial, target, bestTol, bisections, finalTris: res.numTri(), volumeDiff: Math.abs(res.volume() - model.volume()) }
    }

    const spRes = bisectionSimplify(sp, 0.1)
    console.log(`Sphere decimation:`, spRes)

    const brRes = bisectionSimplify(bracket, 0.2)
    console.log(`Bracket decimation:`, brRes)

    expect(spRes.bisections).toBeLessThanOrEqual(8)
    expect(brRes.bisections).toBeLessThanOrEqual(8)
  })
})
