import { describe, expect, it } from 'vitest'
import { MODELS, modelById, registryIssues, type ModelSpec } from './models'

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
})
