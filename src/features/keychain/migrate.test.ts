import { describe, expect, it } from 'vitest'
import { migrateKeychain } from './migrate'
import { defaultAiSilhouette, defaultKeychain } from '../../geometry/keychain'
import { defaultText } from '../../geometry/text'

describe('migrateKeychain', () => {
  it('пустое сохранённое дополняется умолчаниями', () => {
    const m = migrateKeychain({})
    expect(m).toMatchObject({ imageId: '', imageName: '', silhouette: defaultKeychain.silhouette, size: defaultKeychain.size, relief: defaultKeychain.relief, base: defaultKeychain.base, quality: defaultKeychain.quality })
  })
  it('частичные вложенные объекты сливаются, битые заменяются', () => {
    const m = migrateKeychain({ silhouette: { close: 9, keepOpen: 'x', threshold: 'abc' }, relief: null, base: 'zzz', size: { mode: 'box' } })
    expect((m.silhouette as { close: number; areas: unknown; threshold: unknown })).toMatchObject({ close: 9, areas: {}, threshold: 'auto' })
    expect(m.relief).toEqual(defaultKeychain.relief)
    expect(m.base).toEqual(defaultKeychain.base)
    expect((m.size as { mode: string; longest: number })).toMatchObject({ mode: 'box', longest: 70 })
  })
  it('keepOpen превращается в открытые области (только целые числа); число в threshold сохраняется', () => {
    const m = migrateKeychain({ silhouette: { keepOpen: [1, 'a', 2.5, 3], threshold: 120 } })
    expect(Object.keys((m.silhouette as { areas: Record<string, unknown> }).areas)).toEqual(['1', '3'])
    expect((m.silhouette as { threshold: number }).threshold).toBe(120)
    expect((m.silhouette as { threshold: number }).threshold).toBe(120)
  })
  it('старая запись (до узоров) получает источник, детали, узор и профиль по умолчанию', () => {
    const m = migrateKeychain({ imageId: 'i', imageName: 'a.png', relief: { hmax: 3, edgeWidth: 4, pow: 0.7, heightFloor: 0.1 }, base: { thickness: 1 } })
    expect(m.source).toEqual(defaultKeychain.source)
    expect(m.detail).toEqual(defaultKeychain.detail)
    expect(m.pattern).toEqual(defaultKeychain.pattern)
    expect(m.relief).toMatchObject({ hmax: 3, edgeWidth: 4, profile: 'bevel', steps: 3 }) // сохранённое остаётся, новое — по умолчанию
  })
  it('битые перечисления заменяются: профиль, источник, узор, область', () => {
    const m = migrateKeychain({ relief: { profile: 'zzz' }, source: { kind: 'x' }, pattern: { kind: 'swirl', scope: 'nowhere', pitch: 2 } })
    expect((m.relief as { profile: string }).profile).toBe('bevel')
    expect((m.source as { kind: string }).kind).toBe('distance')
    expect(m.pattern).toMatchObject({ kind: 'none', scope: 'relief', pitch: 2 })
  })
  it('корректный узор сохраняется', () => {
    const m = migrateKeychain({ pattern: { kind: 'hex', scope: 'plateau', pitch: 3 }, relief: { profile: 'terrace', steps: 4 } })
    expect(m.pattern).toMatchObject({ kind: 'hex', scope: 'plateau', pitch: 3 })
    expect(m.relief).toMatchObject({ profile: 'terrace', steps: 4 })
  })
  it('сглаживание: старая запись с яркостью остаётся на 0 и без удаления пятен, мусор приводится к 0', () => {
    const old = migrateKeychain({ source: { kind: 'brightness', contrast: 1.5, gamma: 1, invert: false }, relief: { hmax: 3 } })
    expect(old.source).toMatchObject({ kind: 'brightness', contrast: 1.5, smooth: 0, despeckle: false })
    expect((old.relief as { smooth: number }).smooth).toBe(0)
    const junk = migrateKeychain({ source: { smooth: 'x', despeckle: 'yes' }, relief: { smooth: null } })
    expect(junk.source).toMatchObject({ smooth: 0, despeckle: false })
    expect((junk.relief as { smooth: number }).smooth).toBe(0)
  })
  it('сохранённое сглаживание сохраняется', () => {
    const m = migrateKeychain({ source: { kind: 'brightness', smooth: 0.8, despeckle: true }, relief: { smooth: 1.2 } })
    expect(m.source).toMatchObject({ smooth: 0.8, despeckle: true })
    expect((m.relief as { smooth: number }).smooth).toBe(1.2)
  })

  describe('области (из keepOpen)', () => {
    const areasOf = (sil: Record<string, unknown>) => (migrateKeychain({ silhouette: sil }).silhouette as { areas: Record<number, unknown>; keepOpen?: unknown }).areas
    it.each([
      ['нет ни того, ни другого', {}, {}],
      ['keepOpen [3] → открытая область 3', { keepOpen: [3] }, { 3: { mode: 'open', level: 0.6 } }],
      ['keepOpen [1, 4]', { keepOpen: [1, 4] }, { 1: { mode: 'open', level: 0.6 }, 4: { mode: 'open', level: 0.6 } }],
      ['мусор в keepOpen отбрасывается', { keepOpen: [2, 'x', -1, 1.5, null] }, { 2: { mode: 'open', level: 0.6 } }],
      ['новые areas сохраняются', { areas: { 2: { mode: 'level', level: 1.2 } } }, { 2: { mode: 'level', level: 1.2 } }],
      ['areas важнее keepOpen для того же номера', { keepOpen: [2], areas: { 2: { mode: 'level', level: 0.9 } } }, { 2: { mode: 'level', level: 0.9 } }],
      ['неизвестный режим и уровень приводятся', { areas: { 5: { mode: 'zzz', level: 'x' } } }, { 5: { mode: 'follow', level: 0.6 } }],
      ['плохие ключи отбрасываются', { areas: { a: { mode: 'open' }, 0: { mode: 'open' } } }, {}],
    ])('%s', (_n, sil, expected) => {
      expect(areasOf(sil)).toEqual(expected)
    })
    it('keepOpen из записи удаляется', () => {
      expect((migrateKeychain({ silhouette: { keepOpen: [1] } }).silhouette as { keepOpen?: unknown }).keepOpen).toBeUndefined()
    })
    it('мусор вместо areas не ломает загрузку', () => {
      expect(areasOf({ areas: 7 })).toEqual({})
      expect(areasOf({ areas: [1, 2] })).toEqual({})
    })
  })

  describe('надпись', () => {
    const textOf = (t: unknown) => migrateKeychain({ text: t }).text as Record<string, unknown>
    it('нет записи — умолчания: выключена, пустая, Roboto', () => {
      expect(migrateKeychain({}).text).toEqual(defaultText)
    })
    it('сохранённое сохраняется, maskId отбрасывается', () => {
      const t = textOf({ enabled: true, content: 'Анна', font: { id: 'lobster', bold: true, italic: false, name: 'x' }, size: 10, letterSpacing: 0.5, lineSpacing: 1.3, align: 'left', rotation: 15, mode: 'engrave', height: 1, depth: 0.7, x: 0.2, y: 0.8, maskId: 'm1' })
      expect(t).toMatchObject({ enabled: true, content: 'Анна', size: 10, align: 'left', rotation: 15, mode: 'engrave', depth: 0.7, x: 0.2, y: 0.8 })
      expect(t.font).toEqual({ id: 'lobster', bold: true, italic: false, name: 'x' })
      expect('maskId' in t).toBe(false)
    })
    it.each([
      ['мусор вместо объекта', 7], ['массив', [1, 2]], ['null', null],
    ])('%s → умолчания', (_n, v) => { expect(textOf(v)).toEqual(defaultText) })
    it('числа и перечисления приводятся: строки → умолчания, неизвестные align и mode → center и emboss', () => {
      const t = textOf({ size: 'x', rotation: NaN, align: 'justify', mode: 'zzz', font: 'bad', x: Infinity, enabled: 'yes' })
      expect(t).toMatchObject({ size: 8, rotation: 0, align: 'center', mode: 'emboss', x: 0.5, enabled: false })
      expect(t.font).toEqual(defaultText.font)
    })
    it('слишком длинный текст обрезается', () => {
      expect((textOf({ content: 'x'.repeat(5000) }).content as string).length).toBe(400)
    })
    it('шрифт: пустой идентификатор → Roboto, флаги только настоящие true', () => {
      expect(textOf({ font: { id: '', bold: 'true', italic: 1 } }).font).toEqual({ id: 'roboto', bold: false, italic: false })
    })
  })
})

describe('силуэт по ИИ в сохранённом (33, 2.3)', () => {
  const sil = (raw: Record<string, unknown>) => (migrateKeychain({ silhouette: raw }).silhouette as Record<string, unknown>)

  it('старая запись без полей получает яркость, умолчания ИИ и автоматический порог областей', () => {
    const s = sil({ threshold: 90 })
    expect(s.source).toBe('brightness'); expect(s.autoOpen).toBeNull()
    expect(s.ai).toEqual(defaultAiSilhouette)
    expect(migrateKeychain({}).silhouette).toMatchObject({ source: 'brightness', autoOpen: null })
  })

  it('круговой проход: нормализованное значение не меняется при повторной нормализации', () => {
    const once = migrateKeychain({ silhouette: { source: 'ai', autoOpen: 80, ai: { model: 'isnet', threshold: 0.4, smooth: 1, keepLargest: false, matteId: 'm1' } } })
    expect(migrateKeychain(once)).toEqual(once)
    expect(once.silhouette).toMatchObject({ source: 'ai', autoOpen: 80, ai: { model: 'isnet', threshold: 0.4, smooth: 1, keepLargest: false, matteId: 'm1' } })
  })

  it('частичные и испорченные значения возвращаются к умолчаниям или пределам, ничего не падает', () => {
    expect(sil({ source: 'weird' }).source).toBe('brightness')
    expect(sil({ source: 'ai', ai: { threshold: 'x', smooth: NaN, keepLargest: 'yes', matteId: 5, model: 7 } }).ai).toEqual(defaultAiSilhouette)
    expect(sil({ ai: { threshold: 5, smooth: 99 } }).ai).toMatchObject({ threshold: 0.95, smooth: 3 })
    expect(sil({ ai: { threshold: -1, smooth: -2 } }).ai).toMatchObject({ threshold: 0.05, smooth: 0 })
    expect(sil({ ai: 'oops' }).ai).toEqual(defaultAiSilhouette)
    for (const bad of [-5, 'x', NaN, Infinity, null]) expect(sil({ autoOpen: bad }).autoOpen).toBeNull()
    expect(sil({ autoOpen: 0 }).autoOpen).toBe(0)
  })
})

describe('кадр, контур и источник «Фото» в сохранённом (34, 2.4)', () => {
  it('старая запись: весь кадр, гладкий контур по умолчанию, источник прежний, поля «Фото» с умолчаниями', () => {
    const m = migrateKeychain({ source: { kind: 'brightness', contrast: 1.5, gamma: 1, invert: false } }) as Record<string, any>
    expect(m.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 }); expect(m.outline).toEqual({ smooth: 0.25, cornerDeg: 50, step: 1 })
    expect(m.source.kind).toBe('brightness'); expect(m.source.contrast).toBe(1.5)
    expect(m.source.mix).toEqual({ contour: 25, depth: 45, detail: 30 }); expect(m.source.detailMode).toBe('engrave'); expect(m.source.levels).toBe(0)
  })

  it('круговой проход: нормализованное значение не меняется при повторной нормализации', () => {
    const once = migrateKeychain({ crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }, outline: { smooth: 0.4, cornerDeg: 60, step: 0.5 }, source: { kind: 'photo', mix: { contour: 10, depth: 20, detail: 70 }, depthId: 'd1', boost: 3, boostRadius: 2, levels: 4, levelSoftness: 0.3, detailMode: 'both', darkThreshold: 0.3, snap: 40, maxSlope: 35, finalSmooth: 0.1 }, silhouette: { source: 'frame' } })
    expect(migrateKeychain(once)).toEqual(once)
    expect(once).toMatchObject({ crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }, silhouette: { source: 'frame' }, source: { kind: 'photo', depthId: 'd1', levels: 4, detailMode: 'both' } })
  })

  it('частичные и испорченные значения возвращаются к умолчаниям или пределам, ничего не падает', () => {
    const m = migrateKeychain({ crop: { x: 'a', y: 0, w: 1, h: 1 }, outline: 'oops', source: { kind: 'photo', mix: { contour: -5, depth: 500 }, boost: NaN, levels: 1, detailMode: 'weird', snap: 999, maxSlope: -3 } }) as Record<string, any>
    expect(m.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 }); expect(m.outline).toEqual({ smooth: 0.25, cornerDeg: 50, step: 1 })
    expect(m.source).toMatchObject({ mix: { contour: 0, depth: 100, detail: 30 }, boost: 2, levels: 0, detailMode: 'engrave', snap: 100, maxSlope: 0 })
    expect((migrateKeychain({ crop: { x: 0.9, y: 0.9, w: 0.5, h: 0.01 } }) as Record<string, any>).crop).toEqual({ x: 0.5, y: 0.9, w: 0.5, h: 0.05 })
    expect((migrateKeychain({ source: { kind: 'weird' } }) as Record<string, any>).source.kind).toBe('distance')
  })
})
