import { describe, it, expect, vi } from 'vitest'
import i18next from 'i18next'
import './index'
import en from './en.json'
import ru from './ru.json'
import { generate } from '../geometry/model'

describe('stack error messages (Task 4.3)', () => {
  const errorKeys = [
    'stack.error.notSolid',
    'stack.error.cycle',
    'stack.error.toolMissing',
    'stack.error.wallTooThick',
    'stack.error.tooMany',
    'stack.error.offsetEmpty',
  ]

  it('has exact parity between en and ru for all stack.error.* keys', () => {
    for (const key of errorKeys) {
      const parts = key.split('.')
      let enVal: any = en
      let ruVal: any = ru
      for (const p of parts) {
        enVal = enVal?.[p]
        ruVal = ruVal?.[p]
      }
      expect(typeof enVal, `missing en key: ${key}`).toBe('string')
      expect(typeof ruVal, `missing ru key: ${key}`).toBe('string')
    }
  })

  it('interpolates parameters correctly in both languages', async () => {
    const tEn = i18next.getFixedT('en')
    const tRu = i18next.getFixedT('ru')

    // notSolid
    expect(tEn('stack.error.notSolid', { name: 'PartA', openEdges: 4 })).toBe(
      'PartA is not a closed solid (4 open edges)'
    )
    expect(tRu('stack.error.notSolid', { name: 'PartA', openEdges: 4 })).toBe(
      'PartA не является замкнутым телом (открытых рёбер: 4)'
    )

    // wallTooThick
    expect(tEn('stack.error.wallTooThick', { wall: 5 })).toBe(
      'Wall thickness 5 mm is too thick for this body'
    )
    expect(tRu('stack.error.wallTooThick', { wall: 5 })).toBe(
      'Толщина стенки 5 мм слишком велика для этого тела'
    )

    // tooMany
    expect(tEn('stack.error.tooMany', { limit: '6M', count: '8M' })).toBe(
      'Operation would exceed limit of 6M triangles (reached 8M)'
    )
    expect(tRu('stack.error.tooMany', { limit: '6M', count: '8M' })).toBe(
      'Превышен лимит в 6M треугольников (достигнуто 8M)'
    )
  })

  it('logs a warning when an operation fails during model evaluation', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await generate('editor', {
        objects: [
          {
            id: 'box-fail',
            name: 'BoxFail',
            source: { kind: 'primitive', shape: 'box', params: { size: [10, 10, 10] } },
            stack: [
              {
                id: 'bad-bool',
                kind: 'boolean',
                enabled: true,
                params: { mode: 'subtract', tools: ['missing-tool-id'] },
              },
            ],
          },
        ],
      } as any)

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[stack] Object box-fail op bad-bool failed: stack.error.toolMissing'),
        expect.objectContaining({ id: 'missing-tool-id' })
      )
    } finally {
      warnSpy.mockRestore()
    }
  })
})
