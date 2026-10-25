import { MODELS, type MlKind, type ModelSpec } from './models'

export type DownloadError = 'network' | 'http' | 'size' | 'checksum' | 'storage'
export type ModelStatus =
  | { state: 'absent' }
  | { state: 'downloading'; loaded: number; total: number }
  | { state: 'ready' }
  | { state: 'failed'; error: DownloadError; detail?: string }

export interface StoreDeps {
  fetch: typeof fetch
  /** Cache API; undefined — недоступна (приватный режим, http): веса живут в памяти до перезагрузки. */
  caches: CacheStorage | undefined
  /** SHA-256 в hex. */
  digest: (data: ArrayBuffer) => Promise<string>
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  registry?: readonly ModelSpec[]
}

const CACHE = 'printkit-ml-v1'
const ACTIVE_KEY = 'gridfinity.ml'

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('')
const defaultDeps = (): StoreDeps => ({
  fetch: (...a) => fetch(...a),
  caches: typeof caches === 'undefined' ? undefined : caches,
  digest: async (d) => hex(await crypto.subtle.digest('SHA-256', d)),
  storage: typeof localStorage === 'undefined' ? undefined : localStorage,
})

/**
 * Хранилище весов нейросетей на клиенте: скачивание с прогрессом и отменой, проверка размера и SHA-256, Cache API под ключом
 * ревизии (URL содержит хеш коммита), список, удаление, флаг `persistent` с запасным вариантом в памяти. Файл попадает в кэш
 * только после полной проверки, поэтому прерванная или повреждённая загрузка ничего не оставляет. Хранилище само ничего не качает:
 * загрузка начинается только вызовом `download`, а он вызывается из менеджера моделей после подтверждения пользователя.
 */
export function createModelStore(given?: Partial<StoreDeps>) {
  const deps = { ...defaultDeps(), ...given }
  const registry = deps.registry ?? MODELS
  const memory = new Map<string, ArrayBuffer>()
  const status = new Map<string, ModelStatus>()
  const aborts = new Map<string, AbortController>()
  const listeners = new Set<() => void>()
  let persistent = !!deps.caches
  let active: Partial<Record<MlKind, string>> = {}
  try { active = JSON.parse(deps.storage?.getItem(ACTIVE_KEY) ?? '{}')?.active ?? {} } catch { active = {} }
  let version = 0
  const emit = () => { version++; listeners.forEach((l) => l()) }
  const set = (id: string, s: ModelStatus) => { status.set(id, s); emit() }

  const openCache = async () => { try { return deps.caches ? await deps.caches.open(CACHE) : null } catch { persistent = false; return null } }

  async function put(spec: ModelSpec, buf: ArrayBuffer): Promise<void> {
    const cache = await openCache()
    if (cache) {
      try { await cache.put(spec.url, new Response(buf.slice(0))); return } catch { persistent = false }
    }
    memory.set(spec.id, buf)
  }

  return {
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
    /** Меняется при каждом изменении состояния: для useSyncExternalStore. */
    getVersion: () => version,
    status: (id: string): ModelStatus => status.get(id) ?? { state: 'absent' },
    get persistent() { return persistent },
    activeFor: (kind: MlKind) => active[kind],
    setActive(kind: MlKind, id: string) {
      active = { ...active, [kind]: id }
      try { deps.storage?.setItem(ACTIVE_KEY, JSON.stringify({ active })) } catch { /* без хранилища выбор живёт до перезагрузки */ }
      emit()
    },

    /** Читает, какие модели уже лежат в кэше (после перезагрузки страницы). */
    async refresh() {
      const cache = await openCache()
      for (const m of registry) {
        if (status.get(m.id)?.state === 'downloading') continue
        const inCache = cache ? !!(await cache.match(m.url)) : false
        if (inCache || memory.has(m.id)) status.set(m.id, { state: 'ready' })
        else if (status.get(m.id)?.state !== 'failed') status.delete(m.id)
      }
      emit()
    },

    /** Скачивает модель. Вызывать только после явного подтверждения пользователя в менеджере моделей. Успех — состояние ready. */
    async download(spec: ModelSpec, onProgress?: (loaded: number, total: number) => void): Promise<void> {
      if (status.get(spec.id)?.state === 'downloading') return
      const ctl = new AbortController()
      aborts.set(spec.id, ctl)
      set(spec.id, { state: 'downloading', loaded: 0, total: spec.bytes })
      try {
        let res: Response
        try { res = await deps.fetch(spec.url, { signal: ctl.signal }) } catch (e) {
          if (ctl.signal.aborted) throw e
          return set(spec.id, { state: 'failed', error: 'network', detail: e instanceof Error ? e.message : String(e) })
        }
        if (!res.ok) return set(spec.id, { state: 'failed', error: 'http', detail: String(res.status) })
        const chunks: Uint8Array[] = []
        let loaded = 0
        const reader = res.body?.getReader()
        if (reader) {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value); loaded += value.length
            set(spec.id, { state: 'downloading', loaded, total: spec.bytes })
            onProgress?.(loaded, spec.bytes)
          }
        } else { const b = new Uint8Array(await res.arrayBuffer()); chunks.push(b); loaded = b.length }
        if (ctl.signal.aborted) throw new DOMException('aborted', 'AbortError') // отмена, пока поток дочитывался
        if (loaded !== spec.bytes) return set(spec.id, { state: 'failed', error: 'size', detail: `${loaded} ≠ ${spec.bytes}` })
        const buf = new Uint8Array(loaded)
        let at = 0
        for (const c of chunks) { buf.set(c, at); at += c.length }
        if ((await deps.digest(buf.buffer)) !== spec.sha256) return set(spec.id, { state: 'failed', error: 'checksum' })
        await put(spec, buf.buffer)
        set(spec.id, { state: 'ready' })
      } catch (e) {
        // отмена или обрыв: ничего не сохранено, состояние возвращается к «нет»
        if (ctl.signal.aborted) { status.delete(spec.id); emit() } else set(spec.id, { state: 'failed', error: 'network', detail: e instanceof Error ? e.message : String(e) })
      } finally { aborts.delete(spec.id) }
    },

    cancel(id: string) { aborts.get(id)?.abort() },

    /** Байты весов из кэша или памяти; null — модели нет. */
    async read(spec: ModelSpec): Promise<ArrayBuffer | null> {
      const mem = memory.get(spec.id)
      if (mem) return mem
      const cache = await openCache()
      const hit = cache ? await cache.match(spec.url) : undefined
      return hit ? hit.arrayBuffer() : null
    },

    async remove(id: string) {
      const spec = registry.find((m) => m.id === id)
      memory.delete(id)
      if (spec) { try { await (await openCache())?.delete(spec.url) } catch { /* ignore */ } }
      status.delete(id); emit()
    },
    async removeAll() { for (const m of registry) await this.remove(m.id) },

    /** Занятое место, байт (по готовым моделям реестра). */
    usedBytes: () => registry.reduce((n, m) => n + (status.get(m.id)?.state === 'ready' ? m.bytes : 0), 0),
  }
}

export type ModelStore = ReturnType<typeof createModelStore>
/** Общее хранилище приложения. */
export const modelStore: ModelStore = createModelStore()
