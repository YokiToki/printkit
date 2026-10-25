import { memoryFallback } from '../../app/activityLog'
import type { GrayImage } from '../../geometry/raster/threshold'

/**
 * Хранилище изображений Keychain: IndexedDB (картинки велики для localStorage), у собственной базы, чтобы не менять схему
 * хранилища сеток Cutout. Без IndexedDB изображения живут в памяти до перезагрузки, `persistent` сообщает об этом.
 */
export interface ImageStore {
  save(id: string, image: GrayImage): Promise<void>
  load(id: string): Promise<GrayImage | undefined>
  remove(id: string): Promise<void>
  /** true — данные переживут перезагрузку страницы. */
  readonly persistent: boolean
}

const DB = 'gridfinity-keychain'
const STORE = 'images'

class MemoryStore implements ImageStore {
  persistent = false
  private m = new Map<string, GrayImage>()
  async save(id: string, image: GrayImage) { this.m.set(id, image) }
  async load(id: string) { return this.m.get(id) }
  async remove(id: string) { this.m.delete(id) }
}

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })

class IdbStore implements ImageStore {
  persistent = true
  constructor(private db: IDBDatabase, private fallback: MemoryStore) {}
  private tx(mode: IDBTransactionMode) { return this.db.transaction(STORE, mode).objectStore(STORE) }
  async save(id: string, image: GrayImage) {
    try { await req(this.tx('readwrite').put(image, id)) } catch { this.persistent = false; memoryFallback('images'); await this.fallback.save(id, image) }
  }
  async load(id: string) {
    try { return ((await req(this.tx('readonly').get(id))) as GrayImage | undefined) ?? (await this.fallback.load(id)) } catch { return this.fallback.load(id) }
  }
  async remove(id: string) { try { await req(this.tx('readwrite').delete(id)) } catch { /* ignore */ } await this.fallback.remove(id) }
}

/** Открывает IndexedDB (без аргумента — глобальную, null — без неё); при отсутствии или ошибке возвращает хранилище в памяти. */
export async function openImageStore(given?: IDBFactory | null): Promise<ImageStore> {
  const memory = new MemoryStore()
  const factory = given === undefined ? (typeof indexedDB === 'undefined' ? undefined : indexedDB) : (given ?? undefined)
  if (!factory) { memoryFallback('images'); return memory }
  try {
    const open = factory.open(DB, 1)
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE) }
    return new IdbStore(await req(open), memory)
  } catch {
    memoryFallback('images')
    return memory
  }
}
