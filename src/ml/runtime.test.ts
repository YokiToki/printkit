import { describe, expect, it } from 'vitest'
import { MODELS } from './models'
import { createRuntime, type OrtLike, type SessionLike } from './runtime'

const spec = { ...MODELS[2], size: 4, sigmoid: false }

function fakeOrt(log: string[]): OrtLike {
  return {
    Tensor: class { constructor(public type: string, public data: Float32Array, public dims: number[]) {} } as unknown as OrtLike['Tensor'],
    InferenceSession: {
      async create(bytes, o) {
        log.push(`create ${bytes.length} ${o.executionProviders.join()}`)
        const s: SessionLike = {
          inputNames: ['in'], outputNames: ['out'],
          async run(feeds) { log.push(`run ${(feeds.in as { dims: number[] }).dims.join('x')}`); return { out: { data: new Float32Array(16).fill(0.75) } } },
          async release() { log.push('release') },
        }
        return s
      },
    },
  }
}

describe('runtime', () => {
  it('библиотека грузится только при первой загрузке сессии; matte возвращает альфу нужного размера', async () => {
    const log: string[] = [], phases: string[] = []
    let loads = 0
    const rt = createRuntime(async () => { loads++; return fakeOrt(log) }, (p) => phases.push(p))
    expect(loads).toBe(0)
    await rt.load(spec, new ArrayBuffer(10), 'wasm')
    expect(loads).toBe(1); expect(rt.has(spec.id)).toBe(true)
    const a = await rt.matte(spec, new Uint8Array(2 * 2 * 3), 2, 2)
    expect(a).toHaveLength(4); for (const v of a) expect(v).toBeCloseTo(0.75, 5)
    expect(log).toEqual(['create 10 wasm', 'run 1x3x4x4'])
    expect(phases).toEqual(['session', 'run'])
    await rt.load(spec, new ArrayBuffer(10), 'wasm')
    expect(loads).toBe(1) // библиотека одна на воркер
  })

  it('без загруженной сессии matte падает с понятной ошибкой; release убирает сессию', async () => {
    const log: string[] = []
    const rt = createRuntime(async () => fakeOrt(log))
    await expect(rt.matte(spec, new Uint8Array(12), 2, 2)).rejects.toThrow(/not loaded/)
    await rt.load(spec, new ArrayBuffer(1), 'wasm'); await rt.release(spec.id)
    expect(rt.has(spec.id)).toBe(false); expect(log).toContain('release')
  })
})
