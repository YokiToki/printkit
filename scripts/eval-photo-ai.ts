/**
 * Оценка нейросетевых силуэтов против классического `segment()` (change 32, задача 1.1). Не входит в сборку, CI не запускает.
 *
 *   npx tsx scripts/eval-photo-ai.ts [--models id,id] [--dir tmp/ai/models] [--download] [--no-write]
 *
 * Снимки: фикстуры `geometry/photo/fixtures` (углы заданы вручную) и оригиналы владельца `tmp/ai/photo_cutout_*.jpeg`
 * (лист ищет `detectPaper`). Лист выпрямляется (4 px/мм), прогоняются классика и каждая модель; для каждого силуэта печатается
 * размер в мм, IoU с классикой, площади «сеть больше» (утекла тень) и «сеть меньше» (потеряна часть) и время.
 * Альфа каждой модели для фикстур пишется в `geometry/photo/fixtures/ai/<модель>-<фикстура>.png`.
 *
 * Веса не лежат в репозитории: берутся из `--dir` (по умолчанию tmp/ai/models, git-ignored). Скачивание только с флагом
 * `--download` (файл по закреплённой ревизии Hugging Face, размер проверяется), иначе отсутствующая модель пропускается.
 * Бэкенд — CPU (onnxruntime-node): fp16-модели для WebGPU (InSPyReNet, ISNet imgly fp16) здесь не запускаются, их замеры в
 * poc/ai/FINDINGS.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decode } from 'jpeg-js'
import { zlibSync } from 'fflate'
import { toColorImage, toGrayImage } from '../src/features/keychain/decodeImage'
import { detectPaper } from '../src/geometry/photo/detect'
import { rectify, type Rectified } from '../src/geometry/photo/homography'
import { paperSize } from '../src/geometry/photo/paper'
import { defaultSegmentParams, segment, type Segmentation, type Silhouette } from '../src/geometry/photo/segment'
import { fillHoles, labelComponents } from '../src/geometry/raster/components'
import { loadFixture } from '../src/geometry/photo/fixtures/load'
import { CANDIDATES, type Candidate } from '../poc/ai/models'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1] }
const flag = (name: string) => process.argv.includes(`--${name}`)

// модели, которые идут на CPU: fp32 / int8; fp16 под WebGPU в Node не проверяются
const DEFAULT_MODELS = ['birefnet-lite-512-fp32', 'ormbg-int8', 'isnet-imgly-fp32', 'isnet-general-q', 'u2netp']
const models = (arg('models')?.split(',') ?? DEFAULT_MODELS).map((id) => {
  const c = CANDIDATES.find((x) => x.id === id)
  if (!c) throw new Error(`неизвестная модель ${id}; есть: ${CANDIDATES.map((x) => x.id).join(', ')}`)
  if (c.referenceOnly) throw new Error(`${id}: лицензия не позволяет включить модель в проект`)
  return c
})
const DIR = resolve(ROOT, arg('dir') ?? 'tmp/ai/models')
const OUT = join(ROOT, 'src/geometry/photo/fixtures/ai')

// ---------- снимки ----------
interface Shot { name: string; rect: Rectified; write: boolean }
const A4 = paperSize('a4', 'portrait')

function shots(): Shot[] {
  const list: Shot[] = []
  for (const name of ['flash', 'noflash'] as const) {
    const f = loadFixture(name)
    const rect = rectify(f.gray, f.corners, A4, f.color.rgb)
    if (rect) list.push({ name, rect, write: true })
  }
  const originals: [string, string][] = [['orig-flash', 'photo_cutout_with_flash.jpeg'], ['orig-noflash', 'photo_cutout_without_flash.jpeg']]
  for (const [name, file] of originals) {
    const path = join(ROOT, 'tmp/ai', file)
    if (!existsSync(path)) { console.warn(`нет ${path}, пропуск`); continue }
    const img = decode(readFileSync(path), { useTArray: true, formatAsRGBA: true })
    const rgba = new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength)
    const color = toColorImage(rgba, img.width, img.height)
    const det = detectPaper(color)
    if (!det) { console.warn(`${name}: лист не найден, пропуск`); continue }
    const rect = rectify(toGrayImage(rgba, img.width, img.height), det.corners, A4, color.rgb)
    if (rect) list.push({ name, rect, write: false })
  }
  return list
}

// ---------- загрузка весов ----------
async function ensureFile(url: string, bytes: number, path: string): Promise<boolean> {
  if (existsSync(path) && readFileSync(path).length === bytes) return true
  if (!flag('download')) return false
  console.log(`скачиваю ${url} (${(bytes / 1e6).toFixed(0)} МБ)`)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`)
  const buf = new Uint8Array(await r.arrayBuffer())
  if (buf.length !== bytes) throw new Error(`размер ${buf.length} ≠ ${bytes} для ${url}`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, buf)
  return true
}

// ---------- подготовка входа и разворот выхода (в браузере то же делает poc/ai/engine.ts) ----------
function bilinear(rgb: Uint8Array, w: number, h: number, x: number, y: number, k: number): number {
  x = Math.min(w - 1, Math.max(0, x - 0.5)); y = Math.min(h - 1, Math.max(0, y - 0.5))
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = x - x0, ty = y - y0
  const p = (i: number, j: number) => rgb[(j * w + i) * 3 + k]
  return (p(x0, y0) * (1 - tx) + p(x1, y0) * tx) * (1 - ty) + (p(x0, y1) * (1 - tx) + p(x1, y1) * tx) * ty
}

/** NCHW float32: картинка вписана в s × s с сохранением пропорций, поля — среднее модели. При уменьшении берётся среднее блока. */
function toInput(rgb: Uint8Array, w: number, h: number, c: Candidate): Float32Array {
  const s = c.size, r = Math.min(s / w, s / h), dw = w * r, dh = h * r, ox = (s - dw) / 2, oy = (s - dh) / 2
  const out = new Float32Array(3 * s * s)
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) for (let k = 0; k < 3; k++) {
    const inside = i >= ox && i < ox + dw && j >= oy && j < oy + dh
    let v = c.mean[k] * 255
    if (inside) {
      // 2 × 2 выборки внутри пикселя выхода: сглаживание при сильном уменьшении (лист 840 × 1188 → 512)
      let acc = 0
      for (const dy of [0.25, 0.75]) for (const dx of [0.25, 0.75]) acc += bilinear(rgb, w, h, (i + dx - ox) / r, (j + dy - oy) / r, k)
      v = acc / 4
    }
    out[k * s * s + j * s + i] = (v / 255 - c.mean[k]) / c.std[k]
  }
  return out
}

function cubicSample(v: Float32Array, w: number, h: number, x: number, y: number): number {
  x -= 0.5; y -= 0.5
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0
  const wg = (t: number) => [(-t * t * t + 2 * t * t - t) / 2, (3 * t * t * t - 5 * t * t + 2) / 2, (-3 * t * t * t + 4 * t * t + t) / 2, (t * t * t - t * t) / 2]
  const wx = wg(tx), wy = wg(ty); let acc = 0
  for (let j = 0; j < 4; j++) {
    const yy = Math.min(h - 1, Math.max(0, y0 - 1 + j)); let row = 0
    for (let i = 0; i < 4; i++) row += wx[i] * v[yy * w + Math.min(w - 1, Math.max(0, x0 - 1 + i))]
    acc += wy[j] * row
  }
  return acc
}

function fromOutput(v: Float32Array, s: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h), r = Math.min(s / w, s / h), ox = (s - w * r) / 2, oy = (s - h * r) / 2
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out[j * w + i] = Math.min(1, Math.max(0, cubicSample(v, s, s, (i + 0.5) * r + ox, (j + 0.5) * r + oy)))
  return out
}

// ---------- маска → Segmentation (те же шаги очистки, что у classic; в приложении это будет ai.ts, задача 3.1) ----------
function toSegmentation(alpha: Float32Array, r: Rectified, threshold = 0.5): Segmentation {
  const { width: w, height: h } = r.image, s = r.scale, p = defaultSegmentParams
  const m = Math.round(p.margin * s)
  let mask = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const edge = i < m || j < m || i >= w - m || j >= h - m
    mask[j * w + i] = !edge && alpha[j * w + i] >= threshold ? 1 : 0
  }
  mask = new Uint8Array(fillHoles(mask, w, h).mask)
  const comps = labelComponents(mask, w, h, 1)
  const found: { l: number; box: [number, number, number, number] }[] = []
  for (let l = 1; l <= comps.count; l++) found.push({ l, box: [w, h, -1, -1] })
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const l = comps.labels[j * w + i]; if (!l) continue
    const b = found[l - 1].box
    if (i < b[0]) b[0] = i; if (j < b[1]) b[1] = j; if (i > b[2]) b[2] = i; if (j > b[3]) b[3] = j
  }
  const labels = new Int32Array(w * h), map = new Int32Array(comps.count + 1), silhouettes: Silhouette[] = []
  for (const { l, box } of found) {
    const wm = (box[2] - box[0] + 1) / s, hm = (box[3] - box[1] + 1) / s, area = comps.sizes[l] / (s * s)
    if (wm < p.minSize || hm < p.minSize || area < p.minArea) continue
    map[l] = silhouettes.length + 1
    silhouettes.push({ id: map[l], areaMm2: area, widthMm: wm, heightMm: hm, bbox: box })
  }
  // нумерация сверху вниз, как у классики (метки уже идут в порядке обхода строк)
  for (let k = 0; k < labels.length; k++) labels[k] = map[comps.labels[k]] ?? 0
  return { width: w, height: h, scale: s, labels, silhouettes, sensitivity: 0, defaultSensitivity: 0 }
}

// ---------- сравнение ----------
interface Row { shot: string; model: string; classic: Silhouette; ai?: Silhouette; iou?: number; larger?: number; smaller?: number; ms: number }

function compare(shot: string, model: string, a: Segmentation, b: Segmentation, ms: number): Row[] {
  const px = 1 / (a.scale * a.scale), n = a.labels.length
  const inter = new Map<string, number>()
  for (let k = 0; k < n; k++) { const la = a.labels[k], lb = b.labels[k]; if (la && lb) inter.set(`${la}:${lb}`, (inter.get(`${la}:${lb}`) ?? 0) + 1) }
  return a.silhouettes.map((sa) => {
    let best = 0, bestN = 0
    for (const sb of b.silhouettes) { const v = inter.get(`${sa.id}:${sb.id}`) ?? 0; if (v > bestN) { bestN = v; best = sb.id } }
    const sb = b.silhouettes.find((x) => x.id === best)
    if (!sb) return { shot, model, classic: sa, ms }
    const areaA = sa.areaMm2, areaB = sb.areaMm2, i = bestN * px
    return { shot, model, classic: sa, ai: sb, iou: i / (areaA + areaB - i), larger: areaB - i, smaller: areaA - i, ms }
  })
}

function printRows(rows: Row[]) {
  const f = (v: number | undefined, d = 1) => (v === undefined ? '—' : v.toFixed(d))
  console.log(['снимок', 'модель', 'классика мм', 'сеть мм', 'Δ ш/в мм', 'IoU', 'сеть больше мм²', 'сеть меньше мм²', 'с'].join(' | '))
  for (const r of rows) {
    const c = r.classic, a = r.ai
    console.log([r.shot, r.model, `${f(c.widthMm)}×${f(c.heightMm)}`, a ? `${f(a.widthMm)}×${f(a.heightMm)}` : 'не найден',
      a ? `${f(a.widthMm - c.widthMm)}/${f(a.heightMm - c.heightMm)}` : '—', f(r.iou, 3), f(r.larger, 0), f(r.smaller, 0), f(r.ms / 1000)].join(' | '))
  }
}

// ---------- PNG 8 бит, серый (без зависимостей, zlib из fflate) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function pngGray(plane: Float32Array, w: number, h: number): Uint8Array {
  const raw = new Uint8Array((w + 1) * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) raw[j * (w + 1) + 1 + i] = Math.round(plane[j * w + i] * 255)
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer)
    dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
    out.set(data, 8); dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out
  }
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer)
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 0
  const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))]
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0
  for (const p of parts) { png.set(p, o); o += p.length }
  return png
}

// ---------- основной прогон ----------
async function main() {
  let ort: typeof import('onnxruntime-node')
  try { ort = await import('onnxruntime-node') } catch { throw new Error('нужен onnxruntime-node: npm i -D onnxruntime-node') }
  const list = shots()
  const classic = list.map((s) => ({ shot: s, seg: segment(s.rect) }))
  for (const { shot, seg } of classic) console.log(`${shot.name}: классика ${seg.silhouettes.length} силуэта(ов), лист ${shot.rect.image.width}×${shot.rect.image.height}`)
  const rows: Row[] = []
  for (const c of models) {
    const path = join(DIR, `${c.id}.onnx`)
    if (!(await ensureFile(c.url, c.bytes, path))) { console.warn(`${c.id}: нет весов в ${path} (флаг --download скачает ${(c.bytes / 1e6).toFixed(0)} МБ)`); continue }
    let session
    try { session = await ort.InferenceSession.create(path, { executionProviders: ['cpu'] }) } catch (e) { console.warn(`${c.id}: сессия не создана: ${(e as Error).message}`); continue }
    for (const { shot, seg } of classic) {
      const { width: w, height: h } = shot.rect.image, rgb = shot.rect.rgb
      if (!rgb) continue
      try {
        const t = performance.now()
        const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', toInput(rgb, w, h, c), [1, 3, c.size, c.size]) })
        const ms = performance.now() - t
        let o = Float32Array.from(out[session.outputNames[0]].data as Float32Array)
        let lo = Infinity, hi = -Infinity; for (const x of o) { if (x < lo) lo = x; if (x > hi) hi = x }
        if (c.sigmoid || lo < -0.001 || hi > 1.001) o = o.map((x) => 1 / (1 + Math.exp(-x)))
        const alpha = fromOutput(o, Math.round(Math.sqrt(o.length)), w, h)
        rows.push(...compare(shot.name, c.id, seg, toSegmentation(alpha, shot.rect), ms))
        if (shot.write && !flag('no-write')) { mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, `${c.id}-${shot.name}.png`), pngGray(alpha, w, h)) }
      } catch (e) { console.warn(`${c.id} / ${shot.name}: ${(e as Error).message}`) }
    }
  }
  if (!rows.length) { console.log('\nНи одна модель не отработала: положите веса в ' + DIR + ' или запустите с --download'); return }
  console.log(); printRows(rows)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
