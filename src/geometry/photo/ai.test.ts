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
    expect(aiSegmentation(blank(w, h), a, { threshold: 0.5 }).silhouettes[0].widthMm).toBeCloseTo(25, 5)
    expect(aiSegmentation(blank(w, h), a, { threshold: 0.2 }).silhouettes[0].widthMm).toBeCloseTo(27.5, 5)
    expect(() => aiSegmentation(blank(w, h), new Float32Array(10))).toThrow()
  })
})
