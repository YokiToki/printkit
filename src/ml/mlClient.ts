import type { Backend, ModelSpec } from './models'
import type { Phase } from './runtime'

export type MlRequest =
  | { kind: 'load'; id: number; spec: ModelSpec; bytes: ArrayBuffer; backend: Backend; data?: ArrayBuffer }
  | { kind: 'matte'; id: number; spec: ModelSpec; rgb: Uint8Array; w: number; h: number }
  | { kind: 'depth'; id: number; spec: ModelSpec; rgb: Uint8Array; w: number; h: number }
  | { kind: 'release'; id: number; modelId: string }
export type MlResponse =
  | { id: number; ok: true; alpha?: Float32Array }
  | { id: number; error: string }
  | { kind: 'phase'; phase: Phase; modelId: string }
  | { kind: 'fatal'; message: string }

export interface MlWorkerLike {
  postMessage(msg: MlRequest, transfer?: Transferable[]): void
  addEventListener(type: 'message', cb: (e: { data: MlResponse }) => void): void
  addEventListener(type: 'error', cb: (e: { message?: string }) => void): void
  terminate?(): void
}

type NoId<T> = T extends unknown ? Omit<T, 'id'> : never

export class MlAbortError extends Error { constructor() { super('aborted'); this.name = 'MlAbortError' } }

interface Pending { resolve: (v: Float32Array | null | undefined) => void; reject: (e: Error) => void; kind: MlRequest['kind'] }

/**
 * Клиент воркера ИИ, по образцу `ModelClient`: побеждает последний запрос `matte` (ответ на более старый — null и никогда не
 * заменяет новый), есть сообщения о фазах и отмена. Прервать работающий вывод внутри ORT нельзя, поэтому отмена закрывает воркер
 * и создаёт новый при следующем запросе: сессии придётся загрузить заново.
 */
export class MlClient {
  private worker: MlWorkerLike | null = null
  private nextId = 1
  private latestMatte = 0
  private latestDepth = 0
  private pending = new Map<number, Pending>()
  onPhase?: (phase: Phase, modelId: string) => void

  constructor(private factory: () => MlWorkerLike) {}

  private get w(): MlWorkerLike {
    if (!this.worker) {
      this.worker = this.factory()
      this.worker.addEventListener('message', (e) => this.onMessage(e.data))
      // ошибка вне запроса (не загрузился модуль воркера, необработанное исключение): ждущие запросы не должны зависнуть
      this.worker.addEventListener('error', (e) => this.fail(new Error(e.message || 'worker error')))
    }
    return this.worker
  }

  private send<T>(msg: NoId<MlRequest>, transfer: Transferable[] = []): Promise<T> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as Pending['resolve'], reject, kind: msg.kind })
      this.w.postMessage({ ...msg, id } as MlRequest, transfer)
    })
  }

  /** Создаёт сессию модели в воркере (байты копируются и передаются). */
  async load(spec: ModelSpec, bytes: ArrayBuffer, backend: Backend, data?: ArrayBuffer): Promise<void> {
    const copy = bytes.slice(0), dataCopy = data?.slice(0)
    await this.send<void>({ kind: 'load', spec, bytes: copy, backend, ...(dataCopy ? { data: dataCopy } : {}) }, dataCopy ? [copy, dataCopy] : [copy])
  }

  /** Альфа 0…1 размера w × h; null — запрос вытеснен более новым. */
  matte(spec: ModelSpec, rgb: Uint8Array, w: number, h: number): Promise<Float32Array | null> {
    const copy = rgb.slice()
    const id = this.nextId
    this.latestMatte = id
    for (const [oldId, p] of this.pending) if (oldId < id && p.kind === 'matte') { p.resolve(null); this.pending.delete(oldId) }
    return this.send<Float32Array | null>({ kind: 'matte', spec, rgb: copy, w, h }, [copy.buffer])
  }

  /** Карта глубины 0…1 размера w × h; null — запрос вытеснен более новым (своя полоса, как у matte). */
  depth(spec: ModelSpec, rgb: Uint8Array, w: number, h: number): Promise<Float32Array | null> {
    const copy = rgb.slice()
    const id = this.nextId
    this.latestDepth = id
    for (const [oldId, p] of this.pending) if (oldId < id && p.kind === 'depth') { p.resolve(null); this.pending.delete(oldId) }
    return this.send<Float32Array | null>({ kind: 'depth', spec, rgb: copy, w, h }, [copy.buffer])
  }

  release(modelId: string): Promise<void> { return this.send<void>({ kind: 'release', modelId }) }

  private fail(err: Error) {
    for (const p of this.pending.values()) p.reject(err)
    this.pending.clear()
  }

  /** Отмена: ждущие запросы получают MlAbortError, воркер закрывается. */
  cancel() {
    this.worker?.terminate?.(); this.worker = null
    const err = new MlAbortError()
    for (const p of this.pending.values()) p.reject(err)
    this.pending.clear()
  }

  private onMessage(r: MlResponse) {
    if ('kind' in r) { if (r.kind === 'fatal') this.fail(new Error(r.message)); else this.onPhase?.(r.phase, r.modelId); return }
    const p = this.pending.get(r.id)
    if (!p) return // запрос вытеснен или отменён
    this.pending.delete(r.id)
    if ('error' in r) return p.reject(new Error(r.error))
    if (p.kind === 'matte' && r.id !== this.latestMatte) return p.resolve(null)
    if (p.kind === 'depth' && r.id !== this.latestDepth) return p.resolve(null)
    p.resolve(r.alpha)
  }

  dispose() { this.cancel() }
}
