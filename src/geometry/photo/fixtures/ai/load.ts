import { unzlibSync } from 'fflate'

// Как в ../load.ts: типов Node в проекте нет, файл читается через встроенный модуль
type NodeFs = { readFileSync(path: URL): Uint8Array }
const fs = (globalThis as unknown as { process: { getBuiltinModule(id: 'node:fs'): NodeFs } }).process.getBuiltinModule('node:fs')

export type AiModelId = 'birefnet-lite-512-fp32' | 'isnet-imgly-fp32' | 'isnet-general-q' | 'u2netp' | 'ormbg-int8'

/** Альфа сети для фикстуры (`scripts/eval-photo-ai.ts`): серый PNG 8 бит, 0…1, размер выпрямленного листа, строки подряд. */
export function loadAlpha(model: AiModelId, fixture: 'flash' | 'noflash'): { alpha: Float32Array; width: number; height: number } {
  const png = fs.readFileSync(new URL(`./${model}-${fixture}.png`, import.meta.url))
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const width = dv.getUint32(16), height = dv.getUint32(20)
  const idat: Uint8Array[] = []
  for (let o = 8; o < png.length;) {
    const len = dv.getUint32(o), type = String.fromCharCode(png[o + 4], png[o + 5], png[o + 6], png[o + 7])
    if (type === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len))
    o += 12 + len
  }
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of idat) { joined.set(c, at); at += c.length }
  const raw = unzlibSync(joined), alpha = new Float32Array(width * height)
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) alpha[j * width + i] = raw[j * (width + 1) + 1 + i] / 255 // фильтр строки всегда 0
  return { alpha, width, height }
}
