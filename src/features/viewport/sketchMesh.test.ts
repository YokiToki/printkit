import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildSketchGrid } from './sketchMesh'

describe('buildSketchGrid', () => {
  const xyPlane = { base: 'XY' as const, offset: 0 }

  it('creates an adaptive 5x5 shader plane and preserves colored X/Y axes and origin cross', () => {
    const group = buildSketchGrid(xyPlane, { size: 10, visible: true })

    // Should contain: shader plane mesh + X axis + Y axis + origin marker = 4 children
    expect(group.children).toHaveLength(4)

    const gridPlane = group.children.find((c) => c.name === 'sketch-grid-plane') as THREE.Mesh
    expect(gridPlane).toBeInstanceOf(THREE.Mesh)
    expect(gridPlane.renderOrder).toBe(-1)

    const mat = gridPlane.material as THREE.ShaderMaterial
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial)
    expect(group.userData.gridMaterial).toBe(mat)
    expect(mat.uniforms.uUseLocal.value).toBe(true)
    expect(mat.uniforms.uMinor.value).toBe(10)
    expect(mat.uniforms.uMajor.value).toBe(50)
    expect(mat.uniforms.uMajorAlpha.value).toBeGreaterThan(mat.uniforms.uMinorAlpha.value)

    // Verify colored axes and origin LineSegments are preserved
    const lineSegments = group.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[]
    expect(lineSegments).toHaveLength(3)
    const colors = lineSegments.map((ls) => (ls.material as THREE.LineBasicMaterial).color.getHex())
    expect(colors).toContain(0xf05060) // Red X axis
    expect(colors).toContain(0x2ecc71) // Green Y axis
    expect(colors).toContain(0xf7c948) // Yellow origin cross
  })

  it('returns an empty group when grid.visible is false', () => {
    const group = buildSketchGrid(xyPlane, { visible: false })
    expect(group.children).toHaveLength(0)
  })
})
