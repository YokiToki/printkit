/** Запуск моделей PoC: загрузка (Cache API), сессии ORT Web, подготовка входа и разворот выхода. Не зависит от страницы. */
import * as ort from 'onnxruntime-web'
import type { Candidate } from './models'

ort.env.wasm.proxy = true // вывод в воркере ORT: страница не замирает
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@' + (ort.env.versions?.web ?? 'latest') + '/dist/'

const sessions = new Map<string, ort.InferenceSession>()
export type Log = (s: string) => void

async function fetchUrl(url: string, bytes: number, log: Log): Promise<ArrayBuffer> {
  const cache = await caches.open('poc-ai-models')
  let r = await cache.match(url)
  const t0 = performance.now()
  if (!r) {
    const net = await fetch(url)
    if (!net.ok) throw new Error(`HTTP ${net.status} for ${url}`)
    await cache.put(url, net.clone()); r = net
    log(`скачано ${(bytes / 1e6).toFixed(0)} МБ за ${((performance.now() - t0) / 1000).toFixed(1)} с`)
  }
  const buf = await r.arrayBuffer()
  if (buf.byteLength !== bytes) log(`ВНИМАНИЕ: размер ${buf.byteLength} ≠ ${bytes}`)
  return buf
}

async function session(c: Candidate, ep: string, threads: number, log: Log): Promise<ort.InferenceSession> {
  const key = `${c.id}|${ep}|${threads}`
  let s = sessions.get(key)
  if (s) return s
  const buf = await fetchUrl(c.url, c.bytes, log)
  const externalData = c.data ? [{ path: c.data.path, data: new Uint8Array(await fetchUrl(c.data.url, c.data.bytes, log)) }] : undefined
  ort.env.wasm.numThreads = threads
  const t = performance.now()
  s = await ort.InferenceSession.create(buf, { executionProviders: [ep], graphOptimizationLevel: 'all', ...(externalData ? { externalData } : {}) })
  log(`сессия ${c.id} (${ep}) за ${(performance.now() - t).toFixed(0)} мс`)
  sessions.set(key, s)
  return s
}

/** Вход NCHW float32: картинка вписывается в s × s с сохранением пропорций, поля — среднее модели. */
function toInput(rgb: Uint8Array, w: number, h: number, c: Candidate, s: number): Float32Array {
  const src = new ImageData(w, h)
  for (let i = 0; i < w * h; i++) { src.data[i * 4] = rgb[i * 3]; src.data[i * 4 + 1] = rgb[i * 3 + 1]; src.data[i * 4 + 2] = rgb[i * 3 + 2]; src.data[i * 4 + 3] = 255 }
  const a = document.createElement('canvas'); a.width = w; a.height = h; a.getContext('2d')!.putImageData(src, 0, 0)
  const b = document.createElement('canvas'); b.width = s; b.height = s
  const g = b.getContext('2d')!; g.imageSmoothingQuality = 'high'
  g.fillStyle = `rgb(${c.mean.map((m) => Math.round(m * 255)).join(',')})`; g.fillRect(0, 0, s, s)
  const r = Math.min(s / w, s / h); g.drawImage(a, (s - w * r) / 2, (s - h * r) / 2, w * r, h * r)
  const d = g.getImageData(0, 0, s, s).data
  const out = new Float32Array(3 * s * s)
  for (let i = 0; i < s * s; i++) for (let k = 0; k < 3; k++) out[k * s * s + i] = (d[i * 4 + k] / 255 - c.mean[k]) / c.std[k]
  return out
}

/** Бикубическая (Катмулл–Ром) интерполяция плоскости: гладкая изолиния при растяжении, без «ступеней» билинейной сетки. */
export function cubicSample(v: Float32Array, w: number, h: number, x: number, y: number): number {
  x -= 0.5; y -= 0.5
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0
  const wgt = (t: number) => [(-t * t * t + 2 * t * t - t) / 2, (3 * t * t * t - 5 * t * t + 2) / 2, (-3 * t * t * t + 4 * t * t + t) / 2, (t * t * t - t * t) / 2]
  const wx = wgt(tx), wy = wgt(ty); let acc = 0
  for (let j = 0; j < 4; j++) {
    const yy = Math.min(h - 1, Math.max(0, y0 - 1 + j)); let row = 0
    for (let i = 0; i < 4; i++) row += wx[i] * v[yy * w + Math.min(w - 1, Math.max(0, x0 - 1 + i))]
    acc += wy[j] * row
  }
  return acc
}

/** Выход s × s → плоскость w × h (бикубически, поля вписывания отброшены), значения 0…1. */
function fromOutput(v: Float32Array, s: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h), r = Math.min(s / w, s / h), ox = (s - w * r) / 2, oy = (s - h * r) / 2
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out[j * w + i] = Math.min(1, Math.max(0, cubicSample(v, s, s, (i + 0.5) * r + ox, (j + 0.5) * r + oy)))
  return out
}

/** Прогон модели на картинке rgb (w × h). matte → альфа 0…1, depth → глубина 0…1 по 2–98 перцентилям (ближе = больше). */
export async function infer(c: Candidate, ep: string, threads: number, rgb: Uint8Array, w: number, h: number, log: Log): Promise<{ plane: Float32Array; ms: number }> {
  const sess = await session(c, ep, threads, log)
  const s = c.size, data = toInput(rgb, w, h, c, s)
  const t = performance.now()
  const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, s, s]) })
  const ms = performance.now() - t
  let o = out[sess.outputNames[0]].data as Float32Array
  if (c.kind === 'depth') {
    const sorted = Float32Array.from(o).sort(), lo = sorted[Math.floor(sorted.length * 0.02)], hi = sorted[Math.floor(sorted.length * 0.98)]
    o = o.map((x) => Math.min(1, Math.max(0, (x - lo) / (hi - lo || 1))))
  } else {
    let lo = Infinity, hi = -Infinity; for (const x of o) { if (x < lo) lo = x; if (x > hi) hi = x }
    if (c.sigmoid || lo < -0.001 || hi > 1.001) o = o.map((x) => 1 / (1 + Math.exp(-x)))
  }
  // выход может быть не s × s (некоторые модели): определяем сторону по длине
  const side = Math.round(Math.sqrt(o.length))
  return { plane: fromOutput(o, side, w, h), ms }
}
