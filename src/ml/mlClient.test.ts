import { describe, expect, it } from 'vitest'
import { MlAbortError, MlClient, type MlRequest, type MlResponse, type MlWorkerLike } from './mlClient'
import { MODELS } from './models'

const spec = MODELS[0]

/** Подставной воркер: запросы копятся, ответы шлёт тест в нужном порядке. */
class FakeWorker implements MlWorkerLike {
  sent: MlRequest[] = []; terminated = false
  private cb: (e: { data: MlResponse }) => void = () => {}
  postMessage(m: MlRequest) { this.sent.push(m) }
  addEventListener(_t: 'message', cb: (e: { data: MlResponse }) => void) { this.cb = cb }
  terminate() { this.terminated = true }
  reply(r: MlResponse) { this.cb({ data: r }) }
}
const setup = () => { const workers: FakeWorker[] = []; const c = new MlClient(() => { const w = new FakeWorker(); workers.push(w); return w }); return { c, workers } }

describe('MlClient', () => {
  it('воркер создаётся лениво: до первого запроса его нет', () => {
    const { workers } = setup()
    expect(workers).toHaveLength(0)
  })

  it('побеждает последний matte: ответ на старый запрос разрешается как null', async () => {
    const { c, workers } = setup()
    const p1 = c.matte(spec, new Uint8Array(12), 2, 2), p2 = c.matte(spec, new Uint8Array(12), 2, 2)
    const [a, b] = workers[0].sent
    workers[0].reply({ id: b.id, ok: true, alpha: new Float32Array([1]) })
    workers[0].reply({ id: a.id, ok: true, alpha: new Float32Array([0]) }) // опоздавший ответ
    expect(await p1).toBeNull()
    expect(Array.from((await p2)!)).toEqual([1])
  })

  it('load и ошибки: ответ ok разрешает, error отклоняет; фазы доходят до onPhase', async () => {
    const { c, workers } = setup()
    const phases: string[] = []
    c.onPhase = (p, m) => phases.push(`${p}:${m}`)
    const ok = c.load(spec, new ArrayBuffer(4), 'wasm')
    workers[0].reply({ kind: 'phase', phase: 'session', modelId: spec.id })
    workers[0].reply({ id: workers[0].sent[0].id, ok: true })
    await expect(ok).resolves.toBeUndefined()
    expect(phases).toEqual([`session:${spec.id}`])
    const bad = c.matte(spec, new Uint8Array(12), 2, 2)
    workers[0].reply({ id: workers[0].sent[1].id, error: 'bad_alloc' })
    await expect(bad).rejects.toThrow('bad_alloc')
  })

  it('отмена закрывает воркер, ждущие запросы получают MlAbortError, следующий запрос создаёт новый воркер', async () => {
    const { c, workers } = setup()
    const p = c.matte(spec, new Uint8Array(12), 2, 2)
    c.cancel()
    await expect(p).rejects.toBeInstanceOf(MlAbortError)
    expect(workers[0].terminated).toBe(true)
    void c.matte(spec, new Uint8Array(12), 2, 2)
    expect(workers).toHaveLength(2)
  })
})
