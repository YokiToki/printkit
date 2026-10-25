import { describe, expect, it, vi } from 'vitest'
import { createModelStore } from './modelStore'
import { MODELS, type ModelSpec } from './models'

const hexOf = async (d: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', d)), (x) => x.toString(16).padStart(2, '0')).join('')

/** Модель с настоящей суммой известного содержимого. */
async function specFor(id: string, content: Uint8Array): Promise<ModelSpec> {
  return { ...MODELS[0], id, url: `https://huggingface.co/x/${id}/resolve/${MODELS[0].revision}/m.onnx`, bytes: content.length, sha256: await hexOf(content.buffer.slice(0) as ArrayBuffer) }
}
const stream = (parts: Uint8Array[], onChunk?: (i: number) => void) => new Response(new ReadableStream({
  start(c) { parts.forEach((p, i) => { c.enqueue(p); onChunk?.(i) }); c.close() },
}))
class FakeCaches {
  m = new Map<string, Uint8Array>()
  async open() { return { put: async (u: string, r: Response) => { this.m.set(u, new Uint8Array(await r.arrayBuffer())) }, match: async (u: string) => (this.m.has(u) ? new Response(this.m.get(u) as unknown as BodyInit) : undefined), delete: async (u: string) => this.m.delete(u) } }
}
const bytes = (n: number, v = 7) => new Uint8Array(n).fill(v)
const make = (over: Record<string, unknown> = {}) => {
  const caches = new FakeCaches()
  return { caches, store: (reg: ModelSpec[], f: typeof fetch) => createModelStore({ fetch: f, caches: caches as unknown as CacheStorage, digest: hexOf, registry: reg, storage: undefined, ...over }) }
}

describe('modelStore', () => {
  it('скачивает с прогрессом, проверяет сумму, кладёт в кэш; read возвращает те же байты', async () => {
    const a = bytes(30), spec = await specFor('a', a), { caches, store } = make(), progress: number[] = []
    const s = store([spec], async () => stream([a.slice(0, 10), a.slice(10, 30)]))
    await s.download(spec, (l) => progress.push(l))
    expect(progress).toEqual([10, 30]); expect(s.status('a')).toEqual({ state: 'ready' })
    expect(caches.m.has(spec.url)).toBe(true); expect(s.persistent).toBe(true)
    expect(new Uint8Array((await s.read(spec))!)).toEqual(a); expect(s.usedBytes()).toBe(30)
  })

  it('неверная сумма отклоняется и ничего не оставляет; неверный размер — тоже', async () => {
    const a = bytes(20), spec = await specFor('a', a), { caches, store } = make()
    const s = store([spec], async () => stream([bytes(20, 9)]))
    await s.download(spec)
    expect(s.status('a')).toMatchObject({ state: 'failed', error: 'checksum' }); expect(caches.m.size).toBe(0); expect(await s.read(spec)).toBeNull()
    const short = store([spec], async () => stream([bytes(5)]))
    await short.download(spec)
    expect(short.status('a')).toMatchObject({ state: 'failed', error: 'size' })
  })

  it('ошибка сети и HTTP-статус дают failed с причиной, отмена возвращает «нет» и не оставляет файла', async () => {
    const a = bytes(20), spec = await specFor('a', a), { caches, store } = make()
    const net = store([spec], async () => { throw new Error('offline') }); await net.download(spec)
    expect(net.status('a')).toMatchObject({ state: 'failed', error: 'network' })
    const http = store([spec], async () => new Response('x', { status: 404 })); await http.download(spec)
    expect(http.status('a')).toMatchObject({ state: 'failed', error: 'http', detail: '404' })
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const slow = store([spec], (async (_u: unknown, init?: RequestInit) => new Response(new ReadableStream({
      async start(c) { c.enqueue(a.slice(0, 5)); await gate; if (init?.signal?.aborted) c.error(new DOMException('aborted', 'AbortError')); else { c.enqueue(a.slice(5)); c.close() } },
    }))) as typeof fetch)
    const p = slow.download(spec)
    await vi.waitFor(() => expect(slow.status('a').state).toBe('downloading'))
    slow.cancel('a'); release(); await p
    expect(slow.status('a')).toEqual({ state: 'absent' }); expect(caches.m.size).toBe(0)
  })

  it('несколько моделей рядом; удаление убирает одну, removeAll — все', async () => {
    const a = bytes(10, 1), b = bytes(12, 2), sa = await specFor('a', a), sb = await specFor('b', b), { caches, store } = make()
    const s = store([sa, sb], (async (u: string) => stream([u.includes('/a/') ? a : b])) as unknown as typeof fetch)
    await s.download(sa); await s.download(sb)
    expect(s.usedBytes()).toBe(22); expect(caches.m.size).toBe(2)
    await s.remove('a')
    expect(s.status('a')).toEqual({ state: 'absent' }); expect(s.status('b')).toEqual({ state: 'ready' }); expect(caches.m.size).toBe(1)
    await s.removeAll(); expect(caches.m.size).toBe(0); expect(s.usedBytes()).toBe(0)
  })

  it('refresh находит уже лежащие в кэше модели после «перезагрузки»', async () => {
    const a = bytes(10), spec = await specFor('a', a), { caches, store } = make()
    await store([spec], async () => stream([a])).download(spec)
    const again = store([spec], async () => { throw new Error('не должен ходить в сеть') })
    expect(again.status('a')).toEqual({ state: 'absent' })
    await again.refresh()
    expect(again.status('a')).toEqual({ state: 'ready' }); expect(caches.m.size).toBe(1)
  })

  it('без Cache API (или при ошибке записи) вес живёт в памяти, persistent = false', async () => {
    const a = bytes(10), spec = await specFor('a', a)
    const s = createModelStore({ fetch: (async () => stream([a])) as unknown as typeof fetch, caches: undefined, digest: hexOf, registry: [spec], storage: undefined })
    await s.download(spec)
    expect(s.persistent).toBe(false); expect(s.status('a')).toEqual({ state: 'ready' }); expect(new Uint8Array((await s.read(spec))!)).toEqual(a)
    const broken = { open: async () => ({ put: async () => { throw new Error('quota') }, match: async () => undefined, delete: async () => true }) }
    const q = createModelStore({ fetch: (async () => stream([a])) as unknown as typeof fetch, caches: broken as unknown as CacheStorage, digest: hexOf, registry: [spec], storage: undefined })
    await q.download(spec)
    expect(q.persistent).toBe(false); expect(q.status('a')).toEqual({ state: 'ready' })
  })

  it('выбор активной модели по виду запоминается в хранилище', async () => {
    const mem = new Map<string, string>(), st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    const s = createModelStore({ caches: undefined, storage: st })
    s.setActive('matte', 'isnet-general-int8')
    expect(createModelStore({ caches: undefined, storage: st }).activeFor('matte')).toBe('isnet-general-int8')
  })
})
