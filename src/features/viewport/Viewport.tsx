import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as THREE from 'three'
import { creaseEdges } from './degenerate'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { ModelResult } from '../../geometry/model'
import { groundOpacity } from './ground'
import { readRootVar, toolColor } from './toolColor'
import { assembledMatrix, layoutBounds, type KeychainView } from './layout'
import { createRenderMonitor, type RendererLike } from '../../app/resources/render'
import { isObjectInBoxSelect, type Rect2D } from '../editor/boxSelect'
import { transformBounds } from '../../editor/transform'
import type { Mat4 } from '../../editor/scene'
import {
  fitCameraToBounds,
  orthoHeightFromDistance,
  standardViewPosition,
  type ViewFace,
} from '../editor/viewCommands'
import { ViewCube } from '../editor/ViewCube'
import { buildSketchContent, buildSketchGrid, type ViewportSketchConfig } from './sketchMesh'
import { lookAtPlane, pointerToPlaneCoordinates, screenPick, type ScreenPickResult } from './sketchPicking'
import { SketchOverlay } from './SketchOverlay'
import { planeFrame, planeKey } from '../../editor/sketch/model'
import type { MeshHighlight } from '../editor/mesh/MeshSection'

export interface BuildPlate { x: number; y: number; /** Поле по краю: пунктирный контур рабочей области. */ margin?: number }

export type Matrix4Tuple = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
]

export interface ViewportGizmoConfig {
  mode: 'translate' | 'rotate' | 'scale'
  space?: 'world' | 'local'
  snap?: {
    grid?: number
    angle?: number
  }
}

export interface ViewportSceneConfig {
  matrices: Record<string, Matrix4Tuple>
  selection: string[]
  hover?: string
  locked?: string[]
  hidden?: string[]
  gizmo?: ViewportGizmoConfig
  projection?: 'persp' | 'ortho'
}

export interface ViewportProps {
  model: ModelResult | null
  plate?: BuildPlate | null
  gap?: number
  /** Keychain в режиме половин: лист печати или собранный брелок (нужен model.assembly). */
  view?: KeychainView
  /** Раздвижка собранных половин по Z, мм. */
  openGap?: number
  /** Показывать вырезающие инструменты (model.tools) полупрозрачными. */
  showTools?: boolean
  scene?: ViewportSceneConfig
  sketch?: ViewportSketchConfig | null
  onPick?: (label: string | null, additive: boolean) => void
  onBoxSelect?: (labels: string[]) => void
  onGizmoChange?: (matrices: Record<string, Matrix4Tuple>) => void
  onGizmoCommit?: () => void
  onFitReady?: (fit: () => void) => void
  onCameraChange?: (rotation: [number, number, number]) => void
  onSketchPointer?: (
    kind: 'down' | 'move' | 'up' | 'click' | 'dblclick',
    pos: { x: number; y: number },
    mods: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean; pixelsPerMm?: number },
    rawEvent: PointerEvent,
  ) => void
  onSketchSelect?: (hit: ScreenPickResult | null, additive: boolean) => void
  onSketchSelectBox?: (box: { points: string[]; curves: string[] }, additive: boolean) => void
  onSubmitDraftInput?: (val1: number, val2: number) => void
  onCancelSketchStage?: () => void
  onUpdateConstraint?: (id: string, value: number) => void
  onDeleteConstraint?: (id: string) => void
  onSelectConstraint?: (id: string) => void
  onHoverConstraint?: (id: string | null) => void
  onPinDimension?: (curveId: string) => void
  clippingPlane?: { normal: [number, number, number]; constant: number } | null
  highlight?: MeshHighlight | null
  measurePickActive?: boolean
  onMeasurePick?: (hit: {
    point: [number, number, number]
    normal: [number, number, number]
    faceIndex: number
    objectId?: string
    screenPos: { x: number; y: number }
  }) => void
}

interface Api {
  setModel: (m: ModelResult | null) => void
  setTools: (m: ModelResult | null, show: boolean) => void
  setGap: (gap: number) => void
  setLayout: (view: KeychainView, openGap: number) => void
  setPlate: (p: BuildPlate | null) => void
  fit: () => void
  setViewFace: (face: ViewFace) => void
  orbit: (dx: number, dy: number) => void
  updateScene: (sc: ViewportSceneConfig | undefined) => void
  setSketch: (s: ViewportSketchConfig | null | undefined) => void
  lookAtSketchPlane: () => void
  projectPoint: (planePt: { x: number; y: number }) => { x: number; y: number } | null
  setClippingPlane?: (plane: { normal: [number, number, number]; constant: number } | null) => void
  setHighlight?: (h: MeshHighlight | null) => void
}

const GIZMO_SIZE = 120
/** Отступ гизмо от низа: над нижней строкой измерений (h-9 = 36 px) плюс зазор. */
const GIZMO_BOTTOM = 44
const GIZMO_AXIS_R = 0.05 // радиус оси гизмо в его единицах (±1.5 на 120 px)
const AXES = [
  { label: 'X', dir: [1, 0, 0], color: 0xe5484d },
  { label: 'Y', dir: [0, 1, 0], color: 0x46c35f },
  { label: 'Z', dir: [0, 0, 1], color: 0x3b82f6 },
] as const

function labelSprite(text: string, color: number, filled: boolean) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext?.('2d')
  if (g) {
    const css = '#' + color.toString(16).padStart(6, '0')
    g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2)
    if (filled) { g.fillStyle = css; g.fill() } else { g.globalAlpha = 0.55; g.fillStyle = css; g.fill(); g.globalAlpha = 1 }
    if (text) { g.fillStyle = '#fff'; g.font = 'bold 34px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 32, 34) }
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }))
  s.scale.setScalar(0.62)
  return s
}

// «бесконечная» сетка: мелкие линии 10 мм, крупные 50 мм, плавно гаснет с расстоянием
function makeGrid() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uCenter: { value: new THREE.Vector3() }, uFade: { value: 600 }, uAlpha: { value: 1 } },
    vertexShader: `varying vec3 vPos; void main(){ vec4 w = modelMatrix * vec4(position,1.); vPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      varying vec3 vPos; uniform vec3 uCenter; uniform float uFade; uniform float uAlpha;
      float line(float size, float w){
        vec2 c = vPos.xy / size; vec2 g = abs(fract(c - .5) - .5) / fwidth(c);
        return 1. - min(min(g.x, g.y) / w, 1.);
      }
      void main(){
        float d = distance(vPos.xy, uCenter.xy);
        float fade = 1. - smoothstep(uFade * .25, uFade, d);
        float minor = line(10., 1.) * .15, major = line(50., 1.5) * .45;
        float a = max(minor, major) * fade * uAlpha;
        if (a < .01) discard;
        gl_FragColor = vec4(vec3(.17, .45, .75), a);
      }`,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
  mesh.renderOrder = -1
  return mesh
}

/** Цвета частей (design/artboards/ViewportStyle.dc.html): заливка, контур и цвет подписи. */
const PART_STYLES = [
  { fill: 0x8fa3c4, edge: 0x4a5a78, outline: '#B3C2DB' },
  { fill: 0x7fc4b0, edge: 0x3f7466, outline: '#A8E0D1' },
  { fill: 0xc9a7e0, edge: 0x6f5784, outline: '#E2CBF1' },
  { fill: 0xe0a98a, edge: 0x84583e, outline: '#F2CDB6' },
]

/** Подпись части: плашка с текстом, всегда повёрнута к экрану. */
function textSprite(text: string, color: string) {
  const c = document.createElement('canvas')
  c.width = 128; c.height = 64
  const g = c.getContext?.('2d')
  if (g) {
    g.fillStyle = 'rgba(14,16,19,0.92)'
    g.beginPath(); g.roundRect?.(4, 8, 120, 48, 14); g.fill()
    g.lineWidth = 3; g.strokeStyle = color; g.stroke()
    g.fillStyle = '#E6E9EE'; g.font = '500 28px "JetBrains Mono Variable", ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(text, 64, 33)
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }))
  s.scale.set(26, 13, 1)
  s.renderOrder = 10
  return s
}

export function Viewport({
  model,
  plate,
  gap = 0,
  view = 'sheet',
  openGap = 0,
  showTools = true,
  scene: sceneConfig,
  onPick,
  onBoxSelect,
  onGizmoChange,
  onGizmoCommit,
  onFitReady,
  onCameraChange,
  sketch,
  onSketchPointer,
  onSketchSelect,
  onSketchSelectBox,
  onSubmitDraftInput,
  onCancelSketchStage,
  onUpdateConstraint,
  onDeleteConstraint,
  onSelectConstraint,
  onHoverConstraint,
  onPinDimension,
  clippingPlane,
  highlight,
  measurePickActive,
  onMeasurePick,
}: ViewportProps) {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const gapRef = useRef(gap)
  gapRef.current = gap
  const layoutRef = useRef({ view, openGap })
  layoutRef.current = { view, openGap }
  const sceneRef = useRef(sceneConfig)
  sceneRef.current = sceneConfig

  const sketchRef = useRef(sketch)
  sketchRef.current = sketch

  const callbacksRef = useRef({
    onPick,
    onBoxSelect,
    onGizmoChange,
    onGizmoCommit,
    onCameraChange,
    onSketchPointer,
    onSketchSelect,
    onSketchSelectBox,
    onSubmitDraftInput,
    onCancelSketchStage,
    onUpdateConstraint,
    onDeleteConstraint,
    onSelectConstraint,
    measurePickActive,
    onMeasurePick,
  })
  callbacksRef.current = {
    onPick,
    onBoxSelect,
    onGizmoChange,
    onGizmoCommit,
    onCameraChange,
    onSketchPointer,
    onSketchSelect,
    onSketchSelectBox,
    onSubmitDraftInput,
    onCancelSketchStage,
    onUpdateConstraint,
    onDeleteConstraint,
    onSelectConstraint,
    measurePickActive,
    onMeasurePick,
  }

  const [boxSelectRect, setBoxSelectRect] = useState<Rect2D | null>(null)
  const boxSelectRectRef = useRef(boxSelectRect)
  boxSelectRectRef.current = boxSelectRect

  const [cameraRotation, setCameraRotation] = useState<[number, number, number]>([0, 0, 0])
  // счётчик изменений вида: подписи эскиза пересчитывают экранные позиции только при смене камеры
  const [, setViewTick] = useState(0)

  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.autoClear = false
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0e1013)

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20000)
    camera.up.set(0, 0, 1)
    camera.position.set(160, -220, 160)

    const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20000)
    orthoCamera.up.set(0, 0, 1)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI // камера может уйти под плоскость XY и смотреть на низ модели; ось Z остаётся вверху
    controls.minDistance = 0.5
    controls.maxDistance = 20000
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    }

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8794a8, 1.4))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(120, -180, 300)
    scene.add(sun)

    const under = new THREE.DirectionalLight(0xffffff, 0.9)
    under.position.set(-120, 180, -300)
    scene.add(under)

    const grid = makeGrid()
    grid.scale.setScalar(6000)
    grid.position.z = -0.02
    scene.add(grid)

    // стол: полупрозрачная плита + контур
    const plateGroup = new THREE.Group()
    scene.add(plateGroup)
    let plateMats: { fill: THREE.MeshBasicMaterial; line: THREE.LineBasicMaterial; safe?: THREE.LineBasicMaterial } | null = null

    const modelGroup = new THREE.Group()
    scene.add(modelGroup)

    const toolGroup = new THREE.Group()
    scene.add(toolGroup)

    const sketchGroup = new THREE.Group()
    scene.add(sketchGroup)
    // сетка плоскости живёт отдельно и пересобирается только при смене плоскости или эскиза
    const sketchGridGroup = new THREE.Group()
    const sketchContentGroup = new THREE.Group()
    sketchGroup.add(sketchGridGroup, sketchContentGroup)
    let sketchViewKey = ''

    const highlightGroup = new THREE.Group()
    scene.add(highlightGroup)
    const disposeGeometries = (root: THREE.Object3D) => {
      root.traverse((o) => {
        const g = (o as THREE.Mesh).geometry
        if (g) g.dispose()
      })
    }

    // Pivot & TransformControls
    const pivotGroup = new THREE.Group()
    scene.add(pivotGroup)
    const transformControls = new TransformControls(camera, renderer.domElement)
    // TransformControls internal helper mesh
    const tcHelper = (transformControls as unknown as { getHelper?: () => THREE.Object3D }).getHelper
      ? (transformControls as unknown as { getHelper: () => THREE.Object3D }).getHelper()
      : (transformControls as unknown as THREE.Object3D)
    scene.add(tcHelper)

    let initialMatrices: Record<string, THREE.Matrix4> = {}
    const initialPivotInv = new THREE.Matrix4()

    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value
      if (!event.value) {
        callbacksRef.current.onGizmoCommit?.()
        pivotGroup.updateMatrixWorld()
        initialPivotInv.copy(pivotGroup.matrixWorld).invert()
        for (const p of partGroups) {
          if (sceneRef.current?.selection.includes(p.label)) {
            initialMatrices[p.label] = p.group.matrix.clone()
          }
        }
      }
    })

    transformControls.addEventListener('change', () => {
      if (transformControls.dragging && sceneRef.current) {
        pivotGroup.updateMatrixWorld()
        const delta = pivotGroup.matrixWorld.clone().multiply(initialPivotInv)
        const updated: Record<string, Matrix4Tuple> = {}

        for (const label of sceneRef.current.selection) {
          const orig = initialMatrices[label]
          if (orig) {
            const next = delta.clone().multiply(orig)
            const p = partGroups.find((pg) => pg.label === label)
            if (p) {
              p.group.matrixAutoUpdate = false
              p.group.matrix.copy(next)
              p.group.matrixWorldNeedsUpdate = true
            }
            updated[label] = next.toArray() as Matrix4Tuple
          }
        }
        callbacksRef.current.onGizmoChange?.(updated)
      }
    })

    let partGroups: {
      group: THREE.Group
      label: string
      col: number
      row: number
      body: THREE.Mesh
      labelSprite?: THREE.Sprite
      outlineMesh?: THREE.Mesh
    }[] = []
    let cols = 1, rows = 1
    let current: ModelResult | null = null
    let assembledNow = false
    let radius = 60

    const updateGizmo = (sc: ViewportSceneConfig | undefined) => {
      if (!sc || !sc.gizmo || sc.selection.length === 0) {
        transformControls.detach()
        return
      }

      const selectedParts = partGroups.filter(
        (p) => sc.selection.includes(p.label) && p.group.visible
      )
      if (selectedParts.length === 0) {
        transformControls.detach()
        return
      }

      transformControls.setMode(sc.gizmo.mode)
      transformControls.setSpace(sc.gizmo.space ?? 'world')

      if (sc.gizmo.snap?.grid) {
        transformControls.setTranslationSnap(sc.gizmo.snap.grid)
        transformControls.setScaleSnap(sc.gizmo.snap.grid)
      } else {
        transformControls.setTranslationSnap(null)
        transformControls.setScaleSnap(null)
      }

      if (sc.gizmo.snap?.angle) {
        transformControls.setRotationSnap(THREE.MathUtils.degToRad(sc.gizmo.snap.angle))
      } else {
        transformControls.setRotationSnap(null)
      }

      const box = new THREE.Box3()
      for (const p of selectedParts) {
        p.body.geometry.computeBoundingBox()
        const partBox = p.body.geometry.boundingBox!.clone()
        partBox.applyMatrix4(p.group.matrixWorld)
        box.union(partBox)
      }

      const center = box.getCenter(new THREE.Vector3())
      pivotGroup.position.copy(center)
      pivotGroup.rotation.set(0, 0, 0)
      pivotGroup.scale.set(1, 1, 1)
      pivotGroup.updateMatrixWorld()

      initialPivotInv.copy(pivotGroup.matrixWorld).invert()
      initialMatrices = {}
      for (const p of selectedParts) {
        initialMatrices[p.label] = p.group.matrix.clone()
      }

      transformControls.attach(pivotGroup)
    }

    const applyScene = (sc: ViewportSceneConfig | undefined) => {
      if (!sc) {
        for (const p of partGroups) {
          if (p.outlineMesh) p.outlineMesh.visible = false
        }
        applyGap(gapRef.current)
        transformControls.detach()
        return
      }

      const hiddenSet = new Set(sc.hidden ?? [])
      const selectionSet = new Set(sc.selection ?? [])

      for (const p of partGroups) {
        p.group.visible = !hiddenSet.has(p.label)
        if (sc.matrices[p.label]) {
          p.group.matrixAutoUpdate = false
          p.group.matrix.fromArray(sc.matrices[p.label])
          p.group.matrixWorldNeedsUpdate = true
        }
        if (p.outlineMesh) {
          p.outlineMesh.visible = selectionSet.has(p.label)
        }
        if (p.labelSprite) {
          p.labelSprite.visible = false
        }
      }

      updateGizmo(sc)
    }

    // раскладка деталей: разнесённый вид по сетке (gap) или матрицы собранного вида брелка
    const applyGap = (g: number) => {
      if (sceneRef.current) {
        applyScene(sceneRef.current)
        return
      }
      const { view: v, openGap: og } = layoutRef.current
      assembledNow = false
      for (const p of partGroups) {
        const m = assembledMatrix(p.label, current?.assembly, v, og)
        if (m) {
          assembledNow = true
          p.group.matrixAutoUpdate = false
          p.group.matrix.fromArray(m)
          p.group.matrixWorldNeedsUpdate = true
        } else {
          p.group.matrixAutoUpdate = true
          p.group.position.set(g * (p.col - (cols - 1) / 2), g * (p.row - (rows - 1) / 2), 0)
          p.group.updateMatrix()
        }
        if (p.labelSprite) p.labelSprite.visible = !m
        const mat = p.body.material as THREE.MeshStandardMaterial
        mat.polygonOffsetFactor = m && p.label === 'bottom' ? 2 : 1
        mat.polygonOffsetUnits = m && p.label === 'bottom' ? 2 : 1
      }
      if (current) {
        const b = layoutBounds(current.parts, current.assembly, layoutRef.current.view, og)
        radius = new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)).getBoundingSphere(new THREE.Sphere()).radius
      }
    }

    // гизмо осей
    const gScene = new THREE.Scene()
    const gCam = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 10)
    gCam.up.set(0, 0, 1)
    const hits: THREE.Sprite[] = []
    for (const a of AXES) {
      const dir = new THREE.Vector3(...a.dir)
      const line = new THREE.Mesh(
        new THREE.CylinderGeometry(GIZMO_AXIS_R, GIZMO_AXIS_R, 0.95, 12),
        new THREE.MeshBasicMaterial({ color: a.color, depthTest: false }),
      )
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      line.position.copy(dir).multiplyScalar(0.475)
      gScene.add(line)
      const pos = labelSprite(a.label, a.color, true); pos.position.copy(dir); pos.userData.dir = dir.clone(); gScene.add(pos); hits.push(pos)
      const neg = labelSprite('', a.color, false); neg.position.copy(dir).negate(); neg.scale.setScalar(0.4); neg.userData.dir = dir.clone().negate(); gScene.add(neg); hits.push(neg)
    }

    const fit = () => {
      const dist = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.15
      const dir = camera.position.clone().sub(controls.target).normalize()
      controls.target.set(0, 0, 0)
      camera.position.copy(dir.multiplyScalar(dist))
      controls.minDistance = 0.5
    }

    const view = (dir: THREE.Vector3) => {
      const dist = camera.position.distanceTo(controls.target)
      const d = dir.clone()
      if (Math.abs(d.z) === 1) d.add(new THREE.Vector3(0, -1e-3, 0))
      camera.position.copy(controls.target).add(d.normalize().multiplyScalar(dist))
    }

    let fitted = false
    let lastViewSig = ''
    let lastRot: [number, number] = [Number.NaN, Number.NaN]
    let saved3DCameraState: {
      position: [number, number, number]
      target: [number, number, number]
      up: [number, number, number]
    } | null = null

    api.current = {
      fit,
      setViewFace(face: ViewFace) {
        const prevEnabled = controls.enabled
        controls.enabled = true
        const dist = camera.position.distanceTo(controls.target)
        const pos = standardViewPosition(
          face,
          [controls.target.x, controls.target.y, controls.target.z],
          dist,
        )
        camera.up.set(0, 0, 1)
        camera.position.set(pos[0], pos[1], pos[2])
        camera.lookAt(controls.target)
        controls.update()
        controls.enabled = prevEnabled
      },
      orbit(dx: number, dy: number) {
        const prevEnabled = controls.enabled
        controls.enabled = true
        const elH = el.clientHeight || 400
        controls.rotateLeft((2 * Math.PI * dx) / elH)
        controls.rotateUp((2 * Math.PI * dy) / elH)
        controls.update()
        controls.enabled = prevEnabled
      },
      updateScene(sc) {
        applyScene(sc)
      },
      setSketch(s) {
        disposeGeometries(sketchContentGroup)
        sketchContentGroup.clear()
        if (!s) {
          disposeGeometries(sketchGridGroup)
          sketchGridGroup.clear()
          sketchViewKey = ''
          controls.enableRotate = true
          controls.enabled = true

          // Восстанавливаем 3D-камеру сцены с Z-up (0, 0, 1)
          camera.up.set(0, 0, 1)
          if (saved3DCameraState) {
            camera.position.set(...saved3DCameraState.position)
            controls.target.set(...saved3DCameraState.target)
            saved3DCameraState = null
          } else {
            const dist = camera.position.distanceTo(controls.target) || 200
            camera.position.set(dist * 0.5, -dist * 0.7, dist * 0.5)
            camera.lookAt(controls.target)
          }

          // Предотвращаем сингулярность полюса OrbitControls: камера не должна смотреть строго параллельно оси Z
          const dist = camera.position.distanceTo(controls.target)
          const dx = camera.position.x - controls.target.x
          const dy = camera.position.y - controls.target.y
          if (Math.hypot(dx, dy) < 1e-3) {
            camera.position.set(
              controls.target.x + dist * 0.5,
              controls.target.y - dist * 0.7,
              controls.target.z + dist * 0.5,
            )
          }
          camera.lookAt(controls.target)
          controls.update()

          // Сбрасываем подпись вида, чтобы ViewCube пересчитал свою ориентацию на следующем кадре
          lastRot = [Number.NaN, Number.NaN]
          lastViewSig = ''
          return
        }

        // Сохраняем 3D-камеру перед входом в эскиз
        if (!saved3DCameraState) {
          saved3DCameraState = {
            position: [camera.position.x, camera.position.y, camera.position.z],
            target: [controls.target.x, controls.target.y, controls.target.z],
            up: [camera.up.x, camera.up.y, camera.up.z],
          }
        }

        controls.enableRotate = false
        sketchContentGroup.add(buildSketchContent(s))
        // камера и сетка меняются только при входе в эскиз или смене плоскости: правка эскиза не должна сбрасывать вид
        const key = `${s.sketch.id}|${planeKey(s.plane)}`
        if (key !== sketchViewKey) {
          sketchViewKey = key
          disposeGeometries(sketchGridGroup)
          sketchGridGroup.clear()
          sketchGridGroup.add(buildSketchGrid(s.plane, s.grid))
          const look = lookAtPlane(s.plane)
          controls.target.set(...look.target)
          camera.position.set(...look.position)
          camera.up.set(...look.up)
          camera.lookAt(...look.target)
          orthoCamera.position.copy(camera.position)
          orthoCamera.up.copy(camera.up)
          orthoCamera.lookAt(...look.target)
          controls.update()
        }
      },
      lookAtSketchPlane() {
        if (sketchRef.current) {
          const look = lookAtPlane(sketchRef.current.plane)
          controls.target.set(...look.target)
          camera.position.set(...look.position)
          camera.up.set(...look.up)
          camera.lookAt(...look.target)
          orthoCamera.position.copy(camera.position)
          orthoCamera.up.copy(camera.up)
          orthoCamera.lookAt(...look.target)
          controls.update()
        }
      },
      projectPoint(planePt) {
        if (!sketchRef.current) return null
        const frame = planeFrame(sketchRef.current.plane)
        const isOrtho = sceneRef.current?.projection === 'ortho' || !!sketchRef.current
        const activeCam = isOrtho ? orthoCamera : camera
        const worldPt = new THREE.Vector3(
          frame.origin[0] + planePt.x * frame.xDir[0] + planePt.y * frame.yDir[0],
          frame.origin[1] + planePt.x * frame.xDir[1] + planePt.y * frame.yDir[1],
          frame.origin[2] + planePt.x * frame.xDir[2] + planePt.y * frame.yDir[2],
        ).project(activeCam)
        return {
          x: ((worldPt.x + 1) / 2) * el.clientWidth,
          y: ((1 - worldPt.y) / 2) * el.clientHeight,
        }
      },
      setClippingPlane(plane) {
        if (plane) {
          renderer.clippingPlanes = [
            new THREE.Plane(new THREE.Vector3(...plane.normal), plane.constant),
          ]
        } else {
          renderer.clippingPlanes = []
        }
      },
      setHighlight(h) {
        while (highlightGroup.children.length > 0) {
          const child = highlightGroup.children[0]
          highlightGroup.remove(child)
          if ((child as any).geometry) (child as any).geometry.dispose()
          if ((child as any).material) (child as any).material.dispose()
        }
        if (!h) return
        if (h.lines && h.lines.length > 0) {
          const pts: number[] = []
          for (const [p1, p2] of h.lines) pts.push(...p1, ...p2)
          const geom = new THREE.BufferGeometry()
          geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
          const mat = new THREE.LineBasicMaterial({ color: 0xe5484d, linewidth: 2, depthTest: false })
          const line = new THREE.LineSegments(geom, mat)
          line.renderOrder = 999
          highlightGroup.add(line)
        }
        if (h.points && h.points.length > 0) {
          const pts: number[] = []
          for (const p of h.points) pts.push(...p)
          const geom = new THREE.BufferGeometry()
          geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
          const mat = new THREE.PointsMaterial({ color: 0xfa5252, size: 6, depthTest: false })
          const pMesh = new THREE.Points(geom, mat)
          pMesh.renderOrder = 999
          highlightGroup.add(pMesh)
        }
      },
      setPlate(p) {
        plateGroup.children.forEach((c) => { const m = c as THREE.Mesh; m.geometry.dispose() })
        plateGroup.clear()
        plateMats = null
        if (!p) return
        const fillMat = new THREE.MeshBasicMaterial({ color: 0x1b2028, transparent: true, opacity: 0.85, depthWrite: false })
        const lineMat = new THREE.LineBasicMaterial({ color: 0x5c6b82, transparent: true })
        plateMats = { fill: fillMat, line: lineMat }
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(p.x, p.y), fillMat)
        fill.position.z = -0.05
        const box = new THREE.EdgesGeometry(new THREE.PlaneGeometry(p.x, p.y))
        const outline = new THREE.LineSegments(box, lineMat)
        outline.position.z = -0.04
        plateGroup.add(fill, outline)
        const m = p.margin ?? 0
        if (m > 0 && p.x > 2 * m && p.y > 2 * m) {
          const safeMat = new THREE.LineDashedMaterial({ color: 0x5c6b82, dashSize: 4, gapSize: 3, transparent: true })
          plateMats!.safe = safeMat
          const safe = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(p.x - 2 * m, p.y - 2 * m)), safeMat)
          safe.computeLineDistances()
          safe.position.z = -0.03
          plateGroup.add(safe)
        }
      },
      setGap(g) { applyGap(g) },
      setLayout() { applyGap(gapRef.current) },
      setTools(m, show) {
        toolGroup.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.geometry) mesh.geometry.dispose() })
        toolGroup.clear()
        toolGroup.visible = show
        for (const tool of m?.tools ?? []) {
          const mm = tool.mesh
          const pos = new Float32Array((mm.vertProperties.length / mm.numProp) * 3)
          for (let i = 0; i < pos.length / 3; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = mm.vertProperties[i * mm.numProp + k]
          const g = new THREE.BufferGeometry()
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
          g.setIndex(new THREE.BufferAttribute(mm.triVerts, 1))
          const smooth = toCreasedNormals(g, Math.PI / 6)
          g.dispose()
          const mesh = new THREE.Mesh(smooth, new THREE.MeshStandardMaterial({ color: toolColor(tool.color, readRootVar), transparent: true, opacity: 0.45, depthWrite: false, roughness: 0.4, metalness: 0 }))
          mesh.renderOrder = 2
          toolGroup.add(mesh)
        }
      },
      setModel(m) {
        modelGroup.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (mesh.geometry) mesh.geometry.dispose()
          const sprite = o as THREE.Sprite
          if (sprite.isSprite) (sprite.material as THREE.SpriteMaterial).map?.dispose()
        })
        modelGroup.clear()
        partGroups = []
        current = m
        if (!m || m.parts.length === 0) return
        const many = m.parts.length > 1
        cols = Math.max(...m.parts.map((p) => p.col)) + 1
        rows = Math.max(...m.parts.map((p) => p.row)) + 1
        for (const part of m.parts) {
          const mm = part.mesh
          const pos = new Float32Array((mm.vertProperties.length / mm.numProp) * 3)
          for (let i = 0; i < pos.length / 3; i++)
            for (let k = 0; k < 3; k++) pos[i * 3 + k] = mm.vertProperties[i * mm.numProp + k]
          const indexed = new THREE.BufferGeometry()
          indexed.setAttribute('position', new THREE.BufferAttribute(pos, 3))
          indexed.setIndex(new THREE.BufferAttribute(mm.triVerts, 1))
          const g = indexed.toNonIndexed()
          g.computeVertexNormals()
          const style = many ? PART_STYLES[(part.col + part.row) % PART_STYLES.length] : PART_STYLES[0]
          const body = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
            color: style.fill, roughness: 0.6, metalness: 0.05, flatShading: true,
            polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
          }))

          const edgeGeometry = new THREE.BufferGeometry()
          edgeGeometry.setAttribute('position', new THREE.BufferAttribute(creaseEdges(pos, mm.triVerts), 3))
          const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: part.oversize ? 0xf0707b : style.edge }))

          // Inverted hull outline mesh (selection outline token #7c9cff)
          const outlineGeometry = g.clone()
          const outlineMat = new THREE.MeshBasicMaterial({
            color: 0x7c9cff,
            side: THREE.BackSide,
          })
          const outlineMesh = new THREE.Mesh(outlineGeometry, outlineMat)
          outlineMesh.scale.setScalar(1.025)
          outlineMesh.visible = false

          const group = new THREE.Group()
          group.add(body, edges, outlineMesh)

          let labelSprite: THREE.Sprite | undefined
          if (many) {
            labelSprite = textSprite(part.label, part.oversize ? '#F0707B' : style.outline)
            labelSprite.position.set((mm.min[0] + mm.max[0]) / 2, (mm.min[1] + mm.max[1]) / 2, mm.max[2] + 6)
            group.add(labelSprite)
          }
          modelGroup.add(group)
          partGroups.push({ group, label: part.label, col: part.col, row: part.row, body, labelSprite, outlineMesh })
          indexed.dispose()
        }
        if (sceneRef.current) {
          applyScene(sceneRef.current)
        } else {
          applyGap(gapRef.current)
        }
        if (!fitted) { fitted = true; fit() }
      },
    }
    onFitReady?.(fit)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const RO = typeof ResizeObserver !== 'undefined' ? ResizeObserver : class { observe() {} disconnect() {} }
    const ro = new RO(resize)
    ro.observe(el)
    resize()

    // Raycaster for gizmo and picking
    const ray = new THREE.Raycaster()
    let mouseDownPos = { x: 0, y: 0 }
    let isDragging = false
    let isBoxSelecting = false
    let isPointerDownOnCanvas = false

    // эскиз: координаты указателя на плоскости и масштаб вида (пикселей на мм) для допусков в пикселях
    const sketchPlanePoint = (e: MouseEvent) => {
      if (!sketchRef.current) return null
      const rect = el.getBoundingClientRect()
      return pointerToPlaneCoordinates(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        { width: el.clientWidth, height: el.clientHeight },
        orthoCamera,
        sketchRef.current.plane,
      )
    }
    const sketchPixelsPerMm = () => {
      const dist = camera.position.distanceTo(controls.target)
      const oH = orthoHeightFromDistance(dist, camera.fov)
      return oH > 1e-9 ? (el.clientHeight || 1) / oH : 5
    }
    const sketchMods = (e: MouseEvent) => ({
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
      pixelsPerMm: sketchPixelsPerMm(),
    })

    const onPointerDown = (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return
      // в эскизе рисует и выбирает только левая кнопка; средняя и правая двигают вид (OrbitControls)
      if (sketchRef.current && e.button !== 0) return
      isPointerDownOnCanvas = true
      mouseDownPos = { x: e.clientX, y: e.clientY }
      isDragging = false
      isBoxSelecting = false

      if (sketchRef.current) {
        controls.enableRotate = false
        const planeCoords = sketchPlanePoint(e)
        const mods = sketchMods(e)
        if (planeCoords) {
          callbacksRef.current.onSketchPointer?.('down', planeCoords, mods, e as unknown as PointerEvent)
        }
        return
      }

      // In Editor scene mode: Left Click without Option/Alt is for selection/box-select only, not rotation
      if (sceneRef.current && e.button === 0 && !e.altKey) {
        controls.enabled = false
      } else {
        controls.enabled = true
      }
    }

    const onPointerMove = (e: MouseEvent) => {
      if (sketchRef.current) {
        // окно слушается целиком: над панелями эскиз ничего не должен делать
        const rect = el.getBoundingClientRect()
        const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
        if (!inside && !isPointerDownOnCanvas) return
        const planeCoords = sketchPlanePoint(e)
        if (planeCoords) {
          callbacksRef.current.onSketchPointer?.('move', planeCoords, sketchMods(e), e as unknown as PointerEvent)
        }
        if (isPointerDownOnCanvas) {
          const dx = e.clientX - mouseDownPos.x
          const dy = e.clientY - mouseDownPos.y
          if (Math.hypot(dx, dy) > 5) {
            isDragging = true
            if (sketchRef.current.tool === 'select') {
              isBoxSelecting = true
              setBoxSelectRect({
                x0: mouseDownPos.x - rect.left,
                y0: mouseDownPos.y - rect.top,
                x1: e.clientX - rect.left,
                y1: e.clientY - rect.top,
              })
            }
          }
        }
        return
      }

      if (!isPointerDownOnCanvas) return
      if (e.buttons === 0) {
        isPointerDownOnCanvas = false
        if (isBoxSelecting) {
          isBoxSelecting = false
          setBoxSelectRect(null)
        }
        controls.enabled = true
        return
      }

      const dx = e.clientX - mouseDownPos.x
      const dy = e.clientY - mouseDownPos.y
      if (Math.hypot(dx, dy) > 5) {
        isDragging = true
        if (!transformControls.dragging && !e.altKey && sceneRef.current && (e.buttons & 1)) {
          isBoxSelecting = true
          controls.enabled = false
          const rect = el.getBoundingClientRect()
          setBoxSelectRect({
            x0: mouseDownPos.x - rect.left,
            y0: mouseDownPos.y - rect.top,
            x1: e.clientX - rect.left,
            y1: e.clientY - rect.top,
          })
        }
      }
    }

    const onPointerUp = (e: MouseEvent) => {
      if (!isPointerDownOnCanvas) return
      isPointerDownOnCanvas = false
      controls.enabled = true

      if (sketchRef.current) {
        const rect = el.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const planeCoords = sketchPlanePoint(e)
        if (planeCoords) {
          callbacksRef.current.onSketchPointer?.('up', planeCoords, sketchMods(e), e as unknown as PointerEvent)
        }

        const projectPoint = (planePt: { x: number; y: number }): { x: number; y: number } | null =>
          api.current?.projectPoint(planePt) ?? null

        if (isBoxSelecting && boxSelectRectRef.current && sketchRef.current) {
          const bRect = boxSelectRectRef.current
          isBoxSelecting = false
          setBoxSelectRect(null)
          const minX = Math.min(bRect.x0, bRect.x1)
          const maxX = Math.max(bRect.x0, bRect.x1)
          const minY = Math.min(bRect.y0, bRect.y1)
          const maxY = Math.max(bRect.y0, bRect.y1)

          const matchedPoints: string[] = []
          for (const [pId, pt] of Object.entries(sketchRef.current.sketch.points)) {
            const sp = projectPoint(pt)
            if (sp && sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY) {
              matchedPoints.push(pId)
            }
          }

          const matchedCurves: string[] = []
          for (const [cId, c] of Object.entries(sketchRef.current.sketch.curves)) {
            if (c.kind === 'line') {
              const p1 = sketchRef.current.sketch.points[c.a]
              const p2 = sketchRef.current.sketch.points[c.b]
              if (p1 && p2) {
                const sp1 = projectPoint(p1)
                const sp2 = projectPoint(p2)
                const midSp = projectPoint({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 })
                if (
                  (sp1 && sp1.x >= minX && sp1.x <= maxX && sp1.y >= minY && sp1.y <= maxY) ||
                  (sp2 && sp2.x >= minX && sp2.x <= maxX && sp2.y >= minY && sp2.y <= maxY) ||
                  (midSp && midSp.x >= minX && midSp.x <= maxX && midSp.y >= minY && midSp.y <= maxY)
                ) {
                  matchedCurves.push(cId)
                }
              }
            } else if (c.kind === 'circle' || c.kind === 'arc') {
              const center = sketchRef.current.sketch.points[c.c]
              if (center) {
                const sp = projectPoint(center)
                if (sp && sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY) {
                  matchedCurves.push(cId)
                }
              }
            }
          }

          callbacksRef.current.onSketchSelectBox?.(
            { points: matchedPoints, curves: matchedCurves },
            e.shiftKey || e.ctrlKey || e.metaKey,
          )
          return
        }

        if (!isDragging) {
          const hit = screenPick({ x, y }, sketchRef.current.sketch, projectPoint, 12)
          callbacksRef.current.onSketchSelect?.(hit, e.shiftKey || e.ctrlKey || e.metaKey)
        }
        return
      }

      if (isBoxSelecting) {
        isBoxSelecting = false
        const rect = boxSelectRectRef.current
        setBoxSelectRect(null)
        if (rect && sceneRef.current) {
          const lockedSet = new Set(sceneRef.current.locked ?? [])
          const hiddenSet = new Set(sceneRef.current.hidden ?? [])
          const matched: string[] = []

          const isOrtho = sceneRef.current.projection === 'ortho'
          const activeCam = isOrtho ? orthoCamera : camera

          const projectPoint = (pt: [number, number, number]): [number, number] => {
            const v = new THREE.Vector3(...pt).project(activeCam)
            const px = ((v.x + 1) / 2) * el.clientWidth
            const py = ((1 - v.y) / 2) * el.clientHeight
            return [px, py]
          }

          for (const p of partGroups) {
            if (hiddenSet.has(p.label) || lockedSet.has(p.label)) continue
            p.body.geometry.computeBoundingBox()
            const b = p.body.geometry.boundingBox!
            const wb = {
              min: [b.min.x, b.min.y, b.min.z] as [number, number, number],
              max: [b.max.x, b.max.y, b.max.z] as [number, number, number],
            }
            const tb = transformBounds(wb, p.group.matrix.toArray() as Mat4)
            if (isObjectInBoxSelect(rect, tb, projectPoint)) {
              matched.push(p.label)
            }
          }
          callbacksRef.current.onBoxSelect?.(matched)
        }
        return
      }

      if (!isDragging && !transformControls.dragging) {
        const rect = el.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        // Axis gizmo check
        const gx = e.clientX - (rect.right - GIZMO_SIZE)
        const gy = e.clientY - (rect.bottom - GIZMO_BOTTOM - GIZMO_SIZE)
        if (gx >= 0 && gy >= 0 && gx <= GIZMO_SIZE && gy <= GIZMO_SIZE) {
          ray.setFromCamera(new THREE.Vector2((gx / GIZMO_SIZE) * 2 - 1, 1 - (gy / GIZMO_SIZE) * 2), gCam)
          const hit = ray.intersectObjects(hits)[0]
          if (hit) view(hit.object.userData.dir)
          return
        }

        if (sceneRef.current) {
          const isOrtho = sceneRef.current.projection === 'ortho'
          const activeCam = isOrtho ? orthoCamera : camera
          const mouse = new THREE.Vector2((x / el.clientWidth) * 2 - 1, 1 - (y / el.clientHeight) * 2)
          ray.setFromCamera(mouse, activeCam)

          const lockedSet = new Set(sceneRef.current.locked ?? [])
          const hiddenSet = new Set(sceneRef.current.hidden ?? [])

          const candidateBodies: THREE.Mesh[] = []
          const bodyToPart = new Map<THREE.Mesh, string>()

          for (const p of partGroups) {
            if (hiddenSet.has(p.label) || lockedSet.has(p.label)) continue
            candidateBodies.push(p.body)
            bodyToPart.set(p.body, p.label)
          }

          const intersects = ray.intersectObjects(candidateBodies, false)
          if (intersects.length > 0) {
            const hit = intersects[0]
            const hitLabel = bodyToPart.get(hit.object as THREE.Mesh)
            if (callbacksRef.current.measurePickActive && callbacksRef.current.onMeasurePick) {
              const normal: [number, number, number] = hit.face
                ? [hit.face.normal.x, hit.face.normal.y, hit.face.normal.z]
                : [0, 0, 1]
              callbacksRef.current.onMeasurePick({
                point: [hit.point.x, hit.point.y, hit.point.z],
                normal,
                faceIndex: hit.faceIndex ?? 0,
                objectId: hitLabel,
                screenPos: { x: e.clientX, y: e.clientY },
              })
            } else {
              callbacksRef.current.onPick?.(hitLabel ?? null, e.shiftKey || e.ctrlKey || e.metaKey)
            }
          } else {
            callbacksRef.current.onPick?.(null, false)
          }
        }
      }
    }

    const onWheel = (e: WheelEvent) => {
      if (!sketchRef.current) return
      e.preventDefault()
      e.stopPropagation()

      const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87
      const dist = camera.position.distanceTo(controls.target)
      const newDist = Math.max(5, Math.min(25000, dist * zoomFactor))
      const factor = newDist / dist

      const planePtBefore = sketchPlanePoint(e)
      if (planePtBefore) {
        const frame = planeFrame(sketchRef.current.plane)
        const worldP = new THREE.Vector3(
          frame.origin[0] + planePtBefore.x * frame.xDir[0] + planePtBefore.y * frame.yDir[0],
          frame.origin[1] + planePtBefore.x * frame.xDir[1] + planePtBefore.y * frame.yDir[1],
          frame.origin[2] + planePtBefore.x * frame.xDir[2] + planePtBefore.y * frame.yDir[2],
        )
        const newTarget = controls.target.clone().add(worldP.clone().sub(controls.target).multiplyScalar(1 - factor))
        const camDir = camera.position.clone().sub(controls.target).normalize()
        controls.target.copy(newTarget)
        camera.position.copy(newTarget).addScaledVector(camDir, newDist)
      } else {
        const camDir = camera.position.clone().sub(controls.target).normalize()
        camera.position.copy(controls.target).addScaledVector(camDir, newDist)
      }

      controls.update()

      const newCoords = sketchPlanePoint(e)
      if (newCoords) {
        callbacksRef.current.onSketchPointer?.('move', newCoords, sketchMods(e), e as unknown as PointerEvent)
      }
      setViewTick((v) => v + 1)
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: false })

    const tmp = new THREE.Vector3()
    const renderMon = createRenderMonitor(renderer as unknown as RendererLike)

    renderer.setAnimationLoop(() => {
      controls.update()
      grid.position.x = Math.round(controls.target.x / 50) * 50
      grid.position.y = Math.round(controls.target.y / 50) * 50
      ;(grid.material as THREE.ShaderMaterial).uniforms.uCenter.value.set(0, 0, 0)
      const dist = camera.position.distanceTo(controls.target)
      ;(grid.material as THREE.ShaderMaterial).uniforms.uFade.value = Math.max(600, dist * 3)

      const ground = groundOpacity(camera.position.z, dist)
      ;(grid.material as THREE.ShaderMaterial).uniforms.uAlpha.value = ground
      grid.visible = ground > 0.01
      plateGroup.visible = ground > 0.01 && !assembledNow
      if (plateMats) { plateMats.fill.opacity = 0.85 * ground; plateMats.line.opacity = ground; if (plateMats.safe) plateMats.safe.opacity = ground }

      const w = el.clientWidth, h = el.clientHeight
      const isOrtho = sceneRef.current?.projection === 'ortho' || !!sketchRef.current
      const activeCam = isOrtho ? orthoCamera : camera

      if (isOrtho) {
        const oH = orthoHeightFromDistance(dist, camera.fov)
        const oW = oH * (w / h)
        orthoCamera.left = -oW / 2
        orthoCamera.right = oW / 2
        orthoCamera.top = oH / 2
        orthoCamera.bottom = -oH / 2
        orthoCamera.position.copy(camera.position)
        orthoCamera.quaternion.copy(camera.quaternion)
        orthoCamera.updateProjectionMatrix()
      }

      // Ориентация для ViewCube и обновление подписей эскиза: только когда вид действительно изменился,
      // иначе каждый кадр перерисовывал весь React-интерфейс (главная причина тормозов).
      const viewSig = [
        camera.position.x, camera.position.y, camera.position.z,
        controls.target.x, controls.target.y, controls.target.z, w, h,
      ].map((v) => v.toFixed(3)).join()
      if (viewSig !== lastViewSig) {
        lastViewSig = viewSig
        if (dist > 0.001) {
          const dx = camera.position.x - controls.target.x
          const dy = camera.position.y - controls.target.y
          const dz = camera.position.z - controls.target.z
          const pitch = (Math.asin(Math.max(-1, Math.min(1, dz / dist))) * 180) / Math.PI
          const yaw = (Math.atan2(dx, -dy) * 180) / Math.PI
          if (
            Number.isNaN(lastRot[0]) ||
            Number.isNaN(lastRot[1]) ||
            Math.abs(pitch - lastRot[0]) > 0.05 ||
            Math.abs(yaw - lastRot[1]) > 0.05
          ) {
            lastRot = [pitch, yaw]
            setCameraRotation([pitch, yaw, 0])
            callbacksRef.current.onCameraChange?.([pitch, yaw, 0])
          }
        }
        if (sketchRef.current) setViewTick((v) => v + 1)
      }

      renderer.setViewport(0, 0, w, h); renderer.setScissorTest(false)
      renderMon.beforeRender()
      renderer.clear(); renderer.render(scene, activeCam)
      renderMon.afterRender()

      // гизмо осей
      tmp.copy(camera.position).sub(controls.target).normalize().multiplyScalar(4)
      gCam.position.copy(tmp); gCam.lookAt(0, 0, 0)
      renderer.setScissorTest(true)
      renderer.setViewport(w - GIZMO_SIZE, GIZMO_BOTTOM, GIZMO_SIZE, GIZMO_SIZE)
      renderer.setScissor(w - GIZMO_SIZE, GIZMO_BOTTOM, GIZMO_SIZE, GIZMO_SIZE)
      renderer.clearDepth(); renderer.render(gScene, gCam)
    })

    return () => {
      renderMon.dispose()
      ro.disconnect()
      renderer.setAnimationLoop(null)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('wheel', onWheel)
      transformControls.dispose()
      controls.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => { api.current?.setModel(model) }, [model])
  useEffect(() => { api.current?.setTools(model, showTools) }, [model, showTools])
  useEffect(() => { api.current?.setGap(gap) }, [gap])
  useEffect(() => { api.current?.setLayout(view, openGap) }, [view, openGap])
  useEffect(() => { api.current?.setPlate(plate ?? null) }, [plate])
  useEffect(() => { api.current?.updateScene(sceneConfig) }, [sceneConfig])
  useEffect(() => { api.current?.setSketch(sketch) }, [sketch])
  useEffect(() => { api.current?.setClippingPlane?.(clippingPlane ?? null) }, [clippingPlane])
  useEffect(() => { api.current?.setHighlight?.(highlight ?? null) }, [highlight])

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      <div ref={host} style={{ width: '100%', height: '100%' }} />

      {/* ViewCube over the view in scene mode (disabled while sketching) */}
      {sceneConfig && !sketch && (
        <div className="absolute top-4 right-4 z-10">
          <ViewCube
            rotation={cameraRotation}
            onSelectFace={(face) => api.current?.setViewFace(face)}
            onOrbit={(dx, dy) => api.current?.orbit(dx, dy)}
          />
        </div>
      )}

      {/* Look at plane button in sketch mode */}
      {sketch && (
        <div className="absolute top-4 right-4 z-10">
          <button
            type="button"
            onClick={() => api.current?.lookAtSketchPlane()}
            className="px-2.5 py-1 text-xs font-medium rounded-(--radius-control) border border-(--color-border) bg-(--color-surface-2)/90 text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-accent) shadow-(--shadow-sticky) cursor-pointer"
          >
            {t('sketch.lookAtPlane', 'Look at plane')}
          </button>
        </div>
      )}

      {/* Sketch Overlay: constraint glyphs and dimension labels */}
      {sketch && (
        <SketchOverlay
          config={sketch}
          project={(pt) => api.current?.projectPoint(pt) ?? null}
          onUpdateConstraint={onUpdateConstraint}
          onDeleteConstraint={onDeleteConstraint}
          onSelectConstraint={onSelectConstraint}
          onHoverConstraint={onHoverConstraint}
          onPinDimension={onPinDimension}
          onSubmitDraftInput={onSubmitDraftInput}
          onCancelStage={onCancelSketchStage}
        />
      )}

      {/* Box selection overlay */}
      {boxSelectRect && (
        <div
          data-testid="box-select-overlay"
          style={{
            position: 'absolute',
            left: Math.min(boxSelectRect.x0, boxSelectRect.x1),
            top: Math.min(boxSelectRect.y0, boxSelectRect.y1),
            width: Math.abs(boxSelectRect.x1 - boxSelectRect.x0),
            height: Math.abs(boxSelectRect.y1 - boxSelectRect.y0),
            border: '1px solid var(--color-accent, #7c9cff)',
            backgroundColor: 'rgba(124, 156, 255, 0.15)',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        />
      )}
    </div>
  )
}
