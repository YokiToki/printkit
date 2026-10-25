import { describe, expect, it } from 'vitest'
import { MODELS } from './models'
import en from '../i18n/en.json'
import ru from '../i18n/ru.json'

type NodeFs = { readFileSync(path: URL, enc: 'utf8'): string }
const fs = (globalThis as unknown as { process: { getBuiltinModule(id: 'node:fs'): NodeFs } }).process.getBuiltinModule('node:fs')
const readme = fs.readFileSync(new URL('../../README.md', import.meta.url), 'utf8')

describe('источники и лицензии моделей (32, 5.4)', () => {
  it('README перечисляет каждую модель реестра с лицензией и ссылкой на источник', () => {
    for (const m of MODELS) {
      const line = readme.split('\n').find((l) => l.includes(`(${m.source})`))
      expect(line, `${m.id}: нет строки с источником ${m.source}`).toBeTruthy()
      expect(line, `${m.id}: нет лицензии ${m.spdx}`).toContain(`(${m.spdx})`)
    }
  })

  it('согласие и подсказка про ИИ есть на обоих языках', () => {
    for (const d of [en, ru]) {
      expect(d.ml.consent.body).toContain('{{host}}'); expect(d.ml.consent.body).toContain('{{spdx}}'); expect(d.ml.consent.body).toContain('{{mb}}')
      expect(d.ml.intro.length).toBeGreaterThan(20)
      expect(d.cutout.photo.ai.privacy.length).toBeGreaterThan(20)
    }
  })
})
