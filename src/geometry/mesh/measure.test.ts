import { describe, it, expect } from 'vitest'
import {
  measureDistance,
  measureAngle,
  fitCircle3D,
  measureWallThickness,
  snapToMesh,
  type Vec3,
} from './measure'
import type { IndexedMesh } from '../stl-import'

describe('measure helpers', () => {
  it('measures distance between opposite corners of a 40x30x20 block', () => {
    const p1: Vec3 = [0, 0, 0]
    const p2: Vec3 = [40, 30, 20]
    const d = measureDistance(p1, p2)
    expect(d).toBeCloseTo(53.8516, 3)
    expect(d.toFixed(2)).toBe('53.85')
  })

  it('measures angle between three points', () => {
    const pA: Vec3 = [10, 0, 0]
    const pVertex: Vec3 = [0, 0, 0]
    const pC: Vec3 = [0, 10, 0]
    const angle = measureAngle(pA, pVertex, pC)
    expect(angle).toBeCloseTo(90, 5)

    const angle180 = measureAngle([-10, 0, 0], [0, 0, 0], [10, 0, 0])
    expect(angle180).toBeCloseTo(180, 5)
  })

  it('fits 3D circle to points with diameter 6 mm', () => {
    const radius = 3.0
    const points: Vec3[] = []
    const numPoints = 8
    for (let i = 0; i < numPoints; i++) {
      const theta = (i * 2 * Math.PI) / numPoints
      points.push([radius * Math.cos(theta), radius * Math.sin(theta), 5.0])
    }

    const fit = fitCircle3D(points)
    expect(fit).not.toBeNull()
    if (!fit) return

    expect(fit.diameter).toBeCloseTo(6.0, 4)
    expect(fit.radius).toBeCloseTo(3.0, 4)
    expect(fit.center[0]).toBeCloseTo(0, 4)
    expect(fit.center[1]).toBeCloseTo(0, 4)
    expect(fit.center[2]).toBeCloseTo(5.0, 4)
    expect(fit.residual).toBeLessThan(1e-4)
    expect(Math.abs(fit.normal[2])).toBeCloseTo(1.0, 4)
  })

  it('measures wall thickness on a 2 mm wall', () => {
    // Two parallel quads at z = 0 and z = -2, normal facing +Z
    // Quad at z = 0 (two triangles)
    // Quad at z = -2 (two triangles)
    const mesh: IndexedMesh = {
      vertProperties: new Float32Array([
        // Top face z = 0
        0, 0, 0,
        10, 0, 0,
        10, 10, 0,
        0, 10, 0,
        // Bottom face z = -2
        0, 0, -2,
        10, 0, -2,
        10, 10, -2,
        0, 10, -2,
      ]),
      triVerts: new Uint32Array([
        0, 1, 2,  0, 2, 3, // top
        4, 6, 5,  4, 7, 6, // bottom
      ]),
    }

    const hitPoint: Vec3 = [5, 5, 0]
    const normal: Vec3 = [0, 0, 1] // outward normal
    const thickness = measureWallThickness(hitPoint, normal, mesh)

    expect(thickness).not.toBeNull()
    expect(thickness).toBeCloseTo(2.0, 4)
  })

  it('snaps to vertex, edge midpoint, face center, and free point', () => {
    const mesh: IndexedMesh = {
      vertProperties: new Float32Array([
        0, 0, 0,
        10, 0, 0,
        0, 10, 0,
      ]),
      triVerts: new Uint32Array([0, 1, 2]),
    }

    // 1-to-1 projection to 2D
    const project = (p: Vec3) => ({ x: p[0], y: p[1] })

    // Pick near vertex [0, 0, 0]
    const snapVert = snapToMesh([0.1, 0.1, 0], 0, mesh, project, 1)
    expect(snapVert.kind).toBe('vertex')
    expect(snapVert.point).toEqual([0, 0, 0])

    // Pick near edge midpoint [5, 0, 0]
    const snapEdge = snapToMesh([5.05, 0.05, 0], 0, mesh, project, 1)
    expect(snapEdge.kind).toBe('edge')
    expect(snapEdge.point).toEqual([5, 0, 0])

    // Pick near face center [10/3, 10/3, 0] ≈ [3.333, 3.333, 0]
    const snapFace = snapToMesh([3.35, 3.35, 0], 0, mesh, project, 1)
    expect(snapFace.kind).toBe('face')
    expect(snapFace.point[0]).toBeCloseTo(10 / 3, 4)
    expect(snapFace.point[1]).toBeCloseTo(10 / 3, 4)

    // Pick far away from everything in the triangle
    const snapFree = snapToMesh([2, 2, 0], 0, mesh, project, 0.1)
    expect(snapFree.kind).toBe('free')
    expect(snapFree.point).toEqual([2, 2, 0])
  })
})
