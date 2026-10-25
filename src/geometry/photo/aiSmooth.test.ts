import { describe, expect, it } from 'vitest'
import { aiSegmentation } from './ai'
import { traceAiSilhouette } from './aiOutline'
import { refineObjects, REFINE_MARGIN, type Matte } from './aiRefine'
import { fitToSquare, resampleOutput } from './aiResample'
import { rectify, type Pt, type Rectified } from './homography'
import { traceSilhouette } from './outline'
import { roughness, smoothOutline } from './outlineSmooth'
import { paperSize } from './paper'
import { segment, type Segmentation } from './segment'
import { loadFixture } from './fixtures/load'
import { loadAlpha } from './fixtures/ai/load'

const A4 = paperSize('a4', 'portrait')
const rectOf = (name: 'flash' | 'noflash') => { const f = loadFixture(name); return rectify(f.gray, f.corners, A4, f.color.rgb)! }
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
const roughOf = (seg: Segmentation, trace: typeof traceSilhouette) => mean(seg.silhouettes.map((s) => roughness(trace(seg, s.id, A4)!.points)))

describe('шероховатость контура: ИИ против классики (3.1b)', () => {
  for (const name of ['flash', 'noflash'] as const) {
    it(`${name}: контур ИИ не грубее классического больше чем на 25 %`, () => {
      const r = rectOf(name), classic = roughOf(segment(r), traceSilhouette)
      const ai = roughOf(aiSegmentation(r, loadAlpha('birefnet-lite-512-fp32', name).alpha), traceAiSilhouette)
      expect(classic).toBeGreaterThan(0)
      expect(ai).toBeLessThanOrEqual(classic * 1.25)
    })
  }

  it('бикубическое растяжение выхода сети не грубее билинейного (замер: на этих альфах разницы по шероховатости нет, см. design.md)', () => {
    const r = rectOf('flash'), { alpha } = loadAlpha('birefnet-lite-512-fp32', 'flash')
    // то, что отдаёт сеть: 512 × 512 с резким краем (сохранённая альфа уже растянута и размыта, поэтому её контраст поднимается)
    const sharp = alpha.map((v) => Math.min(1, Math.max(0, (v - 0.5) * 6 + 0.5)))
    const net = fitToSquare(sharp, r.image.width, r.image.height, 512)
    const rough = (mode: 'cubic' | 'linear') => roughOf(aiSegmentation(r, resampleOutput(net, 512, r.image.width, r.image.height, mode), { smooth: 0 }), traceSilhouette)
    expect(rough('cubic')).toBeLessThanOrEqual(rough('linear') * 1.1)
  })
})

describe('smoothOutline: углы сохраняются', () => {
  it('кончик острия сдвигается не больше чем на 0,3 мм, шум на сторонах убирается', () => {
    // прямоугольник 20 × 10 с острием вверх: основание 6 мм, высота 12 мм, кончик (10, -12); шум по нижней стороне
    const pts: Pt[] = [[0, 0], [7, 0], [10, -12], [13, 0], [20, 0], [20, 10]]
    for (let x = 19; x >= 1; x--) pts.push([x, 10 + (x % 2 ? 0.12 : -0.12)])
    pts.push([0, 10])
    const out = smoothOutline(pts, 0.25)
    const tip = out.reduce((b, p) => (p[1] < b[1] ? p : b))
    expect(Math.hypot(tip[0] - 10, tip[1] + 12)).toBeLessThanOrEqual(0.3)
    expect(roughness(out, 1.5)).toBeLessThan(roughness(pts, 1.5))
  })

  it('без углов и с нулевым радиусом контур не меняется или остаётся близким', () => {
    const circle: Pt[] = Array.from({ length: 200 }, (_, i) => [20 * Math.cos((i / 200) * 2 * Math.PI), 20 * Math.sin((i / 200) * 2 * Math.PI)])
    expect(smoothOutline(circle, 0)).toBe(circle)
    const s = smoothOutline(circle, 0.25)
    for (const [x, y] of s) expect(Math.abs(Math.hypot(x, y) - 20)).toBeLessThan(0.05)
  })
})

describe('refineObjects: второй проход', () => {
  const r = rectOf('flash'), { alpha } = loadAlpha('birefnet-lite-512-fp32', 'flash'), W = r.image.width
  const calls: { w: number; h: number }[] = []
  /** Подставная «сеть»: отдаёт то, что уже есть в общей альфе для этого кропа (в кроп попадает ровно его область). */
  const matteFrom = (full: Float32Array): Matte => async (rgb, w, h) => {
    calls.push({ w, h })
    // позицию кропа восстанавливаем по размеру и порядку вызовов: предметы идут в порядке нумерации
    const s = aiSegmentation(r, full).silhouettes[calls.length - 1], pad = Math.round(REFINE_MARGIN * r.scale)
    const x0 = Math.max(0, s.bbox[0] - pad), y0 = Math.max(0, s.bbox[1] - pad), out = new Float32Array(w * h)
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out[j * w + i] = full[(y0 + j) * W + x0 + i]
    return out
  }

  it('сеть вызывается по разу на предмет с кропом bbox + 12 мм, вне кропов альфа не меняется, шерохватость не растёт', async () => {
    calls.length = 0
    const progress: number[] = []
    const out = await refineObjects(r, alpha, matteFrom(alpha), {}, (d) => progress.push(d))
    expect(calls).toHaveLength(3); expect(progress).toEqual([1, 2, 3])
    const seg = aiSegmentation(r, alpha), pad = Math.round(REFINE_MARGIN * r.scale)
    seg.silhouettes.forEach((s, i) => {
      expect(calls[i].w).toBe(Math.min(r.image.width - 1, s.bbox[2] + pad) - Math.max(0, s.bbox[0] - pad) + 1)
      expect(calls[i].h).toBe(Math.min(r.image.height - 1, s.bbox[3] + pad) - Math.max(0, s.bbox[1] - pad) + 1)
    })
    // подставная сеть отдаёт прежние значения, значит смесь не должна ничего менять (нет швов на краю рамки)
    let maxDiff = 0
    for (let k = 0; k < out.length; k++) maxDiff = Math.max(maxDiff, Math.abs(out[k] - alpha[k]))
    expect(maxDiff).toBeLessThan(1e-6)
    expect(roughOf(aiSegmentation(r, out), traceAiSilhouette)).toBeLessThanOrEqual(roughOf(aiSegmentation(r, alpha), traceAiSilhouette) * 1.001)
  })

  it('результат сети вмешивается внутри рамки и плавно сходит на нет к её краю', async () => {
    const seg = aiSegmentation(r, alpha), s = seg.silhouettes[0], pad = Math.round(REFINE_MARGIN * r.scale)
    const x0 = Math.max(0, s.bbox[0] - pad), y0 = Math.max(0, s.bbox[1] - pad)
    const ones: Matte = async (_rgb, w, h) => new Float32Array(w * h).fill(1)
    const only = { ...r } // один предмет: остальные не трогаем, подменив список
    const out = await refineObjects(only, alpha, async (rgb, w, h) => ones(rgb, w, h))
    const inner = (s.bbox[0] + s.bbox[2]) >> 1, innerY = (s.bbox[1] + s.bbox[3]) >> 1
    expect(out[innerY * W + inner]).toBeCloseTo(1, 5)       // внутри рамки — ответ второго прохода
    expect(out[y0 * W + x0]).toBeCloseTo(alpha[y0 * W + x0], 5) // угол рамки — общий проход
  })

  it('без цвета листа второй проход ничего не делает', async () => {
    const gray: Rectified = { ...r, rgb: undefined }
    expect(await refineObjects(gray, alpha, async () => { throw new Error('не должна вызываться') })).toBe(alpha)
  })
})
