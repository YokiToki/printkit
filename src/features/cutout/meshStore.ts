import { memoryFallback } from '../../app/activityLog'
import type { IndexedMesh } from '../../geometry/stl-import'

/**
 * Хранилище импортированных сеток: IndexedDB (сетки слишком велики для localStorage). Если IndexedDB недоступна
 * (приватный режим, ошибка), сетки живут в памяти до перезагрузки, а `persistent` сообщает об этом.
 */
export interface MeshStore {
  save(id: string, mesh: IndexedMesh): Promise<void>
  load(id: string): Promise<IndexedMesh | undefined>
  remove(id: string): Promise<void>
  /** true — данные переживут перезагрузку страницы. */
  readonly persistent: boolean
}

const DB = 'gridfinity'
const STORE = 'meshes'

class MemoryStore implements MeshStore {
  persistent = false
  private m = new Map<string, IndexedMesh>()
  async save(id: string, mesh: IndexedMesh) { this.m.set(id, mesh) }
  async load(id: string) { return this.m.get(id) }
  async remove(id: string) { this.m.delete(id) }
}

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })

class IdbStore implements MeshStore {
  persistent = true
  constructor(private db: IDBDatabase, private fallback: MemoryStore) {}
  private tx(mode: IDBTransactionMode) { return this.db.transaction(STORE, mode).objectStore(STORE) }
  async save(id: string, mesh: IndexedMesh) {
    try { await req(this.tx('readwrite').put(mesh, id)) } catch { this.persistent = false; memoryFallback('meshes'); await this.fallback.save(id, mesh) }
  }
  async load(id: string) {
    try { return ((await req(this.tx('readonly').get(id))) as IndexedMesh | undefined) ?? (await this.fallback.load(id)) } catch { return this.fallback.load(id) }
  }
  async remove(id: string) { try { await req(this.tx('readwrite').delete(id)) } catch { /* ignore */ } await this.fallback.remove(id) }
}

/** Открывает IndexedDB (без аргумента — глобальную, null — без неё); при отсутствии или ошибке возвращает хранилище в памяти. */
export async function openMeshStore(given?: IDBFactory | null): Promise<MeshStore> {
  const memory = new MemoryStore()
  const factory = given === undefined ? (typeof indexedDB === 'undefined' ? undefined : indexedDB) : (given ?? undefined)
  if (!factory) { memoryFallback('meshes'); return memory }
  try {
    const open = factory.open(DB, 1)
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE) }
    const db = await req(open)
    return new IdbStore(db, memory)
  } catch {
    memoryFallback('meshes')
    return memory
  }
}
