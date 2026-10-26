import { memoryFallback } from '../../app/activityLog'
import type { Matte } from '../../geometry/keychain'
import type { GrayImage } from '../../geometry/raster/threshold'

/** Цвет изображения для нейросети: уменьшенная копия (длинная сторона не больше COLOR_SIDE), RGB подряд. */
export interface StoredColor { width: number; height: number; rgb: Uint8Array }
/** Длинная сторона цветной копии: больше сети всё равно не нужно (вывод ограничен 2048). */
export const COLOR_SIDE = 2048

/**
 * Хранилище изображений Keychain: IndexedDB (картинки велики для localStorage), у собственной базы, чтобы не менять схему
 * хранилища сеток Cutout. Рядом с яркостью лежат цветная копия (для нейросети) и мягкие альфы нейросети по ключу
 * «изображение + модель + ревизия»; всё это уходит вместе с изображением. Без IndexedDB данные живут в памяти до перезагрузки,
 * `persistent` сообщает об этом.
 */
export interface ImageStore {
  save(id: string, image: GrayImage): Promise<void>
  load(id: string): Promise<GrayImage | undefined>
  /** Удаляет изображение вместе с цветной копией и всеми его альфами. */
  remove(id: string): Promise<void>
  saveColor(id: string, color: StoredColor): Promise<void>
  loadColor(id: string): Promise<StoredColor | undefined>
  saveMatte(imageId: string, model: string, revision: string, matte: Matte): Promise<void>
  loadMatte(imageId: string, model: string, revision: string): Promise<Matte | undefined>
  /** true — данные переживут перезагрузку страницы. */
  readonly persistent: boolean
}

const DB = 'gridfinity-keychain'
const IMAGES = 'images', COLORS = 'colors', MATTES = 'mattes'
const matteKey = (imageId: string, model: string, revision: string) => `${imageId}|${model}|${revision}`
const matteRange = (imageId: string) => IDBKeyRange.bound(`${imageId}|`, `${imageId}|￿`)

class MemoryStore implements ImageStore {
  persistent = false
  private images = new Map<string, GrayImage>()
  private colors = new Map<string, StoredColor>()
  private mattes = new Map<string, Matte>()
  async save(id: string, image: GrayImage) { this.images.set(id, image) }
  async load(id: string) { return this.images.get(id) }
  async remove(id: string) { this.images.delete(id); this.colors.delete(id); for (const k of [...this.mattes.keys()]) if (k.startsWith(`${id}|`)) this.mattes.delete(k) }
  async saveColor(id: string, c: StoredColor) { this.colors.set(id, c) }
  async loadColor(id: string) { return this.colors.get(id) }
  async saveMatte(i: string, m: string, r: string, matte: Matte) { this.mattes.set(matteKey(i, m, r), matte) }
  async loadMatte(i: string, m: string, r: string) { return this.mattes.get(matteKey(i, m, r)) }
}

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })

class IdbStore implements ImageStore {
  persistent = true
  constructor(private db: IDBDatabase, private fallback: MemoryStore) {}
  private tx(store: string, mode: IDBTransactionMode) { return this.db.transaction(store, mode).objectStore(store) }
  private async put<T>(store: string, key: string, value: T, mem: () => Promise<void>, what: 'images' = 'images') {
    try { await req(this.tx(store, 'readwrite').put(value, key)) } catch { this.persistent = false; memoryFallback(what); await mem() }
  }
  private async get<T>(store: string, key: string, mem: () => Promise<T | undefined>): Promise<T | undefined> {
    try { return ((await req(this.tx(store, 'readonly').get(key))) as T | undefined) ?? (await mem()) } catch { return mem() }
  }
  save(id: string, image: GrayImage) { return this.put(IMAGES, id, image, () => this.fallback.save(id, image)) }
  load(id: string) { return this.get<GrayImage>(IMAGES, id, () => this.fallback.load(id)) }
  saveColor(id: string, c: StoredColor) { return this.put(COLORS, id, c, () => this.fallback.saveColor(id, c)) }
  loadColor(id: string) { return this.get<StoredColor>(COLORS, id, () => this.fallback.loadColor(id)) }
  saveMatte(i: string, m: string, r: string, matte: Matte) { return this.put(MATTES, matteKey(i, m, r), matte, () => this.fallback.saveMatte(i, m, r, matte)) }
  loadMatte(i: string, m: string, r: string) { return this.get<Matte>(MATTES, matteKey(i, m, r), () => this.fallback.loadMatte(i, m, r)) }
  async remove(id: string) {
    try { await req(this.tx(IMAGES, 'readwrite').delete(id)) } catch { /* ignore */ }
    try { await req(this.tx(COLORS, 'readwrite').delete(id)) } catch { /* ignore */ }
    try { await req(this.tx(MATTES, 'readwrite').delete(matteRange(id))) } catch { /* ignore */ }
    await this.fallback.remove(id)
  }
}

/** Открывает IndexedDB (без аргумента — глобальную, null — без неё); при отсутствии или ошибке возвращает хранилище в памяти. */
export async function openImageStore(given?: IDBFactory | null): Promise<ImageStore> {
  const memory = new MemoryStore()
  const factory = given === undefined ? (typeof indexedDB === 'undefined' ? undefined : indexedDB) : (given ?? undefined)
  if (!factory) { memoryFallback('images'); return memory }
  try {
    const open = factory.open(DB, 2) // версия 2: цветная копия и мягкие альфы нейросети (изображения версии 1 остаются как есть)
    open.onupgradeneeded = () => { for (const s of [IMAGES, COLORS, MATTES]) if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s) }
    return new IdbStore(await req(open), memory)
  } catch {
    memoryFallback('images')
    return memory
  }
}
