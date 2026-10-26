import { describe, expect, it } from 'vitest'
import { defaultKeychain } from './keychain'
import { applyIntensity, INTENSITY, INTENSITY_IDS, intensityOf } from './photoPresets'

describe('интенсивность «Фото» (34)', () => {
  it('каждая ставит свои доли, диапазон и детали и распознаётся обратно; правка любого значения даёт null («Свой»)', () => {
    for (const id of INTENSITY_IDS) {
      const p = applyIntensity(id, defaultKeychain)
      expect(p.source.kind).toBe('photo'); expect(p.relief.hmax).toBe(INTENSITY[id].hmax); expect(p.source.mix).toEqual(INTENSITY[id].mix); expect(intensityOf(p)).toBe(id)
    }
    const p = applyIntensity('portrait', defaultKeychain)
    expect(intensityOf({ ...p, source: { ...p.source, boost: 3 } })).toBeNull(); expect(intensityOf({ ...p, relief: { ...p.relief, hmax: 2.1 } })).toBeNull()
    expect(intensityOf(defaultKeychain)).toBeNull()
  })
  it('доли возрастающей интенсивности: деталей и диапазона больше', () => {
    expect(INTENSITY.subtle.mix.detail).toBeLessThan(INTENSITY.portrait.mix.detail); expect(INTENSITY.portrait.mix.detail).toBeLessThan(INTENSITY.deep.mix.detail)
    expect(INTENSITY.subtle.hmax).toBeLessThan(INTENSITY.deep.hmax)
  })
})
