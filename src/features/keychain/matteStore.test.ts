// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { openImageStore } from './imageStore'
import type { GrayImage } from '../../geometry/raster/threshold'
import type { Matte } from '../../geometry/keychain'

const img = (): GrayImage => ({ width: 2, height: 2, gray: Uint8Array.of(1, 2, 3, 4), alpha: null })
const matte = (v: number): Matte => ({ width: 2, height: 2, data: new Uint8Array(4).fill(v) })
const color = { width: 2, height: 1, rgb: Uint8Array.of(1, 2, 3, 4, 5, 6) }

describe('хранилище альф и цвета (33, 3.1)', () => {
  it('круговой проход: картинка, цветная копия и альфа по ключу «изображение + модель + ревизия»', async () => {
    const s = await openImageStore(new IDBFactory())
    await s.save('a', img()); await s.saveColor('a', color); await s.saveMatte('a', 'isnet', 'r1', matte(200))
    expect(Array.from((await s.load('a'))!.gray)).toEqual(Array.from(img().gray))
    expect(Array.from((await s.loadColor('a'))!.rgb)).toEqual(Array.from(color.rgb))
    expect((await s.loadMatte('a', 'isnet', 'r1'))!.data[0]).toBe(200)
    expect(await s.loadMatte('a', 'isnet', 'r2')).toBeUndefined() // другая ревизия — другая альфа
    expect(await s.loadMatte('a', 'birefnet', 'r1')).toBeUndefined()
    expect(s.persistent).toBe(true)
  })

  it('удаление изображения уносит его цвет и все его альфы, чужие остаются', async () => {
    const s = await openImageStore(new IDBFactory())
    for (const id of ['a', 'ab']) { await s.save(id, img()); await s.saveColor(id, color); await s.saveMatte(id, 'm1', 'r', matte(1)); await s.saveMatte(id, 'm2', 'r', matte(2)) }
    await s.remove('a')
    expect(await s.load('a')).toBeUndefined(); expect(await s.loadColor('a')).toBeUndefined()
    expect(await s.loadMatte('a', 'm1', 'r')).toBeUndefined(); expect(await s.loadMatte('a', 'm2', 'r')).toBeUndefined()
    expect(await s.loadMatte('ab', 'm1', 'r')).toBeDefined() // «ab» не начинается с «a|»: префиксы не путаются
    expect(await s.loadColor('ab')).toBeDefined()
  })

  it('замена изображения: новая запись под другим id, старая альфа не подходит к новому изображению', async () => {
    const s = await openImageStore(new IDBFactory())
    await s.save('old', img()); await s.saveMatte('old', 'm', 'r', matte(9))
    await s.save('new', img())
    expect(await s.loadMatte('new', 'm', 'r')).toBeUndefined()
    await s.remove('old')
    expect(await s.loadMatte('old', 'm', 'r')).toBeUndefined()
  })

  it('удаление модели из менеджера хранилище альф не трогает: оно про модели ничего не знает', async () => {
    const s = await openImageStore(new IDBFactory())
    await s.saveMatte('a', 'isnet', 'r1', matte(7))
    // менеджер моделей чистит свой кэш весов, а не IndexedDB изображений
    expect((await s.loadMatte('a', 'isnet', 'r1'))!.data[0]).toBe(7)
  })

  it('без IndexedDB всё живёт в памяти с флагом persistent = false; отказ записи падает в память', async () => {
    const mem = await openImageStore(null)
    expect(mem.persistent).toBe(false)
    await mem.save('a', img()); await mem.saveMatte('a', 'm', 'r', matte(5))
    expect((await mem.loadMatte('a', 'm', 'r'))!.data[0]).toBe(5)
    await mem.remove('a'); expect(await mem.loadMatte('a', 'm', 'r')).toBeUndefined()
    const s = await openImageStore(new IDBFactory())
    await s.save('a', img())
    const big = { width: 1, height: 1, data: new Uint8Array(1) }
    Object.defineProperty(big, 'data', { get() { throw new Error('quota') } }) // структурное клонирование падает
    await s.saveMatte('a', 'm', 'r', big as unknown as Matte)
    expect(s.persistent).toBe(false)
  })
})
