import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createGridMaterial, updateGridMaterialUniforms } from './gridMaterial'

describe('gridMaterial', () => {
  it('initializes shader material with required uniforms', () => {
    const mat = createGridMaterial()
    expect(mat.transparent).toBe(true)
    expect(mat.depthWrite).toBe(false)
    expect(mat.side).toBe(THREE.DoubleSide)

    const u = mat.uniforms
    expect(u.uMinor.value).toBe(10)
    expect(u.uMajor.value).toBe(50)
    expect(u.uSubFade.value).toBe(1)
    expect(u.uAlpha.value).toBe(1)
    expect(u.uFade.value).toBe(600)
    expect(u.uUseLocal.value).toBe(false)
  })

  it('respects custom configuration options', () => {
    const mat = createGridMaterial({
      color: 0xff0000,
      useLocal: true,
      alpha: 0.8,
      fade: 1200,
      majorAlpha: 0.6,
      minorAlpha: 0.2,
    })
    const u = mat.uniforms
    expect(u.uUseLocal.value).toBe(true)
    expect(u.uAlpha.value).toBe(0.8)
    expect(u.uFade.value).toBe(1200)
    expect(u.uMajorAlpha.value).toBe(0.6)
    expect(u.uMinorAlpha.value).toBe(0.2)
    expect(u.uColor.value.getHex()).toBe(0xff0000)
  })

  it('updates dynamic uniforms with grid levels', () => {
    const mat = createGridMaterial()
    updateGridMaterialUniforms(
      mat,
      { minor: 2, major: 10, fade: 0.45, mmPerPx: 0.1 },
      { alpha: 0.75, fade: 800, center: new THREE.Vector3(10, 20, 0) },
    )
    const u = mat.uniforms
    expect(u.uMinor.value).toBe(2)
    expect(u.uMajor.value).toBe(10)
    expect(u.uSubFade.value).toBe(0.45)
    expect(u.uAlpha.value).toBe(0.75)
    expect(u.uFade.value).toBe(800)
    expect(u.uCenter.value.x).toBe(10)
    expect(u.uCenter.value.y).toBe(20)
  })
})
