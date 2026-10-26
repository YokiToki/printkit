// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { defaultAiSilhouette, type AiSilhouetteParams, type Matte } from '../../geometry/keychain'
import type { GrayImage } from '../../geometry/raster/threshold'
import { MlAbortError } from '../../ml/mlClient'
import { MODELS } from '../../ml/models'
import { MlUnavailableError } from '../../ml/service'
import { openImageStore, type ImageStore } from './imageStore'
import { matteIdOf, useMatte } from './matte'

const MODEL = MODELS[2] // ISNet general int8
const registered: string[] = []
vi.mock('../../app/useModel', () => ({ getModelClient: () => ({ registerMatte: (id: string) => registered.push(id) }) }))
vi.mock('../../ml/service', async (orig) => ({ ...(await orig<typeof import('../../ml/service')>()), getMlService: () => ({}) }))
vi.mock('../../ml/useMl', () => ({
  useModelStore: () => ({ status: (id: string) => ({ state: id === 'isnet-general-int8' ? 'ready' : 'absent' }), activeFor: () => undefined }),
  useCapabilities: () => ({ webgpu: false, f16: false }),
}))

const image: GrayImage = { width: 4, height: 2, gray: new Uint8Array(8), alpha: null }
const color = { width: 4, height: 2, rgb: new Uint8Array(24) }
const stored = (v: number): Matte => ({ width: 4, height: 2, data: new Uint8Array(8).fill(v) })

type Ml = { matteAlpha: ReturnType<typeof vi.fn<(spec: unknown, rgb: Uint8Array, w: number, h: number) => Promise<Float32Array>>> }
async function setup(opts: { ai?: AiSilhouetteParams; ml?: Ml; withColor?: boolean } = {}) {
  const store: ImageStore = await openImageStore(null)
  await store.save('img', image)
  if (opts.withColor !== false) await store.saveColor('img', color)
  const onAi = vi.fn()
  const ml: Ml = opts.ml ?? { matteAlpha: vi.fn(async () => new Float32Array(8).fill(1)) }
  const hook = renderHook((p: { ai: AiSilhouetteParams }) => useMatte({ imageId: 'img', image, store, ai: p.ai, source: p.ai.matteId ? 'ai' : 'brightness', onAi, ml }), { initialProps: { ai: opts.ai ?? defaultAiSilhouette } })
  return { store, onAi, ml, hook }
}

describe('useMatte (33, 3.2)', () => {
  beforeEach(() => { registered.length = 0 })

  it('запуск: альфа сохраняется, регистрируется в воркере и только потом попадает в параметры', async () => {
    const { store, onAi, ml, hook } = await setup()
    await act(async () => { await hook.result.current.run() })
    expect(ml.matteAlpha).toHaveBeenCalledTimes(1)
    const id = matteIdOf('img', MODEL.id)
    expect(registered).toEqual([id])
    expect((await store.loadMatte('img', MODEL.id, MODEL.revision))!.data[0]).toBe(255)
    expect(onAi).toHaveBeenCalledWith(expect.objectContaining({ model: MODEL.id, matteId: id, threshold: MODEL.maskDefaults.threshold }))
    expect(hook.result.current.running).toBe(false); expect(hook.result.current.matte).not.toBeNull()
  })

  it('без цветной копии запуск сообщает noColour и сеть не вызывается', async () => {
    const { ml, hook, onAi } = await setup({ withColor: false })
    await act(async () => { await hook.result.current.run() })
    expect(hook.result.current.error).toBe('noColour'); expect(ml.matteAlpha).not.toHaveBeenCalled(); expect(onAi).not.toHaveBeenCalled()
  })

  it('ошибки: отмена и вытеснение молчат, остальное показывается; побеждает последний запуск', async () => {
    const calls: ((a: Float32Array) => void)[] = []
    const ml: Ml = { matteAlpha: vi.fn(() => new Promise<Float32Array>((r) => calls.push(r))) }
    const { hook, onAi } = await setup({ ml })
    let first!: Promise<void>, second!: Promise<void>
    act(() => { first = hook.result.current.run(); second = hook.result.current.run() })
    await waitFor(() => expect(calls).toHaveLength(2))
    await act(async () => { calls[1](new Float32Array(8).fill(1)); await second })
    await act(async () => { calls[0](new Float32Array(8)); await first }) // опоздавший старый результат
    expect(onAi).toHaveBeenCalledTimes(1); expect(hook.result.current.matte!.data[0]).toBe(255)
    ml.matteAlpha.mockRejectedValueOnce(new MlAbortError())
    await act(async () => { await hook.result.current.run() })
    expect(hook.result.current.error).toBeNull()
    ml.matteAlpha.mockRejectedValueOnce(new MlUnavailableError('noModel'))
    await act(async () => { await hook.result.current.run() })
    expect(hook.result.current.error).toBe('noModel')
    ml.matteAlpha.mockRejectedValueOnce(new Error('bad_alloc'))
    await act(async () => { await hook.result.current.run() })
    expect(hook.result.current.error).toBe('failed')
  })

  it('восстановление после перезагрузки: сохранённая альфа регистрируется без запуска сети', async () => {
    const store = await openImageStore(null); await store.save('img', image); await store.saveMatte('img', MODEL.id, MODEL.revision, stored(77))
    const ml: Ml = { matteAlpha: vi.fn(async () => new Float32Array(8)) }
    const ai = { ...defaultAiSilhouette, model: MODEL.id, matteId: matteIdOf('img', MODEL.id) }
    const { result } = renderHook(() => useMatte({ imageId: 'img', image, store, ai, source: 'ai', onAi: vi.fn(), ml }))
    await waitFor(() => expect(result.current.restored).toBe(true))
    expect(registered).toEqual([ai.matteId]); expect(result.current.matte!.data[0]).toBe(77); expect(result.current.lost).toBe(false)
    expect(ml.matteAlpha).not.toHaveBeenCalled()
  })

  it('альфа потеряна (хранилище очищено): lost, сети не вызывает, в воркер ничего не регистрируется', async () => {
    const store = await openImageStore(null); await store.save('img', image)
    const ai = { ...defaultAiSilhouette, model: MODEL.id, matteId: matteIdOf('img', MODEL.id) }
    const { result } = renderHook(() => useMatte({ imageId: 'img', image, store, ai, source: 'ai', onAi: vi.fn(), ml: { matteAlpha: vi.fn(async () => new Float32Array(8)) } }))
    await waitFor(() => expect(result.current.restored).toBe(true))
    expect(result.current.lost).toBe(true); expect(result.current.matte).toBeNull(); expect(registered).toEqual([])
  })

  it('выбор другой модели альфу не стирает: прежняя остаётся до нового запуска', async () => {
    const store = await openImageStore(null); await store.save('img', image); await store.saveMatte('img', 'birefnet-lite-512-fp16', MODELS[0].revision, stored(5))
    const ai = { ...defaultAiSilhouette, model: 'birefnet-lite-512-fp16', matteId: matteIdOf('img', 'birefnet-lite-512-fp16') }
    const { result } = renderHook(() => useMatte({ imageId: 'img', image, store, ai, source: 'ai', onAi: vi.fn(), ml: { matteAlpha: vi.fn(async () => new Float32Array(8)) } }))
    await waitFor(() => expect(result.current.matte).not.toBeNull())
    expect(result.current.model?.id).toBe(MODEL.id) // рабочая модель — другая (готова только ISNet int8)
    expect(result.current.matteModel).toBe('birefnet-lite-512-fp16')
  })
})
