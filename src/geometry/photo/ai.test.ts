import { describe, expect, it } from 'vitest'
import { aiSegmentation } from './ai'
import { rectify, type Rectified } from './homography'
import { paperSize } from './paper'
import { segment } from './segment'
import { loadFixture } from './fixtures/load'
import { loadAlpha, type AiModelId } from './fixtures/ai/load'

const A4 = paperSize('a4', 'portrait')
const MODELS: AiModelId[] = ['birefnet-lite-512-fp32', 'isnet-imgly-fp32']
const rectOf = (name: 'flash' | 'noflash') => { const f = loadFixture(name); return rectify(f.gray, f.corners, A4, f.color.rgb)! }
/** Пустой лист нужного размера для синтетических альф (нужны только размеры и масштаб). */
const blank = (w: number, h: number): Rectified => ({ image: { width: w, height: h, gray: new Uint8Array(w * h), alpha: null }, scale: 4, paper: { width: w / 4, height: h / 4 } })
const rect = (a: Float32Array, w: number, x0: number, y0: number, x1: number, y1: number) => { for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) a[j * w + i] = 1 }

describe('aiSegmentation: сохранённые альфы сетей на фикстурах', () => {
  for (const name of ['flash', 'noflash'] as const) {
    const r = rectOf(name), base = segment(r)
    for (const model of MODELS) {
      it(`${model} / ${name}: три силуэта, размеры в пределах 1,5 мм от классики, ничего в поле у края`, () => {
        const { alpha, width, height } = loadAlpha(model, name)
        expect([width, height]).toEqual([r.image.width, r.image.height])
        const seg = aiSegmentation(r, alpha)
        expect(seg.silhouettes).toHaveLength(3)
        const m = Math.round(3 * seg.scale)
        for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
          if (i < m || j < m || i >= width - m || j >= height - m) expect(seg.labels[j * width + i]).toBe(0)
        }
        // нумерация та же, что у классики (по первому пикселю при обходе строк), поэтому предметы идут в том же порядке
        seg.silhouettes.forEach((s, i) => {
          expect(s.id).toBe(i + 1)
          expect(Math.abs(s.widthMm - base.silhouettes[i].widthMm), `${i + 1} ширина`).toBeLessThanOrEqual(1.5)
          expect(Math.abs(s.heightMm - base.silhouettes[i].heightMm), `${i + 1} высота`).toBeLessThanOrEqual(1.5)
        })
      })
    }
  }

  it('на снимке со вспышкой размеры ближе: в пределах 1 мм от классики', () => {
    const r = rectOf('flash'), base = segment(r)
    for (const model of MODELS) {
      const seg = aiSegmentation(r, loadAlpha(model, 'flash').alpha)
      seg.silhouettes.forEach((s, i) => {
        expect(Math.abs(s.widthMm - base.silhouettes[i].widthMm)).toBeLessThanOrEqual(1)
        expect(Math.abs(s.heightMm - base.silhouettes[i].heightMm)).toBeLessThanOrEqual(1)
      })
    }
  })
})

describe('aiSegmentation: синтетические альфы', () => {
  const w = 400, h = 400

  it('пустая альфа не даёт силуэтов', () => {
    const seg = aiSegmentation(blank(w, h), new Float32Array(w * h))
    expect(seg.silhouettes).toHaveLength(0)
    expect(seg.labels.every((v) => v === 0)).toBe(true)
  })

  it('два соприкасающихся предмета остаются одним силуэтом', () => {
    const a = new Float32Array(w * h)
    rect(a, w, 100, 100, 200, 200); rect(a, w, 200, 120, 300, 220) // общая граница в 80 пикселей
    const seg = aiSegmentation(blank(w, h), a)
    expect(seg.silhouettes).toHaveLength(1)
    expect(seg.silhouettes[0].widthMm).toBeCloseTo(200 / 4, 5)
  })

  it('силуэты нумеруются сверху вниз; мелкие пятна и силуэты у края отбрасываются', () => {
    const a = new Float32Array(w * h)
    rect(a, w, 150, 250, 250, 350)   // нижний
    rect(a, w, 150, 40, 250, 140)    // верхний
    rect(a, w, 20, 200, 24, 204)     // пятно меньше minSpeck
    rect(a, w, 0, 300, 30, 340)      // у края: поле его срезает до остатка меньше minArea
    const seg = aiSegmentation(blank(w, h), a)
    expect(seg.silhouettes.map((s) => s.bbox[1])).toEqual([40, 250])
  })

  it('порог меняет контур, длина альфы проверяется', () => {
    const a = new Float32Array(w * h)
    rect(a, w, 100, 100, 200, 200)
    for (let j = 100; j < 200; j++) for (let i = 90; i < 100; i++) a[j * w + i] = 0.3 // мягкая зона слева
    expect(aiSegmentation(blank(w, h), a, { threshold: 0.5, smooth: 0 }).silhouettes[0].widthMm).toBeCloseTo(25, 5)
    expect(aiSegmentation(blank(w, h), a, { threshold: 0.2, smooth: 0 }).silhouettes[0].widthMm).toBeCloseTo(27.5, 5)
    expect(() => aiSegmentation(blank(w, h), new Float32Array(10))).toThrow()
  })
})

describe('aiSegmentation: настройка маски (порог и сглаживание)', () => {
  const r = rectOf('noflash'), { alpha } = loadAlpha('birefnet-lite-512-fp32', 'noflash')
  const areas = (o: Parameters<typeof aiSegmentation>[2]) => aiSegmentation(r, alpha, o).silhouettes.map((s) => s.areaMm2)
  /** Длина границы в пикселях: число рёбер между пикселем силуэта и не силуэта. */
  const perimeter = (labels: Int32Array, w: number, h: number) => {
    let n = 0
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const v = labels[j * w + i] > 0
      if (i + 1 < w && v !== labels[j * w + i + 1] > 0) n++
      if (j + 1 < h && v !== labels[(j + 1) * w + i] > 0) n++
    }
    return n
  }

  it('порог монотонен: ниже никогда не сжимает силуэт, выше никогда не раздувает', () => {
    const [lo, mid, hi] = [0.3, 0.5, 0.7].map((threshold) => areas({ threshold }))
    expect(lo).toHaveLength(3); expect(mid).toHaveLength(3); expect(hi).toHaveLength(3)
    for (let i = 0; i < 3; i++) { expect(lo[i]).toBeGreaterThanOrEqual(mid[i]); expect(mid[i]).toBeGreaterThanOrEqual(hi[i]) }
  })

  it('сглаживание не удлиняет контур; smooth 0 даёт несглаженный результат, умолчание близко к нему по размерам', () => {
    const raw = aiSegmentation(r, alpha, { smooth: 0 }), smooth = aiSegmentation(r, alpha, { smooth: 1 })
    expect(perimeter(smooth.labels, smooth.width, smooth.height)).toBeLessThanOrEqual(perimeter(raw.labels, raw.width, raw.height))
    const def = aiSegmentation(r, alpha)
    expect(def.silhouettes).toHaveLength(raw.silhouettes.length)
    def.silhouettes.forEach((s, i) => {
      expect(Math.abs(s.widthMm - raw.silhouettes[i].widthMm)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(s.heightMm - raw.silhouettes[i].heightMm)).toBeLessThanOrEqual(0.5)
    })
  })

  it('smooth 0 на жёсткой альфе возвращает ровно исходный прямоугольник', () => {
    const w = 400, h = 400, a = new Float32Array(w * h)
    rect(a, w, 100, 100, 220, 180)
    const s = aiSegmentation(blank(w, h), a, { smooth: 0, close: 0 }).silhouettes[0]
    expect(s.bbox).toEqual([100, 100, 219, 179])
    expect(s.areaMm2).toBeCloseTo(120 * 80 / 16, 5)
  })

  it('тонкая деталь 1 мм исчезает при большом радиусе и остаётся при малом', () => {
    const w = 400, h = 400, a = new Float32Array(w * h)
    rect(a, w, 100, 100, 104, 300) // 4 пикселя = 1 мм шириной, 50 мм длиной
    const tiny = { minSize: 0.5, minArea: 1, close: 0 }
    expect(aiSegmentation(blank(w, h), a, { ...tiny, smooth: 0.3 }).silhouettes).toHaveLength(1)
    expect(aiSegmentation(blank(w, h), a, { ...tiny, smooth: 3 }).silhouettes).toHaveLength(0)
  })
})

describe('aiSegmentation: гибридный край (3.2)', () => {
  const sizeOf = (seg: ReturnType<typeof aiSegmentation>, i: number) => seg.silhouettes[i]
  for (const name of ['flash', 'noflash'] as const) {
    it(`${name}: размеры в пределах 0,5 мм от классики (без вспышки 1 мм); IoU ≥ 0,97 (без вспышки ≥ 0,94, а у плоскогубцев ≥ 0,6: классика там захватывает тень, см. design.md)`, () => {
      const r = rectOf(name), base = segment(r)
      for (const model of ['birefnet-lite-512-fp32', 'isnet-imgly-fp32'] as const) {
        const seg = aiSegmentation(r, loadAlpha(model, name).alpha)
        expect(seg.silhouettes).toHaveLength(3)
        seg.silhouettes.forEach((s, i) => {
          const tol = name === 'noflash' ? 1.0 : 0.5 // без вспышки классика сама неточна (тень, до ~1 мм), там допуск 1 мм
          expect(Math.abs(s.widthMm - base.silhouettes[i].widthMm), `${model} #${i + 1} ширина`).toBeLessThanOrEqual(tol)
          expect(Math.abs(s.heightMm - base.silhouettes[i].heightMm), `${model} #${i + 1} высота`).toBeLessThanOrEqual(tol)
          let inter = 0
          for (let k = 0; k < seg.labels.length; k++) if (seg.labels[k] === s.id && base.labels[k] === i + 1) inter++
          const px = 1 / (seg.scale * seg.scale), iou = (inter * px) / (s.areaMm2 + base.silhouettes[i].areaMm2 - inter * px)
          expect(iou, `${model} #${i + 1} IoU`).toBeGreaterThanOrEqual(name === 'noflash' ? (i === 0 ? 0.6 : 0.94) : 0.97)
        })
      }
    })
  }

  /** Лист A4 с одним тёмным прямоугольником; цвет задан, поэтому гибридный край работает. */
  const scene = (x: number, y: number, w: number, h: number): Rectified => {
    const scale = 4, W = Math.round(A4.width * scale), H = Math.round(A4.height * scale), rgb = new Uint8Array(W * H * 3), gray = new Uint8Array(W * H)
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const px = (i + 0.5) / scale, py = (j + 0.5) / scale, v = px >= x && px <= x + w && py >= y && py <= y + h ? 50 : 235
      for (let c = 0; c < 3; c++) rgb[(j * W + i) * 3 + c] = v
      gray[j * W + i] = v
    }
    return { image: { width: W, height: H, gray, alpha: null }, rgb, scale, paper: A4 }
  }
  const alphaRect = (r: Rectified, x: number, y: number, w: number, h: number) => {
    const { width: W, height: H } = r.image, a = new Float32Array(W * H)
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const px = (i + 0.5) / r.scale, py = (j + 0.5) / r.scale; a[j * W + i] = px >= x && px <= x + w && py >= y && py <= y + h ? 1 : 0 }
    return a
  }

  it('прямоугольник 40 × 20 мм с «раздутой» маской на 1 мм со всех сторон измеряется 40 × 20 мм с точностью 0,5 мм', () => {
    const r = scene(60, 60, 40, 20), puffy = alphaRect(r, 59, 59, 42, 22)
    const raw = aiSegmentation(r, puffy, { refine: false, smooth: 0 }).silhouettes[0]
    expect(raw.widthMm).toBeGreaterThan(41.5) // без уточнения маска остаётся раздутой
    const s = aiSegmentation(r, puffy, { smooth: 0 }).silhouettes[0]
    expect(Math.abs(s.widthMm - 40)).toBeLessThanOrEqual(0.5); expect(Math.abs(s.heightMm - 20)).toBeLessThanOrEqual(0.5)
  })

  it('тёмная деталь, слитая с «тенью»: где классика края не видит, остаётся край сети, предмет не рвётся', () => {
    // предмет до x = 110, сеть остановилась на 108: полоса вокруг её края целиком «предмет», классика ничего не различает
    const r = scene(60, 60, 50, 20), a = alphaRect(r, 60, 60, 48, 20)
    const out = aiSegmentation(r, a, { smooth: 0 })
    expect(out.silhouettes).toHaveLength(1)
    expect(Math.abs(out.silhouettes[0].widthMm - 48)).toBeLessThanOrEqual(0.5)
  })

  it('refine: false возвращает маску сети без уточнения', () => {
    const r = scene(60, 60, 40, 20), puffy = alphaRect(r, 58, 58, 44, 24)
    const raw = aiSegmentation(r, puffy, { refine: false, smooth: 0 }), noRgb = aiSegmentation({ ...r, rgb: undefined }, puffy, { smooth: 0 })
    expect(raw.silhouettes[0].areaMm2).toBeCloseTo(noRgb.silhouettes[0].areaMm2, 5)
    expect(raw.silhouettes[0].widthMm).toBeCloseTo(44, 0)
  })
})
