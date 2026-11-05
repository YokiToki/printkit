import type { Manifold } from 'manifold-3d'

export class PrefixCache {
  private map = new Map<string, { solid: Manifold; triCount: number; lastUsed: number }>()
  private totalTriangles = 0
  public hits = 0
  public misses = 0
  public evictions = 0
  public deletions = 0

  constructor(public maxTriangles: number = 6_000_000) {}

  get(key: string): Manifold | undefined {
    const item = this.map.get(key)
    if (item) {
      item.lastUsed = performance.now()
      this.hits++
      return item.solid
    }
    this.misses++
    return undefined
  }

  set(key: string, solid: Manifold): void {
    if (this.map.has(key)) {
      const old = this.map.get(key)!
      this.totalTriangles -= old.triCount
      old.solid.delete()
      this.deletions++
      this.map.delete(key)
    }

    const triCount = solid.numTri()
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

    this.map.set(key, { solid: solid.asOriginal(), triCount, lastUsed: performance.now() })
    this.totalTriangles += triCount
  }

  delete(key: string): void {
    const item = this.map.get(key)
    if (item) {
      this.totalTriangles -= item.triCount
      item.solid.delete()
      this.deletions++
      this.map.delete(key)
    }
  }

  clear(): void {
    for (const item of this.map.values()) {
      item.solid.delete()
      this.deletions++
    }
    this.map.clear()
    this.totalTriangles = 0
  }

  size(): number {
    return this.map.size
  }

  triangles(): number {
    return this.totalTriangles
  }
}
