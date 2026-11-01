import { describe, expect, it } from 'vitest'
import en from './en.json'
import ru from './ru.json'

const keys = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]))

describe('переводы', () => {
  it('в ru.json есть каждый ключ из en.json и наоборот', () => {
    expect(keys(ru).sort()).toEqual(keys(en).sort())
  })
  it('нет пустых строк', () => {
    for (const k of [...keys(en), ...keys(ru)]) expect(k).toBeTruthy()
  })
})

// Карточки продуктов и режимов на стартовых страницах.
const CARDS = [
  'products.gridfinity',
  'products.keychain',
  'products.rack',
  'start.box',
  'start.baseplate',
  'start.cutout',
  'start.keychainImage',
  'start.keychainShape',
  'start.rackPanel',
  'start.rackCase',
  'start.rackShelf',
] as const

type Locale = Record<string, unknown>
const at = (o: Locale, path: string) => path.split('.').reduce<unknown>((v, k) => (v as Locale)[k], o) as Record<string, string>

/** Слова тега: разделители (·, →, +, ×) словами не считаются. */
const words = (tag: string) => tag.split(/\s+/).filter((w) => !/^[·→+×–-]$/.test(w))

describe('тексты карточек', () => {
  it.each(['en', 'ru'] as const)('%s: у каждой карточки ровно два тега не длиннее двух слов', (lang) => {
    const json = lang === 'en' ? en : ru
    for (const card of CARDS) {
      const c = at(json, card)
      expect(Object.keys(c).filter((k) => k.startsWith('tag')).sort(), card).toEqual(['tag1', 'tag2'])
      for (const tag of [c.tag1, c.tag2]) {
        expect(typeof tag, `${card}: tag не строка`).toBe('string')
        expect(words(tag).length, `${card}: «${tag}» длиннее двух слов`).toBeLessThanOrEqual(2)
      }
    }
  })
  it.each(['en', 'ru'] as const)('%s: на карточках нет слов-заглушек и жаргона', (lang) => {
    const json = lang === 'en' ? en : ru
    for (const card of CARDS) {
      const text = Object.values(at(json, card)).join(' ').toLowerCase()
      expect(text, card).not.toMatch(/soon|скоро/)
      expect(text, card).not.toMatch(/\b(snap|mask|маска|привязка)\b/)
    }
  })
  it('описание Rack Master перечисляет панели, корпуса и полки', () => {
    expect(at(en, 'products.rack').desc).toMatch(/panels.*enclosures.*shelves/i)
    expect(at(ru, 'products.rack').desc).toMatch(/панел.*корпус.*полк/i)
  })
  it('карточка Cutout упоминает фото', () => {
    expect(at(en, 'start.cutout').desc).toMatch(/photo/i)
    expect(at(ru, 'start.cutout').desc).toMatch(/фото/i)
  })
  it('keystone пишется одинаково на всех карточках', () => {
    for (const json of [en, ru]) {
      for (const card of CARDS) {
        const text = Object.values(at(json, card)).join(' ')
        expect(text, card).not.toMatch(/keystones\b|кейстон/i)
      }
    }
  })
})
