import { DEFAULT_AREA_LEVEL, defaultAiSilhouette, defaultKeychain, type AiSilhouetteParams, type AreaSetting } from '../../geometry/keychain'
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
  sil.source = sil.source === 'ai' ? 'ai' : 'brightness'
  sil.ai = normalizeAiSilhouette(sil.ai)
  sil.autoOpen = typeof sil.autoOpen === 'number' && Number.isFinite(sil.autoOpen) && sil.autoOpen >= 0 ? sil.autoOpen : null
  sil.areas = areas
  if (sil.threshold !== 'auto' && !(typeof sil.threshold === 'number' && Number.isFinite(sil.threshold))) sil.threshold = 'auto'
  const relief = { ...defaultKeychain.relief, ...obj(raw.relief) }
  if (!PROFILE_KINDS.includes(relief.profile)) relief.profile = defaultKeychain.relief.profile
  const source = { ...defaultKeychain.source, ...obj(raw.source) }
  if (source.kind !== 'distance' && source.kind !== 'brightness') source.kind = 'distance'
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
    source,
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
