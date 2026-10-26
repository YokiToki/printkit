import { defaultSource, type KeychainParams } from './keychain'

/** Интенсивность рельефа «Фото»: доли смеси, диапазон высоты и детали. Отдельно от предмета (лицо, животное, рисунок). */
export type IntensityId = 'subtle' | 'portrait' | 'deep'
export const INTENSITY_IDS: IntensityId[] = ['subtle', 'portrait', 'deep']

interface Intensity { mix: { contour: number; depth: number; detail: number }; hmax: number; boost: number; boostRadius: number; levels: number; levelSoftness: number }

// значения подобраны на фото кота (poc/ai/FINDINGS.md, «Смесь контур + глубина + детали»); портрет человека и игрушку проверяет владелец
export const INTENSITY: Record<IntensityId, Intensity> = {
  subtle: { mix: { contour: 40, depth: 45, detail: 15 }, hmax: 1.2, boost: 1.5, boostRadius: 1.4, levels: 0, levelSoftness: 0.6 },
  portrait: { mix: { contour: 25, depth: 45, detail: 30 }, hmax: 2, boost: 2, boostRadius: 1.4, levels: 0, levelSoftness: 0.6 },
  deep: { mix: { contour: 20, depth: 45, detail: 35 }, hmax: 2.8, boost: 2.5, boostRadius: 1.4, levels: 0, levelSoftness: 0.6 },
}

export function applyIntensity(id: IntensityId, p: KeychainParams): KeychainParams {
  const v = INTENSITY[id]
  return { ...p, relief: { ...p.relief, hmax: v.hmax }, source: { ...defaultSource, ...p.source, kind: 'photo', mix: { ...v.mix }, boost: v.boost, boostRadius: v.boostRadius, levels: v.levels, levelSoftness: v.levelSoftness } }
}

/** Интенсивность по значениям: та, чьи значения совпали, иначе null («Свой»). */
export function intensityOf(p: KeychainParams): IntensityId | null {
  if (p.source.kind !== 'photo') return null
  const s = p.source
  for (const id of INTENSITY_IDS) {
    const v = INTENSITY[id]
    if (p.relief.hmax === v.hmax && JSON.stringify(s.mix) === JSON.stringify(v.mix) && s.boost === v.boost && s.boostRadius === v.boostRadius && (s.levels ?? 0) === v.levels && s.levelSoftness === v.levelSoftness) return id
  }
  return null
}
