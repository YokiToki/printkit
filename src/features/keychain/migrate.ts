import { DEFAULT_AREA_LEVEL, defaultAiSilhouette, defaultKeychain, defaultSource, fullCrop, MIN_CROP, type AiSilhouetteParams, type AreaSetting, type Crop, type SourceParams } from '../../geometry/keychain'
import { defaultOutline, type OutlineParams } from '../../geometry/imageOutline'
import { defaultText, MAX_TEXT_CHARS, type TextParams } from '../../geometry/text'
import { PATTERN_KINDS } from '../../geometry/patterns/fields'
import { PROFILE_KINDS } from '../../geometry/patterns/profile'

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Надпись из сохранённого: вложенный шрифт сливается с умолчаниями, числа и перечисления приводятся к допустимому, maskId не хранится. */
export function normalizeText(raw: unknown): TextParams {
  const r = obj(raw), d = defaultText
  const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def)
  const f = obj(r.font)
  return {
    enabled: r.enabled === true,
    content: typeof r.content === 'string' ? r.content.slice(0, MAX_TEXT_CHARS) : d.content,
    font: { id: typeof f.id === 'string' && f.id ? f.id : d.font.id, bold: f.bold === true, italic: f.italic === true, ...(typeof f.name === 'string' ? { name: f.name } : {}) },
    size: num(r.size, d.size), letterSpacing: num(r.letterSpacing, d.letterSpacing), lineSpacing: num(r.lineSpacing, d.lineSpacing),
    align: r.align === 'left' || r.align === 'right' ? r.align : 'center',
    rotation: num(r.rotation, d.rotation),
    mode: r.mode === 'engrave' ? 'engrave' : 'emboss',
    height: num(r.height, d.height), depth: num(r.depth, d.depth),
    x: num(r.x, d.x), y: num(r.y, d.y),
  }
}

/** Силуэт по ИИ из сохранённого: частичные и испорченные значения возвращаются к умолчаниям, порог и сглаживание приводятся к допустимым пределам. */
export function normalizeAiSilhouette(raw: unknown): AiSilhouetteParams {
  const r = obj(raw), d = defaultAiSilhouette
  const num = (v: unknown, def: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def)
  return {
    model: typeof r.model === 'string' ? r.model : d.model,
    threshold: num(r.threshold, d.threshold, 0.05, 0.95),
    smooth: num(r.smooth, d.smooth, 0, 3),
    keepLargest: typeof r.keepLargest === 'boolean' ? r.keepLargest : d.keepLargest,
    matteId: typeof r.matteId === 'string' ? r.matteId : d.matteId,
  }
}

const clampNum = (v: unknown, def: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def)

/** Кадрирование из сохранённого: доли внутри изображения, стороны не меньше MIN_CROP; мусор — весь кадр. */
export function normalizeCrop(raw: unknown): Crop {
  const r = obj(raw)
  if (![r.x, r.y, r.w, r.h].every((v) => typeof v === 'number' && Number.isFinite(v))) return { ...fullCrop }
  const w = clampNum(r.w, 1, MIN_CROP, 1), h = clampNum(r.h, 1, MIN_CROP, 1)
  return { x: clampNum(r.x, 0, 0, 1 - w), y: clampNum(r.y, 0, 0, 1 - h), w, h }
}

/** Контур из сохранённого: старые записи без поля получают гладкий контур по умолчанию. */
export function normalizeOutline(raw: unknown): OutlineParams {
  const r = obj(raw), d = defaultOutline
  return { smooth: clampNum(r.smooth, d.smooth, 0, 3), cornerDeg: clampNum(r.cornerDeg, d.cornerDeg, 10, 170), step: clampNum(r.step, d.step, 0.1, 5) }
}

/** Поля источника «Фото» из сохранённого (у остальных источников не используются, но заполняются, чтобы переключение не теряло значения). */
export function normalizePhotoSource(source: Record<string, unknown>): SourceParams {
  const d = defaultSource, mix = obj(source.mix)
  const levels = typeof source.levels === 'number' && Number.isFinite(source.levels) ? Math.round(source.levels) : 0
  return {
    ...(source as unknown as SourceParams),
    mix: { contour: clampNum(mix.contour, d.mix!.contour, 0, 100), depth: clampNum(mix.depth, d.mix!.depth, 0, 100), detail: clampNum(mix.detail, d.mix!.detail, 0, 100) },
    depthId: typeof source.depthId === 'string' ? source.depthId : '',
    depthModel: typeof source.depthModel === 'string' ? source.depthModel : '',
    boost: clampNum(source.boost, d.boost!, 0, 10), boostRadius: clampNum(source.boostRadius, d.boostRadius!, 0.2, 10),
    levels: levels >= 2 ? Math.min(8, levels) : 0, levelSoftness: clampNum(source.levelSoftness, d.levelSoftness!, 0, 1),
    detailMode: source.detailMode === 'relief' || source.detailMode === 'both' ? source.detailMode : 'engrave',
    darkThreshold: clampNum(source.darkThreshold, d.darkThreshold!, 0, 0.95),
    snap: clampNum(source.snap, d.snap!, 0, 100), maxSlope: clampNum(source.maxSlope, d.maxSlope!, 0, 89), finalSmooth: clampNum(source.finalSmooth, d.finalSmooth!, 0, 3),
  }
}

/** Состояние режима: параметры геометрии и подпись изображения (сами пиксели лежат в IndexedDB). */
export interface KeychainState { imageName: string; [k: string]: unknown }

/** Донаполняет сохранённое: вложенные объекты сливаются с умолчаниями (старые записи без источника, деталей и узора получают значения по умолчанию), список открытых дырок, порог и перечисления приводятся к допустимому виду. */
export function migrateKeychain(raw: Record<string, unknown>): Record<string, unknown> {
  const sil: Record<string, unknown> = { ...defaultKeychain.silhouette, ...obj(raw.silhouette) }
  // области: keepOpen из прошлой версии → открытые области; настройки приводятся к допустимому виду
  const areas: Record<number, AreaSetting> = {}
  const stored = obj(sil.areas)
  for (const [key, v] of Object.entries(stored)) {
    const id = Number(key), o = obj(v)
    if (!Number.isInteger(id) || id < 1) continue
    const mode = o.mode === 'open' || o.mode === 'level' ? o.mode : 'follow'
    areas[id] = { mode, level: typeof o.level === 'number' && Number.isFinite(o.level) ? o.level : DEFAULT_AREA_LEVEL }
  }
  if (Array.isArray(sil.keepOpen)) for (const n of sil.keepOpen as unknown[]) if (Number.isInteger(n) && (n as number) >= 1 && !areas[n as number]) areas[n as number] = { mode: 'open', level: DEFAULT_AREA_LEVEL }
  delete sil.keepOpen
  // источник силуэта: старые записи без поля остаются на яркости, ИИ и порог областей приводятся к допустимому виду
  sil.source = sil.source === 'ai' || sil.source === 'frame' ? sil.source : 'brightness'
  sil.ai = normalizeAiSilhouette(sil.ai)
  sil.autoOpen = typeof sil.autoOpen === 'number' && Number.isFinite(sil.autoOpen) && sil.autoOpen >= 0 ? sil.autoOpen : null
  sil.areas = areas
  if (sil.threshold !== 'auto' && !(typeof sil.threshold === 'number' && Number.isFinite(sil.threshold))) sil.threshold = 'auto'
  const relief = { ...defaultKeychain.relief, ...obj(raw.relief) }
  if (!PROFILE_KINDS.includes(relief.profile)) relief.profile = defaultKeychain.relief.profile
  const source = { ...defaultKeychain.source, ...obj(raw.source) }
  if (source.kind !== 'distance' && source.kind !== 'brightness' && source.kind !== 'photo') source.kind = 'distance'
  // сглаживание: старые записи без полей остаются на 0 (модель не меняется), мусор приводится к 0
  const num0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  source.smooth = num0(source.smooth)
  source.despeckle = source.despeckle === true
  relief.smooth = num0(relief.smooth)
  const pattern = { ...defaultKeychain.pattern, ...obj(raw.pattern) }
  if (!PATTERN_KINDS.includes(pattern.kind)) pattern.kind = 'none'
  if (pattern.scope !== 'relief' && pattern.scope !== 'plateau' && pattern.scope !== 'base') pattern.scope = 'relief'
  const mount = { ...defaultKeychain.mount, ...obj(raw.mount) }
  if (!['none', 'hole', 'eyelet', 'channel'].includes(mount.style)) mount.style = 'none'
  const split = { ...defaultKeychain.split, ...obj(raw.split) }
  // положения штифтов: массив точек с конечными x и y, иначе автоматически
  split.pinPositions = Array.isArray(split.pinPositions) && (split.pinPositions as unknown[]).every((q) => { const o = obj(q); return Number.isFinite(o.x) && Number.isFinite(o.y) })
    ? (split.pinPositions as { x: number; y: number }[]) : null
  return {
    ...raw,
    origin: { kind: 'image' }, // режим «Изображение»: фигура живёт в своём состоянии (keychain.shape)
    imageId: typeof raw.imageId === 'string' ? raw.imageId : '',
    imageName: typeof raw.imageName === 'string' ? raw.imageName : '',
    silhouette: sil,
    size: { ...defaultKeychain.size, ...obj(raw.size) },
    source: normalizePhotoSource(source),
    crop: normalizeCrop(raw.crop),
    outline: normalizeOutline(raw.outline),
    relief,
    detail: { ...defaultKeychain.detail, ...obj(raw.detail) },
    pattern,
    mount,
    split,
    text: normalizeText(raw.text),
    base: { ...defaultKeychain.base, ...obj(raw.base) },
    quality: { ...defaultKeychain.quality, ...obj(raw.quality) },
  }
}
