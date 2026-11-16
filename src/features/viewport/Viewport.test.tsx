// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import '../../i18n'
import type { ModelResult } from '../../geometry/model'
import { computeWheelZoomFactor } from './gesture'
import type { ViewportSketchConfig } from './sketchMesh'
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

  // jsdom не даёт элементам раскладку: размеры задаём вручную
  const fakeRect = (w: number, h: number) =>
    ({ x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h, toJSON: () => ({}) }) as DOMRect
  const setSize = (node: HTMLElement, w: number, h: number) => {
    Object.defineProperty(node, 'clientWidth', { value: w, configurable: true })
    Object.defineProperty(node, 'clientHeight', { value: h, configurable: true })
  }
  const wheelAt = (canvas: HTMLCanvasElement, x: number, y: number, deltaY = -100) => {
    canvas.dispatchEvent(
      new WheelEvent('wheel', { deltaY, clientX: x, clientY: y, bubbles: true, cancelable: true })
    )
  }

  it('zooms the 3D view toward the cursor position and stops at the distance limit', () => {
    // плоская плита 400x400 мм: лучи и в центре, и в углу экрана попадают в модель
    const plate: ModelResult = {
      parts: [
        {
          label: 'plate',
          col: 0,
          row: 0,
          oversize: false,
          mesh: {
            vertProperties: new Float32Array([
              -200, -200, 0, 200, -200, 0, -200, 200, 0, 200, 200, 0,
            ]),
            triVerts: new Uint32Array([0, 1, 2, 1, 3, 2]),
            numProp: 3,
            min: [-200, -200, 0] as [number, number, number],
            max: [200, 200, 0] as [number, number, number],
            volume: 1,
          },
        },
      ],
    }
    const { container } = render(<Viewport model={plate} plate={null} />)
    const canvas = container.querySelector('canvas')!
    const host = canvas.parentElement as HTMLElement
    canvas.getBoundingClientRect = () => fakeRect(800, 600)
    host.getBoundingClientRect = () => fakeRect(800, 600)
    setSize(host, 800, 600)
    lastAnimationLoop!()
    const cam = lastRenderedCamera! as THREE.PerspectiveCamera
    // resize() при маунте видел нулевые размеры jsdom — чиним проекцию до зума
    cam.aspect = 800 / 600
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()

    const ndcOf = (pt: THREE.Vector3) => {
      const v = pt.clone().project(cam)
      return { x: v.x, y: v.y }
    }
    // точка плоскости z=0 под курсором — тот же якорь, что возвращает pickAnchorAt для плиты
    const anchorUnder = (x: number, y: number) => {
      const rc = new THREE.Raycaster()
      rc.setFromCamera(new THREE.Vector2((x / 800) * 2 - 1, 1 - (y / 600) * 2), cam)
      const t = -rc.ray.origin.z / rc.ray.direction.z
      return rc.ray.origin.clone().addScaledVector(rc.ray.direction, t)
    }

    // зум в центре: якорь совпадает с центром орбиты, камера приближается радиально на один множитель
    const before = cam.position.clone()
    wheelAt(canvas, 400, 300)
    const afterCenter = cam.position.clone()
    expect(afterCenter.length()).toBeCloseTo(before.length() * computeWheelZoomFactor(-100), 4)

    // зум к точке модели не в центре экрана: луч через (520, 380) попадает в плиту
    const cornerX = 520
    const cornerY = 380
    const anchor = anchorUnder(cornerX, cornerY)
    const ndcBefore = ndcOf(anchor)
    wheelAt(canvas, cornerX, cornerY)
    cam.updateMatrixWorld()
    const ndcAfter = ndcOf(anchor)
    expect(Math.abs(ndcAfter.x - ndcBefore.x)).toBeLessThan(1e-6)
    expect(Math.abs(ndcAfter.y - ndcBefore.y)).toBeLessThan(1e-6)
    // и направление движения отличается от радиального: центр зума зависит от курсора
    const centerDir = afterCenter.clone().sub(before).normalize()
    const cornerDir = cam.position.clone().sub(afterCenter).normalize()
    expect(centerDir.dot(cornerDir)).toBeLessThan(0.999)

    // предел: длительное отдаление от курсора не уводит камеру в бесконечность
    for (let i = 0; i < 80; i++) {
      wheelAt(canvas, cornerX, cornerY, 100)
    }
    cam.updateMatrixWorld()
    // дистанция к цели <= 20000 и цель не дальше 20000 от точки зума на модели
    expect(cam.position.length()).toBeLessThan(42000)
  })

  it('applies a single cursor-anchored zoom step in sketch mode', () => {
    const sketch: ViewportSketchConfig = {
      plane: { base: 'XY', offset: 0 },
      sketch: {
        id: 's1',
        name: 'S1',
        plane: { base: 'XY', offset: 0 },
        visible: true,
        points: {},
        curves: {},
        constraints: [],
      },
      tool: 'line',
    }
    const { container } = render(<Viewport model={model} plate={null} sketch={sketch} />)
    // host-эффект закрылся над родителем канваса, а не над корнем компонента
    const host = container.querySelector('canvas')!.parentElement as HTMLElement
    const canvas = container.querySelector('canvas')!
    setSize(host, 800, 600)
    lastAnimationLoop!()
    lastAnimationLoop!()
    const cam = lastRenderedCamera!
    cam.updateMatrixWorld()

    // колесо в центре: якорь совпадает с целью, панорамирования нет —
    // каждая координата умножается ровно на один множитель кривой зума
    // (до правки dolly OrbitControls накладывался вторым множителем)
    const before = cam.position.clone()
    wheelAt(canvas, 400, 300)
    lastAnimationLoop!()
    const centered = cam.position.clone()
    const factor = computeWheelZoomFactor(-100)
    expect(centered.x).toBeCloseTo(before.x * factor, 6)
    expect(centered.y).toBeCloseTo(before.y * factor, 6)
    expect(centered.z).toBeCloseTo(before.z * factor, 6)

    // колесо в углу: якорь смещается от цели — камера сдвигается в плоскости XY
    wheelAt(canvas, 700, 450)
    lastAnimationLoop!()
    const cornered = cam.position.clone()
    expect(Math.abs(cornered.x) + Math.abs(cornered.y)).toBeGreaterThan(0.1)
  })
})
