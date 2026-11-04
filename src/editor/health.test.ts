import { describe, expect, it } from 'vitest'
import { boxSoup } from '../geometry/stl-fixtures'
import type { TriSoup } from '../geometry/stl-import'
import { isSolid, meshHealth } from './health'

describe('editor/health', () => {
  it('correctly reports closed cube as solid with positive volume', () => {
    // 10 x 10 x 10 cube
    const soup = boxSoup(10, 10, 10)
    const h = meshHealth(soup)

    expect(h.triangles).toBe(12)
    expect(h.openEdges).toBe(0)
    expect(h.nonManifoldEdges).toBe(0)
    expect(h.degenerate).toBe(0)
    expect(h.volume).toBeCloseTo(1000)
    expect(h.closed).toBe(true)
    expect(isSolid(h)).toBe(true)
    expect(isSolid(soup)).toBe(true)
  })

  it('detects missing triangle as open edges and not solid', () => {
    const soup = boxSoup(10, 10, 10)
    // Drop 1 triangle (positions has 12 * 9 floats, drop last 9)
    const incomplete: TriSoup = {
      positions: soup.positions.slice(0, 11 * 9),
    }

    const h = meshHealth(incomplete)
    expect(h.triangles).toBe(11)
    expect(h.openEdges).toBe(3) // The three boundary edges of the removed triangle
    expect(h.closed).toBe(false)
    expect(isSolid(h)).toBe(false)
  })

  it('detects flipped cube having negative volume and not solid', () => {
    const soup = boxSoup(10, 10, 10)
    const flippedPositions = new Float32Array(soup.positions.length)

    // Swap second and third vertex of each triangle
    for (let t = 0; t < 12; t++) {
      const idx = t * 9
      // vertex 1
      flippedPositions[idx] = soup.positions[idx]
      flippedPositions[idx + 1] = soup.positions[idx + 1]
      flippedPositions[idx + 2] = soup.positions[idx + 2]

      // vertex 2 <- original vertex 3
      flippedPositions[idx + 3] = soup.positions[idx + 6]
      flippedPositions[idx + 4] = soup.positions[idx + 7]
      flippedPositions[idx + 5] = soup.positions[idx + 8]

      // vertex 3 <- original vertex 2
      flippedPositions[idx + 6] = soup.positions[idx + 3]
      flippedPositions[idx + 7] = soup.positions[idx + 4]
      flippedPositions[idx + 8] = soup.positions[idx + 5]
    }

    const flippedSoup: TriSoup = { positions: flippedPositions }
    const h = meshHealth(flippedSoup)

    expect(h.triangles).toBe(12)
    expect(h.openEdges).toBe(0)
    expect(h.volume).toBeCloseTo(-1000)
    expect(h.volume).toBeLessThan(0)
    expect(isSolid(h)).toBe(false)
  })

  it('detects degenerate triangle and counts it', () => {
    const soup = boxSoup(10, 10, 10)
    // Add one degenerate triangle (vertices a, a, b)
    const withDegenerate = new Float32Array(soup.positions.length + 9)
    withDegenerate.set(soup.positions)
    // Triangle: (0,0,0), (0,0,0), (1,1,1)
    withDegenerate.set([0, 0, 0, 0, 0, 0, 1, 1, 1], soup.positions.length)

    const degenSoup: TriSoup = { positions: withDegenerate }
    const h = meshHealth(degenSoup)

    expect(h.triangles).toBe(13)
    expect(h.degenerate).toBe(1)
    expect(h.closed).toBe(false)
    expect(isSolid(h)).toBe(false)
  })
})
