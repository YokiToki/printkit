/**
 * PoC пайплайна вырезов (change 25/25a/32): фото инструментов на листе → углы листа и выпрямление → силуэты (классика или модель маски)
 * → векторный контур → карманы в корпусе → 3D. Контуры и сглаживание те же, что в PoC Keychain (outline.ts).
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { toColorImage, toGrayImage } from '../../src/features/keychain/decodeImage'
import { detectPaper } from '../../src/geometry/photo/detect'
import { guessPaper } from '../../src/geometry/photo/aspect'
import { paperSize, type Paper, type PaperOrientation } from '../../src/geometry/photo/paper'
import { rectify, type Rectified } from '../../src/geometry/photo/homography'
import { segment, type Segmentation } from '../../src/geometry/photo/segment'
import { edt } from '../../src/geometry/raster/edt'
import { gaussianBlur, MIN_SIGMA } from '../../src/geometry/raster/blur'
import { fillHoles, labelComponents, removeSpecks } from '../../src/geometry/raster/components'
import { backendsOf, CANDIDATES } from './models'
import { infer } from './engine'
import { signedDistance, vectorOutline, type Pt } from './outline'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const num = (id: string) => +$<HTMLInputElement>(id).value
const chk = (id: string) => $<HTMLInputElement>(id).checked
const logEl = $('log')
const log = (s: string) => { logEl.textContent += s + '\n'; logEl.scrollTop = logEl.scrollHeight; console.log(s) }
$('coi').textContent = String(self.crossOriginIsolated); $('cores').textContent = String(navigator.hardwareConcurrency)
const ones = (n: number) => new Uint8Array(n).fill(1)

for (const c of CANDIDATES.filter((x) => (x.kind ?? 'matte') === 'matte')) $('modelsel').append(new Option(c.label, c.id))
$<HTMLSelectElement>('modelsel').value = 'birefnet-lite-512-fp16'
function syncEp() {
  const ep = $<HTMLSelectElement>('ep'), list = backendsOf($<HTMLSelectElement>('modelsel').value), keep = ep.value
  ep.innerHTML = ''; for (const b of list) ep.append(new Option(b, b))
  ep.value = list.includes(keep as 'wasm' | 'webgpu') ? keep : list[0]; ep.disabled = list.length === 1
}
syncEp(); $('modelsel').addEventListener('change', syncEp)

// ---------- состояние ----------
interface Sil { id: number; widthMm: number; heightMm: number; areaMm2: number; bbox: [number, number, number, number] }
interface Seg { labels: Int32Array; sils: Sil[] }
let photo: { w: number; h: number; rgb: Uint8Array; gray: ReturnType<typeof toGrayImage>; color: ReturnType<typeof toColorImage> } | null = null
let detection: { corners: Pt[]; paper: Paper; info: string } | null = null
let rect: Rectified | null = null
let classic: Seg | null = null
let matte: Float32Array | null = null // мягкая альфа модели на выпрямленном растре
const excluded = new Set<number>()

async function loadPhoto() {
  const f = $<HTMLInputElement>('file').files?.[0]
  const el = new Image(); el.src = f ? URL.createObjectURL(f) : `./samples/${$<HTMLSelectElement>('sample').value}.jpeg`; await el.decode()
  const cv = document.createElement('canvas'); cv.width = el.naturalWidth; cv.height = el.naturalHeight
  const g = cv.getContext('2d')!; g.drawImage(el, 0, 0)
  const d = g.getImageData(0, 0, cv.width, cv.height)
  const gray = toGrayImage(d.data, d.width, d.height), color = toColorImage(d.data, d.width, d.height)
  photo = { w: d.width, h: d.height, rgb: color.rgb, gray, color }
  const found = detectPaper(color)
  if (!found) { detection = null; log('лист не найден'); $('st-paper').textContent = 'лист не найден'; return }
  const guess = guessPaper(found.corners, d.width, d.height)
  detection = { corners: found.corners, paper: paperSize('a4', 'portrait'), info: '' }
  detection.info = `найден лист, уверенность ${found.confidence.toFixed(2)}, формат ${guess?.preset ?? '?'} / ${guess?.orientation ?? '?'}`
  ;(window as unknown as { __guess: unknown }).__guess = guess
  log(`фото ${d.width}×${d.height}: ${detection.info}`)
  matte = null; excluded.clear(); rebuildRect(); schedule()
}

function currentPaper(): Paper {
  const guess = (window as unknown as { __guess: ReturnType<typeof guessPaper> }).__guess
  const pp = $<HTMLSelectElement>('ppaper').value, po = $<HTMLSelectElement>('porient').value
  const preset = pp === 'auto' ? guess?.preset ?? 'a4' : (pp as 'a4' | 'letter'), orient = (po === 'auto' ? guess?.orientation ?? 'portrait' : po) as PaperOrientation
  return paperSize(preset, orient)
}

function rebuildRect() {
  if (!photo || !detection) return
  const paper = currentPaper()
  rect = rectify(photo.gray, detection.corners, paper, photo.color.rgb)
  $('st-paper').textContent = `${detection.info}; лист ${paper.width}×${paper.height} мм`
  if (!rect) { log('углы листа не дают выпрямления'); return }
  const t = performance.now()
  classic = segFromClassic(rect, segment(rect, { margin: num('margin'), ...(($<HTMLInputElement>('sens').value) ? { sensitivity: num('sens') } : {}) }))
  log(`выпрямлено ${rect.image.width}×${rect.image.height} (${rect.scale} px/мм); классика: ${classic.sils.length} силуэтов за ${(performance.now() - t).toFixed(0)} мс`)
  matte = null
}
const segFromClassic = (r: Rectified, s: Segmentation): Seg => ({ labels: s.labels, sils: s.silhouettes.map((x) => ({ id: x.id, widthMm: x.widthMm, heightMm: x.heightMm, areaMm2: x.areaMm2, bbox: x.bbox })) })

/** Силуэты по мягкой маске модели: сглаживание, порог, поле у края, заливка пустот, мелочь долой, компоненты по порядку обхода сверху вниз. */
function aiSegmentation(r: Rectified, alpha: Float32Array): Seg {
  const w = r.image.width, h = r.image.height, s = r.scale, n = w * h
  const sg = num('smooth') * s, a = sg > 0 ? gaussianBlur(alpha, w, h, Math.max(MIN_SIGMA, sg), ones(n)) : alpha, thr = num('thr')
  let mask: Uint8Array = new Uint8Array(n); for (let i = 0; i < n; i++) mask[i] = a[i] >= thr ? 1 : 0
  const mp = Math.round(num('margin') * s)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (i < mp || j < mp || i >= w - mp || j >= h - mp) mask[j * w + i] = 0
  mask = removeSpecks(fillHoles(mask, w, h).mask, w, h, Math.round(2 * s * s))
  const cc = labelComponents(mask, w, h), bb: [number, number, number, number][] = Array.from({ length: cc.count + 1 }, () => [w, h, -1, -1])
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = cc.labels[j * w + i]; if (k) { const b = bb[k]; if (i < b[0]) b[0] = i; if (j < b[1]) b[1] = j; if (i > b[2]) b[2] = i; if (j > b[3]) b[3] = j } }
  const keep = new Int32Array(cc.count + 1), sils: Sil[] = []; let id = 0
  for (let k = 1; k <= cc.count; k++) {
    const b = bb[k], wm = (b[2] - b[0] + 1) / s, hm = (b[3] - b[1] + 1) / s, area = cc.sizes[k] / (s * s)
    if (area >= num('minarea') && wm >= 3 && hm >= 3) { keep[k] = ++id; sils.push({ id, widthMm: wm, heightMm: hm, areaMm2: area, bbox: b }) }
  }
  const labels = new Int32Array(n); for (let i = 0; i < n; i++) labels[i] = keep[cc.labels[i]]
  return { labels, sils }
}

// ---------- превью ----------
function show(id: string, w: number, h: number, px: (i: number) => [number, number, number]) {
  const cv = $<HTMLCanvasElement>(id); cv.width = w; cv.height = h
  const g = cv.getContext('2d')!, im = g.createImageData(w, h)
  for (let i = 0; i < w * h; i++) { const [r, gg, b] = px(i); im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255 }
  g.putImageData(im, 0, 0)
}
function previewPhoto() {
  if (!photo) return
  const cv = $<HTMLCanvasElement>('pv-photo'), s = Math.min(1, 480 / photo.w); cv.width = Math.round(photo.w * s); cv.height = Math.round(photo.h * s)
  const t = document.createElement('canvas'); t.width = photo.w; t.height = photo.h
  const im = t.getContext('2d')!.createImageData(photo.w, photo.h)
  for (let i = 0; i < photo.w * photo.h; i++) { im.data[i * 4] = photo.rgb[i * 3]; im.data[i * 4 + 1] = photo.rgb[i * 3 + 1]; im.data[i * 4 + 2] = photo.rgb[i * 3 + 2]; im.data[i * 4 + 3] = 255 }
  t.getContext('2d')!.putImageData(im, 0, 0)
  const g = cv.getContext('2d')!; g.drawImage(t, 0, 0, cv.width, cv.height)
  if (detection) { g.strokeStyle = '#ff3'; g.lineWidth = 2; g.beginPath(); detection.corners.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s))); g.closePath(); g.stroke() }
}

// ---------- контуры и поле ----------
interface Outline { id: number; loops: Pt[][] }
function outlineOf(seg: Seg, sil: Sil, r: Rectified): Outline {
  const w = r.image.width, h = r.image.height, PAD = 4
  const x0 = Math.max(0, sil.bbox[0] - PAD), y0 = Math.max(0, sil.bbox[1] - PAD), x1 = Math.min(w - 1, sil.bbox[2] + PAD), y1 = Math.min(h - 1, sil.bbox[3] + PAD), bw = x1 - x0 + 1, bh = y1 - y0 + 1
  const v = new Float32Array(bw * bh); for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) if (seg.labels[(y0 + j) * w + x0 + i] === sil.id) v[j * bw + i] = 255
  const f = gaussianBlur(v, bw, bh, 0.8, ones(bw * bh)), sigma = chk('vec') ? Math.max(0, num('osm') * r.scale) : 0
  const loops = vectorOutline(Uint8Array.from(f, (x) => Math.round(x)), bw, bh, sigma, num('cang')).map((l) => l.map(([x, y]) => [x + x0, y + y0] as Pt))
  return { id: sil.id, loops }
}

interface Field { key: string; nx: number; ny: number; cell: number; sd: Float32Array; cx: number; cy: number; binW: number; binH: number; scale: number }
let fieldCache: Field | null = null

function activeSeg(): Seg | null {
  if ($<HTMLSelectElement>('eng').value === 'ai' && rect && matte) return aiSegmentation(rect, matte)
  return classic
}
const otherSeg = (): Seg | null => ($<HTMLSelectElement>('eng').value === 'ai' ? classic : rect && matte ? aiSegmentation(rect, matte) : null)

let timer = 0
function schedule() { clearTimeout(timer); timer = window.setTimeout(update, 120) }
function update() {
  for (const id of ['thr', 'smooth']) { const e = $<HTMLInputElement>(id); (e.nextElementSibling as HTMLElement).textContent = e.value }
  $('aibox').hidden = $<HTMLSelectElement>('eng').value !== 'ai'; $('classicbox').hidden = !$('aibox').hidden
  previewPhoto()
  const seg = activeSeg(); if (!rect || !seg) return
  $('st-sil').textContent = `${seg.sils.length} силуэтов` + ($<HTMLSelectElement>('eng').value === 'ai' && !matte ? ' (маска не посчитана: запустите модель)' : '')
  // список силуэтов с галочками
  const list = $('sils'); list.innerHTML = ''
  for (const s of seg.sils) {
    const l = document.createElement('label'), c = document.createElement('input'); c.type = 'checkbox'; c.checked = !excluded.has(s.id)
    c.addEventListener('input', () => { c.checked ? excluded.delete(s.id) : excluded.add(s.id); schedule() })
    l.append(c, ` №${s.id}: ${s.widthMm.toFixed(1)} × ${s.heightMm.toFixed(1)} мм, ${s.areaMm2.toFixed(0)} мм²`); list.append(l, document.createElement('br'))
  }
  // превью силуэтов (+ контуры другого движка)
  const W = rect.image.width, H = rect.image.height, other = chk('cmp') ? otherSeg() : null
  show('pv-sil', W, H, (i) => {
    const l = seg.labels[i], ex = excluded.has(l), o = other ? other.labels[i] > 0 : false
    const gv = rect!.image.gray[i]
    if (!l) return o ? [gv * 0.7 + 60, gv * 0.5, gv * 0.5] : [gv, gv, gv]
    return ex ? [gv * 0.5, gv * 0.5, gv * 0.5] : [gv * 0.45, gv * 0.45 + 120, gv * 0.45 + 40]
  })
  compareTable(seg, other)
  build()
}
function compareTable(seg: Seg, other: Seg | null) {
  const el = $('cmptab'); if (!other || !rect) { el.innerHTML = ''; return }
  const n = seg.labels.length, rows = ['<tr><th>активный мм</th><th>другой мм</th><th>Δ шир</th><th>Δ выс</th><th>IoU</th></tr>']
  for (const a of seg.sils) {
    const ov = new Map<number, number>(); for (let i = 0; i < n; i++) if (seg.labels[i] === a.id) { const k = other.labels[i]; if (k) ov.set(k, (ov.get(k) ?? 0) + 1) }
    let best = 0, bo = 0; for (const [k, v] of ov) if (v > bo) { bo = v; best = k }
    const b = other.sils.find((x) => x.id === best); if (!b) { rows.push(`<tr><td>${a.widthMm.toFixed(1)}×${a.heightMm.toFixed(1)}</td><td colspan=4>не найден</td></tr>`); continue }
    let i2 = 0, u2 = 0; for (let i = 0; i < n; i++) { const x = seg.labels[i] === a.id, y = other.labels[i] === best; if (x && y) i2++; if (x || y) u2++ }
    rows.push(`<tr><td>${a.widthMm.toFixed(1)}×${a.heightMm.toFixed(1)}</td><td>${b.widthMm.toFixed(1)}×${b.heightMm.toFixed(1)}</td><td>${(b.widthMm - a.widthMm).toFixed(2)}</td><td>${(b.heightMm - a.heightMm).toFixed(2)}</td><td>${(i2 / u2).toFixed(3)}</td></tr>`)
  }
  el.innerHTML = '<table>' + rows.join('') + '</table>'
}

// ---------- 3D ----------
const view = $('view')
const renderer = new THREE.WebGLRenderer({ antialias: true }); view.append(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe8e8e4)
const camera = new THREE.PerspectiveCamera(35, 1, 1, 3000)
const controls = new OrbitControls(camera, renderer.domElement)
scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 0.55))
const sun = new THREE.DirectionalLight(0xffffff, 2.2); scene.add(sun)
const fillLight = new THREE.DirectionalLight(0xffffff, 0.5); fillLight.position.set(60, -80, 40); scene.add(fillLight)
const mat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.75, metalness: 0, side: THREE.DoubleSide })
const toolMat = new THREE.MeshStandardMaterial({ color: 0x1fb6c9, transparent: true, opacity: 0.4, roughness: 0.5 })
const group = new THREE.Group(); scene.add(group)
function setLight() { const a = (num('lightang') * Math.PI) / 180; sun.position.set(Math.cos(a) * 120, Math.sin(a) * 120, 100) }
function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
new ResizeObserver(resize).observe(view); resize(); setLight()
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera) })
let fitted = ''
function frame(size: number, preset: 'top' | 'iso') {
  const d = size * 1.7
  if (preset === 'top') { camera.up.set(0, 1, 0); camera.position.set(0, -0.001, d) } else { camera.up.set(0, 0, 1); camera.position.set(-d * 0.45, -d * 0.75, d * 0.7) }
  camera.lookAt(0, 0, 0); controls.target.set(0, 0, 0); controls.update()
}
$('vtop').addEventListener('click', () => frame(Math.max(binDims.w, binDims.h), 'top'))
$('viso').addEventListener('click', () => frame(Math.max(binDims.w, binDims.h), 'iso'))
const binDims = { w: 100, h: 100 }

function build() {
  const seg = activeSeg(); if (!rect || !seg) return
  const sels = seg.sils.filter((s) => !excluded.has(s.id))
  group.clear()
  if (!sels.length) { $('stat3d').textContent = 'нет выбранных силуэтов'; return }
  const sc = rect.scale, cell0 = Math.max(0.15, num('cell'))
  const outs = sels.map((s) => outlineOf(seg, s, rect!))
  $('st-out').textContent = `${outs.reduce((a, o) => a + o.loops.length, 0)} петель, ${outs.reduce((a, o) => a + o.loops.reduce((b, l) => b + l.length, 0), 0)} вершин`
  // габарит всех инструментов (мм листа) → корпус целыми юнитами
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const o of outs) for (const l of o.loops) for (const [x, y] of l) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  const cx = (x0 + x1) / 2 / sc, cy = (y0 + y1) / 2 / sc, ex = (x1 - x0) / sc, ey = (y1 - y0) / sc, pitch = num('pitch'), m = num('bmargin') + num('clear')
  const ux = Math.max(1, Math.ceil((ex + 2 * m) / pitch - 1e-9)), uy = Math.max(1, Math.ceil((ey + 2 * m) / pitch - 1e-9)), binW = ux * pitch, binH = uy * pitch
  binDims.w = binW; binDims.h = binH
  $('st-bin').textContent = `инструменты ${ex.toFixed(0)}×${ey.toFixed(0)} мм → корпус ${ux}×${uy} юнитов (${binW}×${binH} мм)`
  const nx = Math.round(binW / cell0) + 1, ny = Math.round(binH / cell0) + 1, cx3 = binW / (nx - 1), cy3 = binH / (ny - 1)
  const key = [sels.map((s) => s.id).join(','), $<HTMLSelectElement>('eng').value, chk('vec'), num('osm'), num('cang'), nx, ny, binW, binH, num('margin'), num('thr'), num('smooth'), num('minarea'), matte ? 1 : 0].join('|')
  if (!fieldCache || fieldCache.key !== key) fieldCache = computeField(key, seg, sels, outs, nx, ny, cx, cy, binW, binH, sc, rect)
  const F = fieldCache
  const zTop = num('blockh'), zFloor = Math.max(1, zTop - num('depth')), clear = num('clear') * sc
  // F' по знаковому расстоянию (px) со сдвигом на зазор; в ячейке-мосту: линейно по расстоянию → точный контур кармана
  const Fv = new Float32Array(nx * ny), isIn = new Uint8Array(nx * ny)
  for (let k = 0; k < nx * ny; k++) { const d = F.sd[k] + clear; Fv[k] = Math.min(1, Math.max(0, 0.5 + d / (2 * cell0 * sc))); isIn[k] = d >= 0 ? 1 : 0 }
  const NXp = (i: number) => -binW / 2 + i * cx3, NYp = (j: number) => binH / 2 - j * cy3
  const tri: number[] = [], wall: number[] = []
  const emit = (poly: [number, number][], z: number) => {
    let area = 0; for (let t = 0; t < poly.length; t++) { const a = poly[t], b = poly[(t + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1] }
    const p = area < 0 ? [...poly].reverse() : poly
    for (let t = 1; t + 1 < p.length; t++) tri.push(p[0][0], p[0][1], z, p[t][0], p[t][1], z, p[t + 1][0], p[t + 1][1], z)
  }
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const k0 = j * nx + i, ks = [k0, k0 + 1, k0 + nx + 1, k0 + nx], P = ks.map((k) => [NXp(k % nx), NYp(Math.floor(k / nx))] as [number, number])
    const flags = ks.map((k) => isIn[k] === 1), n = flags.filter(Boolean).length
    if (n === 0) { emit(P, zTop); continue }
    if (n === 4) { emit(P, zFloor); continue }
    const outP: [number, number][] = [], inP: [number, number][] = [], segEnds: [number, number][] = []
    for (let e = 0; e < 4; e++) {
      const a = e, b = (e + 1) % 4
      if (flags[a]) inP.push(P[a]); else outP.push(P[a])
      if (flags[a] !== flags[b]) {
        const ia = flags[a] ? a : b, oa = flags[a] ? b : a, t = (Fv[ks[ia]] - 0.5) / Math.max(1e-6, Fv[ks[ia]] - Fv[ks[oa]])
        const c: [number, number] = [P[ia][0] + (P[oa][0] - P[ia][0]) * t, P[ia][1] + (P[oa][1] - P[ia][1]) * t]
        inP.push(c); outP.push(c); segEnds.push(c)
      }
    }
    emit(outP, zTop); emit(inP, zFloor)
    if (segEnds.length >= 2) { const [a, b] = segEnds; wall.push(a[0], a[1], zFloor, b[0], b[1], zFloor, a[0], a[1], zTop, b[0], b[1], zFloor, b[0], b[1], zTop, a[0], a[1], zTop) }
  }
  // боковые стенки корпуса и дно
  const hx = binW / 2, hy = binH / 2
  const sideQuad = (a: [number, number], b: [number, number]) => wall.push(a[0], a[1], 0, b[0], b[1], 0, a[0], a[1], zTop, b[0], b[1], 0, b[0], b[1], zTop, a[0], a[1], zTop)
  sideQuad([-hx, -hy], [hx, -hy]); sideQuad([hx, -hy], [hx, hy]); sideQuad([hx, hy], [-hx, hy]); sideQuad([-hx, hy], [-hx, -hy])
  tri.push(-hx, -hy, 0, -hx, hy, 0, hx, -hy, 0, hx, -hy, 0, -hx, hy, 0, hx, hy, 0)
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...tri, ...wall]), 3)); geo.computeVertexNormals()
  mat.wireframe = chk('wire'); group.add(new THREE.Mesh(geo, mat))
  if (chk('tools')) for (const o of outs) { // инструменты: настоящий контур без зазора, стоят на дне кармана
    const sh = new THREE.Shape(); const loop = o.loops.reduce((best, l) => (l.length > best.length ? l : best), o.loops[0])
    loop.forEach(([x, y], t) => { const X = x / sc - cx, Y = -(y / sc - cy); t ? sh.lineTo(X, Y) : sh.moveTo(X, Y) })
    const g2 = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.5, num('depth') - 0.6), bevelEnabled: false }); g2.translate(0, 0, zFloor + 0.05)
    group.add(new THREE.Mesh(g2, toolMat))
  }
  $('stat3d').textContent = `сетка ${nx}×${ny}, шаг ${cx3.toFixed(2)} мм, ${((tri.length + wall.length) / 9 / 1000).toFixed(0)} тыс. треуг.; карман ${(zTop - zFloor).toFixed(0)} мм, зазор ${num('clear')} мм`
  const sig = `${binW}|${binH}`; if (sig !== fitted) { fitted = sig; frame(Math.max(binW, binH), 'iso') }
}

/** Знаковое расстояние (px листа, + внутри) в узлах сетки корпуса: точно у края (до контура), приближённо дальше (EDT). */
function computeField(key: string, seg: Seg, sels: Sil[], outs: Outline[], nx: number, ny: number, cx: number, cy: number, binW: number, binH: number, sc: number, r: Rectified): Field {
  const W = r.image.width, H = r.image.height, M = new Uint8Array(W * H), ids = new Set(sels.map((s) => s.id))
  for (let i = 0; i < M.length; i++) if (ids.has(seg.labels[i])) M[i] = 1
  const inv = M.map((v) => 1 - v) as Uint8Array
  const dIn = edt(M, W, H), dOut = edt(inv, W, H)
  const loops = outs.flatMap((o) => o.loops), sd = new Float32Array(nx * ny), cell = binW / (nx - 1), band = (num('clear') + 3 * cell) * sc + 2
  let exact = 0
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const X = (cx - binW / 2 + (i * binW) / (nx - 1)) * sc, Y = (cy - binH / 2 + (j * binH) / (ny - 1)) * sc // координаты листа (px), Y вниз
    const xi = Math.min(W - 1, Math.max(0, Math.round(X))), yi = Math.min(H - 1, Math.max(0, Math.round(Y))), p = yi * W + xi
    const inside = M[p] === 1, d = inside ? dIn[p] : dOut[p]
    if (d <= band) { sd[j * nx + i] = signedDistance(loops, X, Y); exact++ } else sd[j * nx + i] = inside ? d : -d
  }
  log(`поле: ${nx}×${ny} узлов, точное расстояние в ${exact} узлах у края`)
  return { key, nx, ny, cell, sd, cx, cy, binW, binH, scale: sc }
}

// ---------- запуск модели и события ----------
$('runai').addEventListener('click', async () => {
  if (!rect) return
  const c = CANDIDATES.find((x) => x.id === $<HTMLSelectElement>('modelsel').value)!, ep = $<HTMLSelectElement>('ep').value, btn = $<HTMLButtonElement>('runai'); btn.disabled = true
  try {
    log(`силуэты: ${c.id}, ${ep}, лицензия ${c.license}`)
    const r = await infer(c, ep, 1, rect.rgb!, rect.image.width, rect.image.height, log)
    log(`готово за ${r.ms.toFixed(0)} мс`); matte = r.plane; $<HTMLSelectElement>('eng').value = 'ai'; fieldCache = null; schedule()
  } catch (e) { log('ОШИБКА: ' + ((e as Error)?.message ?? e)) } finally { btn.disabled = false }
})
$('sample').addEventListener('change', () => { $<HTMLInputElement>('file').value = ''; loadPhoto() })
$('file').addEventListener('change', () => loadPhoto())
for (const id of ['ppaper', 'porient']) $(id).addEventListener('change', () => { rebuildRect(); fieldCache = null; schedule() })
for (const id of ['margin', 'sens']) $(id).addEventListener('change', () => { rebuildRect(); fieldCache = null; schedule() })
for (const el of document.querySelectorAll('input[type=range], input[type=number], input[type=checkbox], select')) {
  if (['file', 'sample', 'ppaper', 'porient', 'margin', 'sens', 'modelsel', 'ep'].includes(el.id) || el.closest('#sils')) continue
  el.addEventListener('input', () => { if (el.id === 'lightang') setLight(); schedule() })
}
loadPhoto()
