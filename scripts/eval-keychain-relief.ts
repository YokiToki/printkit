/**
 * Подбор смеси «контур + глубина + детали» на картинках для брелка (change 34, задача 1.1). Не входит в сборку, CI не запускает.
 *
 *   npx tsx scripts/eval-keychain-relief.ts [--pics cat,cat_face] [--mix 30,40,30] [--radius 1.4] [--amount 2] [--dark 0.15]
 *
 * На каждую картинку: маска (ISNet, вся картинка), глубина (Depth Anything V2 Small q4f16), контур (скос от кромки), детали
 * (локальный контраст, гравировка тёмного), смесь и рельеф со светотенью. Контактный лист `tmp/ai/relief/sheet.png`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decode } from 'jpeg-js'
import { zlibSync } from 'fflate'
import { resampleOutput } from '../src/geometry/photo/aiResample'
import { edt } from '../src/geometry/raster/edt'
import { keepLargest } from '../src/geometry/raster/matte'
import { localContrast, normaliseDepth } from '../src/geometry/raster/tone'
import { fromOutput, toInput } from '../src/ml/prepost'
import { MODELS } from '../src/ml/models'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1] }
const pics = arg('pics', 'cat,cat_face').split(',')
const [wC, wD, wT] = arg('mix', '30,40,30').split(',').map(Number)
const radiusMm = Number(arg('radius', '1.4')), amount = Number(arg('amount', '2')), dark = Number(arg('dark', '0.15')), longestMm = Number(arg('size', '70'))
const levelsN = Number(arg('levels', '0')), edgeW = 6, hmax = 2, floor = 0.06, WORK = 640
const OUT = join(ROOT, 'tmp/ai/relief'); mkdirSync(OUT, { recursive: true })

const CRCT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRCT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function png(rgb: Uint8Array, w: number, h: number): Uint8Array {
  const raw = new Uint8Array((w * 3 + 1) * h); for (let j = 0; j < h; j++) raw.set(rgb.subarray(j * w * 3, (j + 1) * w * 3), j * (w * 3 + 1) + 1)
  const chunk = (t: string, d: Uint8Array) => { const o = new Uint8Array(12 + d.length), dv = new DataView(o.buffer); dv.setUint32(0, d.length); for (let i = 0; i < 4; i++) o[4 + i] = t.charCodeAt(i); o.set(d, 8); dv.setUint32(8 + d.length, crc(o.subarray(4, 8 + d.length))); return o }
  const ih = new Uint8Array(13), dv = new DataView(ih.buffer); dv.setUint32(0, w); dv.setUint32(4, h); ih[8] = 8; ih[9] = 2
  const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', ih), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out
}
const grey = (v: Float32Array, w: number, h: number) => { const o = new Uint8Array(w * h * 3); for (let i = 0; i < w * h; i++) { const x = Math.round(Math.min(1, Math.max(0, v[i])) * 255); o[i * 3] = x; o[i * 3 + 1] = x; o[i * 3 + 2] = x } return o }

function shrink(rgb: Uint8Array, w: number, h: number, side: number) {
  const k = Math.min(1, side / Math.max(w, h)); if (k === 1) return { rgb, w, h }
  const nw = Math.round(w * k), nh = Math.round(h * k), out = new Uint8Array(nw * nh * 3)
  for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
    const x0 = Math.floor(i / k), x1 = Math.max(x0 + 1, Math.floor((i + 1) / k)), y0 = Math.floor(j / k), y1 = Math.max(y0 + 1, Math.floor((j + 1) / k)); let r = 0, g = 0, b = 0, c = 0
    for (let y = y0; y < Math.min(h, y1); y++) for (let x = x0; x < Math.min(w, x1); x++) { const q = (y * w + x) * 3; r += rgb[q]; g += rgb[q + 1]; b += rgb[q + 2]; c++ }
    const q = (j * nw + i) * 3; out[q] = r / c; out[q + 1] = g / c; out[q + 2] = b / c
  }
  return { rgb: out, w: nw, h: nh }
}

async function main() {
  const ort = await import('onnxruntime-node')
  const isnet = MODELS.find((m) => m.id === 'isnet-general-int8')!
  const matteSession = await ort.InferenceSession.create(join(ROOT, 'tmp/ai/models/isnet-general-q.onnx'), { executionProviders: ['cpu'] })
  const depthSession = await ort.InferenceSession.create(join(ROOT, 'tmp/ai/models/depth/model_q4f16.onnx'), { executionProviders: ['cpu'] })
  const T = 300, cells: { rgb: Uint8Array; w: number; h: number }[][] = []
  for (const name of pics) {
    const img = decode(readFileSync(join(ROOT, `poc/ai/samples/${name}.jpeg`)), { useTArray: true, formatAsRGBA: true })
    const full = new Uint8Array(img.width * img.height * 3); for (let i = 0; i < img.width * img.height; i++) { full[i * 3] = img.data[i * 4]; full[i * 3 + 1] = img.data[i * 4 + 1]; full[i * 3 + 2] = img.data[i * 4 + 2] }
    const { rgb, w, h } = shrink(full, img.width, img.height, WORK)
    const gray = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) gray[i] = Math.round(0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2])
    // маска
    const mo = await matteSession.run({ [matteSession.inputNames[0]]: new ort.Tensor('float32', toInput(rgb, w, h, isnet), [1, 3, isnet.size, isnet.size]) })
    const alpha = fromOutput(mo[matteSession.outputNames[0]].data as Float32Array, isnet, w, h)
    let mask = new Uint8Array(w * h); for (let i = 0; i < mask.length; i++) mask[i] = alpha[i] >= 0.5 ? 1 : 0
    mask = keepLargest(mask, w, h)
    // глубина (вход 518, mean/std ImageNet)
    const dn = { size: 518, mean: [0.485, 0.456, 0.406] as [number, number, number], std: [0.229, 0.224, 0.225] as [number, number, number] }
    const t0 = performance.now()
    const dout = await depthSession.run({ [depthSession.inputNames[0]]: new ort.Tensor('float32', toInput(rgb, w, h, dn), [1, 3, 518, 518]) })
    const raw = dout[depthSession.outputNames[0]].data as Float32Array, side = Math.round(Math.sqrt(raw.length))
    let lo = Infinity, hi = -Infinity; for (const v of raw) { if (v < lo) lo = v; if (v > hi) hi = v }
    const depth = normaliseDepth(resampleOutput(Float32Array.from(raw, (v) => (v - lo) / (hi - lo || 1)), side, w, h, 'cubic'), mask)
    console.log(name, `${w}x${h}`, `глубина ${((performance.now() - t0) / 1000).toFixed(1)} с`)
    // масштаб: 70 мм по длинной стороне габарита маски
    let x0 = w, x1 = -1, y0 = h, y1 = -1; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (mask[j * w + i]) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j) }
    const pxPerMm = Math.max(x1 - x0 + 1, y1 - y0 + 1) / longestMm
    // контур
    const dist = edt(mask, w, h), contour = new Float32Array(w * h)
    for (let i = 0; i < contour.length; i++) { const t = Math.min(1, dist[i] / pxPerMm / edgeW); contour[i] = mask[i] ? t ** 0.65 : 0 }
    // детали: гравировка тёмного
    const tone = localContrast(gray, w, h, radiusMm * pxPerMm, amount), detail = new Float32Array(w * h)
    for (let i = 0; i < detail.length; i++) { const d = 2 * Math.max(0, 0.5 - tone[i]); const g = Math.min(1, Math.max(0, (d - dark) / (1 - dark))); detail[i] = 1 - g * g * (3 - 2 * g) }
    const sum = wC + wD + wT, mix = new Float32Array(w * h)
    for (let i = 0; i < mix.length; i++) mix[i] = mask[i] ? Math.min(1, (wC * contour[i] + wD * depth[i] + wT * detail[i]) / sum) * Math.min(1, contour[i] * 2 + 0.05) : 0
    // светотень: высота в мм, свет сверху-слева
    const H = new Float32Array(w * h); for (let i = 0; i < H.length; i++) H[i] = mask[i] ? floor + mix[i] * (hmax - floor) : 0
    const shade = new Float32Array(w * h)
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
      const gx = (H[j * w + i + 1] - H[j * w + i - 1]) * pxPerMm / 2 * 4, gy = (H[(j + 1) * w + i] - H[(j - 1) * w + i]) * pxPerMm / 2 * 4
      const nz = 1 / Math.hypot(gx, gy, 1); shade[j * w + i] = mask[j * w + i] ? Math.min(1, Math.max(0, 0.25 + 0.75 * (-gx * 0.5 * nz - gy * 0.6 * nz + 0.62 * nz))) : 0.08
    }
    const shot = (v: Float32Array) => shrink(grey(v, w, h), w, h, T)
    const alphaView = new Float32Array(w * h); for (let i = 0; i < alphaView.length; i++) alphaView[i] = mask[i]
    cells.push([shrink(rgb, w, h, T), shot(alphaView), shot(contour), shot(depth), shot(tone), shot(detail), shot(mix), shot(shade)])
    writeFileSync(join(OUT, `${name}-shade.png`), png(grey(shade, w, h), w, h))
  }
  const cols = cells[0].length, W = cols * T, Hh = cells.length * T, sheet = new Uint8Array(W * Hh * 3).fill(30)
  cells.forEach((row, j) => row.forEach((c, i) => { for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const q = ((j * T + y) * W + i * T + x) * 3, p = (y * c.w + x) * 3; sheet[q] = c.rgb[p]; sheet[q + 1] = c.rgb[p + 1]; sheet[q + 2] = c.rgb[p + 2] } }))
  writeFileSync(join(OUT, 'sheet.png'), png(sheet, W, Hh))
  console.log(`лист ${join(OUT, 'sheet.png')}: оригинал, маска, контур, глубина, локальный контраст, детали (гравировка), смесь ${wC}/${wD}/${wT}, рельеф со светотенью`)
  void existsSync; void levelsN
}
main().catch((e) => { console.error(e); process.exit(1) })
