// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { paperSize } from '../../../geometry/photo/paper'
import type { Pt } from '../../../geometry/photo/homography'
import type { Rectified } from '../../../geometry/photo/homography'
import { grayOfRgb, rectObject, syntheticColorPhoto } from '../../../geometry/photo/synthetic'
import { usePhotoTrace } from './usePhotoTrace'

const decode = vi.hoisted(() => vi.fn())
const silhouetteAlpha = vi.hoisted(() => vi.fn())
vi.mock('../../keychain/decodeImage', async (orig) => ({ ...(await orig<typeof import('../../keychain/decodeImage')>()), decodeColorImage: decode }))
vi.mock('../../../ml/service', async (orig) => ({ ...(await orig<typeof import('../../../ml/service')>()), getMlService: () => ({ silhouetteAlpha }) }))
// модель «готова» без настоящих загрузок: хранилище и возможности подменены
vi.mock('../../../ml/useMl', () => ({
  useModelStore: () => ({ status: (id: string) => ({ state: id === 'isnet-general-int8' ? 'ready' : 'absent' }), activeFor: () => undefined }),
  useCapabilities: () => ({ webgpu: false, f16: false }),
}))

const A4P = paperSize('a4', 'portrait')
const W = 800, H = 1000
function camera(w: number, h: number): Pt[] {
  const a = (18 * Math.PI) / 180, z0 = 0.1
  const pts: [number, number, number][] = [[-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0]]
  return pts.map(([x, y]) => {
    const rx = x * Math.cos(z0) - y * Math.sin(z0), ry = x * Math.sin(z0) + y * Math.cos(z0)
    const py = ry * Math.cos(a), pz = ry * Math.sin(a), d = 600 + pz
    return [W / 2 + (1300 * rx) / d, H / 2 + (1300 * py) / d] as Pt
  })
}
const decoded = () => {
  const c = syntheticColorPhoto({ paper: A4P, quad: camera(210, 297), width: W, height: H, paperRgb: [236, 236, 231], backgroundRgb: [125, 92, 62], noise: 8, objects: [rectObject(40, 60, 40, 20)] })
  return { image: grayOfRgb(c.rgb, W, H), color: { width: W, height: H, rgb: c.rgb }, original: { width: W, height: H }, downscaled: false }
}
/** Альфа «сети»: единицы внутри прямоугольника предмета (мм листа 40–80 × 60–80), нули вокруг. */
const alphaFor = (r: Rectified, grow = 0) => {
  const { width: w, height: h } = r.image, a = new Float32Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const x = (i + 0.5) / r.scale, y = (j + 0.5) / r.scale; a[j * w + i] = x >= 40 - grow && x <= 80 + grow && y >= 60 - grow && y <= 80 + grow ? 1 : 0 }
  return a
}

async function ready() {
  decode.mockResolvedValue(decoded())
  const hook = renderHook(() => usePhotoTrace(0))
  await act(async () => { await hook.result.current.load(new File(['x'], 't.jpg')) })
  act(() => hook.result.current.needSilhouettes(true))
  await waitFor(() => expect(hook.result.current.segmentation).not.toBeNull(), { timeout: 15000 })
  return hook
}

describe('usePhotoTrace: движок ИИ (32, 5.1)', () => {
  beforeEach(() => { decode.mockReset(); silhouetteAlpha.mockReset() })

  it('по умолчанию классика, модель не вызывается, активные силуэты — классические', async () => {
    const { result } = await ready()
    expect(result.current.settings.engine).toBe('classic')
    expect(silhouetteAlpha).not.toHaveBeenCalled()
    expect(result.current.active).toBe(result.current.segmentation)
    expect(result.current.aiSegmentation).toBeNull()
    expect(result.current.ai.model?.id).toBe('isnet-general-int8') // готовая и доступная на устройстве без WebGPU
  })

  it('переключение на ИИ само модель не запускает; запуск идёт по кнопке, дальше порог и сглаживание не вызывают модель', async () => {
    const { result } = await ready()
    silhouetteAlpha.mockImplementation(async (_m: unknown, r: Rectified) => alphaFor(r, 1))
    act(() => result.current.set({ engine: 'ai', aiRefine: false })) // без уточнения края размеры зависят от маски сети (с ним край берётся у классики)
    expect(silhouetteAlpha).not.toHaveBeenCalled()
    expect(result.current.active).toBe(result.current.segmentation) // результата ИИ ещё нет
    await act(async () => { await result.current.ai.run() })
    expect(silhouetteAlpha).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.aiSegmentation).not.toBeNull())
    expect(result.current.active).toBe(result.current.aiSegmentation)
    const before = result.current.active!.silhouettes[0].areaMm2
    act(() => result.current.set({ ai: { ...result.current.settings.ai, smooth: 2 } }))
    await waitFor(() => expect(result.current.active!.silhouettes[0].areaMm2).not.toBe(before), { timeout: 10000 })
    expect(silhouetteAlpha).toHaveBeenCalledTimes(1) // кэшированная альфа, модель не перезапущена
  })

  it('ошибка клиента: активной остаётся классика, состояние ошибки задано, повторный запуск возможен', async () => {
    const { result } = await ready()
    silhouetteAlpha.mockRejectedValueOnce(new Error('bad_alloc'))
    act(() => result.current.set({ engine: 'ai' }))
    await act(async () => { await result.current.ai.run() })
    expect(result.current.ai.error).toBe('bad_alloc')
    expect(result.current.active).toBe(result.current.segmentation)
    silhouetteAlpha.mockImplementationOnce(async (_m: unknown, r: Rectified) => alphaFor(r))
    await act(async () => { await result.current.ai.run() })
    expect(result.current.ai.error).toBeNull()
    await waitFor(() => expect(result.current.active).toBe(result.current.aiSegmentation))
  })

  it('при ненулевой задержке покой не вызывает пересчётов: силуэты ИИ не считаются заново сами по себе', async () => {
    decode.mockResolvedValue(decoded())
    const { result } = renderHook(() => usePhotoTrace(40))
    await act(async () => { await result.current.load(new File(['x'], 't.jpg')) })
    act(() => result.current.needSilhouettes(true))
    await waitFor(() => expect(result.current.segmentation).not.toBeNull(), { timeout: 15000 })
    silhouetteAlpha.mockImplementation(async (_m: unknown, r: Rectified) => alphaFor(r))
    act(() => result.current.set({ engine: 'ai' }))
    await act(async () => { await result.current.ai.run() })
    await waitFor(() => expect(result.current.aiSegmentation).not.toBeNull())
    const settled = result.current.aiSegmentation
    await act(async () => { await new Promise((r) => setTimeout(r, 600)) }) // 15 периодов задержки
    expect(result.current.aiSegmentation).toBe(settled) // тот же объект: цикл «таймер → рендер → пересчёт» не работает
  }, 30000)

  it('движок сохраняется, пока жив хук (закрытие и повторное открытие окна), и сбрасывает выбор при смене', async () => {
    const { result, rerender } = await ready()
    act(() => result.current.toggle(1))
    expect(result.current.settings.excluded).toEqual([1])
    act(() => result.current.set({ engine: 'ai' }))
    expect(result.current.settings.excluded).toEqual([])
    rerender()
    expect(result.current.settings.engine).toBe('ai')
  })
})
