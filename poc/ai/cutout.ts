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

/** Шероховатость контура, мм: среднее отклонение вершин от того же контура, сглаженного гауссом σ = 1.5 мм (чем меньше, тем плавнее линия). */
function roughness(loops: Pt[][], scale: number): number {
  let sum = 0, cnt = 0
  for (const l of loops) {
    if (l.length < 12) continue
    const step = 0.7, n = l.length, sg = (1.5 * scale) / step, r = Math.ceil(3 * sg), k: number[] = []; let ks = 0
    for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sg * sg)); k.push(v); ks += v }
    for (let i = 0; i < n; i++) { let x = 0, y = 0; for (let d = -r; d <= r; d++) { const q = l[(((i + d) % n) + n) % n]; x += k[d + r] * q[0]; y += k[d + r] * q[1] } ; sum += Math.hypot(l[i][0] - x / ks, l[i][1] - y / ks); cnt++ }
  }
  return cnt ? sum / cnt / scale : 0
}

interface Field { key: string; nx: number; ny: number; cell: number; sd: Float32Array; cx: number; cy: number; binW: number; binH: number; scale: number }
/** Смещение замкнутого контура (против часовой стрелки) наружу на d мм по нормалям вершин с митрой (масштаб ≤ 2). */
function offsetLoop(p: [number, number][], d: number): [number, number][] {
  if (d <= 0) return p
  const n = p.length
  return p.map((b, i) => {
    const a = p[(i - 1 + n) % n], c = p[(i + 1) % n]
    const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]], l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1
    const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2], mx = n1[0] + n2[0], my = n1[1] + n2[1], ml = Math.hypot(mx, my) || 1
    const cos = (n1[0] * mx + n1[1] * my) / ml, k = d / Math.max(0.5, cos)
    return [b[0] + (mx / ml) * k, b[1] + (my / ml) * k] as [number, number]
  })
}


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
  $('st-out').textContent = `${outs.reduce((a, o) => a + o.loops.length, 0)} петель, ${outs.reduce((a, o) => a + o.loops.reduce((b, l) => b + l.length, 0), 0)} вершин; шероховатость ${(roughness(outs.flatMap((o) => o.loops), sc) * 1000).toFixed(0)} мкм`
  // габарит всех инструментов (мм листа) → корпус целыми юнитами
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const o of outs) for (const l of o.loops) for (const [x, y] of l) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  const cx = (x0 + x1) / 2 / sc, cy = (y0 + y1) / 2 / sc, ex = (x1 - x0) / sc, ey = (y1 - y0) / sc, pitch = num('pitch'), m = num('bmargin') + num('clear')
  const ux = Math.max(1, Math.ceil((ex + 2 * m) / pitch - 1e-9)), uy = Math.max(1, Math.ceil((ey + 2 * m) / pitch - 1e-9)), binW = ux * pitch, binH = uy * pitch
  binDims.w = binW; binDims.h = binH
  $('st-bin').textContent = `инструменты ${ex.toFixed(0)}×${ey.toFixed(0)} мм → корпус ${ux}×${uy} юнитов (${binW}×${binH} мм)`
  // Карманы строятся прямо по контуру (как в приложении: контур → смещение на зазор → выдавливание), а не по узлам сетки:
  // стенки — вертикальные ленты вдоль полигона с гладкими нормалями, верх — прямоугольник с отверстиями-карманами, дно кармана — сам контур.
  const zTop = num('blockh'), zFloor = Math.max(1, zTop - num('depth')), clearMm = num('clear')
  const toMm = (l: Pt[]): [number, number][] => l.map(([x, y]) => [x / sc - cx, -(y / sc - cy)])
  const area = (l: [number, number][]) => l.reduce((a, [x, y], i) => { const [x2, y2] = l[(i + 1) % l.length]; return a + (x * y2 - x2 * y) / 2 }, 0)
  const pockets = outs.map((o) => {
    const outer = o.loops.reduce((best, l) => (Math.abs(area(toMm(l))) > Math.abs(area(toMm(best))) ? l : best), o.loops[0])
    let poly = toMm(outer); if (area(poly) < 0) poly = poly.reverse() // против часовой стрелки: наружу — вправо от хода
    return offsetLoop(poly, clearMm)
  })
  const hx = binW / 2, hy = binH / 2, pos: number[] = [], nor: number[] = []
  const tri = (a: number[], b: number[], c: number[], n: number[]) => { pos.push(...a, ...b, ...c); for (let t = 0; t < 3; t++) nor.push(...n) }
  const flat = (poly: [number, number][], holes: [number, number][][], z: number, up: boolean) => {
    const pts = [...poly, ...holes.flat()], faces = THREE.ShapeUtils.triangulateShape(poly.map((p) => new THREE.Vector2(p[0], p[1])), holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1]))))
    for (const [i, j, k] of faces) {
      const A = pts[i], B = pts[j], C = pts[k], sa = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]), flip = (sa < 0) === up
      const P = (q: [number, number]) => [q[0], q[1], z]
      flip ? tri(P(A), P(C), P(B), [0, 0, up ? 1 : -1]) : tri(P(A), P(B), P(C), [0, 0, up ? 1 : -1])
    }
  }
  flat([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]], pockets, zTop, true) // верх с отверстиями
  for (const pk of pockets) flat(pk, [], zFloor, true) // дно карманов
  flat([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]], [], 0, false) // дно корпуса
  const quad = (a: number[], b: number[], c: number[], d: number[], na: number[], nb: number[]) => { // a,b снизу; c,d сверху (c над b, d над a)
    pos.push(...a, ...b, ...d, ...b, ...c, ...d); nor.push(...na, ...nb, ...na, ...nb, ...nb, ...na)
  }
  for (const pk of pockets) { // стенки кармана: нормали в сторону кармана, сглаженные по вершинам
    // нормаль вершины — среднее нормалей рёбер в окне ±nw мм вдоль контура: шум в десятки мкм не даёт полос на стенке
    const n = pk.length, perim = pk.reduce((a, q, i) => a + Math.hypot(pk[(i + 1) % n][0] - q[0], pk[(i + 1) % n][1] - q[1]), 0), k = Math.max(1, Math.round((num('nwin') / perim) * n))
    const en = pk.map((q, i) => { const r = pk[(i + 1) % n], dx = r[0] - q[0], dy = r[1] - q[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l] }) // наружу кармана (контур против часовой)
    const vn = pk.map((_, i) => { let x = 0, y = 0; for (let d = -k; d <= k; d++) { const e = en[(((i + d) % n) + n) % n], w = 1 - Math.abs(d) / (k + 1); x += w * e[0]; y += w * e[1] } const l = Math.hypot(x, y) || 1; return [-x / l, -y / l, 0] })
    for (let i = 0; i < n; i++) { const a = pk[i], b = pk[(i + 1) % n]; quad([a[0], a[1], zFloor], [b[0], b[1], zFloor], [b[0], b[1], zTop], [a[0], a[1], zTop], vn[i], vn[(i + 1) % n]) }
  }
  const sideN = [[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]], corners: [number, number][] = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]
  for (let i = 0; i < 4; i++) { const a = corners[i], b = corners[(i + 1) % 4]; quad([b[0], b[1], 0], [a[0], a[1], 0], [a[0], a[1], zTop], [b[0], b[1], zTop], sideN[i], sideN[i]) }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3))
  mat.wireframe = chk('wire'); group.add(new THREE.Mesh(geo, mat))
  if (chk('tools')) for (const o of outs) { // инструменты: настоящий контур без зазора, стоят на дне кармана
    const sh = new THREE.Shape(); const loop = o.loops.reduce((best, l) => (l.length > best.length ? l : best), o.loops[0])
    loop.forEach(([x, y], t) => { const X = x / sc - cx, Y = -(y / sc - cy); t ? sh.lineTo(X, Y) : sh.moveTo(X, Y) })
    const g2 = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.5, num('depth') - 0.6), bevelEnabled: false }); g2.translate(0, 0, zFloor + 0.05)
    group.add(new THREE.Mesh(g2, toolMat))
  }
  $('stat3d').textContent = `${pockets.length} кармана, ${pockets.reduce((a, p) => a + p.length, 0)} вершин контура, ${(pos.length / 9 / 1000).toFixed(0)} тыс. треуг.; глубина ${(zTop - zFloor).toFixed(0)} мм, зазор ${clearMm} мм`
  const sig = `${binW}|${binH}`; if (sig !== fitted) { fitted = sig; frame(Math.max(binW, binH), 'iso') }
}

// ---------- запуск модели и события ----------
/** Второй проход: каждый найденный объект (рамка + поле) прогоняется моделью отдельно, поэтому на объект приходятся все 512 px сети (≈0.3 мм вместо ≈0.6 мм на весь лист). */
async function refine(c: (typeof CANDIDATES)[number], ep: string, base: Float32Array, r: Rectified): Promise<Float32Array> {
  const seg0 = aiSegmentation(r, base), W = r.image.width, H = r.image.height, out = Float32Array.from(base), pad = Math.round(12 * r.scale)
  for (const s of seg0.sils) {
    const x0 = Math.max(0, s.bbox[0] - pad), y0 = Math.max(0, s.bbox[1] - pad), x1 = Math.min(W - 1, s.bbox[2] + pad), y1 = Math.min(H - 1, s.bbox[3] + pad), cw = x1 - x0 + 1, ch = y1 - y0 + 1
    const crop = new Uint8Array(cw * ch * 3); for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const q = ((y0 + j) * W + x0 + i) * 3; crop.set(r.rgb!.subarray(q, q + 3), (j * cw + i) * 3) }
    const res = await infer(c, ep, 1, crop, cw, ch, () => {})
    log(`  уточнение объекта №${s.id}: ${cw}×${ch} px, ${res.ms.toFixed(0)} мс`)
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { // внутри рамки без самого края (край рамки остаётся от общего прохода)
      const edge = Math.min(i, j, cw - 1 - i, ch - 1 - j), w2 = Math.min(1, edge / (pad * 0.5)) // плавный переход к общему проходу на краю рамки
      out[(y0 + j) * W + x0 + i] = base[(y0 + j) * W + x0 + i] * (1 - w2) + res.plane[j * cw + i] * w2
    }
  }
  return out
}

$('runai').addEventListener('click', async () => {
  if (!rect) return
  const c = CANDIDATES.find((x) => x.id === $<HTMLSelectElement>('modelsel').value)!, ep = $<HTMLSelectElement>('ep').value, btn = $<HTMLButtonElement>('runai'); btn.disabled = true
  try {
    log(`силуэты: ${c.id}, ${ep}, лицензия ${c.license}`)
    const r = await infer(c, ep, 1, rect.rgb!, rect.image.width, rect.image.height, log)
    log(`общий проход за ${r.ms.toFixed(0)} мс`); matte = r.plane
    if (chk('refine')) { const t = performance.now(); matte = await refine(c, ep, matte, rect); log(`второй проход по объектам за ${((performance.now() - t) / 1000).toFixed(1)} с`) }
    $<HTMLSelectElement>('eng').value = 'ai'; schedule()
  } catch (e) { log('ОШИБКА: ' + ((e as Error)?.message ?? e)) } finally { btn.disabled = false }
})
$('sample').addEventListener('change', () => { $<HTMLInputElement>('file').value = ''; loadPhoto() })
$('file').addEventListener('change', () => loadPhoto())
for (const id of ['ppaper', 'porient']) $(id).addEventListener('change', () => { rebuildRect(); schedule() })
for (const id of ['margin', 'sens']) $(id).addEventListener('change', () => { rebuildRect(); schedule() })
for (const el of document.querySelectorAll('input[type=range], input[type=number], input[type=checkbox], select')) {
  if (['file', 'sample', 'ppaper', 'porient', 'margin', 'sens', 'modelsel', 'ep'].includes(el.id) || el.closest('#sils')) continue
  el.addEventListener('input', () => { if (el.id === 'lightang') setLight(); schedule() })
}
loadPhoto()
