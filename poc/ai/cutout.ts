import * as ort from 'onnxruntime-web'
import { toColorImage, toGrayImage } from '../../src/features/keychain/decodeImage'
import { detectPaper } from '../../src/geometry/photo/detect'
import { guessPaper } from '../../src/geometry/photo/aspect'
import { paperSize } from '../../src/geometry/photo/paper'
import { rectify, type Rectified } from '../../src/geometry/photo/homography'
import { segment } from '../../src/geometry/photo/segment'
import { edt } from '../../src/geometry/raster/edt'
import { gaussianBlur, MIN_SIGMA } from '../../src/geometry/raster/blur'
import { fillHoles, labelComponents, removeSpecks } from '../../src/geometry/raster/components'
import { backendsOf, CANDIDATES, type Candidate } from './models'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const log = (s: string) => { $('log').textContent += s + '\n'; console.log(s) }
$('coi').textContent = String(self.crossOriginIsolated)
$('cores').textContent = String(navigator.hardwareConcurrency)
$('gpu').textContent = 'gpu' in navigator ? 'yes' : 'no'
for (const c of CANDIDATES.filter((x) => (x.kind ?? 'matte') === 'matte')) $('model').append(new Option(c.label, c.id))
function syncEp() {
  const ep = $<HTMLSelectElement>('ep'), list = backendsOf($<HTMLSelectElement>('model').value), keep = ep.value
  ep.innerHTML = ''; for (const b of list) ep.append(new Option(b, b))
  ep.value = list.includes(keep as 'wasm' | 'webgpu') ? keep : list[0]; ep.disabled = list.length === 1
}
syncEp(); $('model').addEventListener('change', syncEp)

const sessions = new Map<string, ort.InferenceSession>()
ort.env.wasm.proxy = true // вывод в воркере ORT: страница не замирает на время инференса
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@' + (ort.env.versions?.web ?? 'latest') + '/dist/'

async function fetchUrl(url: string, bytes: number): Promise<ArrayBuffer> {
  const cache = await caches.open('poc-ai-models')
  let r = await cache.match(url)
  const t0 = performance.now()
  if (!r) {
    const net = await fetch(url)
    if (!net.ok) throw new Error(`HTTP ${net.status} for ${url}`)
    await cache.put(url, net.clone())
    r = net
    log(`скачано ${(bytes / 1e6).toFixed(0)} МБ за ${((performance.now() - t0) / 1000).toFixed(1)} с`)
  } else log('модель из Cache API')
  const buf = await r.arrayBuffer()
  if (buf.byteLength !== bytes) log(`ВНИМАНИЕ: размер ${buf.byteLength} ≠ ${bytes}`)
  return buf
}
const fetchModel = (c: Candidate) => fetchUrl(c.url, c.bytes)

async function loadImage(maxSide = 0): Promise<ImageData> {
  const f = $<HTMLInputElement>('file').files?.[0]
  const src = f ? URL.createObjectURL(f) : `./samples/${$<HTMLSelectElement>('sample').value}.jpeg`
  const img = new Image(); img.src = src; await img.decode()
  const k = maxSide ? Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight)) : 1
  const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k)
  const g = cv.getContext('2d')!; g.drawImage(img, 0, 0, cv.width, cv.height)
  return g.getImageData(0, 0, cv.width, cv.height)
}

/** Нормализованный вход NCHW float32: лист из rgb растра, масштабированный до s × s. */
function toInput(rect: Rectified, c: Candidate, s: number, pad = false): Float32Array {
  const w = rect.image.width, h = rect.image.height
  const src = new ImageData(w, h)
  for (let i = 0; i < w * h; i++) { src.data[i * 4] = rect.rgb![i * 3]; src.data[i * 4 + 1] = rect.rgb![i * 3 + 1]; src.data[i * 4 + 2] = rect.rgb![i * 3 + 2]; src.data[i * 4 + 3] = 255 }
  const a = document.createElement('canvas'); a.width = w; a.height = h; a.getContext('2d')!.putImageData(src, 0, 0)
  const b = document.createElement('canvas'); b.width = s; b.height = s
  const bg = b.getContext('2d')!; bg.imageSmoothingQuality = 'high'
  if (pad) { // вписать с сохранением пропорций, поля — цвет, нейтральный для модели (среднее по ImageNet)
    bg.fillStyle = `rgb(${c.mean.map((m) => Math.round(m * 255)).join(',')})`; bg.fillRect(0, 0, s, s)
    const r = Math.min(s / w, s / h); bg.drawImage(a, (s - w * r) / 2, (s - h * r) / 2, w * r, h * r)
  } else bg.drawImage(a, 0, 0, s, s)
  const d = bg.getImageData(0, 0, s, s).data
  const out = new Float32Array(3 * s * s)
  for (let i = 0; i < s * s; i++) for (let k = 0; k < 3; k++) out[k * s * s + i] = (d[i * 4 + k] / 255 - c.mean[k]) / c.std[k]
  return out
}

/** Выход модели s × s → альфа w × h (билинейно), 0…1. Модели с несколькими выходами: берётся первый. */
function toAlpha(o: Float32Array, s: number, w: number, h: number, sigmoid: boolean, pad = false): Float32Array {
  // значения вне 0…1 — логиты: sigmoid (признак из реестра подстраховывается самим диапазоном выхода)
  let lo = Infinity, hi = -Infinity; for (const x of o) { if (x < lo) lo = x; if (x > hi) hi = x }
  const v = sigmoid || lo < -0.001 || hi > 1.001 ? o.map((x) => 1 / (1 + Math.exp(-x))) : o
  const out = new Float32Array(w * h)
  const r = pad ? Math.min(s / w, s / h) : 0
  const kx = pad ? r : s / w, ky = pad ? r : s / h, ox = pad ? (s - w * r) / 2 : 0, oy = pad ? (s - h * r) / 2 : 0
  for (let j = 0; j < h; j++) {
    const fy = Math.min(s - 1.001, Math.max(0, (j + 0.5) * ky + oy - 0.5)), y0 = Math.floor(fy), ty = fy - y0
    for (let i = 0; i < w; i++) {
      const fx = Math.min(s - 1.001, Math.max(0, (i + 0.5) * kx + ox - 0.5)), x0 = Math.floor(fx), tx = fx - x0
      const a = v[y0 * s + x0], b = v[y0 * s + x0 + 1], cc = v[(y0 + 1) * s + x0], d = v[(y0 + 1) * s + x0 + 1]
      out[j * w + i] = (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + d * tx) * ty
    }
  }
  return out
}

interface Sil { id: number; wMm: number; hMm: number; areaMm2: number; bbox: [number, number, number, number] }
function components(mask: Uint8Array, w: number, h: number, scale: number, marginMm: number): { labels: Int32Array; sils: Sil[] } {
  const m = new Uint8Array(mask), mp = Math.round(marginMm * scale)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (i < mp || j < mp || i >= w - mp || j >= h - mp) m[j * w + i] = 0
  const clean = removeSpecks(fillHoles(m, w, h).mask, w, h, Math.round(2 * scale * scale))
  const cc = labelComponents(clean, w, h)
  const sils: Sil[] = []
  const bb: [number, number, number, number][] = Array.from({ length: cc.count + 1 }, () => [w, h, -1, -1])
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = cc.labels[j * w + i]; if (k) { const b = bb[k]; if (i < b[0]) b[0] = i; if (j < b[1]) b[1] = j; if (i > b[2]) b[2] = i; if (j > b[3]) b[3] = j } }
  const keep = new Int32Array(cc.count + 1); let n = 0
  for (let k = 1; k <= cc.count; k++) {
    const b = bb[k], wm = (b[2] - b[0] + 1) / scale, hm = (b[3] - b[1] + 1) / scale, area = cc.sizes[k] / (scale * scale)
    if (area >= 60 && wm >= 3 && hm >= 3) { keep[k] = ++n; sils.push({ id: n, wMm: wm, hMm: hm, areaMm2: area, bbox: b }) }
  }
  const labels = new Int32Array(w * h); for (let i = 0; i < labels.length; i++) labels[i] = keep[cc.labels[i]]
  return { labels, sils }
}

function draw(rect: Rectified, classic: Int32Array, ai: Int32Array) {
  const w = rect.image.width, h = rect.image.height
  for (const [id, lab, col] of [['c1', classic, [255, 40, 40]], ['c2', ai, [0, 200, 80]]] as const) {
    const cv = $<HTMLCanvasElement>(id); cv.width = w; cv.height = h
    const g = cv.getContext('2d')!, im = g.createImageData(w, h)
    for (let i = 0; i < w * h; i++) {
      const edge = lab[i] && (!lab[i - 1] || !lab[i + 1] || !lab[i - w] || !lab[i + w])
      for (let k = 0; k < 3; k++) im.data[i * 4 + k] = edge ? col[k] : lab[i] ? rect.rgb![i * 3 + k] * 0.5 + col[k] * 0.5 : rect.rgb![i * 3 + k]
      im.data[i * 4 + 3] = 255
    }
    g.putImageData(im, 0, 0)
  }
}

async function run() {
  $('log').textContent = ''; $('status').textContent = 'работаю…'
  const c = CANDIDATES.find((x) => x.id === $<HTMLSelectElement>('model').value)!
  const ep = $<HTMLSelectElement>('ep').value, threads = +$<HTMLInputElement>('threads').value
  const s = +($<HTMLInputElement>('size').value || c.size), thr = +$<HTMLInputElement>('thr').value, margin = +$<HTMLInputElement>('margin').value
  log(`модель ${c.id}, лицензия ${c.license}, вход ${s}, бэкенд ${ep}, потоков ${threads}, isolated=${self.crossOriginIsolated}`)

  const whole = $<HTMLInputElement>('whole').checked
  const im = await loadImage(whole ? 2048 : 0)
  const gray = toGrayImage(im.data, im.width, im.height), color = toColorImage(im.data, im.width, im.height)
  let rect: Rectified, seg: ReturnType<typeof segment>
  if (whole) {
    // режим Keychain: вся картинка как есть, без листа; масштаб 1 пиксель = 1 «мм» (размеры в таблице — в пикселях)
    rect = { image: gray, rgb: color.rgb, scale: 1, paper: { width: im.width, height: im.height } }
    seg = { width: im.width, height: im.height, scale: 1, labels: new Int32Array(im.width * im.height), silhouettes: [], sensitivity: 0, defaultSensitivity: 0 }
    log(`режим Keychain: картинка ${im.width}×${im.height}, вписывание с полями до ${s}×${s}`)
  } else {
    const found = detectPaper(color)
    if (!found) { log('лист не найден'); return }
    const guess = guessPaper(found.corners, im.width, im.height)
    const paper = paperSize(guess?.preset ?? 'a4', guess?.orientation ?? 'portrait')
    rect = rectify(gray, found.corners, paper, color.rgb)!
    log(`снимок ${im.width}×${im.height}, лист ${paper.width}×${paper.height} мм (${guess?.preset}/${guess?.orientation}), растр ${rect.image.width}×${rect.image.height}, ${rect.scale.toFixed(2)} px/мм`)
    const t0 = performance.now(); seg = segment(rect)
    log(`классика: ${seg.silhouettes.length} силуэтов за ${(performance.now() - t0).toFixed(0)} мс`)
  }
  const W = rect.image.width, H = rect.image.height
  let t = performance.now()

  const key = `${c.id}|${ep}|${threads}`
  let session = sessions.get(key)
  if (!session) {
    const buf = await fetchModel(c)
    ort.env.wasm.numThreads = threads
    t = performance.now()
    const externalData = c.data ? [{ path: c.data.path, data: new Uint8Array(await fetchUrl(c.data.url, c.data.bytes)) }] : undefined
    session = await ort.InferenceSession.create(buf, { executionProviders: [ep], graphOptimizationLevel: 'all', ...(externalData ? { externalData } : {}) })
    log(`сессия создана за ${(performance.now() - t).toFixed(0)} мс; входы ${session.inputNames}, выходы ${session.outputNames}`)
    sessions.set(key, session)
  }
  const inName = session.inputNames[0]
  const data = toInput(rect, c, s, whole)
  const runs: number[] = []; let out!: ort.InferenceSession.OnnxValueMapType
  for (let i = 0; i < 2; i++) { t = performance.now(); out = await session.run({ [inName]: new ort.Tensor('float32', data.slice(), [1, 3, s, s]) }); runs.push(performance.now() - t) }
  log(`инференс: 1-й ${runs[0].toFixed(0)} мс (прогрев), 2-й ${runs[1].toFixed(0)} мс`)
  const o = out[session.outputNames[0]]
  let raw = o.data as Float32Array
  if (c.kind === 'depth') { // относительная глубина → 0…1 по 2–98 перцентилям (дальше — ближе = выше, как в рельефе)
    const sorted = Float32Array.from(raw).sort(); const lo = sorted[Math.floor(sorted.length * 0.02)], hi = sorted[Math.floor(sorted.length * 0.98)]
    raw = raw.map((x) => Math.min(1, Math.max(0, (x - lo) / (hi - lo || 1))))
  }
  const alpha = toAlpha(raw, s, W, H, c.sigmoid, whole)

  state = { rect, seg, alpha, runs, c, ep, threads, s, whole, depth: c.kind === 'depth' }
  evaluate()
  $('status').textContent = 'готово'
}

interface State { rect: Rectified; seg: ReturnType<typeof segment>; alpha: Float32Array; runs: number[]; c: Candidate; ep: string; threads: number; s: number; whole: boolean; depth: boolean }
let state: State | null = null

/** Всё после инференса: сглаживание альфы, порог, компоненты, сравнение. Модель не запускается, поэтому ползунки работают мгновенно. */
function evaluate() {
  if (!state) return
  const { rect, seg, runs, c, ep, threads, s, whole } = state
  const W = rect.image.width, H = rect.image.height
  const thr = +$<HTMLInputElement>('thr').value, margin = +$<HTMLInputElement>('margin').value, smoothMm = +$<HTMLInputElement>('smooth').value
  let alpha = state.alpha
  if (smoothMm > 0) alpha = gaussianBlur(alpha, W, H, Math.max(MIN_SIGMA, smoothMm * rect.scale), new Uint8Array(W * H).fill(1))
  drawAlpha(alpha, W, H)
  capture(state.depth, alpha, rect, W, H, thr)
  if (state.depth) { combine(); $('edge').textContent = 'карта глубины (светлее = ближе): справа — глубина, силуэт не считается'; $('tbl').innerHTML = ''; $('status').textContent = 'готово'; return }
  const mask = new Uint8Array(W * H); for (let i = 0; i < mask.length; i++) mask[i] = alpha[i] >= thr ? 1 : 0
  const ai = components(mask, W, H, rect.scale, margin)
  draw(rect, seg.labels, ai.labels)

  // сравнение: общий IoU и по силуэтам (сопоставление по наибольшему пересечению)
  let inter = 0, uni = 0; for (let i = 0; i < W * H; i++) { const a = seg.labels[i] > 0, b = ai.labels[i] > 0; if (a && b) inter++; if (a || b) uni++ }
  const rows: string[] = ['<tr><th>классика мм</th><th>AI мм</th><th>Δ ширина</th><th>Δ высота</th><th>IoU</th><th>AI больше (тень?)</th><th>AI меньше (потеря?)</th></tr>']
  for (const cs of seg.silhouettes) {
    const ov = new Map<number, number>(); let cArea = 0
    for (let i = 0; i < W * H; i++) if (seg.labels[i] === cs.id) { cArea++; const k = ai.labels[i]; if (k) ov.set(k, (ov.get(k) ?? 0) + 1) }
    let best = 0, bo = 0; for (const [k, v] of ov) if (v > bo) { bo = v; best = k }
    const a = ai.sils.find((x) => x.id === best)
    if (!a) { rows.push(`<tr><td>${cs.widthMm.toFixed(1)}×${cs.heightMm.toFixed(1)}</td><td colspan=6>НЕ НАЙДЕН</td></tr>`); continue }
    let i2 = 0, u2 = 0, big = 0, small = 0
    for (let i = 0; i < W * H; i++) { const x = seg.labels[i] === cs.id, y = ai.labels[i] === best; if (x && y) i2++; if (x || y) u2++; if (y && !x) big++; if (x && !y) small++ }
    const px = scaleMm(rect.scale)
    rows.push(`<tr><td>${cs.widthMm.toFixed(1)}×${cs.heightMm.toFixed(1)}</td><td>${a.wMm.toFixed(1)}×${a.hMm.toFixed(1)}</td><td>${(a.wMm - cs.widthMm).toFixed(2)}</td><td>${(a.hMm - cs.heightMm).toFixed(2)}</td><td>${(i2 / u2).toFixed(3)}</td><td>${(big * px).toFixed(0)} мм²</td><td>${(small * px).toFixed(0)} мм²</td></tr>`)
  }
  if (whole) for (const a of ai.sils) rows.push(`<tr><td colspan=2>объект ${a.id}</td><td colspan=5>${a.wMm.toFixed(0)}×${a.hMm.toFixed(0)} px, площадь ${a.areaMm2.toFixed(0)} px²</td></tr>`)
  const extra = whole ? 0 : ai.sils.length - seg.silhouettes.length
  $('tbl').innerHTML = rows.join('') + `<tr><td colspan=7>всего: классика ${seg.silhouettes.length}, AI ${ai.sils.length}${extra ? ' (лишние/слитые!)' : ''}; общий IoU ${(inter / uni).toFixed(3)}; инференс ${runs[1].toFixed(0)} мс</td></tr>`
  ;(window as unknown as { __poc: unknown }).__poc = { model: c.id, ep, threads, size: s, classic: seg.silhouettes.map((x) => [x.widthMm, x.heightMm, x.areaMm2]), ai: ai.sils.map((x) => [x.wMm, x.hMm, x.areaMm2]), iou: inter / uni, ms: runs }
  // длина границы: меньше — гладче контур (дрожащий край = много лишних угловых пикселей)
  let edgePx = 0; for (let i = 1; i < W * H - W; i++) if (ai.labels[i] && (!ai.labels[i - 1] || !ai.labels[i + 1] || !ai.labels[i - W] || !ai.labels[i + W])) edgePx++
  $('edge').textContent = `граница AI: ${(edgePx / rect.scale).toFixed(0)} мм, мягкая зона альфы (0.1…0.9): ${(softPx(alpha) / rect.scale / rect.scale).toFixed(0)} мм²`
}

function softPx(alpha: Float32Array): number { let n = 0; for (const a of alpha) if (a > 0.1 && a < 0.9) n++; return n }

function drawAlpha(alpha: Float32Array, w: number, h: number) {
  const cv = $<HTMLCanvasElement>('c3'); cv.width = w; cv.height = h
  const g = cv.getContext('2d')!, im = g.createImageData(w, h)
  for (let i = 0; i < w * h; i++) { const v = Math.round(alpha[i] * 255); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255 }
  g.putImageData(im, 0, 0)
}
for (const id of ['thr', 'smooth', 'margin']) $(id).addEventListener('input', () => evaluate())
/** Плоскости последнего запуска для комбинатора: маска (контур), глубина, яркость. Размеры совпадают, пока снимок один. */
const planes: { w: number; h: number; mask?: Uint8Array; depth?: Float32Array; gray?: Float32Array; name?: string } = { w: 0, h: 0 }
function capture(isDepth: boolean, alpha: Float32Array, rect: Rectified, W: number, H: number, thr: number) {
  if (planes.w !== W || planes.h !== H) { planes.mask = undefined; planes.depth = undefined }
  planes.w = W; planes.h = H
  planes.gray = Float32Array.from(rect.image.gray, (v) => v / 255)
  if (isDepth) planes.depth = alpha
  else planes.mask = alpha.map((v) => (v >= thr ? 1 : 0)) as unknown as Uint8Array
  $('planes').textContent = ` плоскости: маска ${planes.mask ? 'есть' : 'нет'}, глубина ${planes.depth ? 'есть' : 'нет'}`
  combine()
}
const ones = (n: number) => new Uint8Array(n).fill(1)
function localContrast(g: Float32Array, w: number, h: number, sigma: number, amount: number): Float32Array {
  if (amount <= 0) return g.map(() => 0.5)
  const mean = gaussianBlur(g, w, h, Math.max(MIN_SIGMA, sigma), ones(w * h))
  const dev = g.map((v, i) => v - mean[i])
  const sd = gaussianBlur(dev.map((v) => v * v), w, h, Math.max(MIN_SIGMA, sigma), ones(w * h)).map((v) => Math.sqrt(v) + 0.02)
  return dev.map((v, i) => 0.5 + 0.5 * Math.tanh(amount * v / sd[i]))
}
const smooth01 = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x) }
/** Форма = нормированная смесь трёх источников: контур (скос от края маски), глубина (внутри маски), детали (локальный контраст яркости). */
function combine() {
  const { w, h, mask, depth, gray } = planes
  if (!gray || !w) return
  const num = (id: string) => +$<HTMLInputElement>(id).value
  const wc = num('wc'), wd = num('wd'), wt = num('wt')
  const pxMm = w / Math.max(1, num('partw')) // пикселей на мм детали (кадр = вся деталь)
  const inside = mask ?? ones(w * h)
  // контур: скос шириной bevel мм от края маски
  const dist = mask ? edt(mask, w, h) : null
  const bevelPx = Math.max(1, num('bevel') * pxMm)
  const contour = Float32Array.from({ length: w * h }, (_, i) => (dist ? smooth01(dist[i] / bevelPx) : 1))
  // глубина: нормировка по перцентилям внутри маски
  let dnorm = new Float32Array(w * h).fill(0.5)
  if (depth) {
    const vals: number[] = []; for (let i = 0; i < w * h; i++) if (inside[i]) vals.push(depth[i])
    vals.sort((a, b) => a - b); const lo = vals[Math.floor(vals.length * 0.02)] ?? 0, hi = vals[Math.floor(vals.length * 0.98)] ?? 1
    dnorm = depth.map((v) => Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1))))
  }
  let tone = localContrast(gray, w, h, num('lcr') * pxMm, num('lca'))
  const L = num('lvl'); if (L >= 2) tone = tone.map((v) => Math.round(v * (L - 1)) / (L - 1))
  const wsum = (mask || !depth ? wc : wc) + wd * (depth ? 1 : 0) + wt || 1
  const wcE = wc, wdE = depth ? wd : 0
  const sum = wcE + wdE + wt || 1
  const height = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) height[i] = inside[i] ? (wcE * contour[i] + wdE * dnorm[i] + wt * tone[i]) / sum : 0
  void wsum
  // рисуем высоту и «затенённый» рельеф (свет сверху слева), чтобы оценить, читается ли форма
  const cv4 = $<HTMLCanvasElement>('c4'), cv5 = $<HTMLCanvasElement>('c5'); cv4.width = cv5.width = w; cv4.height = cv5.height = h
  const g4 = cv4.getContext('2d')!.createImageData(w, h), g5 = cv5.getContext('2d')!.createImageData(w, h), k = num('light')
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const p = j * w + i, v = Math.round(height[p] * 255)
    g4.data[p * 4] = g4.data[p * 4 + 1] = g4.data[p * 4 + 2] = v; g4.data[p * 4 + 3] = 255
    const a = height[Math.max(0, j - 1) * w + Math.max(0, i - 1)], b = height[Math.min(h - 1, j + 1) * w + Math.min(w - 1, i + 1)]
    const sh = Math.round(Math.min(1, Math.max(0, 0.5 + k * (a - b))) * 255)
    const sv = inside[p] ? sh : 40
    g5.data[p * 4] = g5.data[p * 4 + 1] = g5.data[p * 4 + 2] = sv; g5.data[p * 4 + 3] = 255
  }
  cv4.getContext('2d')!.putImageData(g4, 0, 0); cv5.getContext('2d')!.putImageData(g5, 0, 0)
}
for (const id of ['wc', 'wd', 'wt', 'partw', 'lcr', 'lca', 'lvl', 'bevel', 'light']) $(id).addEventListener('input', () => combine())
const scaleMm = (scale: number) => 1 / (scale * scale)

$('run').addEventListener('click', () => { run().catch((e) => { log('ОШИБКА: ' + (e?.stack ?? e)); $('status').textContent = 'ошибка' }) })

/** Серия прогонов без участия человека: window.__all[ключ] = результат, window.__done = true. */
;(window as unknown as { runAll: (jobs: [string, string, number, string][]) => void }).runAll = (jobs) => {
  const w = window as unknown as { __all: Record<string, unknown>; __done: boolean }
  w.__all = {}; w.__done = false
  ;(async () => {
    for (const [m, ep, th, sample] of jobs) {
      $<HTMLSelectElement>('model').value = m; $<HTMLSelectElement>('ep').value = ep; $<HTMLInputElement>('threads').value = String(th); $<HTMLSelectElement>('sample').value = sample
      try { await run(); w.__all[`${m}/${ep}/${th}/${sample}`] = { ...(window as unknown as { __poc: object }).__poc, table: [...document.querySelectorAll('#tbl tr')].slice(1).map((r) => [...r.children].map((c) => c.textContent).join(' | ')), log: $('log').textContent } }
      catch (e) { w.__all[`${m}/${ep}/${th}/${sample}`] = { error: String(e) } }
    }
    w.__done = true
  })()
}
