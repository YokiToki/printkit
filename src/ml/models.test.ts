import { describe, expect, it } from 'vitest'
import { MODELS, modelById, registryIssues, totalBytes, type ModelSpec } from './models'

describe('реестр моделей', () => {
  it('все записи проходят проверку: разрешённая лицензия, ревизия-хеш, SHA-256, размер', () => {
    expect(registryIssues()).toEqual([])
    expect(MODELS.length).toBeGreaterThanOrEqual(3)
  })

  it('проверка отклоняет неразрешённую лицензию, ветку вместо хеша и запись без суммы', () => {
    const base = MODELS[0]
    const bad = (patch: Partial<ModelSpec>) => registryIssues([{ ...base, ...patch }])
    expect(bad({ spdx: 'bria-rmbg-1.4' }).join()).toMatch(/лицензия/)
    expect(bad({ spdx: 'AGPL-3.0' }).join()).toMatch(/лицензия/)
    expect(bad({ revision: 'main', url: base.url.replace(base.revision, 'main') }).join()).toMatch(/ревизия/)
    expect(bad({ sha256: '' }).join()).toMatch(/SHA-256/)
    expect(registryIssues([base, base]).join()).toMatch(/повторный/)
  })

  it('источник только huggingface.co, по умолчанию предлагается BiRefNet-lite', () => {
    for (const m of MODELS) expect(new URL(m.url).host).toBe('huggingface.co')
    expect(MODELS.find((m) => m.purpose === 'default')?.id).toBe('birefnet-lite-512-fp16')
    expect(modelById('isnet-general-int8')?.spdx).toBe('Apache-2.0')
  })

  it('модели глубины: два файла, оба закреплены ревизией, с суммой и размером; вид отдельный', () => {
    const depth = MODELS.filter((m) => m.kind === 'depth')
    expect(depth.length).toBeGreaterThanOrEqual(1)
    for (const m of depth) {
      expect(m.data).toBeTruthy(); expect(m.data!.url).toContain(`/resolve/${m.revision}/`); expect(m.data!.sha256).toMatch(/^[0-9a-f]{64}$/); expect(m.data!.bytes).toBeGreaterThan(m.bytes)
      expect(totalBytes(m)).toBe(m.bytes + m.data!.bytes)
    }
    expect(MODELS.filter((m) => m.kind === 'matte').every((m) => !m.data)).toBe(true)
    const base = depth[0]
    expect(registryIssues([{ ...base, data: { ...base.data!, sha256: 'x' } }]).join()).toMatch(/файл данных/)
    expect(registryIssues([{ ...base, data: { ...base.data!, url: base.data!.url.replace(base.revision, 'main') } }]).join()).toMatch(/файл данных/)
    expect(registryIssues([{ ...base, data: { ...base.data!, bytes: 0 } }]).join()).toMatch(/файл данных/)
  })
})
