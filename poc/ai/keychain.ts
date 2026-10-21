/**
 * PoC пайплайна Keychain (change 33 + 34): фото → кроп → силуэт (модель маски) → глубина (модель глубины) → детали
 * (локальный контраст) → смесь → 3D-рельеф. Этапы независимы: у каждого своя модель/настройки и своё превью.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { edt } from '../../src/geometry/raster/edt'
import { gaussianBlur, MIN_SIGMA } from '../../src/geometry/raster/blur'
import { otsu } from '../../src/geometry/raster/threshold'
import { close } from '../../src/geometry/raster/morphology'
import { fillHoles, labelComponents, removeSpecks } from '../../src/geometry/raster/components'
import { backendsOf, CANDIDATES, type Candidate } from './models'
import { infer } from './engine'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const num = (id: string) => +$<HTMLInputElement>(id).value
const chk = (id: string) => $<HTMLInputElement>(id).checked
const logEl = $('log')
const log = (s: string) => { logEl.textContent += s + '\n'; logEl.scrollTop = logEl.scrollHeight; console.log(s) }
$('coi').textContent = String(self.crossOriginIsolated); $('cores').textContent = String(navigator.hardwareConcurrency)

for (const c of CANDIDATES.filter((x) => (x.kind ?? 'matte') === 'matte')) $('silmodelsel').append(new Option(c.label, c.id))
for (const c of CANDIDATES.filter((x) => x.kind === 'depth')) $('depthsel').append(new Option(c.label, c.id))
$<HTMLSelectElement>('silmodelsel').value = 'birefnet-lite-512-fp16'
/** Бэкенд подбирается под модель: показываются только те, на которых она работает. */
function syncBackends(modelSel: string, epSel: string) {
  const ep = $<HTMLSelectElement>(epSel), list = backendsOf($<HTMLSelectElement>(modelSel).value), keep = ep.value
  ep.innerHTML = ''; for (const b of list) ep.append(new Option(b, b))
  ep.value = list.includes(keep as 'wasm' | 'webgpu') ? keep : list[0]; ep.disabled = list.length === 1
}
for (const [m, e] of [['silmodelsel', 'silep'], ['depthsel', 'depthep']] as const) { syncBackends(m, e); $(m).addEventListener('change', () => syncBackends(m, e)) }

// ---------- состояние ----------
interface Img { w: number; h: number; rgb: Uint8Array }
interface Crop { x: number; y: number; w: number; h: number } // доли
let img: Img | null = null
let matte: Float32Array | null = null // мягкая альфа, размер картинки
let depthRec: { plane: Float32Array; w: number; h: number; crop: Crop } | null = null

const cropNow = (): Crop => ({ x: num('cx') / 100, y: num('cy') / 100, w: Math.min(num('cw'), 100 - num('cx')) / 100, h: Math.min(num('ch'), 100 - num('cy')) / 100 })
const cropPx = (c: Crop, im: Img) => ({ x0: Math.round(c.x * im.w), y0: Math.round(c.y * im.h), pw: Math.max(8, Math.round(c.w * im.w)), ph: Math.max(8, Math.round(c.h * im.h)) })

async function loadImage() {
  const f = $<HTMLInputElement>('file').files?.[0]
  const el = new Image(); el.src = f ? URL.createObjectURL(f) : `./samples/${$<HTMLSelectElement>('sample').value}.jpeg`; await el.decode()
  const k = Math.min(1, 2048 / Math.max(el.naturalWidth, el.naturalHeight))
  const cv = document.createElement('canvas'); cv.width = Math.round(el.naturalWidth * k); cv.height = Math.round(el.naturalHeight * k)
  const g = cv.getContext('2d')!; g.drawImage(el, 0, 0, cv.width, cv.height)
  const d = g.getImageData(0, 0, cv.width, cv.height).data, rgb = new Uint8Array(cv.width * cv.height * 3)
  for (let i = 0; i < cv.width * cv.height; i++) { rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2] }
  img = { w: cv.width, h: cv.height, rgb }; matte = null; depthRec = null; work = null
  log(`снимок ${img.w}×${img.h}`); schedule()
}

// ---------- рабочий растр кропа ----------
interface Work { key: string; ww: number; wh: number; gray: Float32Array; rgb: Uint8Array; matte: Float32Array | null; depth: Float32Array | null; k: number; x0: number; y0: number }
let work: Work | null = null
function bil(p: Float32Array, w: number, h: number, x: number, y: number): number {
  x = Math.min(w - 1.001, Math.max(0, x - 0.5)); y = Math.min(h - 1.001, Math.max(0, y - 0.5))
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0
  return (p[y0 * w + x0] * (1 - tx) + p[y0 * w + x0 + 1] * tx) * (1 - ty) + (p[(y0 + 1) * w + x0] * (1 - tx) + p[(y0 + 1) * w + x0 + 1] * tx) * ty
}
function getWork(): Work | null {
  if (!img) return null
  const c = cropNow(), { x0, y0, pw, ph } = cropPx(c, img)
  const key = [x0, y0, pw, ph, matte ? 1 : 0, depthRec ? depthRec.crop.x + ',' + depthRec.crop.y + ',' + depthRec.crop.w + ',' + depthRec.crop.h : 0].join('|')
  if (work && work.key === key) return work
  const k = Math.min(1, 640 / Math.max(pw, ph)), ww = Math.max(8, Math.round(pw * k)), wh = Math.max(8, Math.round(ph * k))
  const gray = new Float32Array(ww * wh), rgb = new Uint8Array(ww * wh * 3)
  const mw = matte ? new Float32Array(ww * wh) : null, dw = depthRec ? new Float32Array(ww * wh) : null
  const dpx = depthRec ? cropPx(depthRec.crop, img) : null
  for (let j = 0; j < wh; j++) for (let i = 0; i < ww; i++) {
    const fx = x0 + (i + 0.5) / k, fy = y0 + (j + 0.5) / k // координаты в полном кадре
    const ix = Math.min(img.w - 1, Math.floor(fx)), iy = Math.min(img.h - 1, Math.floor(fy)), q = (iy * img.w + ix) * 3, p = j * ww + i
    rgb[p * 3] = img.rgb[q]; rgb[p * 3 + 1] = img.rgb[q + 1]; rgb[p * 3 + 2] = img.rgb[q + 2]
    gray[p] = (0.299 * img.rgb[q] + 0.587 * img.rgb[q + 1] + 0.114 * img.rgb[q + 2]) / 255
    if (mw && matte) mw[p] = bil(matte, img.w, img.h, fx, fy)
    if (dw && depthRec && dpx) dw[p] = bil(depthRec.plane, depthRec.w, depthRec.h, (fx - dpx.x0) * depthRec.w / dpx.pw, (fy - dpx.y0) * depthRec.h / dpx.ph)
  }
  work = { key, ww, wh, gray, rgb, matte: mw, depth: dw, k, x0, y0 }
  return work
}

// ---------- этапы ----------
const ones = (n: number) => new Uint8Array(n).fill(1)
const smooth01 = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x) }

function silhouette(w: Work, pxMm: number): { mask: Uint8Array; note: string } {
  const n = w.ww * w.wh, src = $<HTMLSelectElement>('silsrc').value
  let mask: Uint8Array, note = ''
  if (src === 'frame') mask = ones(n)
  else if (src === 'brightness') {
    const g8 = Uint8Array.from(w.gray, (v) => Math.round(v * 255)), thr = otsu(g8), inv = chk('inv')
    mask = new Uint8Array(n); for (let i = 0; i < n; i++) mask[i] = (g8[i] < thr) !== inv ? 1 : 0
    mask = close(mask, w.ww, w.wh, Math.max(1, Math.round(0.6 * pxMm)))
    note = `порог Оцу ${thr}`
  } else {
    if (!w.matte) { note = 'маска не посчитана: запустите модель'; return { mask: ones(n), note } }
    const s = num('smooth') * pxMm, a = s > 0 ? gaussianBlur(w.matte, w.ww, w.wh, Math.max(MIN_SIGMA, s), ones(n)) : w.matte
    mask = new Uint8Array(n); const thr = num('thr'); for (let i = 0; i < n; i++) mask[i] = a[i] >= thr ? 1 : 0
    if (chk('largest')) {
      const cc = labelComponents(mask, w.ww, w.wh); let best = 0
      for (let k = 1; k <= cc.count; k++) if (cc.sizes[k] > (cc.sizes[best] ?? 0)) best = k
      mask = mask.map((_, i) => (cc.labels[i] === best && best ? 1 : 0)) as Uint8Array
    }
  }
  if (src !== 'frame') {
    if (chk('fill')) mask = fillHoles(mask, w.ww, w.wh).mask
    mask = removeSpecks(mask, w.ww, w.wh, Math.round(2 * pxMm * pxMm))
  }
  return { mask, note }
}

function normDepth(w: Work, mask: Uint8Array): Float32Array | null {
  if (!w.depth) return null
  const v: number[] = []; for (let i = 0; i < mask.length; i++) if (mask[i]) v.push(w.depth[i])
  if (!v.length) return null
  v.sort((a, b) => a - b); const lo = v[Math.floor(v.length * 0.02)], hi = v[Math.floor(v.length * 0.98)], inv = chk('dinv')
  return w.depth.map((d) => { const t = Math.min(1, Math.max(0, (d - lo) / (hi - lo || 1))); return inv ? 1 - t : t })
}

function detail(w: Work, pxMm: number): Float32Array {
  const amount = num('lca'), n = w.ww * w.wh
  if (amount <= 0) return new Float32Array(n).fill(0.5)
  const sg = Math.max(MIN_SIGMA, num('lcr') * pxMm), m = ones(n)
  const mean = gaussianBlur(w.gray, w.ww, w.wh, sg, m), dev = w.gray.map((v, i) => v - mean[i])
  const sd = gaussianBlur(dev.map((v) => v * v), w.ww, w.wh, sg, m).map((v) => Math.sqrt(v) + 0.02)
  let t = dev.map((v, i) => 0.5 + 0.5 * Math.tanh(amount * v / sd[i]))
  const L = num('lvl'); if (L >= 2) t = t.map((v) => Math.round(v * (L - 1)) / (L - 1))
  return t
}

// ---------- превью ----------
function show(id: string, w: number, h: number, px: (i: number) => [number, number, number]) {
  const cv = $<HTMLCanvasElement>(id); cv.width = w; cv.height = h
  const g = cv.getContext('2d')!, im = g.createImageData(w, h)
  for (let i = 0; i < w * h; i++) { const [r, gg, b] = px(i); im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255 }
  g.putImageData(im, 0, 0)
}
const gr = (v: number): [number, number, number] => { const t = Math.round(Math.min(1, Math.max(0, v)) * 255); return [t, t, t] }

function previewImage(c: Crop) {
  if (!img) return
  const cv = $<HTMLCanvasElement>('pv-img'), s = Math.min(1, 520 / img.w); cv.width = Math.round(img.w * s); cv.height = Math.round(img.h * s)
  const g = cv.getContext('2d')!, im = g.createImageData(img.w, img.h)
  for (let i = 0; i < img.w * img.h; i++) { im.data[i * 4] = img.rgb[i * 3]; im.data[i * 4 + 1] = img.rgb[i * 3 + 1]; im.data[i * 4 + 2] = img.rgb[i * 3 + 2]; im.data[i * 4 + 3] = 255 }
  const t = document.createElement('canvas'); t.width = img.w; t.height = img.h; t.getContext('2d')!.putImageData(im, 0, 0)
  g.drawImage(t, 0, 0, cv.width, cv.height)
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.rect(0, 0, cv.width, cv.height); g.rect(c.x * cv.width, c.y * cv.height, c.w * cv.width, c.h * cv.height); g.fill('evenodd')
  g.strokeStyle = '#ff3'; g.lineWidth = 2; g.strokeRect(c.x * cv.width, c.y * cv.height, c.w * cv.width, c.h * cv.height)
}

// ---------- обновление пайплайна ----------
let timer = 0
function schedule() { clearTimeout(timer); timer = window.setTimeout(update, 120) }
function update() {
  for (const id of ['cx', 'cy', 'cw', 'ch', 'thr', 'smooth', 'wc', 'wd', 'wt', 'roll']) { const e = $<HTMLInputElement>(id); (e.nextElementSibling as HTMLElement).textContent = e.value }
  $('silmodel').hidden = $<HTMLSelectElement>('silsrc').value !== 'model'
  $('silbright').hidden = $<HTMLSelectElement>('silsrc').value !== 'brightness'
  const c = cropNow(); previewImage(c)
  const w = getWork(); if (!w || !img) return
  const partW = num('partw'), pxMm = w.ww / partW, partH = partW * w.wh / w.ww, n = w.ww * w.wh
  const sil = silhouette(w, pxMm), note = sil.note
  const mask = chk('lm') ? sil.mask : ones(n) // слой «маска»: выключен — рельеф без вырезания по силуэту
  $('st-sil').textContent = note
  show('pv-mask', w.ww, w.wh, (i) => (mask[i] ? [w.rgb[i * 3], w.rgb[i * 3 + 1], w.rgb[i * 3 + 2]] : [30, 30, 40]))
  const dn = normDepth(w, mask)
  const same = depthRec && JSON.stringify(depthRec.crop) === JSON.stringify(c)
  $('st-depth').textContent = depthRec ? (same ? 'посчитана для этого кропа' : 'посчитана для другого кропа (можно пересчитать)') : 'не посчитана'
  show('pv-depth', w.ww, w.wh, (i) => (mask[i] ? (dn ? gr(dn[i]) : [90, 90, 90]) : [30, 30, 40]))
  const dt = detail(w, pxMm)
  show('pv-detail', w.ww, w.wh, (i) => (mask[i] ? gr(dt[i]) : [30, 30, 40]))
  // смесь
  const dist = edt(mask, w.ww, w.wh), bevelPx = Math.max(1, num('bevel') * pxMm), roll = num('roll') / 100
  const wc = chk('lc') ? num('wc') : 0, wd = dn && chk('ld') ? num('wd') : 0, wt = chk('lt') ? num('wt') : 0
  const value = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue
    const contour = smooth01(dist[i] / bevelPx), tot = wc + wd + wt, mixed = tot === 0 ? contour : (wc * contour + wd * (dn ? dn[i] : 0) + wt * dt[i]) / tot
    value[i] = mixed * ((1 - roll) + roll * contour)
  }
  show('pv-mix', w.ww, w.wh, (i) => (mask[i] ? gr(value[i]) : [30, 30, 40]))
  build3D(w, mask, value, partW, partH)
}

// ---------- 3D ----------
const view = $('view')
const renderer = new THREE.WebGLRenderer({ antialias: true }); view.append(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe8e8e4)
const camera = new THREE.PerspectiveCamera(35, 1, 1, 2000)
const controls = new OrbitControls(camera, renderer.domElement)
const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 0.55); scene.add(hemi)
const sun = new THREE.DirectionalLight(0xffffff, 2.2); scene.add(sun)
const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(60, -80, 40); scene.add(fill)
const mat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.75, metalness: 0 })
const group = new THREE.Group(); scene.add(group)
function setLight() { const a = (num('lightang') * Math.PI) / 180; sun.position.set(Math.cos(a) * 80, Math.sin(a) * 80, 70) }
function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
new ResizeObserver(resize).observe(view); resize(); setLight()
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera) })
let fitted = ''
function frame(partW: number, partH: number, preset: 'top' | 'iso' | null) {
  const d = Math.max(partW, partH) * 1.9
  if (preset === 'top') camera.position.set(0, -0.001, d)
  else if (preset === 'iso') camera.position.set(-d * 0.45, -d * 0.7, d * 0.75)
  camera.up.set(0, 0, 1); if (preset === 'top') camera.up.set(0, 1, 0)
  camera.lookAt(0, 0, 0); controls.target.set(0, 0, 0); controls.update()
}
$('vtop').addEventListener('click', () => frame(num('partw'), num('partw'), 'top'))
$('viso').addEventListener('click', () => frame(num('partw'), num('partw'), 'iso'))

function build3D(w: Work, mask: Uint8Array, value: Float32Array, partW: number, partH: number) {
  const nodes = Math.max(60, num('nodes')), s = Math.max(1, Math.ceil(Math.max(w.ww, w.wh) / nodes))
  const nx = Math.floor((w.ww - 1) / s) + 1, ny = Math.floor((w.wh - 1) / s) + 1
  const floor = num('floor'), range = num('range'), mmx = partW / w.ww, mmy = partH / w.wh
  const X = (i: number) => (i * s + 0.5) * mmx - partW / 2, Y = (j: number) => partH / 2 - (j * s + 0.5) * mmy
  const inside = (i: number, j: number) => mask[Math.min(w.wh - 1, j * s) * w.ww + Math.min(w.ww - 1, i * s)] === 1
  const top = (i: number, j: number) => floor + range * value[Math.min(w.wh - 1, j * s) * w.ww + Math.min(w.ww - 1, i * s)]
  // верх: индексированная сетка, только ячейки, у которых все 4 узла внутри маски
  const pos = new Float32Array(nx * ny * 3)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const p = (j * nx + i) * 3; pos[p] = X(i); pos[p + 1] = Y(j); pos[p + 2] = inside(i, j) ? top(i, j) : 0 }
  const idx: number[] = [], cell: boolean[] = new Array((nx - 1) * (ny - 1)).fill(false)
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!(inside(i, j) && inside(i + 1, j) && inside(i, j + 1) && inside(i + 1, j + 1))) continue
    cell[j * (nx - 1) + i] = true
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
    idx.push(a, b, c, b, d, c)
  }
  const topGeo = new THREE.BufferGeometry(); topGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); topGeo.setIndex(idx); topGeo.computeVertexNormals()
  // стенки по границе ячеек и дно
  const wp: number[] = []
  const quad = (a: number[], b: number[], c: number[], d: number[]) => wp.push(...a, ...b, ...c, ...b, ...d, ...c)
  const isCell = (i: number, j: number) => i >= 0 && j >= 0 && i < nx - 1 && j < ny - 1 && cell[j * (nx - 1) + i]
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!isCell(i, j)) continue
    const x0 = X(i), x1 = X(i + 1), y0 = Y(j), y1 = Y(j + 1)
    quad([x0, y0, 0], [x1, y0, 0], [x0, y1, 0], [x1, y1, 0]) // дно (нормаль вниз задаётся порядком ниже)
    if (!isCell(i, j - 1)) quad([x1, y0, 0], [x0, y0, 0], [x1, y0, top(i + 1, j)], [x0, y0, top(i, j)])
    if (!isCell(i, j + 1)) quad([x0, y1, 0], [x1, y1, 0], [x0, y1, top(i, j + 1)], [x1, y1, top(i + 1, j + 1)])
    if (!isCell(i - 1, j)) quad([x0, y0, 0], [x0, y1, 0], [x0, y0, top(i, j)], [x0, y1, top(i, j + 1)])
    if (!isCell(i + 1, j)) quad([x1, y1, 0], [x1, y0, 0], [x1, y1, top(i + 1, j + 1)], [x1, y0, top(i + 1, j)])
  }
  const skirt = new THREE.BufferGeometry(); skirt.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wp), 3)); skirt.computeVertexNormals()
  group.clear()
  mat.wireframe = chk('wire'); mat.side = THREE.DoubleSide
  group.add(new THREE.Mesh(topGeo, mat), new THREE.Mesh(skirt, mat))
  $('stat3d').textContent = `сетка ${nx}×${ny}, шаг ${(s * mmx).toFixed(2)} мм, ${(idx.length / 3 / 1000).toFixed(0)} тыс. треуг.; деталь ${partW.toFixed(0)}×${partH.toFixed(0)} мм, высота до ${(floor + range).toFixed(1)} мм`
  const sig = `${partW}|${partH}`; if (sig !== fitted) { fitted = sig; frame(partW, partH, 'iso') }
}

// ---------- запуск моделей ----------
async function runModel(kind: 'sil' | 'depth') {
  if (!img) return
  const c: Candidate = CANDIDATES.find((x) => x.id === $<HTMLSelectElement>(kind === 'sil' ? 'silmodelsel' : 'depthsel').value)!
  const ep = $<HTMLSelectElement>(kind === 'sil' ? 'silep' : 'depthep').value
  const btn = $<HTMLButtonElement>(kind === 'sil' ? 'runsil' : 'rundepth'); btn.disabled = true
  try {
    log(`${kind === 'sil' ? 'силуэт' : 'глубина'}: ${c.id}, ${ep}, лицензия ${c.license}`)
    let rgb = img.rgb, w = img.w, h = img.h, crop: Crop | null = null
    if (kind === 'depth') { // глубина считается по кропу: на лице больше пикселей
      crop = cropNow(); const p = cropPx(crop, img); w = p.pw; h = p.ph; rgb = new Uint8Array(w * h * 3)
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const q = ((p.y0 + j) * img.w + p.x0 + i) * 3; rgb.set(img.rgb.subarray(q, q + 3), (j * w + i) * 3) }
    }
    const r = await infer(c, ep, 1, rgb, w, h, log)
    log(`готово за ${r.ms.toFixed(0)} мс`)
    if (kind === 'sil') matte = r.plane; else depthRec = { plane: r.plane, w, h, crop: crop! }
    work = null; schedule()
  } catch (e) { log('ОШИБКА: ' + ((e as Error)?.message ?? e)) } finally { btn.disabled = false }
}

// ---------- события ----------
$('runsil').addEventListener('click', () => runModel('sil'))
$('rundepth').addEventListener('click', () => runModel('depth'))
$('sample').addEventListener('change', () => { $<HTMLInputElement>('file').value = ''; loadImage() })
$('file').addEventListener('change', () => loadImage())
$('face').addEventListener('click', () => { for (const [id, v] of [['cx', 42], ['cy', 34], ['cw', 42], ['ch', 24]] as const) $<HTMLInputElement>(id).value = String(v); schedule() })
$('resetcrop').addEventListener('click', () => { for (const [id, v] of [['cx', 0], ['cy', 0], ['cw', 100], ['ch', 100]] as const) $<HTMLInputElement>(id).value = String(v); schedule() })
for (const el of document.querySelectorAll('input[type=range], input[type=number], input[type=checkbox], select')) {
  if (['file', 'sample'].includes(el.id)) continue
  el.addEventListener('input', () => { if (el.id === 'lightang') setLight(); schedule() })
}
loadImage()
