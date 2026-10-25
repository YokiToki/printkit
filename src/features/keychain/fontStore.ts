import { memoryFallback } from '../../app/activityLog'
/**
 * Хранилище пользовательского шрифта Keychain: IndexedDB в отдельной базе (файл шрифта велик для localStorage), без неё — память до
 * перезагрузки. `persistent` сообщает, переживёт ли шрифт перезагрузку.
 */
export interface StoredFont { name: string; bytes: ArrayBuffer }
export interface FontStore {
  save(id: string, font: StoredFont): Promise<void>
  load(id: string): Promise<StoredFont | undefined>
  remove(id: string): Promise<void>
  readonly persistent: boolean
}

const DB = 'gridfinity-keychain-fonts'
const STORE = 'fonts'

class MemoryFontStore implements FontStore {
  persistent = false
  private m = new Map<string, StoredFont>()
  async save(id: string, font: StoredFont) { this.m.set(id, font) }
  async load(id: string) { return this.m.get(id) }
  async remove(id: string) { this.m.delete(id) }
}

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })

class IdbFontStore implements FontStore {
  persistent = true
  constructor(private db: IDBDatabase, private fallback: MemoryFontStore) {}
  private tx(mode: IDBTransactionMode) { return this.db.transaction(STORE, mode).objectStore(STORE) }
  async save(id: string, font: StoredFont) {
    try { await req(this.tx('readwrite').put(font, id)) } catch { this.persistent = false; memoryFallback('fonts'); await this.fallback.save(id, font) }
  }
  async load(id: string) {
    try { return ((await req(this.tx('readonly').get(id))) as StoredFont | undefined) ?? (await this.fallback.load(id)) } catch { return this.fallback.load(id) }
  }
  async remove(id: string) { try { await req(this.tx('readwrite').delete(id)) } catch { /* ignore */ } await this.fallback.remove(id) }
}

/** Открывает IndexedDB (без аргумента — глобальную, null — без неё); при отсутствии или ошибке возвращает хранилище в памяти. */
export async function openFontStore(given?: IDBFactory | null): Promise<FontStore> {
  const memory = new MemoryFontStore()
  const factory = given === undefined ? (typeof indexedDB === 'undefined' ? undefined : indexedDB) : (given ?? undefined)
  if (!factory) { memoryFallback('fonts'); return memory }
  try {
    const open = factory.open(DB, 1)
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE) }
    return new IdbFontStore(await req(open), memory)
  } catch {
    memoryFallback('fonts')
    return memory
  }
}
