import { describe, expect, it } from 'vitest'

// Исходники всего приложения как текст: скачивание весов можно начать только из менеджера моделей (после подтверждения).
const sources = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const ALLOWED = [/\.test\.tsx?$/, /^\/src\/ml\/modelStore\.ts$/, /^\/src\/ml\/service\.ts$/, /^\/src\/features\/ml\/ModelManager\.tsx$/]

describe('скачивание весов недостижимо мимо менеджера моделей (32, 5.2b)', () => {
  it('вызовы downloadModel и store.download есть только в хранилище, сервисе и менеджере', () => {
    const offenders = Object.entries(sources).filter(([path, text]) => !ALLOWED.some((re) => re.test(path)) && /downloadModel\s*\(|\bstore\.download\s*\(|modelStore\.download\s*\(/.test(text)).map(([p]) => p)
    expect(offenders).toEqual([])
  })

  it('сервис ИИ сам модель не скачивает: нет модели — ошибка, а не загрузка', () => {
    const run = sources['/src/ml/service.ts'].split('async silhouetteAlpha')[1]
    expect(run).not.toMatch(/\.download\(|downloadModel/)
    expect(run).toMatch(/noModel/)
  })

  it('кнопка «Скачать» менеджера идёт только через окно подтверждения (setConsent), прямого вызова нет', () => {
    const m = sources['/src/features/ml/ModelManager.tsx']
    expect(m).toMatch(/onDownload=\{\(\) => setConsent\(m\)\}/)
    expect(m.match(/downloadModel\(/g)).toHaveLength(1)
  })
})
