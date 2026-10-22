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
import { findHoles, fillHoles, labelComponents, removeSpecks } from '../../src/geometry/raster/components'
import { backendsOf, CANDIDATES, type Candidate } from './models'
import { infer } from './engine'
import { findCorners, fitLoop, signedDistance, tessellate, vectorOutline, type Pt } from './outline'

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
  const key = [num('res'), x0, y0, pw, ph, matte ? 1 : 0, depthRec ? depthRec.crop.x + ',' + depthRec.crop.y + ',' + depthRec.crop.w + ',' + depthRec.crop.h : 0].join('|')
  if (work && work.key === key) return work
  const k = Math.min(1, num('res') / Math.max(pw, ph)), ww = Math.max(8, Math.round(pw * k)), wh = Math.max(8, Math.round(ph * k))
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

/** Гауссово сглаживание только внутри маски (нормированная свёртка): значения снаружи не просачиваются внутрь. */
function blurIn(a: Float32Array, w: number, h: number, sigmaPx: number, mask: Uint8Array): Float32Array {
  return sigmaPx < 0.4 ? a : gaussianBlur(a, w, h, Math.max(MIN_SIGMA, sigmaPx), mask)
}
/** Предел наклона: нижняя и верхняя огибающие конусом (две хамфер-проходки), результат — среднее. Отвесные ступени становятся склонами. */
function limitSlope(v: Float32Array, w: number, h: number, L: number, mask: Uint8Array): Float32Array {
  if (L <= 0) return v
  const lo = Float32Array.from(v), hi = Float32Array.from(v), D = L * Math.SQRT2
  const pass = (fwd: boolean) => {
    const y0 = fwd ? 0 : h - 1, y1 = fwd ? h : -1, dy = fwd ? 1 : -1, x0 = fwd ? 0 : w - 1, x1 = fwd ? w : -1, dx = fwd ? 1 : -1
    for (let y = y0; y !== y1; y += dy) for (let x = x0; x !== x1; x += dx) {
      const i = y * w + x; if (!mask[i]) continue
      for (const [ox, oy, d] of [[-dx, 0, L], [0, -dy, L], [-dx, -dy, D], [dx, -dy, D]] as const) {
        const xx = x + ox, yy = y + oy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        const j = yy * w + xx; if (!mask[j]) continue
        if (lo[j] + d < lo[i]) lo[i] = lo[j] + d
        if (hi[j] - d > hi[i]) hi[i] = hi[j] - d
      }
    }
  }
  pass(true); pass(false)
  return v.map((_, i) => 0.5 * (lo[i] + hi[i]))
}

/** Среднее по окну (2r+1)² с зажимом у краёв, бегущими суммами. */
function box(a: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float64Array(w * h), out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    let acc = 0; const row = y * w
    for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) { tmp[row + x] = acc; acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)] }
  }
  const n = (2 * r + 1) * (2 * r + 1)
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) { out[y * w + x] = acc / n; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x] }
  }
  return out
}
/** Направляющий фильтр (He): сглаживает p, но края берёт из guide (яркость фото). Убирает зернистость глубины, не размывая контуры черт. */
function guided(guide: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  if (r < 1) return p
  const mI = box(guide, w, h, r), mp = box(p, w, h, r)
  const II = box(guide.map((v) => v * v), w, h, r), Ip = box(guide.map((v, i) => v * p[i]), w, h, r)
  const a = new Float32Array(w * h), b = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) { const v = II[i] - mI[i] * mI[i], c = Ip[i] - mI[i] * mp[i]; a[i] = c / (v + eps); b[i] = mp[i] - a[i] * mI[i] }
  const ma = box(a, w, h, r), mb = box(b, w, h, r)
  return guide.map((v, i) => ma[i] * v + mb[i])
}

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
  if (src === 'brightness') { const b = blurIn(Float32Array.from(mask), w.ww, w.wh, 0.6, ones(n)); mask = b.map((v) => (v >= 0.5 ? 1 : 0)) as unknown as Uint8Array } // ровный край без пиксельной лесенки
  if (src !== 'frame') {
    if (chk('fill')) { // мелкие области (между штрихами) заливаются, крупные (отверстие кольца) остаются открытыми
      const open = findHoles(mask, w.ww, w.wh).holes.filter((x) => x.size / (pxMm * pxMm) >= num('openmm2')).map((x) => x.id)
      mask = fillHoles(mask, w.ww, w.wh, open).mask
      note += (note ? ', ' : '') + `открытых областей: ${open.length}`
    }
    mask = removeSpecks(mask, w.ww, w.wh, Math.round(2 * pxMm * pxMm))
  }
  return { mask, note }
}

function normDepth(w: Work, mask: Uint8Array, pxMm: number): Float32Array | null {
  if (!w.depth) return null
  const src = guided(w.gray, w.depth, w.ww, w.wh, Math.round(num('dgr') * pxMm), 1e-3) // привязка к краям фото до нормировки
  const v: number[] = []; for (let i = 0; i < mask.length; i++) if (mask[i]) v.push(src[i])
  if (!v.length) return null
  v.sort((a, b) => a - b); const lo = v[Math.floor(v.length * 0.02)], hi = v[Math.floor(v.length * 0.98)], inv = chk('dinv')
  return src.map((d) => { const t = Math.min(1, Math.max(0, (d - lo) / (hi - lo || 1))); return inv ? 1 - t : t })
}

function detail(w: Work, pxMm: number): Float32Array {
  const amount = num('lca'), n = w.ww * w.wh
  if (amount <= 0) return new Float32Array(n).fill(0.5)
  const sg = Math.max(MIN_SIGMA, num('lcr') * pxMm), m = ones(n)
  const src = num('tpre') > 0 ? gaussianBlur(w.gray, w.ww, w.wh, Math.max(MIN_SIGMA, num('tpre') * pxMm), m) : w.gray // шум и зерно JPEG убираются до усиления
  const mean = gaussianBlur(src, w.ww, w.wh, sg, m), dev = src.map((v, i) => v - mean[i])
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
/** Подложка-шашка (как «прозрачность» в графических редакторах) для всего, что вне силуэта: клетка 8 px. */
const checker = (i: number, w: number): [number, number, number] => { const x = (i % w) >> 3, y = Math.floor(i / w) >> 3; return (x + y) & 1 ? [214, 214, 214] : [170, 170, 170] }
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
  const silMask = sil.mask // силуэт всегда показывается в превью этапа 2, даже когда слой «маска» выключен для 3D
  const mask = chk('lm') ? silMask : ones(n) // слой «маска»: выключен — рельеф без вырезания по силуэту
  $('st-sil').textContent = note
  show('pv-mask', w.ww, w.wh, (i) => (silMask[i] ? [w.rgb[i * 3], w.rgb[i * 3 + 1], w.rgb[i * 3 + 2]] : checker(i, w.ww)))
  let dn = normDepth(w, mask, pxMm)
  if (dn) { const g = num('dgam'); if (g !== 1) dn = dn.map((v) => Math.pow(v, g)); dn = blurIn(dn, w.ww, w.wh, num('dsm') * pxMm, mask) }
  const same = depthRec && JSON.stringify(depthRec.crop) === JSON.stringify(c)
  $('st-depth').textContent = depthRec ? (same ? 'посчитана для этого кропа' : 'посчитана для другого кропа (можно пересчитать)') : 'не посчитана'
  show('pv-depth', w.ww, w.wh, (i) => (mask[i] ? (dn ? gr(dn[i]) : [90, 90, 90]) : checker(i, w.ww)))
  const tone = blurIn(detail(w, pxMm), w.ww, w.wh, num('tsm') * pxMm, mask)
  // режим деталей: бугры (тон → высота), гравировка (только тёмные черты продавливаются канавками) или оба
  const dmode = $<HTMLSelectElement>('dmode').value, dth = Math.min(0.95, num('dth'))
  const dt = tone.map((t) => {
    const groove = smooth01((Math.max(0, 0.5 - t) * 2 - dth) / (1 - dth)) // 0 везде, кроме самых тёмных мест
    return dmode === 'bumps' ? t : dmode === 'engrave' ? 1 - groove : 0.5 * t + 0.5 * (1 - groove)
  })
  show('pv-detail', w.ww, w.wh, (i) => (mask[i] ? gr(dt[i]) : checker(i, w.ww)))
  // смесь
  const dist = edt(mask, w.ww, w.wh), bevelPx = Math.max(1, num('bevel') * pxMm), roll = num('roll') / 100
  const wc = chk('lc') ? num('wc') : 0, wd = dn && chk('ld') ? num('wd') : 0, wt = chk('lt') ? num('wt') : 0
  const solo = (document.querySelector('input[name=solo]:checked') as HTMLInputElement).value
  const value = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue
    const contour = smooth01(dist[i] / bevelPx), tot = wc + wd + wt, mixed = solo === 'contour' ? contour : solo === 'depth' ? (dn ? dn[i] : 0) : solo === 'detail' ? dt[i] : tot === 0 ? contour : (wc * contour + wd * (dn ? dn[i] : 0) + wt * dt[i]) / tot
    value[i] = mixed * ((1 - roll) + roll * contour)
  }
  let final = blurIn(value, w.ww, w.wh, num('fsm') * pxMm, mask)
  { const rng = Math.max(0.01, num('range')); final = limitSlope(final, w.ww, w.wh, num('slope') / pxMm / rng, mask) } // наклон: мм высоты на мм детали → доли диапазона на пиксель
  value.set(final)
  show('pv-mix', w.ww, w.wh, (i) => (mask[i] ? gr(value[i]) : checker(i, w.ww)))
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

const log2 = document.createElement('span'); log2.className = 'note'; $('stat3d').after(log2)
function build3D(w: Work, mask: Uint8Array, value: Float32Array, partW: number, partH: number) {
  const nodes = Math.max(60, num('nodes')), s = Math.max(1, Math.ceil(Math.max(w.ww, w.wh) / nodes))
  const nx = Math.floor((w.ww - 1) / s) + 1, ny = Math.floor((w.wh - 1) / s) + 1
  const floor = num('floor'), range = num('range'), mmx = partW / w.ww, mmy = partH / w.wh
  // мягкая маска: размытие в мм (в вырезах σ = 1 px при 4 px/мм ≈ 0.25 мм); по изолинии 0.5 край кладётся с субпиксельной точностью
  const soft = gaussianBlur(Float32Array.from(mask), w.ww, w.wh, Math.max(1, num('osm') * (w.ww / partW)), ones(w.ww * w.wh)) // как в вырезах: σ ≈ 0.25 мм
  const px = (i: number) => Math.min(w.ww - 0.5, i * s + 0.5), py = (j: number) => Math.min(w.wh - 0.5, j * s + 0.5)
  const F = new Float32Array(nx * ny), isIn = new Uint8Array(nx * ny), Z = new Float32Array(nx * ny)
  // векторный контур: изолиния, сглаживание вдоль кривой, острые углы сохраняются; поле F у края заменяется знаковым расстоянием до кривой
  let loops: ReturnType<typeof vectorOutline> | null = null
  let wallS: { x: number; y: number; nx: number; ny: number }[] = [] // выборка кривых (мм детали) с нормалями наружу: для гладких стенок
  if (chk('vec')) {
    const f1 = gaussianBlur(Float32Array.from(mask), w.ww, w.wh, 0.8, ones(w.ww * w.wh)), pxMmL = w.ww / partW
    loops = vectorOutline(Uint8Array.from(f1, (v) => Math.round(v * 255)), w.ww, w.wh, Math.max(0.5, num('osm') * pxMmL), num('cang'))
    log2.textContent = `контур: ${loops.length} петель, ${loops.reduce((a, l) => a + l.length, 0)} вершин`
    if (chk('fit')) { // подгонка кубических Безье (как в вырезах): минимум точек, аналитические нормали стенки
      const tolPx = num('ftol') * pxMmL, stepPx = Math.max(1, num('fstep') * pxMmL); let segs = 0, ctrl = 0, verts = 0
      const fitted: Pt[][] = []; wallS = []
      for (const l of loops) {
        if (l.length < 12) { fitted.push(l); continue }
        const { segs: sg } = fitLoop(l, findCorners(l, 3, num('cang')), tolPx), sm = tessellate(sg, stepPx)
        // направление нормали: наружу — туда, где маска пуста
        let inside = 0; for (const q of sm) { const x = q.p[0] + q.n[0] * 1.5, y = q.p[1] + q.n[1] * 1.5; if (bil(soft, w.ww, w.wh, x, y) > 0.5) inside++ }
        const flip = inside > sm.length / 2 ? -1 : 1
        fitted.push(sm.map((q) => q.p as Pt)); for (const q of sm) wallS.push({ x: q.p[0] * mmx - partW / 2, y: partH / 2 - q.p[1] * mmy, nx: q.n[0] * flip, ny: -q.n[1] * flip })
        segs += sg.length; ctrl += 3 * sg.length + 1; verts += sm.length
      }
      loops = fitted; log2.textContent = `контур: кривых Безье ${segs} (контрольных точек ${ctrl}), вершин в модели ${verts}, допуск ${num('ftol')} мм, шаг ${num('fstep')} мм`
    }
  } else log2.textContent = ''
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; F[k] = bil(soft, w.ww, w.wh, px(i), py(j))
    if (loops && F[k] > 0.003 && F[k] < 0.997) F[k] = Math.min(1, Math.max(0, 0.5 + signedDistance(loops, px(i), py(j)) / (2 * s))) // у края: расстояние до кривой в долях ячейки
    isIn[k] = F[k] >= 0.5 ? 1 : 0
    Z[k] = floor + range * bil(value, w.ww, w.wh, px(i), py(j))
  }
  const NX = new Float32Array(nx * ny), NY = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; NX[k] = px(i) * mmx - partW / 2; NY[k] = partH / 2 - py(j) * mmy }
  // Край: marching squares. Ячейка режется по линии F = 0.5: вершины контура лежат на изолинии мягкой маски, а не на узлах сетки.
  const vx: number[] = [], vy: number[] = [], vz: number[] = [], vmap = new Map<number, number>()
  const corner = (k: number) => { let id = vmap.get(k); if (id === undefined) { id = vx.length; vmap.set(k, id); vx.push(NX[k]); vy.push(NY[k]); vz.push(Z[k]) } return id }
  const cross = (a: number, b: number) => { // a внутри, b снаружи (или наоборот): точка F = 0.5 на ребре, высота — как у внутреннего узла
    const key = -1 - (Math.min(a, b) * nx * ny + Math.max(a, b)); let id = vmap.get(key)
    if (id === undefined) {
      const ia = isIn[a] === 1, inn = ia ? a : b, out = ia ? b : a, t = (F[inn] - 0.5) / Math.max(1e-6, F[inn] - F[out])
      id = vx.length; vmap.set(key, id); vx.push(NX[inn] + (NX[out] - NX[inn]) * t); vy.push(NY[inn] + (NY[out] - NY[inn]) * t); vz.push(Z[inn])
    }
    return id
  }
  const idx: number[] = [], segs: [number, number][] = [], flat: [number, number, number][] = [] // flat — ячейки для дна
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const k0 = j * nx + i, ks = [k0, k0 + 1, k0 + nx + 1, k0 + nx] // по кругу
    const n = ks.filter((k) => isIn[k]).length; if (!n) continue
    const poly: number[] = [], crossIdx: boolean[] = []
    for (let e = 0; e < 4; e++) {
      const a = ks[e], b = ks[(e + 1) % 4]
      if (isIn[a]) { poly.push(corner(a)); crossIdx.push(false) }
      if (isIn[a] !== isIn[b]) { poly.push(cross(a, b)); crossIdx.push(true) }
    }
    for (let t = 1; t + 1 < poly.length; t++) idx.push(poly[0], poly[t], poly[t + 1])
    for (let t = 0; t < poly.length; t++) { const u = (t + 1) % poly.length; if (crossIdx[t] && crossIdx[u]) segs.push([poly[t], poly[u]]) }
    void flat
  }
  const pos = new Float32Array(vx.length * 3)
  for (let v = 0; v < vx.length; v++) { pos[v * 3] = vx[v]; pos[v * 3 + 1] = vy[v]; pos[v * 3 + 2] = vz[v] }
  const topGeo = new THREE.BufferGeometry(); topGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); topGeo.setIndex(idx); topGeo.computeVertexNormals()
  // Стенки по сегментам контура и дно: те же полигоны на z = 0 (зеркально)
  const wp: number[] = [], wn: number[] = []
  const V = (v: number, z?: number): number[] => [vx[v], vy[v], z ?? vz[v]]
  const nrmAt = new Map<number, [number, number]>()
  const wallN = (v: number): [number, number] => { // нормаль стенки в вершине контура: у ближайшей точки подогнанной кривой
    let r = nrmAt.get(v); if (r) return r
    let best = Infinity; r = [0, 0]
    for (const q of wallS) { const d = (q.x - vx[v]) ** 2 + (q.y - vy[v]) ** 2; if (d < best) { best = d; r = [q.nx, q.ny] } }
    nrmAt.set(v, r); return r
  }
  const tri3 = (a: number[], b: number[], c: number[], na: number[], nb: number[], nc: number[]) => { // порядок вершин так, чтобы лицевая сторона смотрела по нормали
    const g = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])]
    const dn = g[0] * (na[0] + nb[0] + nc[0]) + g[1] * (na[1] + nb[1] + nc[1]) + g[2] * (na[2] + nb[2] + nc[2])
    if (dn >= 0) { wp.push(...a, ...b, ...c); wn.push(...na, ...nb, ...nc) } else { wp.push(...a, ...c, ...b); wn.push(...na, ...nc, ...nb) }
  }
  const curved = chk('vec') && chk('fit') && wallS.length > 0
  for (const [p0, p1] of segs) {
    const n0 = curved ? [...wallN(p0), 0] : [0, 0, 0], n1 = curved ? [...wallN(p1), 0] : [0, 0, 0]
    if (curved) { tri3(V(p0, 0), V(p1, 0), V(p0), n0, n1, n0); tri3(V(p1, 0), V(p1), V(p0), n1, n1, n0) }
    else wp.push(...V(p0, 0), ...V(p1, 0), ...V(p0), ...V(p1, 0), ...V(p1), ...V(p0))
  }
  for (let t = 0; t < idx.length; t += 3) { wp.push(...V(idx[t], 0), ...V(idx[t + 2], 0), ...V(idx[t + 1], 0)); if (curved) wn.push(0, 0, -1, 0, 0, -1, 0, 0, -1) } // дно
  const skirt = new THREE.BufferGeometry(); skirt.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wp), 3))
  if (curved) skirt.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(wn), 3)); else skirt.computeVertexNormals()
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
const PRESETS: Record<string, Record<string, number | string>> = {
  // значения в мм детали; лицо — кроп морды ~40 мм, целиком — всё животное, мелочь теряется, поэтому деталь шире и сглаживание меньше
  face: { silsrc: 'frame', dmode: 'engrave', dth: 0.15, wc: 30, wd: 40, wt: 30, partw: 40, dsm: 0.6, tsm: 0.3, fsm: 0.3, lcr: 1.4, lca: 1.1, slope: 1.5, bevel: 3, range: 2.4 },
  whole: { silsrc: 'model', dmode: 'engrave', dth: 0.18, wc: 25, wd: 45, wt: 30, partw: 70, dsm: 0.35, tsm: 0.15, fsm: 0.2, lcr: 0.9, lca: 0.9, slope: 2.5, bevel: 3, range: 2.8 },
  // рисунок/логотип: только силуэт по яркости, контурный скос, без глубины и деталей; кончики шипов сохраняются малым сглаживанием
  drawing: { silsrc: 'brightness', dmode: 'engrave', dth: 0.2, wc: 55, wd: 0, wt: 45, partw: 60, bevel: 1.2, roll: 40, range: 1.8, fsm: 0.1, slope: 3, osm: 0.15, openmm2: 150, lca: 1.6, lcr: 0.7, tpre: 0.05, tsm: 0.05 },
}
const applyPreset = (k: string) => { for (const [id, v] of Object.entries(PRESETS[k])) $<HTMLInputElement>(id).value = String(v); schedule() }
for (const k of Object.keys(PRESETS)) $('pre-' + k).addEventListener('click', () => applyPreset(k))
$('runsil').addEventListener('click', () => runModel('sil'))
$('rundepth').addEventListener('click', () => runModel('depth'))
$('sample').addEventListener('change', () => { $<HTMLInputElement>('file').value = ''; const v = $<HTMLSelectElement>('sample').value; if (chk('autopre')) applyPreset(v === 'ring' || v === 'check' ? 'drawing' : v === 'cat_face' ? 'face' : 'whole'); loadImage() })
$('file').addEventListener('change', () => loadImage())
$('face').addEventListener('click', () => { for (const [id, v] of [['cx', 42], ['cy', 34], ['cw', 42], ['ch', 24]] as const) $<HTMLInputElement>(id).value = String(v); schedule() })
$('resetcrop').addEventListener('click', () => { for (const [id, v] of [['cx', 0], ['cy', 0], ['cw', 100], ['ch', 100]] as const) $<HTMLInputElement>(id).value = String(v); schedule() })
for (const el of document.querySelectorAll('input[type=range], input[type=number], input[type=checkbox], input[type=radio], select')) {
  if (['file', 'sample'].includes(el.id)) continue
  el.addEventListener('input', () => { if (el.id === 'lightang') setLight(); schedule() })
}
loadImage()
