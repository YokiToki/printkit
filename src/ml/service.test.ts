import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLogSnapshot, resetActivityLog } from '../app/activityLog'
import { MlAbortError } from './mlClient'
import { MODELS } from './models'
import { createMlService, MlUnavailableError } from './service'

const spec = MODELS[2]
const ready = { webgpu: false, f16: false }
function make(over: { bytes?: ArrayBuffer | null; matte?: ReturnType<typeof vi.fn> } = {}) {
  const client = { load: vi.fn(async () => {}), matte: over.matte ?? vi.fn(async (_s: unknown, _r: Uint8Array, w: number, h: number) => new Float32Array(w * h).fill(0.5)), cancel: vi.fn() }
  const store = { read: vi.fn(async () => (over.bytes === undefined ? new ArrayBuffer(8) : over.bytes)), cancel: vi.fn(), download: vi.fn(), status: () => ({ state: 'ready' }), persistent: true }
  const svc = createMlService({ client: client as never, store: store as never, caps: async () => ready })
  return { svc, client, store }
}

describe('MlService.matteAlpha (33, 3.2)', () => {
  beforeEach(() => resetActivityLog())

  it('сессия поднимается один раз на модель, альфа возвращается размера картинки, журнал: начало и итог', async () => {
    const { svc, client } = make()
    const a = await svc.matteAlpha(spec, new Uint8Array(12), 2, 2)
    expect(a).toHaveLength(4)
    await svc.matteAlpha(spec, new Uint8Array(12), 2, 2)
    expect(client.load).toHaveBeenCalledTimes(1); expect(client.matte).toHaveBeenCalledTimes(2)
    expect(getLogSnapshot().entries.filter((e) => e.source === 'ai').map((e) => e.key)).toEqual(['log.ai.run', 'log.ai.runDone', 'log.ai.run', 'log.ai.runDone'])
    expect(getLogSnapshot().jobs).toHaveLength(0)
  })

  it('строка этапа для всей картинки говорит про фон, а не про лист', async () => {
    const { svc } = make()
    const lines: string[] = []
    const stop = (await import('../app/activityLog')).subscribeLog(() => { const j = getLogSnapshot().jobs.at(-1); if (j && lines.at(-1) !== j.key) lines.push(j.key) })
    await svc.matteAlpha(spec, new Uint8Array(12), 2, 2); stop()
    expect(lines).toContain('log.ai.firstPassImage'); expect(lines).not.toContain('log.ai.firstPass')
  })

  it('нет модели: ошибка noModel, сеть не вызывается, скачивания нет, в журнале нет следа задачи', async () => {
    const { svc, client, store } = make({ bytes: null })
    await expect(svc.matteAlpha(spec, new Uint8Array(12), 2, 2)).rejects.toMatchObject({ reason: 'noModel' })
    expect(client.matte).not.toHaveBeenCalled(); expect(store.download).not.toHaveBeenCalled()
    expect(getLogSnapshot().entries).toHaveLength(0); expect(getLogSnapshot().jobs).toHaveLength(0)
  })

  it('отмена: MlAbortError и запись об отмене; сбой сети — ошибка в журнале, следующий запуск поднимает сессию заново', async () => {
    const matte = vi.fn().mockRejectedValueOnce(new MlAbortError()).mockRejectedValueOnce(new Error('bad_alloc')).mockResolvedValue(new Float32Array(4))
    const { svc, client } = make({ matte })
    await expect(svc.matteAlpha(spec, new Uint8Array(12), 2, 2)).rejects.toBeInstanceOf(MlAbortError)
    expect(getLogSnapshot().entries.at(-1)?.key).toBe('log.ai.runCancelled')
    await expect(svc.matteAlpha(spec, new Uint8Array(12), 2, 2)).rejects.toThrow('bad_alloc')
    expect(getLogSnapshot().errors).toBe(1)
    await svc.matteAlpha(spec, new Uint8Array(12), 2, 2)
    expect(client.load).toHaveBeenCalledTimes(3) // после ошибки сессия считается сброшенной
  })

  it('вытеснение новым запросом не оставляет следа в журнале', async () => {
    const { svc } = make({ matte: vi.fn().mockResolvedValue(null) })
    await expect(svc.matteAlpha(spec, new Uint8Array(12), 2, 2)).rejects.toBeInstanceOf(MlUnavailableError)
    expect(getLogSnapshot().entries).toHaveLength(0)
  })
})
