import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { creaseEdges } from './degenerate'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ModelResult } from '../../geometry/model'
import { groundOpacity } from './ground'
import { readRootVar, toolColor } from './toolColor'
import { assembledMatrix, layoutBounds, type KeychainView } from './layout'
import { createRenderMonitor, type RendererLike } from '../../app/resources/render'

export interface BuildPlate { x: number; y: number; /** Поле по краю: пунктирный контур рабочей области. */ margin?: number }

interface Api {
  setModel: (m: ModelResult | null) => void
  setTools: (m: ModelResult | null, show: boolean) => void
  setGap: (gap: number) => void
  setLayout: (view: KeychainView, openGap: number) => void
  setPlate: (p: BuildPlate | null) => void
  fit: () => void
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
  const g = c.getContext('2d')!
  const css = '#' + color.toString(16).padStart(6, '0')
  g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2)
  if (filled) { g.fillStyle = css; g.fill() } else { g.globalAlpha = 0.55; g.fillStyle = css; g.fill(); g.globalAlpha = 1 }
  if (text) { g.fillStyle = '#fff'; g.font = 'bold 34px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 32, 34) }
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
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(14,16,19,0.92)'
  g.beginPath(); g.roundRect(4, 8, 120, 48, 14); g.fill()
  g.lineWidth = 3; g.strokeStyle = color; g.stroke()
  g.fillStyle = '#E6E9EE'; g.font = '500 28px "JetBrains Mono Variable", ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(text, 64, 33)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }))
  s.scale.set(26, 13, 1)
  s.renderOrder = 10
  return s
}

export function Viewport({ model, plate, gap = 0, view = 'sheet', openGap = 0, showTools = true, onFitReady }: { model: ModelResult | null; plate: BuildPlate | null; gap?: number; /** Keychain в режиме половин: лист печати или собранный брелок (нужен model.assembly). */ view?: KeychainView; /** Раздвижка собранных половин по Z, мм. */ openGap?: number; /** Показывать вырезающие инструменты (model.tools) полупрозрачными. */ showTools?: boolean; onFitReady?: (fit: () => void) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const gapRef = useRef(gap)
  gapRef.current = gap
  const layoutRef = useRef({ view, openGap })
  layoutRef.current = { view, openGap }

  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.autoClear = false
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0e1013)
    const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 20000)
    camera.up.set(0, 0, 1)
    camera.position.set(160, -220, 160)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI // камера может уйти под плоскость XY и смотреть на низ модели; ось Z остаётся вверху
    controls.minDistance = 30
    controls.maxDistance = 1500

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8794a8, 1.4)) // нижний цвет светлее: грани, смотрящие вниз, читаются
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(120, -180, 300)
    scene.add(sun)
    // подсветка снизу: углубления на дне (магниты, отверстия) видны при взгляде снизу
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
    // вырезающие инструменты: полупрозрачные тела поверх модели, не часть частей (разнесение их не двигает)
    const toolGroup = new THREE.Group()
    scene.add(toolGroup)
    let partGroups: { group: THREE.Group; label: string; col: number; row: number; body: THREE.Mesh; labelSprite?: THREE.Sprite }[] = []
    let cols = 1, rows = 1
    let current: ModelResult | null = null
    let assembledNow = false
    let radius = 60
    // раскладка деталей: разнесённый вид по сетке (gap) или матрицы собранного вида брелка (без пересчёта геометрии)
    const applyGap = (g: number) => {
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
        // закрытые половины касаются по плоскости разъёма: сдвиг глубины у нижней гасит мерцание, только визуально
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
      // линия WebGL всегда 1 px, поэтому ось — тонкий цилиндр (≈ 4 px при размере гизмо 120 px)
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
      controls.minDistance = Math.max(radius * 0.35, 15)
    }
    const view = (dir: THREE.Vector3) => {
      const dist = camera.position.distanceTo(controls.target)
      const d = dir.clone()
      if (Math.abs(d.z) === 1) d.add(new THREE.Vector3(0, -1e-3, 0)) // чтобы up-вектор не вырождался
      camera.position.copy(controls.target).add(d.normalize().multiplyScalar(dist))
    }

    let fitted = false
    api.current = {
      fit,
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
          // деталь «как есть»: гладкая поверхность, острые рёбра (угол > 30°) остаются резкими
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
          // плоское затенение — чёткие грани
          const g = indexed.toNonIndexed()
          g.computeVertexNormals()
          const style = many ? PART_STYLES[(part.col + part.row) % PART_STYLES.length] : PART_STYLES[0]
          const body = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
            color: style.fill, roughness: 0.6, metalness: 0.05, flatShading: true,
            polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
          }))
          // контуры: только резкие рёбра (угол > 25°); у слишком большой части — красные
          // контур: складки (угол > 25°) считаются своим алгоритмом, вырожденные треугольники сетки не рисуют линий через грань
          const edgeGeometry = new THREE.BufferGeometry()
          edgeGeometry.setAttribute('position', new THREE.BufferAttribute(creaseEdges(pos, mm.triVerts), 3))
          const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: part.oversize ? 0xf0707b : style.edge }))
          const group = new THREE.Group()
          group.add(body, edges)
          let labelSprite: THREE.Sprite | undefined
          if (many) {
            labelSprite = textSprite(part.label, part.oversize ? '#F0707B' : style.outline)
            labelSprite.position.set((mm.min[0] + mm.max[0]) / 2, (mm.min[1] + mm.max[1]) / 2, mm.max[2] + 6)
            group.add(labelSprite)
          }
          modelGroup.add(group)
          partGroups.push({ group, label: part.label, col: part.col, row: part.row, body, labelSprite })
          indexed.dispose()
        }
        applyGap(gapRef.current)
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
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    // клик по гизмо — выровнять вид по оси
    const ray = new THREE.Raycaster()
    const onClick = (e: MouseEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      const gx = e.clientX - (r.right - GIZMO_SIZE), gy = e.clientY - (r.bottom - GIZMO_BOTTOM - GIZMO_SIZE)
      if (gx < 0 || gy < 0 || gx > GIZMO_SIZE || gy > GIZMO_SIZE) return
      ray.setFromCamera(new THREE.Vector2((gx / GIZMO_SIZE) * 2 - 1, 1 - (gy / GIZMO_SIZE) * 2), gCam)
      const hit = ray.intersectObjects(hits)[0]
      if (hit) view(hit.object.userData.dir)
    }
    renderer.domElement.addEventListener('click', onClick)

    const tmp = new THREE.Vector3()
    const renderMon = createRenderMonitor(renderer as unknown as RendererLike)
    renderer.setAnimationLoop(() => {
      controls.update()
      grid.position.x = Math.round(controls.target.x / 50) * 50
      grid.position.y = Math.round(controls.target.y / 50) * 50
      ;(grid.material as THREE.ShaderMaterial).uniforms.uCenter.value.set(0, 0, 0)
      const dist = camera.position.distanceTo(controls.target)
      ;(grid.material as THREE.ShaderMaterial).uniforms.uFade.value = Math.max(600, dist * 3)
      // сетка и стол плавно гаснут, когда камера уходит под плоскость XY, и возвращаются над ней
      const ground = groundOpacity(camera.position.z, dist)
      ;(grid.material as THREE.ShaderMaterial).uniforms.uAlpha.value = ground
      grid.visible = ground > 0.01
      plateGroup.visible = ground > 0.01 && !assembledNow // в собранном виде стола нет
      if (plateMats) { plateMats.fill.opacity = 0.85 * ground; plateMats.line.opacity = ground; if (plateMats.safe) plateMats.safe.opacity = ground }
      const w = el.clientWidth, h = el.clientHeight
      renderer.setViewport(0, 0, w, h); renderer.setScissorTest(false)
      renderMon.beforeRender()
      renderer.clear(); renderer.render(scene, camera)
      renderMon.afterRender()
      // гизмо
      tmp.copy(camera.position).sub(controls.target).normalize().multiplyScalar(4)
      gCam.position.copy(tmp); gCam.lookAt(0, 0, 0)
      renderer.setScissorTest(true)
      renderer.setViewport(w - GIZMO_SIZE, GIZMO_BOTTOM, GIZMO_SIZE, GIZMO_SIZE)
      renderer.setScissor(w - GIZMO_SIZE, GIZMO_BOTTOM, GIZMO_SIZE, GIZMO_SIZE)
      renderer.clearDepth(); renderer.render(gScene, gCam)
    })
    return () => {
      renderMon.dispose()
      ro.disconnect(); renderer.setAnimationLoop(null)
      renderer.domElement.removeEventListener('click', onClick)
      controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => { api.current?.setModel(model) }, [model])
  useEffect(() => { api.current?.setTools(model, showTools) }, [model, showTools])
  useEffect(() => { api.current?.setGap(gap) }, [gap])
  useEffect(() => { api.current?.setLayout(view, openGap) }, [view, openGap])
  useEffect(() => { api.current?.setPlate(plate) }, [plate])
  return <div ref={host} style={{ width: '100%', height: '100%' }} />
}
