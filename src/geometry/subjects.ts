import { defaultSource, type KeychainParams } from './keychain'
import { defaultOutline } from './imageOutline'
import { otsu, type GrayImage } from './raster/threshold'

/** Что на картинке: от этого зависят источник силуэта, детали, размер и контур (отдельно от интенсивности «Нежный / Портрет / Глубокий»). */
export type SubjectId = 'face' | 'animal' | 'drawing'
export const SUBJECT_IDS: SubjectId[] = ['face', 'animal', 'drawing']

const photoKind = (p: KeychainParams): KeychainParams['source'] => ({ ...defaultSource, ...p.source, kind: 'photo' })

/**
 * Значения предмета как данные: каждый возвращает новые параметры. Лицо: силуэт по ИИ, гравировка тёмного с порогом 0.25, деталь 60 мм.
 * Животное целиком: ИИ, порог 0.18, весь кадр, без тоновых уровней. Рисунок / логотип: яркость, только контур, 60 мм, скос 1.2 мм,
 * гладкость контура 0.15 мм, большие области открываются сами (150 мм²).
 */
export const SUBJECTS: Record<SubjectId, (p: KeychainParams) => KeychainParams> = {
  face: (p) => ({
    ...p, size: { ...p.size, mode: 'longest', longest: 60 }, outline: { ...(p.outline ?? defaultOutline), smooth: 0.25 },
    silhouette: { ...p.silhouette, source: 'ai', autoOpen: null }, source: { ...photoKind(p), detailMode: 'engrave', darkThreshold: 0.25 },
  }),
  animal: (p) => ({
    ...p, crop: { x: 0, y: 0, w: 1, h: 1 }, size: { ...p.size, mode: 'longest', longest: 70 }, outline: { ...(p.outline ?? defaultOutline), smooth: 0.25 },
    silhouette: { ...p.silhouette, source: 'ai', autoOpen: null }, source: { ...photoKind(p), detailMode: 'engrave', darkThreshold: 0.18, levels: 0 },
  }),
  drawing: (p) => ({
    ...p, size: { ...p.size, mode: 'longest', longest: 60 }, relief: { ...p.relief, edgeWidth: 1.2 }, outline: { ...(p.outline ?? defaultOutline), smooth: 0.15 },
    silhouette: { ...p.silhouette, source: 'brightness', autoOpen: 150 }, source: { ...photoKind(p), mix: { contour: 100, depth: 0, detail: 0 } },
  }),
}

export const applySubject = (id: SubjectId, p: KeychainParams): KeychainParams => SUBJECTS[id](p)

/** Предмет по значениям: тот, чьи значения совпали, иначе null («Свой»). */
export function subjectOf(p: KeychainParams): SubjectId | null {
  for (const id of SUBJECT_IDS) {
    const want = applySubject(id, p)
    const same = p.source.kind === 'photo' && p.silhouette.source === want.silhouette.source && p.silhouette.autoOpen === want.silhouette.autoOpen
      && p.size.longest === want.size.longest && p.outline?.smooth === want.outline?.smooth && p.relief.edgeWidth === want.relief.edgeWidth
      && p.source.detailMode === want.source.detailMode && p.source.darkThreshold === want.source.darkThreshold && (p.source.levels ?? 0) === (want.source.levels ?? 0)
      && JSON.stringify(p.source.mix) === JSON.stringify(want.source.mix) && (id !== 'animal' || JSON.stringify(p.crop) === JSON.stringify(want.crop))
    if (same) return id
  }
  return null
}

export interface PictureStats {
  /** Число различимых тонов: заметных пиков гистограммы яркости. */
  tones: number
  /** Доля «тонких» тёмных пикселей среди тёмных: у штрихов рисунка велика (почти всё тёмное у кромки), у плотной фигуры мала. */
  thin: number
  /** Доля кадра, занятая габаритом найденного предмета (по маске модели), 0 — маски нет. */
  boxFill: number
}

/** Показатели картинки для автоматического выбора. maskBox — габарит предмета по маске [x0, y0, x1, y1] (включительно) или null. */
export function pictureStats(img: GrayImage, maskBox: [number, number, number, number] | null = null): PictureStats {
  const { width: w, height: h, gray } = img, hist = new Float64Array(32)
  for (let i = 0; i < gray.length; i++) hist[gray[i] >> 3]++
  const total = gray.length || 1
  let tones = 0
  for (let b = 0; b < 32; b++) if (hist[b] / total > 0.02 && hist[b] >= (hist[b - 1] ?? 0) && hist[b] >= (hist[b + 1] ?? 0)) tones++
  const t = otsu(gray)
  const dark = (i: number) => gray[i] <= t
  let darkCount = 0, edge = 0
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const k = j * w + i
    if (!dark(k)) continue
    darkCount++
    if (!dark(k - 1) || !dark(k + 1) || !dark(k - w) || !dark(k + w)) edge++
  }
  const box = maskBox ? ((maskBox[2] - maskBox[0] + 1) * (maskBox[3] - maskBox[1] + 1)) / (w * h) : 0
  return { tones, thin: darkCount ? edge / darkCount : 0, boxFill: box }
}

/**
 * Автоматический выбор: мало тонов и тонкие штрихи — рисунок; иначе предмет, не заполняющий кадр (животное целиком среди сцены), —
 * «Животное целиком»; предмет на весь кадр (крупный план) — «Лицо». Без маски — «Лицо».
 */
export function chooseSubject(s: PictureStats): SubjectId {
  if (s.tones <= 3 && s.thin >= 0.25) return 'drawing'
  if (s.boxFill > 0 && s.boxFill < 0.7) return 'animal'
  return 'face'
}

