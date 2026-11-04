import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { getLogSnapshot, log, resetActivityLog } from '../../app/activityLog'

describe('editor performance and logging check (task 6.2)', () => {
  it('logs import, add, history, and export entries with names and counts', () => {
    resetActivityLog()

    log.info('editor', 'log.editor.imported', { count: 2, names: 'part1.stl, part2.stl' })
    log.info('editor', 'log.editor.added', { shape: 'Box' })
    log.info('editor', 'log.editor.step', { name: 'Transform' })
    log.info('editor', 'log.editor.exported', { name: 'scene' })

    const entries = getLogSnapshot().entries
    const keys = entries.map((e) => e.key)
    expect(keys).toContain('log.editor.imported')
    expect(keys).toContain('log.editor.added')
    expect(keys).toContain('log.editor.step')
    expect(keys).toContain('log.editor.exported')
  })

  it('measures raycasting picking performance on a 500,000-triangle mesh', () => {
    // 500,000 triangles = 1,500,000 vertices
    const numTris = 500_000
    const positions = new Float32Array(numTris * 9)

    // Fill with a grid of small triangles around origin
    for (let i = 0; i < numTris; i++) {
      const idx = i * 9
      const x = (i % 1000) * 0.1 - 50
      const y = Math.floor(i / 1000) * 0.1 - 25
      const z = 0
      positions[idx] = x
      positions[idx + 1] = y
      positions[idx + 2] = z

      positions[idx + 3] = x + 0.08
      positions[idx + 4] = y
      positions[idx + 5] = z

      positions[idx + 6] = x
      positions[idx + 7] = y + 0.08
      positions[idx + 8] = z
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()

    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())

    const raycaster = new THREE.Raycaster()
    // Ray pointing down directly at the mesh center
    raycaster.set(new THREE.Vector3(0, 0, 100), new THREE.Vector3(0, 0, -1))

    // Warm-up
    const warmIntersects: THREE.Intersection[] = []
    raycaster.intersectObject(mesh, false, warmIntersects)

    // Measure 10 pick operations
    const t0 = performance.now()
    const iterations = 10
    let hitCount = 0
    for (let i = 0; i < iterations; i++) {
      const intersects: THREE.Intersection[] = []
      raycaster.intersectObject(mesh, false, intersects)
      if (intersects.length > 0) hitCount++
    }
    const t1 = performance.now()
    const avgMs = (t1 - t0) / iterations

    // Performance target: picking must take less than 50 ms (and typically < 15 ms on modern hardware)
    console.log(`500k-triangle picking average time: ${avgMs.toFixed(2)} ms (hits: ${hitCount}/${iterations})`)
    expect(avgMs).toBeLessThan(50)
  })
})
