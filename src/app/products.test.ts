import { describe, expect, it } from 'vitest'
import { PRODUCTS, productOf } from './products'
import { KEYCHAIN_MODES, MODES } from './modes'

describe('products', () => {
  it('пути и id продуктов уникальны', () => {
    expect(new Set(PRODUCTS.map((p) => p.path)).size).toBe(PRODUCTS.length)
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length)
  })
  it('каждый путь режима начинается с пути своего продукта', () => {
    for (const p of PRODUCTS) for (const m of p.modes ?? []) expect(m.path.startsWith(`${p.path}/`)).toBe(true)
    expect(PRODUCTS.find((p) => p.id === 'gridfinity')?.modes).toBe(MODES)
  })
  it('у Keychain два режима (image, shape), у Gridfinity три', () => {
    const kc = PRODUCTS.find((p) => p.id === 'keychain')!
    expect(kc.modes?.map((m) => [m.id, m.path])).toEqual([['image', '/keychain/image'], ['shape', '/keychain/shape']])
    expect(kc.modes).toBe(KEYCHAIN_MODES)
    expect(PRODUCTS.find((p) => p.id === 'gridfinity')?.modes).toHaveLength(3)
  })
  it('Rack: путь /rack, режимы panel, case и shelf, пути с префиксом, три продукта', () => {
    expect(PRODUCTS.map((p) => p.id)).toEqual(['gridfinity', 'keychain', 'rack'])
    const r = PRODUCTS.find((p) => p.id === 'rack')!
    expect(r.path).toBe('/rack')
    expect(r.modes?.map((m) => [m.id, m.path])).toEqual([['panel', '/rack/panel'], ['case', '/rack/case'], ['shelf', '/rack/shelf']])
    expect(productOf('/rack/panel')?.id).toBe('rack')
    expect(productOf('/racket')).toBeUndefined()
  })
  it('id режимов уникальны в пределах продукта, ключи подписей и карточек заданы', () => {
    for (const p of PRODUCTS) {
      expect(new Set(p.modes?.map((m) => m.id)).size).toBe(p.modes?.length)
      for (const m of p.modes ?? []) { expect(m.labelKey).toBeTruthy(); expect(m.startKey).toBeTruthy() }
    }
  })
  it('productOf: сам путь и подпуть, граница по слэшу', () => {
    expect(productOf('/gridfinity')?.id).toBe('gridfinity')
    expect(productOf('/gridfinity/box')?.id).toBe('gridfinity')
    expect(productOf('/keychain')?.id).toBe('keychain')
    expect(productOf('/keychainer')).toBeUndefined()
    expect(productOf('/')).toBeUndefined()
  })
})
