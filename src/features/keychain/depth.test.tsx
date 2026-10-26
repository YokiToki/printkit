// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Crop } from '../../geometry/keychain'
import type { GrayImage } from '../../geometry/raster/threshold'
import { MlAbortError } from '../../ml/mlClient'
import { MODELS } from '../../ml/models'
import { cropColor, depthIdOf, placeDepth, runDepth, useDepth } from './depth'
import { openImageStore } from './imageStore'

const MODEL = MODELS.find((m) => m.kind === 'depth')!
const registered: string[] = []
vi.mock('../../app/useModel', () => ({ getModelClient: () => ({ registerDepth: (id: string) => registered.push(id) }) }))
vi.mock('../../ml/service', async (orig) => ({ ...(await orig<typeof import('../../ml/service')>()), getMlService: () => ({}) }))
vi.mock('../../ml/useMl', () => ({
  useModelStore: () => ({ status: (id: string) => ({ state: id === 'depth-v2-small-q4f16' ? 'ready' : 'absent' }), activeFor: () => undefined }),
  useCapabilities: () => ({ webgpu: false, f16: false }),
}))

const full: Crop = { x: 0, y: 0, w: 1, h: 1 }
const image: GrayImage = { width: 8, height: 4, gray: new Uint8Array(32), alpha: null }
const color = { width: 8, height: 4, rgb: Uint8Array.from({ length: 96 }, (_, k) => k) }

describe('глубина: чистые функции (34, 3.2)', () => {
  it('кадр цвета: размеры по долям, содержимое — нужное окно, для широкого и высокого кадра', () => {
    const wide = cropColor(color, { x: 0, y: 0.25, w: 1, h: 0.5 }), tall = cropColor(color, { x: 0.5, y: 0, w: 0.25, h: 1 })
    expect([wide.width, wide.height, tall.width, tall.height]).toEqual([8, 2, 2, 4])
    expect(wide.rgb[0]).toBe(color.rgb[(1 * 8 + 0) * 3]); expect(tall.rgb[0]).toBe(color.rgb[(0 * 8 + 4) * 3])
  })

  it('глубина кладётся в окно на всё изображение без искажений; вне окна значения продолжаются от края', () => {
    const d = Float32Array.from({ length: 4 * 2 }, (_, k) => (k % 4) / 3) // градиент по x в окне 4 × 2
    const m = placeDepth(d, 4, 2, { x: 0.25, y: 0, w: 0.5, h: 1 }, 8, 4) // окно — столбцы 2…5
    expect([m.width, m.height]).toEqual([8, 4])
    expect(m.data[0 * 8 + 1]).toBe(m.data[0 * 8 + 2]) // левее окна — значение левого края окна
    expect(m.data[0 * 8 + 5]).toBeGreaterThan(m.data[0 * 8 + 2]) // внутри окна градиент растёт слева направо
    expect(m.data[0 * 8 + 7]).toBe(m.data[0 * 8 + 5]); expect(m.data[3 * 8 + 3]).toBe(m.data[0 * 8 + 3]) // по y значение не меняется
  })

  it('запуск: сеть получает кадр, результат хранит окно, для которого посчитан', async () => {
    const ml = { depthMap: vi.fn(async (_s: unknown, _r: Uint8Array, w: number, h: number) => new Float32Array(w * h).fill(0.5)) }
    const crop = { x: 0, y: 0, w: 0.5, h: 1 }
    const d = await runDepth(ml, MODEL, color, crop, image)
    expect(ml.depthMap).toHaveBeenCalledWith(MODEL, expect.any(Uint8Array), 4, 4)
    expect(d.crop).toEqual(crop); expect([d.width, d.height]).toEqual([8, 4]); expect(d.data[0]).toBe(128)
  })
})

type Ml = { depthMap: ReturnType<typeof vi.fn<(spec: unknown, rgb: Uint8Array, w: number, h: number) => Promise<Float32Array>>> }
async function setup(opts: { crop?: Crop; ml?: Ml; withColor?: boolean; depthId?: string; depthModel?: string; wanted?: boolean } = {}) {
  const store = await openImageStore(new IDBFactory())
  await store.save('img', image)
  if (opts.withColor !== false) await store.saveColor('img', color)
  const onDepth = vi.fn()
  const ml: Ml = opts.ml ?? { depthMap: vi.fn(async (_s, _r, w, h) => new Float32Array(w * h).fill(1)) }
  const hook = renderHook((p: { crop: Crop }) => useDepth({ imageId: 'img', image, store, crop: p.crop, depthId: opts.depthId ?? '', depthModel: opts.depthModel ?? '', wanted: opts.wanted ?? true, onDepth, ml }), { initialProps: { crop: opts.crop ?? full } })
  return { store, onDepth, ml, hook }
}

describe('useDepth (34, 3.2)', () => {
  beforeEach(() => { registered.length = 0 })

  it('запуск: плоскость сохраняется, регистрируется в воркере и только потом попадает в параметры', async () => {
    const { store, onDepth, hook } = await setup()
    await act(async () => { await hook.result.current.run() })
    const id = depthIdOf('img', MODEL.id)
    expect(registered).toEqual([id]); expect((await store.loadDepth('img', MODEL.id, MODEL.revision))!.data[0]).toBe(255)
    expect(onDepth).toHaveBeenCalledWith({ depthId: id, depthModel: MODEL.id })
    expect(hook.result.current.depth).not.toBeNull(); expect(hook.result.current.staleCrop).toBe(false)
  })

  it('побеждает последний запуск; отмена и вытеснение молчат, остальное показывается', async () => {
    const pending: ((a: Float32Array) => void)[] = []
    const ml: Ml = { depthMap: vi.fn(() => new Promise<Float32Array>((r) => pending.push(r))) }
    const { hook, onDepth } = await setup({ ml })
    let a!: Promise<void>, b!: Promise<void>
    act(() => { a = hook.result.current.run(); b = hook.result.current.run() })
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () => { pending[1](new Float32Array(32).fill(1)); await b })
    await act(async () => { pending[0](new Float32Array(32)); await a })
    expect(onDepth).toHaveBeenCalledTimes(1)
    ml.depthMap.mockRejectedValueOnce(new MlAbortError()); await act(async () => { await hook.result.current.run() }); expect(hook.result.current.error).toBeNull()
    ml.depthMap.mockRejectedValueOnce(new Error('bad_alloc')); await act(async () => { await hook.result.current.run() }); expect(hook.result.current.error).toBe('failed')
  })

  it('смена кадра глубину не стирает, а помечает «для другого кадра»; возврат кадра снимает пометку', async () => {
    const { hook } = await setup()
    await act(async () => { await hook.result.current.run() })
    expect(hook.result.current.staleCrop).toBe(false)
    hook.rerender({ crop: { x: 0.1, y: 0, w: 0.8, h: 1 } })
    expect(hook.result.current.depth).not.toBeNull(); expect(hook.result.current.staleCrop).toBe(true)
    hook.rerender({ crop: full }); expect(hook.result.current.staleCrop).toBe(false)
  })

  it('восстановление после перезагрузки: сеть не вызывается, плоскость регистрируется; потерянная — lost; другая модель не мешает', async () => {
    const store = await openImageStore(new IDBFactory())
    await store.save('img', image)
    await store.saveDepth('img', MODEL.id, MODEL.revision, { width: 8, height: 4, data: new Uint8Array(32).fill(77), crop: full })
    const ml: Ml = { depthMap: vi.fn() }
    const id = depthIdOf('img', MODEL.id)
    const ok = renderHook(() => useDepth({ imageId: 'img', image, store, crop: full, depthId: id, depthModel: MODEL.id, wanted: true, onDepth: vi.fn(), ml }))
    await waitFor(() => expect(ok.result.current.restored).toBe(true))
    expect(registered).toEqual([id]); expect(ok.result.current.depth!.data[0]).toBe(77); expect(ok.result.current.lost).toBe(false); expect(ml.depthMap).not.toHaveBeenCalled()
    const store2 = await openImageStore(new IDBFactory()); await store2.save('img', image)
    const lost = renderHook(() => useDepth({ imageId: 'img', image, store: store2, crop: full, depthId: id, depthModel: MODEL.id, wanted: true, onDepth: vi.fn(), ml }))
    await waitFor(() => expect(lost.result.current.restored).toBe(true))
    expect(lost.result.current.lost).toBe(true)
    const notWanted = renderHook(() => useDepth({ imageId: 'img', image, store: store2, crop: full, depthId: id, depthModel: MODEL.id, wanted: false, onDepth: vi.fn(), ml }))
    await waitFor(() => expect(notWanted.result.current.restored).toBe(true)); expect(notWanted.result.current.lost).toBe(false)
  })

  it('без цвета: noColour; замена изображения уносит глубину, удаление модели — нет', async () => {
    const { hook } = await setup({ withColor: false })
    await act(async () => { await hook.result.current.run() })
    expect(hook.result.current.error).toBe('noColour')
    const store = await openImageStore(new IDBFactory())
    await store.save('a', image); await store.saveDepth('a', MODEL.id, MODEL.revision, { width: 8, height: 4, data: new Uint8Array(32), crop: full })
    expect(await store.loadDepth('a', MODEL.id, MODEL.revision)).toBeDefined() // менеджер моделей хранилище изображений не трогает
    await store.remove('a'); expect(await store.loadDepth('a', MODEL.id, MODEL.revision)).toBeUndefined()
  })
})
