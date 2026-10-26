import { aiSegmentation, type AiSegmentParams } from './ai'
import type { Rectified } from './homography'
import { segment, type SegmentParams, type Segmentation } from './segment'

/**
 * Тяжёлые шаги окна «Из фото» (классические силуэты ≈ 0.7 с, силуэты ИИ с гибридным краем ≈ 0.3 с на листе A4) идут в воркере,
 * чтобы настройки не подвешивали интерфейс. Лист и альфа сети передаются воркеру один раз и дальше называются по номеру.
 */
export type PhotoRequest =
  | { kind: 'sheet'; sheetId: number; sheet: Rectified }
  | { kind: 'alpha'; alphaId: number; alpha: Float32Array }
  | { kind: 'segment'; id: number; sheetId: number; params: Partial<SegmentParams> }
  | { kind: 'ai'; id: number; sheetId: number; alphaId: number; params: Partial<AiSegmentParams> }
export type PhotoResponse = { id: number; seg: Segmentation } | { id: number; error: string }

export interface PhotoWorkerLike {
  postMessage(msg: PhotoRequest): void
  addEventListener(type: 'message', cb: (e: { data: PhotoResponse }) => void): void
  addEventListener(type: 'error', cb: (e: { message?: string }) => void): void
  terminate?(): void
}

/** Состояние воркера: листы и альфы по номерам; хранятся только последние, остальные забываются. */
export function createPhotoHandler() {
  const sheets = new Map<number, Rectified>(), alphas = new Map<number, Float32Array>()
  const keep = <T>(m: Map<number, T>, id: number, v: T, n: number) => { m.set(id, v); while (m.size > n) m.delete(m.keys().next().value as number) }
  return (msg: PhotoRequest): PhotoResponse | null => {
    if (msg.kind === 'sheet') { keep(sheets, msg.sheetId, msg.sheet, 3); return null }
    if (msg.kind === 'alpha') { keep(alphas, msg.alphaId, msg.alpha, 3); return null }
    try {
      const sheet = sheets.get(msg.sheetId)
      if (!sheet) throw new Error('sheet not registered')
      if (msg.kind === 'segment') return { id: msg.id, seg: segment(sheet, msg.params) }
      const alpha = alphas.get(msg.alphaId)
      if (!alpha) throw new Error('alpha not registered')
      return { id: msg.id, seg: aiSegmentation(sheet, alpha, msg.params) }
    } catch (e) { return { id: msg.id, error: e instanceof Error ? e.message : String(e) } }
  }
}

export class PhotoSupersededError extends Error { constructor() { super('superseded') } }

/** Полосы запросов: в каждой побеждает последний. `base` — те же силуэты ИИ при значениях модели по умолчанию (для показа изменений). */
export type Lane = 'segment' | 'ai' | 'base'
interface Pending { resolve: (s: Segmentation) => void; reject: (e: Error) => void; lane: Lane }

/**
 * Клиент: побеждает последний запрос в своей полосе (классика и ИИ считаются независимо), устаревший отклоняется
 * `PhotoSupersededError`. Без воркера (тесты, окружение без Worker) считает тут же в том же потоке по тем же функциям.
 */
export class PhotoClient {
  private worker: PhotoWorkerLike | null | undefined
  private inline = createPhotoHandler()
  private sheetIds = new WeakMap<Rectified, number>()
  private alphaIds = new WeakMap<Float32Array, number>()
  private next = 1
  private latest: Record<Lane, number> = { segment: 0, ai: 0, base: 0 }
  private pending = new Map<number, Pending>()

  constructor(private factory: () => PhotoWorkerLike | null) {}

  private get w(): PhotoWorkerLike | null {
    if (this.worker === undefined) {
      this.worker = this.factory()
      this.worker?.addEventListener('message', (e) => this.onMessage(e.data))
      this.worker?.addEventListener('error', (e) => this.failAll(new Error(e.message || 'worker error')))
    }
    return this.worker
  }

  private send(msg: PhotoRequest) { const w = this.w; if (w) w.postMessage(msg); else this.inlineHandle(msg) }
  private inlineHandle(msg: PhotoRequest) { const r = this.inline(msg); if (r) queueMicrotask(() => this.onMessage(r)) }

  private sheetId(sheet: Rectified) {
    let id = this.sheetIds.get(sheet)
    if (id === undefined) { id = this.next++; this.sheetIds.set(sheet, id); this.send({ kind: 'sheet', sheetId: id, sheet }) }
    return id
  }
  private alphaId(alpha: Float32Array) {
    let id = this.alphaIds.get(alpha)
    if (id === undefined) { id = this.next++; this.alphaIds.set(alpha, id); this.send({ kind: 'alpha', alphaId: id, alpha }) }
    return id
  }

  private request(lane: Lane, build: (id: number) => PhotoRequest): Promise<Segmentation> {
    const id = this.next++
    this.latest[lane] = id
    for (const [old, p] of this.pending) if (p.lane === lane && old < id) { p.reject(new PhotoSupersededError()); this.pending.delete(old) }
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject, lane }); this.send(build(id)) })
  }

  segment(sheet: Rectified, params: Partial<SegmentParams>): Promise<Segmentation> {
    const sheetId = this.sheetId(sheet)
    return this.request('segment', (id) => ({ kind: 'segment', id, sheetId, params }))
  }
  ai(sheet: Rectified, alpha: Float32Array, params: Partial<AiSegmentParams>, lane: 'ai' | 'base' = 'ai'): Promise<Segmentation> {
    const sheetId = this.sheetId(sheet), alphaId = this.alphaId(alpha)
    return this.request(lane, (id) => ({ kind: 'ai', id, sheetId, alphaId, params }))
  }

  private onMessage(r: PhotoResponse) {
    const p = this.pending.get(r.id)
    if (!p) return
    this.pending.delete(r.id)
    if (r.id !== this.latest[p.lane]) return p.reject(new PhotoSupersededError())
    if ('error' in r) p.reject(new Error(r.error)); else p.resolve(r.seg)
  }
  private failAll(e: Error) { for (const p of this.pending.values()) p.reject(e); this.pending.clear() }
  dispose() { this.worker?.terminate?.(); this.failAll(new PhotoSupersededError()) }
}
