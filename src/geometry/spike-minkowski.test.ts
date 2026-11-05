import { describe, it, expect } from 'vitest'
import { getWasm } from './wasm'
import { expectValidSolid } from './testing'

describe('1.1 Minkowski spike', () => {
  it('benchmarks minkowskiSum and minkowskiDifference on cube and shapes', async () => {
    const w = await getWasm()

    // 1. Cube 20x20x20
    const cube = w.Manifold.cube([20, 20, 20], true)
    
    // Check sphere circumscribed / inscribed properties
    // In Manifold: sphere(radius, segments)
    // Vertices of sphere lie on the sphere of radius R => circumscribed sphere has radius R.
    // The inscribed radius of a regular polyhedral approximation is R * cos(pi / segments).
    for (const seg of [16, 24, 48]) {
      const sp = w.Manifold.sphere(2, seg)
      const bb = sp.boundingBox()
      console.log(`Sphere r=2, seg=${seg}: bb min=${bb.min}, max=${bb.max}, tris=${sp.numTri()}`)
      
      const t0 = performance.now()
      const sum = cube.minkowskiSum(sp)
      const t1 = performance.now()
      const sumBb = sum.boundingBox()
      console.log(`Cube + Sphere(r=2, seg=${seg}): ${(t1 - t0).toFixed(2)} ms, tris=${sum.numTri()}, bounds=[${sumBb.min.map(v => v.toFixed(3))}], [${sumBb.max.map(v => v.toFixed(3))}]`)
      expect(sumBb.max[0]).toBeCloseTo(12, 1)

      let diffOk = false
      let diffTime = 0
      let diffTris = 0
      let diffMin = 0
      let diffMax = 0
      try {
        const td0 = performance.now()
        const diff = cube.minkowskiDifference(sp)
        const td1 = performance.now()
        diffOk = true
        diffTime = td1 - td0
        diffTris = diff.numTri()
        const diffBb = diff.boundingBox()
        diffMin = diffBb.min[0]
        diffMax = diffBb.max[0]
        console.log(`Cube - Sphere(r=2, seg=${seg}): ${diffTime.toFixed(2)} ms, tris=${diffTris}, bounds=[${diffBb.min.map(v => v.toFixed(3))}], [${diffBb.max.map(v => v.toFixed(3))}]`)
        diff.delete()
      } catch (err) {
        console.log(`Cube - Sphere(r=2, seg=${seg}) failed:`, err)
      }

      sum.delete()
      sp.delete()
    }

    // 2. Rounded bracket (cylinder + cube)
    const base = w.Manifold.cube([40, 20, 10], true)
    const cyl = w.Manifold.cylinder(15, 8, 8, 32).translate([10, 0, -7.5])
    const bracket = base.add(cyl)
    base.delete(); cyl.delete()
    console.log(`Bracket tris: ${bracket.numTri()}`)

    for (const seg of [16, 24, 48]) {
      const sp = w.Manifold.sphere(1.5, seg)
      const t0 = performance.now()
      const sum = bracket.minkowskiSum(sp)
      const t1 = performance.now()
      console.log(`Bracket + Sphere(r=1.5, seg=${seg}): ${(t1 - t0).toFixed(2)} ms, tris=${sum.numTri()}`)
      
      try {
        const td0 = performance.now()
        const diff = bracket.minkowskiDifference(sp)
        const td1 = performance.now()
        console.log(`Bracket - Sphere(r=1.5, seg=${seg}): ${(td1 - td0).toFixed(2)} ms, tris=${diff.numTri()}`)
        diff.delete()
      } catch (e) {
        console.log(`Bracket - Sphere diff failed:`, e)
      }
      sum.delete()
      sp.delete()
    }
    bracket.delete()

    // 3. High triangle count test (~50k triangles for fast routine tests)
    const highPoly = w.Manifold.sphere(20, 300) // 45k triangles
    console.log(`High-poly mesh tris: ${highPoly.numTri()}`)
    const sp = w.Manifold.sphere(1.0, 16)
    const t0 = performance.now()
    try {
      const sum = highPoly.minkowskiSum(sp)
      const t1 = performance.now()
      console.log(`High-poly (${highPoly.numTri()} tris) + Sphere(seg=16): ${(t1 - t0).toFixed(2)} ms, result tris=${sum.numTri()}`)
      sum.delete()
    } catch (e) {
      console.log(`High-poly sum failed:`, e)
    }
    sp.delete()
    highPoly.delete()
    cube.delete()
  }, 120000)

  it('1.2 Cache: prototypes prefix LRU cache and measures 5-op stack edit', async () => {
    const w = await getWasm()

    class PrefixCache {
      private map = new Map<string, { solid: any; triCount: number; lastUsed: number }>()
      private totalTriangles = 0
      public evictions = 0
      public deletions = 0

      constructor(private maxTriangles: number = 6_000_000) {}

      get(key: string) {
        const item = this.map.get(key)
        if (item) {
          item.lastUsed = performance.now()
          return item.solid
        }
        return undefined
      }

      set(key: string, solid: any) {
        if (this.map.has(key)) {
          const old = this.map.get(key)!
          this.totalTriangles -= old.triCount
          old.solid.delete()
          this.deletions++
          this.map.delete(key)
        }

        const triCount = solid.numTri()
        // Evict if over budget
        while (this.totalTriangles + triCount > this.maxTriangles && this.map.size > 0) {
          let oldestKey: string | undefined
          let oldestTime = Infinity
          for (const [k, v] of this.map.entries()) {
            if (v.lastUsed < oldestTime) {
              oldestTime = v.lastUsed
              oldestKey = k
            }
          }
          if (!oldestKey) break
          const toEvict = this.map.get(oldestKey)!
          this.totalTriangles -= toEvict.triCount
          toEvict.solid.delete()
          this.deletions++
          this.evictions++
          this.map.delete(oldestKey)
        }

        this.map.set(key, { solid, triCount, lastUsed: performance.now() })
        this.totalTriangles += triCount
      }

      clear() {
        for (const v of this.map.values()) {
          v.solid.delete()
          this.deletions++
        }
        this.map.clear()
        this.totalTriangles = 0
      }

      size() {
        return this.map.size
      }

      triangles() {
        return this.totalTriangles
      }
    }

    const cache = new PrefixCache(50_000) // 50k tris budget for test

    function evaluateStep(step: number, prevSolid: any, opParam: number) {
      switch (step) {
        case 1: {
          const c = w.Manifold.cylinder(30, 5, 5, 24).translate([0, 0, -5])
          const res = prevSolid.add(c)
          c.delete()
          return res
        }
        case 2: {
          const s = w.Manifold.sphere(6 + opParam, 24).translate([0, 0, 10])
          const res = prevSolid.subtract(s)
          s.delete()
          return res
        }
        case 3: {
          const c = w.Manifold.cylinder(10, 8, 8, 24).translate([5, 5, 0])
          const res = prevSolid.add(c)
          c.delete()
          return res
        }
        case 4: {
          const cb = w.Manifold.cube([5 + opParam, 5, 5], true).translate([-5, -5, 0])
          const res = prevSolid.subtract(cb)
          cb.delete()
          return res
        }
        case 5: {
          const s = w.Manifold.sphere(3, 16).translate([0, 0, -10])
          const res = prevSolid.add(s)
          s.delete()
          return res
        }
        default:
          return prevSolid
      }
    }

    function evaluateStack(opParams: number[]) {
      let startIndex = 0
      let currentSolid = w.Manifold.cube([20, 20, 20], true)
      let prefixKey = 'src:cube'

      const cachedSrc = cache.get(prefixKey)
      if (cachedSrc) {
        currentSolid.delete()
        currentSolid = cachedSrc.asOriginal()
      } else {
        cache.set(prefixKey, currentSolid.asOriginal())
      }

      for (let i = 0; i < opParams.length; i++) {
        const nextKey = `${prefixKey}|op${i + 1}:${opParams[i]}`
        const cached = cache.get(nextKey)
        if (cached && startIndex === i) {
          currentSolid.delete()
          currentSolid = cached.asOriginal()
          startIndex = i + 1
          prefixKey = nextKey
        } else {
          break
        }
      }

      let recomputedCount = 0
      for (let i = startIndex; i < opParams.length; i++) {
        recomputedCount++
        const nextKey = `${prefixKey}|op${i + 1}:${opParams[i]}`
        const nextSolid = evaluateStep(i + 1, currentSolid, opParams[i])
        currentSolid.delete()
        currentSolid = nextSolid
        cache.set(nextKey, currentSolid.asOriginal())
        prefixKey = nextKey
      }

      return { solid: currentSolid, recomputedCount }
    }

    const t0 = performance.now()
    const run1 = evaluateStack([0, 0, 0, 0, 0])
    const t1 = performance.now()
    expect(run1.recomputedCount).toBe(5)
    console.log(`Initial 5-op evaluation: ${(t1 - t0).toFixed(2)} ms, tris=${run1.solid.numTri()}`)
    run1.solid.delete()

    const t2 = performance.now()
    const run2 = evaluateStack([0, 0, 0, 2, 0])
    const t3 = performance.now()
    expect(run2.recomputedCount).toBe(2)
    console.log(`Edit op 4: ${(t3 - t2).toFixed(2)} ms, recomputed: ${run2.recomputedCount} ops (speedup: ${((t1 - t0) / (t3 - t2)).toFixed(1)}x)`)
    run2.solid.delete()

    cache.clear()
    expect(cache.size()).toBe(0)
    expect(cache.triangles()).toBe(0)
  })
})
