// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { paperSize } from '../../../geometry/photo/paper'
import type { Pt } from '../../../geometry/photo/homography'
import { grayOfRgb, rectObject, syntheticColorPhoto } from '../../../geometry/photo/synthetic'
import { ImageError } from '../../keychain/decodeImage'
import { insetCorners, usePhotoTrace } from './usePhotoTrace'

const decode = vi.hoisted(() => vi.fn())
// сегментация здесь не проверяется (её тесты в geometry/photo): заглушка не даёт каждому изменению настроек считать лист целиком
const segmentSpy = vi.hoisted(() => vi.fn(() => ({ width: 1, height: 1, scale: 4, labels: new Int32Array(1), silhouettes: [], sensitivity: 0.4, defaultSensitivity: 0.4 })))
vi.mock('../../../geometry/photo/segment', async (orig) => ({ ...(await orig<typeof import('../../../geometry/photo/segment')>()), segment: segmentSpy }))
vi.mock('../../keychain/decodeImage', async (orig) => ({ ...(await orig<typeof import('../../keychain/decodeImage')>()), decodeColorImage: decode }))

const A4P = paperSize('a4', 'portrait')
const W = 800, H = 1000
/** Снимок прямоугольника через настоящую камеру (фокус 1300, наклон 18°, поворот в кадре): четырёхугольник согласован с перспективой. */
function camera(w: number, h: number): Pt[] {
  const a = (18 * Math.PI) / 180, z0 = 0.1
  const pts: [number, number, number][] = [[-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0]]
  return pts.map(([x, y]) => {
    const rx = x * Math.cos(z0) - y * Math.sin(z0), ry = x * Math.sin(z0) + y * Math.cos(z0)
    const py = ry * Math.cos(a), pz = ry * Math.sin(a)
    const d = 600 + pz
    return [W / 2 + (1300 * rx) / d, H / 2 + (1300 * py) / d] as Pt
  })
}
const quad = camera(210, 297)
const decoded = (paper = A4P, q = quad) => {
  const c = syntheticColorPhoto({ paper, quad: q, width: W, height: H, paperRgb: [236, 236, 231], backgroundRgb: [125, 92, 62], noise: 8, objects: [rectObject(40, 60, 40, 20)] })
  return { image: grayOfRgb(c.rgb, W, H), color: { width: W, height: H, rgb: c.rgb }, original: { width: W, height: H }, downscaled: false }
}
const file = () => new File(['x'], 'tools.jpg', { type: 'image/jpeg' })
const diag = Math.hypot(W, H)

describe('автоопределение листа при загрузке (25a 2.2)', () => {
  beforeEach(() => { decode.mockReset(); segmentSpy.mockClear() })

  it('найденный лист: углы на углах листа, формат A4 и книжная ориентация предложены без действий пользователя', async () => {
    decode.mockResolvedValue(decoded())
    const { result } = renderHook(() => usePhotoTrace(0))
    expect(result.current.settings.orientation).toBe('landscape') // умолчание до загрузки
    await act(async () => { await result.current.load(file()) })
    const { corners, preset, orientation } = result.current.settings
    corners.forEach((c, i) => expect(Math.hypot(c[0] - quad[i][0], c[1] - quad[i][1])).toBeLessThan(0.012 * diag))
    expect(preset).toBe('a4')
    expect(orientation).toBe('portrait')
    expect(result.current.detection).toMatchObject({ status: 'auto', preset: 'a4', orientation: 'portrait' })
    expect(result.current.quad).toBe('ok')
    expect(result.current.preview).not.toBeNull() // превью сразу, без задержки
    expect(result.current.rectified).toBeNull() // тяжёлый растр и силуэты — только когда нужны
    expect(result.current.segmentation).toBeNull()
  })

  it('Letter распознаётся и заменяет формат по умолчанию', async () => {
    decode.mockResolvedValue(decoded(paperSize('letter', 'portrait'), camera(215.9, 279.4)))
    const { result } = renderHook(() => usePhotoTrace(0))
    await act(async () => { await result.current.load(file()) })
    expect(result.current.settings.preset).toBe('letter')
    expect(result.current.settings.orientation).toBe('portrait')
  })

  it('изменённые пользователем формат, ориентация и углы остаются: повторного поиска нет', async () => {
    decode.mockResolvedValue(decoded())
    const { result } = renderHook(() => usePhotoTrace(0))
    await act(async () => { await result.current.load(file()) })
    const moved = result.current.settings.corners.map((c) => [c[0] + 5, c[1] - 3] as Pt)
    act(() => result.current.set({ preset: 'custom', orientation: 'landscape', corners: moved }))
    expect(result.current.settings.preset).toBe('custom')
    expect(result.current.settings.orientation).toBe('landscape')
    expect(result.current.settings.corners).toEqual(moved)
  })

  it('лист не найден: стартовые углы с отступом, статус «не удалось», формат и ориентация прежние', async () => {
    const empty = new Uint8Array(W * H * 3)
    for (let i = 0; i < W * H; i++) { empty[i * 3] = 125; empty[i * 3 + 1] = 92; empty[i * 3 + 2] = 62 }
    decode.mockResolvedValue({ image: grayOfRgb(empty, W, H), color: { width: W, height: H, rgb: empty }, original: { width: W, height: H }, downscaled: false })
    const { result } = renderHook(() => usePhotoTrace(0))
    await act(async () => { await result.current.load(file()) })
    expect(result.current.settings.corners).toEqual(insetCorners(W, H))
    expect(result.current.detection).toEqual({ status: 'failed' })
    expect(result.current.settings.preset).toBe('a4')
    expect(result.current.settings.orientation).toBe('landscape')
  })

  it('ошибка чтения не меняет настройки и оставляет статус «нет»', async () => {
    decode.mockImplementation(async () => { throw new ImageError('unsupported', 'bad') })
    const { result } = renderHook(() => usePhotoTrace(0))
    await act(async () => { await result.current.load(file()) })
    expect(result.current.error).toBe('unsupported')
    expect(result.current.detection).toEqual({ status: 'none' })
    expect(result.current.photo).toBeNull()
  })
})

describe('тяжёлый пересчёт только по требованию (перетаскивание углов без фриза)', () => {
  beforeEach(() => { decode.mockReset(); segmentSpy.mockClear() })

  it('пока силуэты не нужны, перемещение углов пересчитывает только лёгкое превью: сегментация не вызывается', async () => {
    decode.mockResolvedValue(decoded())
    const { result } = renderHook(() => usePhotoTrace(0))
    await act(async () => { await result.current.load(file()) })
    const first = result.current.preview!
    expect(first.scale).toBeLessThan(2) // превью мелкое, не 4 пикселя на мм
    expect(first.scale).toBe(1.5) // с нулевой задержкой устоявшееся значение — чёткое превью
    for (let i = 1; i <= 8; i++) act(() => result.current.set({ corners: result.current.settings.corners.map((c, k) => (k === 0 ? ([c[0] + 1, c[1] + 1] as Pt) : c)) }))
    expect(result.current.preview).not.toBe(first)
    expect(result.current.rectified).toBeNull()
    expect(segmentSpy).not.toHaveBeenCalled()
  })

  it('на шаге силуэтов растёт полный растр (4 пикселя на мм) и считаются силуэты один раз, а при выходе всё освобождается', async () => {
    decode.mockResolvedValue(decoded())
    const { result } = renderHook(() => usePhotoTrace(0))
    await act(async () => { await result.current.load(file()) })
    expect(result.current.computing).toBe(false)
    act(() => result.current.needSilhouettes(true))
    expect(result.current.rectified!.scale).toBe(4)
    await waitFor(() => expect(result.current.segmentation).not.toBeNull()) // силуэты считает воркер (в тестах — тут же, но асинхронно)
    expect(segmentSpy).toHaveBeenCalledTimes(1)
    act(() => result.current.needSilhouettes(false))
    expect(result.current.rectified).toBeNull()
    expect(result.current.segmentation).toBeNull()
  })

  it('превью не строится для недопустимых углов (без исключений), полный растр тоже', async () => {
    decode.mockResolvedValue(decoded())
    const { result } = renderHook(() => usePhotoTrace(0))
    await act(async () => { await result.current.load(file()) })
    const c = result.current.settings.corners
    act(() => result.current.set({ corners: [c[0], c[2], c[1], c[3]] })) // «бабочка»
    expect(result.current.quad).toBe('notConvex')
    expect(result.current.preview).toBeNull()
    act(() => result.current.needSilhouettes(true))
    expect(result.current.rectified).toBeNull()
  })
})
