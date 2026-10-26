import type { ModeId, ModeParams, ModelResult } from './model'
import type { IndexedMesh } from './stl-import'
import type { GrayImage } from './raster/threshold'
import type { TextRaster } from './text'
import type { Matte } from './keychain'

export interface WorkerRequest { id: number; mode: ModeId; params: ModeParams[ModeId] }
/** Регистрация импортированной сетки в воркере: дальше вырезы ссылаются на неё по id. */
export interface WorkerMeshMessage { kind: 'mesh'; meshId: string; mesh: IndexedMesh }
/** Регистрация изображения Keychain в воркере (яркость и прозрачность по строкам). */
export interface WorkerImageMessage { kind: 'image'; imageId: string; image: GrayImage }
/** Регистрация растра надписи Keychain в воркере (альфа-маска): параметры ссылаются на неё по maskId. */
export interface WorkerTextMessage { kind: 'text'; textId: string; raster: TextRaster }
/** Регистрация мягкой альфы нейросети (силуэт Keychain по ИИ): параметры ссылаются на неё по matteId. */
export interface WorkerMatteMessage { kind: 'matte'; matteId: string; matte: Matte }
export type WorkerMessage = WorkerRequest | WorkerMeshMessage | WorkerImageMessage | WorkerTextMessage | WorkerMatteMessage
export type WorkerResponse = { id: number; result: ModelResult } | { id: number; error: string }

/** Минимальный интерфейс воркера: нужен, чтобы подменять его в тестах. */
export interface WorkerLike {
  postMessage(msg: WorkerMessage, transfer?: Transferable[]): void
  addEventListener(type: 'message', cb: (e: { data: WorkerResponse }) => void): void
  terminate?(): void
}

interface Pending { resolve: (m: ModelResult | null) => void; reject: (e: Error) => void }

/**
 * Клиент воркера генерации. Побеждает последний запрос: ответ на более старый запрос
 * разрешается как null и никогда не заменяет новый результат.
 */
export class ModelClient {
  private nextId = 1
  private latest = 0
  private pending = new Map<number, Pending>()

  constructor(private worker: WorkerLike) {
    worker.addEventListener('message', (e) => this.onMessage(e.data))
  }

  generate<M extends ModeId>(mode: M, params: ModeParams[M]): Promise<ModelResult | null> {
    const id = this.nextId++
    this.latest = id
    // более старые запросы больше никому не нужны
    for (const [oldId, p] of this.pending) if (oldId < id) { p.resolve(null); this.pending.delete(oldId) }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ id, mode, params })
    })
  }

  private onMessage(r: WorkerResponse) {
    const p = this.pending.get(r.id)
    if (!p) return // запрос уже вытеснен
    this.pending.delete(r.id)
    if (r.id !== this.latest) return p.resolve(null)
    if ('error' in r) p.reject(new Error(r.error))
    else p.resolve(r.result)
  }

  /** Сообщает воркеру сетку; сообщения идут по порядку, поэтому следующая генерация её уже видит. Копию передаём, исходная остаётся у вызывающего. */
  registerMesh(meshId: string, mesh: IndexedMesh) {
    const copy: IndexedMesh = { vertProperties: mesh.vertProperties.slice(), triVerts: mesh.triVerts.slice() }
    this.worker.postMessage({ kind: 'mesh', meshId, mesh: copy }, [copy.vertProperties.buffer, copy.triVerts.buffer])
  }

  /** То же для изображения Keychain: копию передаём воркеру с передачей владения буферами. */
  registerImage(imageId: string, image: GrayImage) {
    const copy: GrayImage = { width: image.width, height: image.height, gray: image.gray.slice(), alpha: image.alpha ? image.alpha.slice() : null }
    this.worker.postMessage({ kind: 'image', imageId, image: copy }, [copy.gray.buffer, ...(copy.alpha ? [copy.alpha.buffer] : [])])
  }

  /** То же для мягкой альфы нейросети: копию передаём воркеру с передачей владения буфером. */
  registerMatte(matteId: string, matte: Matte) {
    const copy: Matte = { ...matte, data: matte.data.slice() }
    this.worker.postMessage({ kind: 'matte', matteId, matte: copy }, [copy.data.buffer])
  }

  /** То же для растра надписи: копию передаём воркеру с передачей владения буфером. */
  registerText(textId: string, raster: TextRaster) {
    const copy: TextRaster = { ...raster, mask: raster.mask.slice() }
    this.worker.postMessage({ kind: 'text', textId, raster: copy }, [copy.mask.buffer])
  }

  dispose() { this.worker.terminate?.(); this.pending.clear() }
}
