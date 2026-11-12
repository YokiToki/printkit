// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import type { ModelResult } from '../../geometry/model'
import { Viewport } from './Viewport'

// Mock Three.js WebGLRenderer in jsdom
let lastAnimationLoop: (() => void) | null = null
let lastRenderedScene: import('three').Scene | null = null
let lastRenderedCamera: import('three').Camera | null = null

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class MockWebGLRenderer {
    domElement = document.createElement('canvas')
    autoClear = false
    info = { render: { triangles: 0, calls: 0 } }
    setSize = vi.fn()
    setPixelRatio = vi.fn()
    setAnimationLoop = vi.fn((cb: (() => void) | null) => {
      lastAnimationLoop = cb
    })
    clear = vi.fn()
    clearDepth = vi.fn()
    render = vi.fn((scene: import('three').Scene, camera: import('three').Camera) => {
      if (!lastRenderedScene) {
        lastRenderedScene = scene
        lastRenderedCamera = camera
      }
    })
    setViewport = vi.fn()
    setScissor = vi.fn()
    setScissorTest = vi.fn()
    dispose = vi.fn()
  }
  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  }
})

describe('Viewport', () => {
  const dummyMesh = {
    vertProperties: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]),
    triVerts: new Uint32Array([0, 1, 2]),
    numProp: 3,
    min: [0, 0, 0] as [number, number, number],
    max: [10, 10, 10] as [number, number, number],
    volume: 1000,
  }

  const model: ModelResult = {
    parts: [
      { label: 'part-1', col: 0, row: 0, oversize: false, mesh: dummyMesh },
      { label: 'part-2', col: 1, row: 0, oversize: false, mesh: dummyMesh },
    ],
  }

  afterEach(() => {
    vi.clearAllMocks()
    lastAnimationLoop = null
    lastRenderedScene = null
    lastRenderedCamera = null
  })

  it('renders generator mode as before without scene prop', () => {
    const { container } = render(<Viewport model={model} plate={null} />)
    expect(container.querySelector('canvas')).toBeDefined()
    expect(container.querySelector('[data-testid="view-cube"]')).toBeNull()
  })

  it('renders scene mode with ViewCube when scene prop is provided', () => {
    const sceneConfig = {
      matrices: {
        'part-1': [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1] as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number],
        'part-2': [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 40, 50, 60, 1] as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number],
      },
      selection: ['part-1'],
      locked: ['part-2'],
      hidden: [],
    }

    const { container } = render(
      <Viewport
        model={model}
        plate={null}
        scene={sceneConfig}
        onPick={vi.fn()}
      />
    )

    expect(container.querySelector('[data-testid="view-cube"]')).toBeDefined()
  })

  it('updates ground grid 5x5 levels and hides grid below XY plane in animation loop', () => {
    render(<Viewport model={model} plate={null} />)
    expect(lastAnimationLoop).toBeTypeOf('function')
    lastAnimationLoop!()
    expect(lastRenderedScene).not.toBeNull()
    expect(lastRenderedCamera).not.toBeNull()

    const gridMesh = lastRenderedScene!.children.find((c) => c.renderOrder === -1) as import('three').Mesh
    expect(gridMesh).toBeDefined()
    const mat = gridMesh.material as import('three').ShaderMaterial
    expect(mat.uniforms.uMajor.value).toBe(mat.uniforms.uMinor.value * 5)
    expect(gridMesh.visible).toBe(true)

    // Move camera below XY plane
    lastRenderedCamera!.position.set(0, 0, -200)
    lastAnimationLoop!()
    expect(mat.uniforms.uAlpha.value).toBe(0)
    expect(gridMesh.visible).toBe(false)
  })
})
