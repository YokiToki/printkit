/**
 * Проверка нейросетей на картинках для брелка (change 33, задача 1.1): вся картинка (пропорции сохранены, поля — среднее модели),
 * без листа и без классической «страховки». Не входит в сборку, CI не запускает.
 *
 *   npx tsx scripts/eval-keychain-ai.ts [--models id,id] [--dir tmp/ai/models] [--out tmp/ai/keychain]
 *
 * Печатает на картинку и модель: время, долю площади, число объектов крупнее 1 % кадра, долю маски у края кадра и размер самого
 * крупного объекта; пишет серые маски и контактный лист `sheet.png` (оригинал и маски рядом) для просмотра глазами.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decode } from 'jpeg-js'
import { zlibSync } from 'fflate'
import { labelComponents } from '../src/geometry/raster/components'
import { fromOutput, toInput } from '../src/ml/prepost'
import { CANDIDATES } from '../poc/ai/models'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? undefined : process.argv[i + 1] }
const models = (arg('models')?.split(',') ?? ['birefnet-lite-512-fp32', 'isnet-imgly-fp32', 'isnet-general-q', 'u2netp', 'ormbg-int8']).map((id) => CANDIDATES.find((c) => c.id === id)!)
const DIR = resolve(ROOT, arg('dir') ?? 'tmp/ai/models'), OUT = resolve(ROOT, arg('out') ?? 'tmp/ai/keychain')
const PICS = (arg('pics')?.split(',') ?? ['cat', 'cat_face', 'check', 'ring']).map((n) => ({ name: n, path: join(ROOT, `poc/ai/samples/${n}.jpeg`) }))
const CAP = 2048 // длинная сторона для вывода: картинка меньше не увеличивается

const CRCT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRCT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function pngRgb(rgb: Uint8Array, w: number, h: number): Uint8Array {
  const raw = new Uint8Array((w * 3 + 1) * h)
  for (let j = 0; j < h; j++) raw.set(rgb.subarray(j * w * 3, (j + 1) * w * 3), j * (w * 3 + 1) + 1)
  const chunk = (type: string, data: Uint8Array) => { const o = new Uint8Array(12 + data.length), dv = new DataView(o.buffer); dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) o[4 + i] = type.charCodeAt(i); o.set(data, 8); dv.setUint32(8 + data.length, crc(o.subarray(4, 8 + data.length))); return o }
  const ih = new Uint8Array(13), dv = new DataView(ih.buffer); dv.setUint32(0, w); dv.setUint32(4, h); ih[8] = 8; ih[9] = 2
  const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', ih), chunk('IDAT', zlibSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out
}

/** Уменьшение RGB усреднением до длинной стороны side (для вывода и листа). */
function shrink(rgb: Uint8Array, w: number, h: number, side: number): { rgb: Uint8Array; w: number; h: number } {
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
  mkdirSync(OUT, { recursive: true })
  const T = 240 // сторона ячейки листа
  const cells: { rgb: Uint8Array; w: number; h: number }[][] = []
  console.log(['картинка', 'модель', 'с', 'площадь %', 'объектов>1%', 'у края %', 'главный % площади'].join(' | '))
  for (const pic of PICS) {
    const img = decode(readFileSync(pic.path), { useTArray: true, formatAsRGBA: true })
    const full = new Uint8Array(img.width * img.height * 3)
    for (let i = 0; i < img.width * img.height; i++) { full[i * 3] = img.data[i * 4]; full[i * 3 + 1] = img.data[i * 4 + 1]; full[i * 3 + 2] = img.data[i * 4 + 2] }
    const inf = shrink(full, img.width, img.height, CAP)
    const row = [shrink(inf.rgb, inf.w, inf.h, T)]
    for (const c of models) {
      const path = join(DIR, `${c.id}.onnx`)
      if (!existsSync(path)) { console.warn(`${c.id}: нет весов`); row.push({ rgb: new Uint8Array(3), w: 1, h: 1 }); continue }
      const s = await ort.InferenceSession.create(path, { executionProviders: ['cpu'] })
      const t0 = performance.now()
      const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', toInput(inf.rgb, inf.w, inf.h, c), [1, 3, c.size, c.size]) })
      const sec = (performance.now() - t0) / 1000
      const alpha = fromOutput(out[s.outputNames[0]].data as Float32Array, c, inf.w, inf.h)
      const mask = new Uint8Array(alpha.length); let on = 0, edge = 0
      for (let k = 0; k < mask.length; k++) { if (alpha[k] >= 0.5) { mask[k] = 1; on++ } }
      for (let j = 0; j < inf.h; j++) for (let i = 0; i < inf.w; i++) if (mask[j * inf.w + i] && (i < 3 || j < 3 || i >= inf.w - 3 || j >= inf.h - 3)) edge++
      const comps = labelComponents(mask, inf.w, inf.h, 1), total = inf.w * inf.h
      const big = comps.sizes.slice(1).filter((n) => n > total * 0.01)
      console.log([pic.name, c.id, sec.toFixed(1), ((on / total) * 100).toFixed(0), big.length, ((edge / Math.max(1, on)) * 100).toFixed(1), ((Math.max(0, ...comps.sizes.slice(1)) / total) * 100).toFixed(0)].join(' | '))
      const g = new Uint8Array(alpha.length * 3); for (let k = 0; k < alpha.length; k++) { const v = Math.round(alpha[k] * 255); g[k * 3] = v; g[k * 3 + 1] = v; g[k * 3 + 2] = v }
      writeFileSync(join(OUT, `${pic.name}-${c.id}.png`), pngRgb(g, inf.w, inf.h))
      row.push(shrink(g, inf.w, inf.h, T))
    }
    cells.push(row)
  }
  const cols = models.length + 1, W = cols * T, H = cells.length * T, sheet = new Uint8Array(W * H * 3).fill(40)
  cells.forEach((row, j) => row.forEach((c, i) => { for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const q = ((j * T + y) * W + i * T + x) * 3, p = (y * c.w + x) * 3; sheet[q] = c.rgb[p]; sheet[q + 1] = c.rgb[p + 1]; sheet[q + 2] = c.rgb[p + 2] } }))
  writeFileSync(join(OUT, 'sheet.png'), pngRgb(sheet, W, H))
  console.log(`лист: ${join(OUT, 'sheet.png')}; столбцы: оригинал, ${models.map((m) => m.id).join(', ')}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
