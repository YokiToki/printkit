import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d'
import { getWasm } from './wasm'
import { roundedRectCS } from './bin'
import { dropCollinear, maskLoops, type Pt } from './art/trace'
import { findHoles, removeSpecks, type Hole } from './raster/components'
import { edt } from './raster/edt'
import { close, dilate, erode } from './raster/morphology'
import { maskBounds, resampleGray, resampleIds, resampleMask } from './raster/resample'
import { keepLargest, smoothThreshold } from './raster/matte'
import { photoHeights, type DetailMode, type PhotoMix } from './photoRelief'
import { defaultOutline, traceImageOutline, type OutlineParams } from './imageOutline'
import { midtoneShare, otsu, toMask, type GrayImage } from './raster/threshold'
import { profileValue, type ProfileParams } from './patterns/profile'
import { coverage, type PatternParams } from './patterns/fields'
import { skeleton } from './raster/thin'
import { gaussianBlur, median3, sigmaCells } from './raster/blur'
import { anchorField, exitRay, findAnchors, nearestExit, relToMm, type Anchor, type AnchorField, type Rejected } from './anchors'
import { fitChecks, type FitIssue } from './keychainFit'
import { inflateShape, shapeMask, type ShapeParams } from './shapes'
import { defaultText, MAX_TEXT_CHARS, MAX_TEXT_LINES, textBoxMm, textSampler, type TextParams, type TextRaster, type TextRegistry } from './text'
import { shapeCrossSection } from './shapeOutline'
import { textPolygons } from './textOutline'
import { bottomAssembly, identity, pinAssembly, type Assembly } from './keychainAssembly'
import { cylinderAlong, cylinderZ, lugJoin, lugSolid, pinLength, pinRadiusLoose, pinSolid } from './keychainMounts'

// ---------- параметры ----------

/** Режим области: следует рельефу (залита), открыта (вырезана насквозь) или ровный уровень заданной высоты. */
export type AreaMode = 'follow' | 'open' | 'level'
export interface AreaSetting { mode: AreaMode; /** Высота плоской вершины над подложкой, мм (режим level). */ level: number }
export const DEFAULT_AREA_LEVEL = 0.6

/** Откуда берётся силуэт: яркость (порог, как раньше) или нейросеть (мягкая альфа, зарегистрированная в воркере). */
export type SilhouetteSource = 'brightness' | 'ai' | 'frame'

/** Силуэт по нейросети: мягкая альфа (matte) хранится рядом с изображением, а эти значения превращают её в маску без нового запуска сети. */
export interface AiSilhouetteParams {
  /** Модель, которой получена альфа (для подписи и устаревания). */
  model: string
  /** Порог альфы 0…1: ниже — контур заходит дальше в мягкий край. */
  threshold: number
  /** Радиус сглаживания альфы, мм готового брелка: одно значение даёт одинаковую гладкость при любом разрешении картинки. */
  smooth: number
  /** Оставить только крупнейшую связную область. */
  keepLargest: boolean
  /** Номер альфы в реестре воркера; пусто — альфы нет. */
  matteId: string
}
/** Мягкая альфа в реестре воркера: размеры картинки, значения 0…255. */
export interface Matte { width: number; height: number; data: Uint8Array }
export type MatteRegistry = Map<string, Matte>
export const defaultAiSilhouette: AiSilhouetteParams = { model: '', threshold: 0.5, smooth: 0.3, keepLargest: true, matteId: '' }
/** Площадь области, начиная с которой она открыта сама (мм² детали), если `autoOpen` не задан: нейросеть 150, яркость 0 (как раньше). */
export const AUTO_OPEN_AI = 150

export interface SilhouetteParams {
  /** Источник силуэта; по умолчанию яркость (результат прежний). */
  source: SilhouetteSource
  ai: AiSilhouetteParams
  /** Область фона без своего режима открывается сама, если её площадь не меньше этого значения, мм² детали; меньшие заливаются. null — по источнику (150 для ИИ, 0 для яркости), 0 — выключено. */
  autoOpen: number | null
  /** Порог яркости 0…255 или 'auto' (Оцу). */
  threshold: number | 'auto'
  invert: boolean
  /** Радиус смыкания щелей, пиксели картинки. */
  close: number
  /** Заливать замкнутые области фона (кроме открытых в `areas`); выключено — все области открыты. */
  fillHoles: boolean
  /** Настройки областей по их стабильным номерам; нет записи — область следует рельефу. */
  areas: Record<number, AreaSetting>
  /** Пятна материала меньше этого числа пикселей удаляются. */
  speck: number
  /** Расширение (>0) или сужение (<0) силуэта, пиксели картинки. */
  grow: number
}

export type SizeMode = 'longest' | 'width' | 'height' | 'box'
export interface SizeParams { mode: SizeMode; longest: number; width: number; height: number }

/** Что задаёт высоту рельефа: расстояние от кромки силуэта или яркость изображения внутри него. */
export type HeightSource = 'distance' | 'brightness' | 'photo'
export interface SourceParams {
  kind: HeightSource
  /** Контраст яркости (1 — без изменений). */
  contrast: number
  /** Гамма яркости (1 — без изменений). */
  gamma: number
  /** Светлое ниже, тёмное выше. */
  invert: boolean
  /** Размытие яркости до контраста и гаммы, радиус в мм (0 — выключено): убирает зерно фотографии. */
  smooth?: number
  /** Убрать одиночные пятна яркости (медиана 3 × 3) до размытия. */
  despeckle?: boolean
  // ---- источник «Фото» (смесь контура, глубины и деталей); у остальных источников не используется ----
  /** Доли смеси 0…100: нормируются по сумме. Поля источника «Фото» необязательны: пропущенные берутся из умолчаний (`resolvePhoto`). */
  mix?: PhotoMix
  /** Глубина в реестре воркера (`registerDepth`); пусто — глубины нет. */
  depthId?: string
  /** Модель, которой получена глубина (для подписи и ключа хранилища). */
  depthModel?: string
  /** Усиление деталей (локальный контраст), 0 — выключено. */
  boost?: number
  /** Радиус деталей, мм детали. */
  boostRadius?: number
  /** Тоновые уровни детали 2…8 (0 — без квантования) и мягкость ступеней 0…1. */
  levels?: number
  levelSoftness?: number
  /** Детали: гравировка тёмного, тон как высота или оба; порог тёмного для гравировки. */
  detailMode?: DetailMode
  darkThreshold?: number
  /** Привязка глубины к краям 0…100, предел крутизны (градусы), итоговое сглаживание (мм); 0 — выключено. */
  snap?: number
  maxSlope?: number
  finalSmooth?: number
}

export interface ReliefParams extends ProfileParams {
  /** Высота плато рельефа над подложкой, мм. */
  hmax: number
  /** Ширина скоса от кромки до плато, мм. */
  edgeWidth: number
  /** Минимальная высота рельефа у кромки, мм. */
  heightFloor: number
  /** Сглаживание готовой поверхности рельефа, радиус в мм (0 или нет — выключено); до деталей, узоров и позднейших элементов. */
  smooth?: number
}

/** Хребет вдоль срединной оси и канавка у кромки (порт spine/groove из 02_heightfield.py, в миллиметрах). */
export interface DetailParams {
  /** Высота хребта над плато, мм (0 — выключен). */
  spineAmp: number
  /** Ширина хребта (σ гауссианы), мм. */
  spineWidth: number
  /** Глубина канавки, мм (0 — выключена). */
  grooveDepth: number
  /** Ширина канавки, мм. */
  grooveWidth: number
  /** Расстояние оси канавки от кромки, мм. */
  grooveOffset: number
}

export type PlateShape = 'silhouette' | 'rect' | 'rounded' | 'circle'
export interface BaseParams {
  /** Толщина подложки, мм; 0 — только рельеф. */
  thickness: number
  shape: PlateShape
  /** Для «по силуэту»: на сколько подложка шире силуэта, мм. */
  offset: number
  /** Поле вокруг силуэта для прямоугольника и круга при автоматическом размере, мм. */
  margin: number
  /** Радиус скругления для «скруглённого прямоугольника», мм. */
  radius: number
  /** true — размер подложки по габариту силуэта плюс поле; false — задан width × height (у круга width — диаметр). */
  auto: boolean
  width: number
  height: number
}

export interface QualityParams {
  /** Желаемый шаг сетки рельефа, мм. */
  cell: number
  /** Бюджет треугольников: при превышении шаг увеличивается. */
  maxTriangles: number
}

export type MountStyle = 'none' | 'hole' | 'eyelet' | 'channel'

/** Крепление под кольцо. Положения — доля габарита силуэта (0 слева/снизу, Y вверх), поэтому переживают смену размера. */
export interface MountParams {
  style: MountStyle
  x: number
  y: number
  /** Диаметр отверстия, канала или отверстия ушка, мм. */
  diameter: number
  /** Наружный диаметр ушка, мм. */
  outer: number
  /** Канал: точка выхода наружу (доля габарита). */
  exitX: number
  exitY: number
  /** Минимальная стенка вокруг элементов, мм. */
  minWall: number
}

/** Режим двух половин: симметричный рельеф делится по средней плоскости; штифты совмещают половины. */
export interface SplitParams {
  enabled: boolean
  /** Число штифтов 0…6. */
  pins: number
  /** Радиус отверстия под штифт, мм. */
  pinRadius: number
  /** Зазор: свободный штифт тоньше отверстия на эту величину, мм. */
  clearance: number
  /** Глубина отверстия в каждой половине, мм. */
  pinDepth: number
  /** Положения штифтов (доли габарита); null — автоматически по лучшим местам. */
  pinPositions: { x: number; y: number }[] | null
  /** Зазор между деталями на листе, мм. */
  gap: number
}

/** Готовые диаметры отверстия под кольцо по толщине проволоки. */
export const RING_PRESETS = [{ id: 'thin', diameter: 3 }, { id: 'standard', diameter: 4 }, { id: 'heavy', diameter: 5 }] as const

/** Откуда берётся контур: изображение (маска по порогу) или готовая фигура (аналитическая маска). */
export type Origin = { kind: 'image' } | { kind: 'shape'; shape: ShapeParams }

/** Кадрирование: доли изображения (по умолчанию всё изображение). Дальше силуэт, яркость, альфа и глубина берутся из этого окна. */
export interface Crop { x: number; y: number; w: number; h: number }
export const fullCrop: Crop = { x: 0, y: 0, w: 1, h: 1 }
export const MIN_CROP = 0.05

export interface KeychainParams {
  /** Режим: у фигуры нет порога, дырок и яркости, а размер задаёт сама фигура (`size` и `silhouette` игнорируются). */
  origin: Origin
  /** Изображение лежит вне параметров (в IndexedDB и в воркере), параметры ссылаются на него по id. */
  imageId: string
  /** Окно изображения, с которым работает всё остальное. */
  crop: Crop
  /** Контур силуэта из изображения: гладкий многоугольник, по которому точно обрезается рельеф. */
  outline?: OutlineParams
  silhouette: SilhouetteParams
  size: SizeParams
  source: SourceParams
  relief: ReliefParams
  detail: DetailParams
  pattern: PatternParams
  base: BaseParams
  mount: MountParams
  split: SplitParams
  /** Надпись: общая для обоих режимов. */
  text: TextParams
  quality: QualityParams
}

export const defaultSource: SourceParams = {
  kind: 'distance', contrast: 1, gamma: 1, invert: false, smooth: 0, despeckle: false,
  mix: { contour: 25, depth: 45, detail: 30 }, depthId: '', depthModel: '', boost: 2, boostRadius: 1.4, levels: 0, levelSoftness: 0.6, detailMode: 'engrave', darkThreshold: 0.25, snap: 60, maxSlope: 50, finalSmooth: 0.2,
}
/** Сглаживание яркости, с которого начинается выбор источника «яркость» в интерфейсе (старые записи остаются на 0). */
export const BRIGHTNESS_SMOOTH_DEFAULT = 0.4
export const MAX_SMOOTH = 3
export const defaultDetail: DetailParams = { spineAmp: 0, spineWidth: 0.55, grooveDepth: 0, grooveWidth: 0.6, grooveOffset: 1.5 }
export const defaultPattern: PatternParams = { kind: 'none', pitch: 1.5, width: 0.5, depth: 0.3, angle: 45, offset: 0, staggered: true, scope: 'relief' }

export const defaultMount: MountParams = { style: 'none', x: 0.5, y: 0.92, diameter: 4, outer: 9, exitX: 0.5, exitY: 1.04, minWall: 1.2 }
export const defaultSplit: SplitParams = { enabled: false, pins: 3, pinRadius: 0.9, clearance: 0.1, pinDepth: 1, pinPositions: null, gap: 10 }

export const defaultKeychain: KeychainParams = {
  origin: { kind: 'image' },
  imageId: '',
  crop: fullCrop,
  outline: defaultOutline,
  silhouette: { source: 'brightness', ai: defaultAiSilhouette, autoOpen: null, threshold: 'auto', invert: false, close: 3, fillHoles: true, areas: {}, speck: 200, grow: 2 },
  size: { mode: 'longest', longest: 70, width: 70, height: 70 },
  source: defaultSource,
  relief: { hmax: 2, edgeWidth: 6, pow: 0.65, heightFloor: 0.06, profile: 'bevel', steps: 3, smooth: 0 },
  detail: defaultDetail,
  pattern: defaultPattern,
  base: { thickness: 2, shape: 'silhouette', offset: 0, margin: 3, radius: 4, auto: true, width: 80, height: 60 },
  mount: defaultMount,
  split: defaultSplit,
  text: defaultText,
  quality: { cell: 0.25, maxTriangles: 400_000 },
}

// ---------- проверка параметров ----------

export interface KeychainError { field: string; key: string }

/** Проверка параметров, не зависящая от картинки (размер подложки относительно силуэта проверяется при построении). */
export function validateKeychain(p: KeychainParams): { ok: boolean; errors: KeychainError[] } {
  const errors: KeychainError[] = []
  const bad = (field: string, key: string) => errors.push({ field, key })
  const pos = (v: number) => Number.isFinite(v) && v > 0
  const nonneg = (v: number) => Number.isFinite(v) && v >= 0
  const sz = p.size
  const shape = p.origin.kind === 'shape' ? p.origin.shape : null
  if (shape) {
    // размер задаёт фигура; поля изображения (размер, яркость) не проверяются
    const hasH = shape.kind === 'rect' || shape.kind === 'ellipse' || shape.kind === 'capsule'
    if (!pos(shape.width)) bad('shape.width', 'keychain.error.size')
    if (hasH && !pos(shape.height)) bad('shape.height', 'keychain.error.size')
    if ((shape.kind === 'rect' || shape.kind === 'polygon') && !nonneg(shape.radius)) bad('shape.radius', 'keychain.error.negative')
    if (shape.kind === 'polygon') {
      if (!(Number.isInteger(shape.sides) && shape.sides >= 3 && shape.sides <= 12)) bad('shape.sides', 'keychain.error.sides')
      if (!Number.isFinite(shape.rotation)) bad('shape.rotation', 'keychain.error.size')
    }
    if (shape.rim.enabled) {
      if (!pos(shape.rim.width)) bad('shape.rim.width', 'keychain.error.size')
      if (!nonneg(shape.rim.height)) bad('shape.rim.height', 'keychain.error.negative')
    }
  } else {
    if (sz.mode === 'longest' && !pos(sz.longest)) bad('size.longest', 'keychain.error.size')
    if ((sz.mode === 'width' || sz.mode === 'box') && !pos(sz.width)) bad('size.width', 'keychain.error.size')
    if ((sz.mode === 'height' || sz.mode === 'box') && !pos(sz.height)) bad('size.height', 'keychain.error.size')
  }
  const r = p.relief
  if (!pos(r.hmax)) bad('relief.hmax', 'keychain.error.hmax')
  if (!pos(r.edgeWidth)) bad('relief.edgeWidth', 'keychain.error.edgeWidth')
  if (!pos(r.pow)) bad('relief.pow', 'keychain.error.pow')
  if (!Number.isFinite(r.heightFloor) || r.heightFloor < 0) bad('relief.heightFloor', 'keychain.error.negative')
  else if (r.heightFloor >= r.hmax) bad('relief.heightFloor', 'keychain.error.heightFloor')
  if (r.profile === 'terrace' && !(Number.isInteger(r.steps) && r.steps >= 2)) bad('relief.steps', 'keychain.error.steps')
  if (!shape) for (const [id, a] of Object.entries(p.silhouette.areas ?? {})) if (a.mode === 'level' && !(Number.isFinite(a.level) && a.level >= 0)) bad(`silhouette.areas.${id}`, 'keychain.error.areaLevel')
  const so = p.source
  if (so.kind === 'brightness' && !shape) {
    if (!pos(so.contrast)) bad('source.contrast', 'keychain.error.contrast')
    if (!pos(so.gamma)) bad('source.gamma', 'keychain.error.gamma')
    if (so.smooth !== undefined && !(Number.isFinite(so.smooth) && so.smooth >= 0 && so.smooth <= MAX_SMOOTH)) bad('source.smooth', 'keychain.error.smooth')
  }
  if (r.smooth !== undefined && !(Number.isFinite(r.smooth) && r.smooth >= 0 && r.smooth <= MAX_SMOOTH)) bad('relief.smooth', 'keychain.error.smooth')
  const d = p.detail
  if (!nonneg(d.spineAmp)) bad('detail.spineAmp', 'keychain.error.negative')
  else if (d.spineAmp > 0 && !pos(d.spineWidth)) bad('detail.spineWidth', 'keychain.error.size')
  if (!nonneg(d.grooveDepth)) bad('detail.grooveDepth', 'keychain.error.negative')
  else if (d.grooveDepth > 0 && !(pos(d.grooveWidth) && nonneg(d.grooveOffset))) bad('detail.grooveWidth', 'keychain.error.size')
  const t = p.pattern
  if (t.kind !== 'none') {
    if (!nonneg(t.depth)) bad('pattern.depth', 'keychain.error.negative')
    if (!pos(t.pitch)) bad('pattern.pitch', 'keychain.error.size')
    else if (!pos(t.width) || t.width >= t.pitch) bad('pattern.width', 'keychain.error.patternPitch')
    if (!Number.isFinite(t.angle) || !Number.isFinite(t.offset)) bad('pattern.angle', 'keychain.error.size')
  }
  const b = p.base
  if (!Number.isFinite(b.thickness) || b.thickness < 0) bad('base.thickness', 'keychain.error.negative')
  if (!Number.isFinite(b.offset) || b.offset < 0) bad('base.offset', 'keychain.error.negative')
  if (!Number.isFinite(b.margin) || b.margin < 0) bad('base.margin', 'keychain.error.negative')
  if (!Number.isFinite(b.radius) || b.radius < 0) bad('base.radius', 'keychain.error.negative')
  if (!b.auto && (b.shape === 'rect' || b.shape === 'rounded') && !(pos(b.width) && pos(b.height))) bad('base.width', 'keychain.error.size')
  if (!b.auto && b.shape === 'circle' && !pos(b.width)) bad('base.width', 'keychain.error.size')
  if (b.thickness <= 0 && r.profile === 'engraved') bad('base.thickness', 'keychain.error.engraveNoPlate')
  if (b.thickness <= 0 && t.kind !== 'none' && t.scope === 'base') bad('pattern.scope', 'keychain.error.scopeNoPlate')
  const mo = p.mount, sp = p.split
  if (mo.style !== 'none') {
    if (!pos(mo.diameter)) bad('mount.diameter', 'keychain.error.size')
    if (!nonneg(mo.minWall)) bad('mount.minWall', 'keychain.error.negative')
    if (![mo.x, mo.y].every(Number.isFinite)) bad('mount.x', 'keychain.error.size')
  }
  if (mo.style === 'eyelet') {
    if (!pos(mo.outer) || mo.outer < mo.diameter + 2 * (Number.isFinite(mo.minWall) ? mo.minWall : 0) - 1e-9) bad('mount.outer', 'keychain.error.eyeletWall')
    if (!(b.thickness > 0)) bad('base.thickness', 'keychain.error.eyeletNoPlate')
  }
  if (mo.style === 'channel' && !sp.enabled) bad('mount.style', 'keychain.error.channelNeedsSplit')
  if (sp.enabled) {
    if (!(Number.isInteger(sp.pins) && sp.pins >= 0 && sp.pins <= 6)) bad('split.pins', 'keychain.error.pins')
    if (sp.pins > 0) {
      if (!pos(sp.pinRadius)) bad('split.pinRadius', 'keychain.error.size')
      if (!nonneg(sp.clearance) || sp.clearance >= sp.pinRadius) bad('split.clearance', 'keychain.error.clearance')
      if (!pos(sp.pinDepth)) bad('split.pinDepth', 'keychain.error.size')
    }
    if (!nonneg(sp.gap)) bad('split.gap', 'keychain.error.negative')
  }
  const tx = p.text
  if (tx?.enabled) {
    if (!pos(tx.size)) bad('text.size', 'keychain.error.size')
    if (!Number.isFinite(tx.letterSpacing)) bad('text.letterSpacing', 'keychain.error.size')
    if (!pos(tx.lineSpacing)) bad('text.lineSpacing', 'keychain.error.size')
    if (!Number.isFinite(tx.rotation)) bad('text.rotation', 'keychain.error.size')
    if (![tx.x, tx.y].every(Number.isFinite)) bad('text.x', 'keychain.error.size')
    if (tx.mode === 'emboss' && !nonneg(tx.height)) bad('text.height', 'keychain.error.negative')
    if (tx.mode === 'engrave' && !nonneg(tx.depth)) bad('text.depth', 'keychain.error.negative')
    if (tx.content.length > MAX_TEXT_CHARS || tx.content.split('\n').length > MAX_TEXT_LINES) bad('text.content', 'keychain.error.textLength')
  }
  const q = p.quality
  if (!(Number.isFinite(q.cell) && q.cell >= 0.02 && q.cell <= 5)) bad('quality.cell', 'keychain.error.cell')
  if (!(Number.isFinite(q.maxTriangles) && q.maxTriangles >= 10_000)) bad('quality.maxTriangles', 'keychain.error.budget')
  return { ok: errors.length === 0, errors }
}

// ---------- силуэт ----------

export interface SilhouetteResult {
  /** Итоговая маска материала в разрешении картинки. */
  mask: Uint8Array
  threshold: number
  /** Области (замкнутый фон смыкнутой маски до заливки): номера стабильны, пока набор областей тот же; mode — действующий режим. */
  areas: (Hole & { mode: AreaMode; level: number; open: boolean })[]
  /** Номер области каждого пикселя смыкнутой маски (0 — не область). */
  areaId: Int32Array
  /** Номера областей с сохранёнными настройками, которых больше нет (набор областей изменился). */
  goneAreas: number[]
  /** Доля полутонов: у фотографий велика. */
  photoLike: boolean
  /** Выбран источник «ИИ», но альфы нет (хранилище очищено): силуэт построен по яркости. */
  aiMissing?: boolean
}

const PHOTO_SHARE = 0.4

/** Окно кадрирования в пикселях [x0, y0, x1, y1) (границы целые, окно не меньше одного пикселя, внутри изображения). */
export function cropRect(c: Crop, w: number, h: number): [number, number, number, number] {
  const x0 = Math.min(w - 1, Math.max(0, Math.round(c.x * w))), y0 = Math.min(h - 1, Math.max(0, Math.round(c.y * h)))
  const x1 = Math.min(w, Math.max(x0 + 1, Math.round((c.x + c.w) * w))), y1 = Math.min(h, Math.max(y0 + 1, Math.round((c.y + c.h) * h)))
  return [x0, y0, x1, y1]
}
const isFull = (c: Crop) => c.x <= 0 && c.y <= 0 && c.w >= 1 && c.h >= 1

/** Кадрированная копия изображения (яркость и альфа); полный кадр возвращается как есть, без копирования. */
export function cropImage(img: GrayImage, c: Crop): GrayImage {
  if (isFull(c)) return img
  const [x0, y0, x1, y1] = cropRect(c, img.width, img.height), w = x1 - x0, h = y1 - y0
  const gray = new Uint8Array(w * h), alpha = img.alpha ? new Uint8Array(w * h) : null
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const q = (y0 + j) * img.width + x0 + i; gray[j * w + i] = img.gray[q]; if (alpha) alpha[j * w + i] = img.alpha![q] }
  return { width: w, height: h, gray, alpha }
}

/** То же для плоскости того же размера, что и изображение (альфа нейросети, глубина). */
export function cropPlane(m: Matte, c: Crop): Matte {
  if (isFull(c)) return m
  const [x0, y0, x1, y1] = cropRect(c, m.width, m.height), w = x1 - x0, h = y1 - y0, data = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) data.set(m.data.subarray((y0 + j) * m.width + x0, (y0 + j) * m.width + x1), j * w)
  return { width: w, height: h, data }
}

/** Пикселей изображения на мм готового брелка: по габариту маски и режиму размера; без габарита (пусто) — 1. */
function pxPerMmOf(mask: Uint8Array, w: number, h: number, size: SizeParams | undefined): number {
  const b = size ? maskBounds(mask, w, h) : null
  if (!b || !size) return 1
  const bw = b[2] - b[0] + 1, bh = b[3] - b[1] + 1
  const mm = sizeMm(size, bw, bh)
  return mm.w > 0 ? bw / mm.w : 1
}

/**
 * Картинка → чистый силуэт: порог → смыкание → заливка областей → удаление пятен → расширение (как 01_silhouette.py). Источник
 * «ИИ»: вместо порога яркости маска строится из мягкой альфы (сглаживание в мм брелка, порог, крупнейшая область), дальше тот же
 * путь. `ctx.size` нужен для перевода мм в пиксели; `ctx.matte` — альфа из реестра воркера.
 */
export function buildSilhouette(img: GrayImage, s: SilhouetteParams, ctx: { matte?: Matte; size?: SizeParams } = {}): SilhouetteResult {
  const { width: w, height: h } = img
  const useAi = s.source === 'ai'
  const matte = useAi && ctx.matte && ctx.matte.width === w && ctx.matte.height === h ? ctx.matte : undefined
  const aiMissing = useAi && !matte
  let threshold = 0, ink: Uint8Array
  if (s.source === 'frame') {
    // «Весь кадр»: каждый пиксель кадрированного изображения — материал (портрет в плашке); ни порога, ни областей
    ink = new Uint8Array(w * h).fill(1)
  } else if (matte) {
    // масштаб (пикселей на мм) определяется по грубой маске без сглаживания: габарит силуэта задаёт размер брелка
    const rough = smoothThreshold(matte.data, w, h, 0, s.ai.threshold)
    const scale = pxPerMmOf(rough, w, h, ctx.size)
    const alpha = smoothThreshold(matte.data, w, h, s.ai.smooth * scale, s.ai.threshold)
    ink = new Uint8Array(w * h)
    for (let i = 0; i < ink.length; i++) ink[i] = alpha[i] >= 128 ? 1 : 0
    if (s.ai.keepLargest) ink = keepLargest(ink, w, h)
  } else {
    threshold = s.threshold === 'auto' ? otsu(img.gray) : s.threshold
    ink = toMask(img, threshold, s.invert)
  }
  const closed = close(ink, w, h, s.close)
  const { holes, labels } = findHoles(closed, w, h)
  const settings = s.areas ?? {}
  // автоматические области: большой пробел (кольцо, просвет между лапами) открывается, мелкий между штрихами заливается
  const autoOpen = s.autoOpen ?? (matte ? AUTO_OPEN_AI : 0)
  const mm2PerPx = autoOpen > 0 ? 1 / pxPerMmOf(closed, w, h, ctx.size) ** 2 : 0
  const areas = holes.map((x) => {
    const set = settings[x.id]
    const auto: AreaMode = autoOpen > 0 && x.size * mm2PerPx >= autoOpen ? 'open' : 'follow'
    const mode: AreaMode = s.fillHoles ? (set?.mode ?? auto) : 'open'
    return { ...x, mode, level: set && Number.isFinite(set.level) ? set.level : DEFAULT_AREA_LEVEL, open: mode === 'open' }
  })
  // номер области по метке компоненты фона; заливаются все, кроме открытых
  const idOfLabel = new Int32Array(Math.max(0, ...holes.map((x) => x.label)) + 1)
  const fill = new Uint8Array(idOfLabel.length)
  for (const x of areas) { idOfLabel[x.label] = x.id; if (!x.open) fill[x.label] = 1 }
  const areaId = new Int32Array(labels.length)
  const filled = new Uint8Array(closed)
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]
    if (l && l < idOfLabel.length && idOfLabel[l]) { areaId[i] = idOfLabel[l]; if (fill[l]) filled[i] = 1 }
  }
  const clean = removeSpecks(filled, w, h, s.speck)
  const mask = s.grow > 0 ? dilate(clean, w, h, s.grow) : s.grow < 0 ? erode(clean, w, h, -s.grow) : clean
  const known = new Set(areas.map((x) => x.id))
  const goneAreas = Object.keys(settings).map(Number).filter((id) => !known.has(id) && settings[id].mode !== 'follow').sort((a, b) => a - b)
  return { mask, threshold, areas, areaId, goneAreas, photoLike: midtoneShare(img.gray) > PHOTO_SHARE, ...(aiMissing ? { aiMissing: true } : {}) }
}

// ---------- предпросмотр маски ----------

/** Значения предпросмотра: 0 фон, 1 материал, 2 открытая область, 3 залитая область, 4 область с заданным уровнем. */
export interface MaskPreview {
  width: number
  height: number
  data: Uint8Array
  /** Номер области каждого пикселя предпросмотра (0 — не область): для выбора щелчком. */
  labels: Uint16Array
  /** Габарит силуэта в пикселях предпросмотра: [x0, y0, x1, y1] (нужен редактору положения для перевода в мм). */
  box: [number, number, number, number]
  /** Области с центрами в пикселях предпросмотра. */
  areas: { id: number; size: number; cx: number; cy: number; open: boolean; mode: AreaMode; level: number }[]
}

export const PREVIEW_MAX = 256

export function maskPreview(img: GrayImage, sil: SilhouetteResult): MaskPreview | null {
  const b = maskBounds(sil.mask, img.width, img.height)
  if (!b) return null
  const pad = 4
  const x0 = Math.max(0, b[0] - pad), y0 = Math.max(0, b[1] - pad), x1 = Math.min(img.width - 1, b[2] + pad), y1 = Math.min(img.height - 1, b[3] + pad)
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1
  const k = Math.min(1, PREVIEW_MAX / Math.max(cw, ch))
  const pw = Math.max(1, Math.round(cw * k)), ph = Math.max(1, Math.round(ch * k))
  const data = new Uint8Array(pw * ph), labels = new Uint16Array(pw * ph)
  const byId = new Map(sil.areas.map((x) => [x.id, x]))
  for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
    const sx = x0 + Math.min(cw - 1, Math.floor((i + 0.5) / k)), sy = y0 + Math.min(ch - 1, Math.floor((j + 0.5) / k))
    const p = sy * img.width + sx
    const id = sil.areaId[p]
    const area = id ? byId.get(id) : undefined
    labels[j * pw + i] = id > 65535 ? 0 : id
    data[j * pw + i] = sil.mask[p] ? (area ? (area.mode === 'level' ? 4 : 3) : 1) : area?.open ? 2 : 0
  }
  return {
    width: pw, height: ph, data, labels,
    box: [(b[0] - x0) * k, (b[1] - y0) * k, (b[2] + 1 - x0) * k, (b[3] + 1 - y0) * k],
    areas: sil.areas.map((x) => ({ id: x.id, size: x.size, cx: (x.cx - x0) * k, cy: (x.cy - y0) * k, open: x.open, mode: x.mode, level: x.level })),
  }
}

// ---------- рельеф ----------

const smoothstep = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c) }

/** Высота рельефа над подложкой по расстоянию до кромки, мм: профиль (по умолчанию плато + скос), не ниже heightFloor (как 02_heightfield.py). */
export function reliefHeight(distMm: number, r: ReliefParams): number {
  return Math.max(r.hmax * profileValue(distMm / r.edgeWidth, r), r.heightFloor)
}

/** Яркость пикселя 0…1 → доля высоты 0…1: контраст вокруг середины, гамма, инверсия. */
/** Параметры источника «Фото» с умолчаниями на месте пропущенных полей. */
export function resolvePhoto(s: SourceParams): Required<Pick<SourceParams, 'mix' | 'depthId' | 'boost' | 'boostRadius' | 'levels' | 'levelSoftness' | 'detailMode' | 'darkThreshold' | 'snap' | 'maxSlope' | 'finalSmooth'>> & Pick<SourceParams, 'contrast' | 'gamma' | 'invert'> {
  const d = defaultSource
  return { mix: s.mix ?? d.mix!, depthId: s.depthId ?? '', boost: s.boost ?? d.boost!, boostRadius: s.boostRadius ?? d.boostRadius!, levels: s.levels ?? 0, levelSoftness: s.levelSoftness ?? d.levelSoftness!, detailMode: s.detailMode ?? d.detailMode!, darkThreshold: s.darkThreshold ?? d.darkThreshold!, snap: s.snap ?? d.snap!, maxSlope: s.maxSlope ?? d.maxSlope!, finalSmooth: s.finalSmooth ?? d.finalSmooth!, contrast: s.contrast, gamma: s.gamma, invert: s.invert }
}

export function brightnessValue(g: number, s: SourceParams): number {
  const c = Math.min(1, Math.max(0, (g - 0.5) * s.contrast + 0.5)) ** s.gamma
  return s.invert ? 1 - c : c
}

/** Размер силуэта в мм по режиму размера и габариту в пикселях. */
export function sizeMm(s: SizeParams, wPx: number, hPx: number): { w: number; h: number } {
  switch (s.mode) {
    case 'width': { const k = s.width / wPx; return { w: s.width, h: hPx * k } }
    case 'height': { const k = s.height / hPx; return { w: wPx * k, h: s.height } }
    case 'box': return { w: s.width, h: s.height }
    default: { const k = s.longest / Math.max(wPx, hPx); return { w: wPx * k, h: hPx * k } }
  }
}

/** Шаг сетки: желаемый, но не мельче, чем позволяет бюджет треугольников (≈ 4 на ячейку материала); min — предел по бюджету. */
export function effectiveCell(wMm: number, hMm: number, fill: number, q: QualityParams): { cell: number; reduced: boolean; min: number } {
  const need = Math.sqrt((4.4 * wMm * hMm * Math.max(0.05, fill)) / q.maxTriangles)
  return need > q.cell ? { cell: need, reduced: true, min: need } : { cell: q.cell, reduced: false, min: need }
}

/** Самый мелкий шаг сетки (сотые доли мм), который укладывается в бюджет треугольников. */
const finestCell = (minCell: number) => Math.ceil(Math.max(minCell, 0.02) * 100) / 100

/** Разрешение и узор: мелкие детали у шага сетки получаются ступенчатыми. */
export interface PatternResolution { tooFine: boolean; minPitch: number; /** Можно ли уменьшить шаг сетки в пределах бюджета. */ canRaise: boolean; raiseTo: number }
export function patternResolution(p: PatternParams, cell: number, minCell: number): PatternResolution {
  const minPitch = 4 * cell
  const raiseTo = finestCell(minCell)
  return { tooFine: p.kind !== 'none' && p.pitch < minPitch - 1e-9, minPitch, canRaise: raiseTo < cell - 1e-9, raiseTo }
}

/** Разрешение и сглаживание: радиус меньше одной ячейки сетки на неё не действует. Предлагаемый шаг — радиус (но не мельче бюджета). */
export interface SmoothResolution { noEffect: boolean; canRaise: boolean; raiseTo: number }
export function smoothResolution(radius: number, cell: number, minCell: number): SmoothResolution {
  const raiseTo = Math.max(finestCell(minCell), Math.floor(radius * 100) / 100)
  return { noEffect: radius > 0 && radius < cell - 1e-9, canRaise: raiseTo < cell - 1e-9, raiseTo }
}

/** Разрешение и надпись: штрих букв ≈ size / 8; тоньше четырёх ячеек сетки — края ступенчатые. Предлагаемый шаг — четверть штриха (но не мельче бюджета). */
export interface TextResolution { tooFine: boolean; stroke: number; canRaise: boolean; raiseTo: number }
export function textResolution(size: number, cell: number, minCell: number): TextResolution {
  const stroke = size / 8
  const raiseTo = Math.max(finestCell(minCell), Math.floor((stroke / 4) * 100) / 100)
  return { tooFine: size > 0 && stroke < 4 * cell - 1e-9, stroke, canRaise: raiseTo < cell - 1e-9, raiseTo }
}

// ---------- подложка: форма ----------

export interface PlateSpec {
  shape: PlateShape
  offset: number
  /** Размер прямоугольной подложки, мм. */
  pw: number
  ph: number
  radius: number
  /** Диаметр круглой подложки, мм. */
  diameter: number
  /** На сколько подложка выступает за габарит силуэта по осям, мм. */
  overX: number
  overY: number
  /** Площадь подложки, мм² (грубо: для оценки бюджета). */
  area: number
}

/** Описание подложки или null (толщина 0); error — ключ ошибки, если фигура меньше силуэта. */
export function plateSpec(b: BaseParams, wMm: number, hMm: number): { spec: PlateSpec | null; error?: string } {
  if (b.thickness <= 0) return { spec: null }
  const diag = Math.hypot(wMm, hMm)
  const base = { shape: b.shape, offset: b.offset, radius: b.radius, pw: wMm, ph: hMm, diameter: diag }
  if (b.shape === 'silhouette') return { spec: { ...base, overX: b.offset, overY: b.offset, area: wMm * hMm * 0.8 + b.offset * 2 * (wMm + hMm) } }
  if (b.shape === 'circle') {
    const d = b.auto ? diag + 2 * b.margin : b.width
    if (d < diag - 1e-6) return { spec: null, error: 'keychain.error.plateTooSmall' }
    return { spec: { ...base, diameter: d, overX: (d - wMm) / 2, overY: (d - hMm) / 2, area: (Math.PI * d * d) / 4 } }
  }
  const pw = b.auto ? wMm + 2 * b.margin : b.width, ph = b.auto ? hMm + 2 * b.margin : b.height
  if (pw < wMm - 1e-6 || ph < hMm - 1e-6) return { spec: null, error: 'keychain.error.plateTooSmall' }
  return { spec: { ...base, pw, ph, overX: (pw - wMm) / 2, overY: (ph - hMm) / 2, area: pw * ph } }
}

/** Лежит ли точка (x, y) подложки; distOut — расстояние от точки до силуэта, мм (только для «по силуэту»). */
function plateInside(s: PlateSpec, x: number, y: number, distOut: number): boolean {
  switch (s.shape) {
    case 'silhouette': return distOut <= s.offset
    case 'circle': return Math.hypot(x, y) <= s.diameter / 2
    case 'rect': return Math.abs(x) <= s.pw / 2 && Math.abs(y) <= s.ph / 2
    default: {
      const r = Math.min(s.radius, Math.min(s.pw, s.ph) / 2)
      const qx = Math.abs(x) - (s.pw / 2 - r), qy = Math.abs(y) - (s.ph / 2 - r)
      return Math.abs(x) <= s.pw / 2 && Math.abs(y) <= s.ph / 2 && Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) <= r
    }
  }
}

// ---------- сетка рельефа ----------

export interface Grid {
  nx: number
  ny: number
  /** Шаг по осям, мм (по X и Y отличаются на доли процента, чтобы габарит был ровно заданным). */
  dx: number
  dy: number
  /** Первый узел твёрдых блоков силуэта по осям: от него отсчитываются координаты (тонкие кончики у края габарита выпадают из сетки, габарит считается по настоящим блокам). */
  i0: number
  j0: number
  /** Блоки, из которых строится сетка (между четырьмя узлами материала): 1 — твёрдый. */
  blocks: Uint8Array
  /** Высота верха в узле, мм от плоскости стола (подложка уже включена). */
  top: Float32Array
  /** Блоки только силуэта (для контура подложки по силуэту). */
  silBlocks: Uint8Array
  /** Узлы с материалом: силуэт и, если подложка в сетке, подложка. */
  solid: Uint8Array
}

export interface GridInput {
  img: GrayImage
  mask: Uint8Array
  bounds: [number, number, number, number]
  wMm: number
  hMm: number
  cell: number
  p: KeychainParams
  plate: PlateSpec | null
  /** Подложка строится в той же сетке (нужно для узора на подложке). */
  plateInGrid: boolean
  /** Глубина в разрешении `img` (источник «Фото»): значения 0…255; null — глубины нет. */
  depth?: Matte | null
  /** Фигура растеризована с запасом на столько мм (потом обрезается по точному контуру): расстояния до кромки считаются от настоящего края. */
  edgeShift?: number
  /** Бортик строится отдельно точным кольцом, в сетке его нет. */
  exactRim?: boolean
  /** Области с заданным уровнем: номера пикселей силуэта (разрешение картинки) и уровень каждой, мм над подложкой. */
  levels?: { ids: Int32Array; level: Map<number, number> }
  /** Надпись: покрытие 0…1 в точке (мм от центра габарита силуэта) и правило высоты. */
  text?: { cov: (x: number, y: number) => number; mode: 'emboss' | 'engrave'; height: number; depth: number }
}

const blocksOf = (m: Uint8Array, nx: number, ny: number) => {
  const b = new Uint8Array((nx - 1) * (ny - 1))
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) b[j * (nx - 1) + i] = m[j * nx + i] && m[j * nx + i + 1] && m[(j + 1) * nx + i] && m[(j + 1) * nx + i + 1] ? 1 : 0
  return b
}

/**
 * Сетка рельефа: маска фигуры → узлы, расстояния до кромки, источник высоты (расстояние или яркость), профиль, хребет и
 * канавка, узор. Габарит блоков силуэта ровно wMm × hMm. Порядок как в design: источник → профиль → детали → узор → нижняя граница.
 */
export function buildGrid(inp: GridInput): Grid {
  const { img, mask, bounds, wMm, hMm, cell, p, plate, plateInGrid } = inp
  const shift = inp.edgeShift ?? 0
  const r = p.relief, base = p.base.thickness, floor = r.heightFloor, engraved = r.profile === 'engraved'
  const pad = 2
  const ox = plateInGrid && plate ? Math.ceil(plate.overX / cell) + 1 : 0, oy = plateInGrid && plate ? Math.ceil(plate.overY / cell) + 1 : 0
  const sx = Math.max(3, Math.round(wMm / cell) + 1), sy = Math.max(3, Math.round(hMm / cell) + 1) // узлов по осям у фигуры
  const small = resampleMask(mask, img.width, bounds[0], bounds[1], bounds[2] + 1, bounds[3] + 1, sx, sy)
  const ax = pad + ox, ay = pad + oy
  const nx = sx + 2 * ax, ny = sy + 2 * ay
  const m = new Uint8Array(nx * ny)
  for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) m[(j + ay) * nx + i + ax] = small[j * sx + i]
  const silBlocks = blocksOf(m, nx, ny)

  // узлы областей с заданным уровнем: высота уровня (−1 — обычный узел); сглаживание их не трогает и не усредняет
  const levelAt = new Float32Array(nx * ny).fill(-1)
  const fixed = new Uint8Array(nx * ny)
  if (inp.levels && inp.levels.level.size) {
    const ids = resampleIds(inp.levels.ids, img.width, bounds[0], bounds[1], bounds[2] + 1, bounds[3] + 1, sx, sy)
    for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
      const lv = inp.levels.level.get(ids[j * sx + i])
      if (lv !== undefined && small[j * sx + i]) { const k = (j + ay) * nx + i + ax; levelAt[k] = lv; fixed[k] = 1 }
    }
  }

  // габарит по настоящим блокам: шаг подгоняется, чтобы сетка занимала ровно заданный размер
  const bw = nx - 1
  let bi0 = nx, bi1 = -1, bj0 = ny, bj1 = -1
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < bw; i++) if (silBlocks[j * bw + i]) { if (i < bi0) bi0 = i; if (i > bi1) bi1 = i; if (j < bj0) bj0 = j; if (j > bj1) bj1 = j }
  if (bi1 < 0) { bi0 = ax; bi1 = nx - ax - 2; bj0 = ay; bj1 = ny - ay - 2 }
  const dx = wMm / (bi1 + 1 - bi0), dy = hMm / (bj1 + 1 - bj0)
  const X = (i: number) => (i - bi0) * dx - wMm / 2
  const Y = (j: number) => hMm / 2 - (j - bj0) * dy

  const d = edt(m, nx, ny)
  const inv = (a: Uint8Array) => { const o = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] ? 0 : 1; return o }
  const spine = p.detail.spineAmp > 0 ? edt(inv(skeleton(m, nx, ny)), nx, ny) : null
  const shape = p.origin.kind === 'shape' ? p.origin.shape : null
  const rim = shape?.rim.enabled && shape.rim.height > 0 && !inp.exactRim ? shape.rim : null
  const photo = p.source.kind === 'photo' && !shape
  let gray: Float32Array | null = (p.source.kind === 'brightness' || photo) && !shape ? new Float32Array(nx * ny) : null
  if (gray) {
    const g = resampleGray(img.gray, img.width, bounds[0], bounds[1], bounds[2] + 1, bounds[3] + 1, sx, sy)
    for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) gray[(j + ay) * nx + i + ax] = g[j * sx + i]
    // сглаживание яркости: сначала медиана (одиночные пятна), потом гаусс; усредняются только узлы силуэта, контур не меняется
    if (p.source.despeckle) gray = median3(gray, nx, ny, m, fixed)
    const sg = sigmaCells(p.source.smooth ?? 0, cell)
    if (sg > 0) gray = gaussianBlur(gray, nx, ny, sg, m, fixed)
  }
  // источник «Фото»: смесь контура, глубины и деталей считается один раз на всю сетку (с пределом крутизны и сглаживанием)
  let photoH: Float32Array | null = null
  if (photo && gray) {
    const ph = resolvePhoto(p.source)
    let depthNodes: Float32Array | null = null
    if (inp.depth && inp.depth.width === img.width && inp.depth.height === img.height) {
      depthNodes = new Float32Array(nx * ny)
      const dd = resampleGray(inp.depth.data, img.width, bounds[0], bounds[1], bounds[2] + 1, bounds[3] + 1, sx, sy)
      for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) depthNodes[(j + ay) * nx + i + ax] = dd[j * sx + i]
    }
    const contour = new Float32Array(nx * ny)
    for (let k = 0; k < contour.length; k++) if (m[k]) contour[k] = reliefHeight(Math.max(d[k] * cell - shift, 0), r)
    photoH = photoHeights({ nx, ny, mask: m, fixed, cell, gray, depth: depthNodes, contour, floor, hmax: r.hmax, p: ph }).height
  }
  const dOut = plateInGrid && plate?.shape === 'silhouette' ? edt(inv(m), nx, ny) : null
  const bevel: ReliefParams = { ...r, profile: 'bevel' }
  const pat = p.pattern, patOn = pat.kind !== 'none' && pat.depth > 0
  // Высота источника до деталей: для яркости без потолка скоса (он применяется после сглаживания, чтобы кромка не размылась).
  const sSurface = sigmaCells(r.smooth ?? 0, cell)
  let raw: Float32Array = new Float32Array(nx * ny)
  for (let k = 0; k < raw.length; k++) {
    if (!m[k]) continue
    const dmm = Math.max(d[k] * cell - shift, 0)
    raw[k] = photoH ? photoH[k] : gray ? floor + brightnessValue(gray[k], p.source) * (r.hmax - floor) : reliefHeight(dmm, r)
  }
  if (sSurface > 0) raw = gaussianBlur(raw, nx, ny, sSurface, m, fixed)
  // надпись: рельеф поднимает поверхность на height, гравировка опускает на depth, но не ниже lo (минимальная высота кромки) и не выше прежней
  const txt = inp.text
  const lettered = (t: number, lo: number) => (txt!.mode === 'emboss' ? t + txt!.height : Math.max(t - txt!.depth, Math.min(t, lo)))
  const top = new Float32Array(nx * ny)
  const meshMask = plateInGrid ? new Uint8Array(m) : m

  for (let k = 0; k < top.length; k++) {
    const i = k % nx, j = (k - i) / nx
    if (m[k] && levelAt[k] >= 0) {
      top[k] = base + Math.max(levelAt[k], floor) // ровная вершина области: без профиля, деталей, узора и сглаживания
      if (txt && txt.cov(X(i), Y(j)) >= 0.5) top[k] = lettered(top[k], engraved ? floor : base + floor)
    } else if (m[k]) {
      const dmm = Math.max(d[k] * cell - shift, 0)
      const pv = profileValue(dmm / r.edgeWidth, r)
      // источник высоты: расстояние до кромки или яркость (с защитой кромки профилем скоса)
      let h = gray ? Math.min(raw[k], reliefHeight(dmm, bevel)) : raw[k]
      if (sSurface > 0) h = Math.max(h, floor)
      if (spine) h += p.detail.spineAmp * pv * Math.exp(-((spine[k] * cell) ** 2) / (2 * p.detail.spineWidth ** 2))
      if (p.detail.grooveDepth > 0 && Math.abs(dmm - p.detail.grooveOffset) <= p.detail.grooveWidth / 2) h = Math.max(h - p.detail.grooveDepth, floor)
      let t = engraved ? Math.max(base - (h - floor), floor) : base + h
      // бортик: приподнимает кромку фигуры (расстояние от первого слоя узлов, который лежит на самом краю) до узора
      if (rim && (d[k] - 1) * cell - shift < rim.width - 1e-9) t += rim.height
      if (patOn && (pat.scope === 'relief' || (pat.scope === 'plateau' && dmm >= r.edgeWidth)) && coverage(pat, X(i), Y(j))) {
        const lo = engraved ? floor : base + floor
        t = Math.max(t - pat.depth, Math.min(t, lo))
      }
      // надпись после деталей и узора: буквы остаются чёткими
      if (txt && txt.cov(X(i), Y(j)) >= 0.5) t = lettered(t, engraved ? floor : base + floor)
      top[k] = t
    } else if (plateInGrid && plate && plateInside(plate, X(i), Y(j), dOut ? dOut[k] * cell : 0)) {
      meshMask[k] = 1
      let t = base
      if (patOn && pat.scope === 'base' && coverage(pat, X(i), Y(j))) t = Math.max(base - pat.depth, Math.min(base, floor))
      if (txt && txt.cov(X(i), Y(j)) >= 0.5) t = lettered(t, floor)
      top[k] = t
    }
  }
  return { nx, ny, dx, dy, i0: bi0, j0: bj0, blocks: plateInGrid ? blocksOf(meshMask, nx, ny) : silBlocks, top, silBlocks, solid: meshMask }
}

/** Узел (i, j) в мм: центр габарита фигуры в нуле, +Y вверх. */
const nodeXY = (g: Grid, i: number, j: number, wMm: number, hMm: number): [number, number] => [(i - g.i0) * g.dx - wMm / 2, hMm / 2 - (j - g.j0) * g.dy]

export interface ReliefMesh { vertProperties: Float32Array; triVerts: Uint32Array; triangles: number }

/**
 * Замкнутая сетка рельефа с плоской спинкой на z = 0 (топология блоков, как в 02_heightfield.py: стены строятся на тех же
 * вершинах, что верх и низ, поэтому сетка всегда замкнута). Верх узла берётся из g.top (подложка уже в нём).
 */
export function reliefMesh(g: Grid, wMm: number, hMm: number): ReliefMesh {
  const bw = g.nx - 1
  const vidx = new Int32Array(g.nx * g.ny).fill(-1)
  const pos: number[] = []
  const topV = (i: number, j: number) => {
    const k = j * g.nx + i
    if (vidx[k] < 0) {
      vidx[k] = pos.length / 3 / 2
      const [x, y] = nodeXY(g, i, j, wMm, hMm)
      pos.push(x, y, g.top[k], x, y, 0) // пара вершин узла: верх и низ
    }
    return vidx[k] * 2
  }
  const tri: number[] = []
  const solid = (i: number, j: number) => i >= 0 && j >= 0 && i < bw && j < g.ny - 1 && g.blocks[j * bw + i] === 1
  const quad = (a: number, b: number, c: number, d: number) => { tri.push(a, b, c, a, c, d) }
  for (let j = 0; j < g.ny - 1; j++) for (let i = 0; i < bw; i++) {
    if (!g.blocks[j * bw + i]) continue
    const A = topV(i, j), B = topV(i + 1, j), C = topV(i + 1, j + 1), D = topV(i, j + 1)
    // вершина верха — чётный индекс, низа — следующий
    quad(A, D, C, B)                         // верх (смотрит вверх)
    quad(A + 1, B + 1, C + 1, D + 1)         // спинка (смотрит вниз)
    if (!solid(i - 1, j)) quad(A, A + 1, D + 1, D)     // левая стена, наружу −X
    if (!solid(i + 1, j)) quad(B, C, C + 1, B + 1)     // правая стена, наружу +X
    if (!solid(i, j - 1)) quad(A, B, B + 1, A + 1)     // стена сверху по картинке, наружу +Y
    if (!solid(i, j + 1)) quad(D, D + 1, C + 1, C)     // стена снизу по картинке, наружу −Y
  }
  return { vertProperties: Float32Array.from(pos), triVerts: Uint32Array.from(tri), triangles: tri.length / 3 }
}

/** Контур твёрдых блоков силуэта в мм (петли по границе), в тех же координатах, что вершины рельефа. */
function silhouetteOutline(g: Grid, wMm: number, hMm: number): Pt[][] {
  return maskLoops(g.silBlocks, g.nx - 1, g.ny - 1).map((l) => dropCollinear(l)).map((l) => l.map(([i, j]) => nodeXY(g, i, j, wMm, hMm)))
}

/** Контур подложки как CrossSection (подложка отдельным телом): по силуэту со смещением, прямоугольник, скруглённый, круг. */
function plateCrossSection(w: ManifoldToplevel, s: PlateSpec, g: Grid, wMm: number, hMm: number, engraved: boolean, exact?: CrossSection): CrossSection {
  const { CrossSection } = w
  let cs: CrossSection
  const silhouette = () => exact ?? CrossSection.ofPolygons(silhouetteOutline(g, wMm, hMm), 'EvenOdd')
  if (s.shape === 'silhouette') { const sil = silhouette(); cs = s.offset > 0 ? sil.offset(s.offset, 'Round', 2, exact ? 256 : 32) : sil }
  else if (s.shape === 'circle') cs = CrossSection.circle(s.diameter / 2, exact ? 256 : 128)
  else if (s.shape === 'rect') cs = CrossSection.square([s.pw, s.ph], true)
  else cs = roundedRectCS(w, s.pw, s.ph, Math.min(s.radius, Math.min(s.pw, s.ph) / 2), exact ? 256 : 24)
  // выгравированный рельеф лежит внутри подложки: сама подложка — кольцо вокруг силуэта
  return engraved ? cs.subtract(silhouette()) : cs
}

// ---------- сборка ----------

/** Сведения о креплении и штифтах для редактора положения и предупреждений. Все координаты в мм от центра габарита силуэта, Y вверх. */
export interface MountInfo {
  /** Положение крепления с учётом режима; null — крепления нет. */
  mount: { x: number; y: number; exit?: { x: number; y: number } } | null
  /** Штифты: положение, автоматическое ли, использован ли в геометрии (отвергнутый вручную поставленный — нет). */
  pins: { x: number; y: number; auto: boolean; used: boolean }[]
  /** Лучшие места для крепления (Suggest) и образец отклонённых мест с причиной. */
  candidates: Anchor[]
  rejected: Rejected[]
  issues: FitIssue[]
  /** Габарит листа печати (обе половины и штифты), мм. */
  sheet?: { w: number; h: number }
}

export interface KeychainInfo {
  /** Ключ i18n ошибки (пустая маска, подложка меньше силуэта); при ошибке геометрия не строится. */
  error?: string
  threshold: number
  photoLike: boolean
  preview: MaskPreview | null
  /** Номера областей с настройками, которых в силуэте больше нет. */
  goneAreas?: number[]
  /** Выбран источник «ИИ», а альфы в воркере нет: силуэт построен по яркости. */
  aiMissing?: boolean
  /** Источник «Фото» с долей глубины, а глубины в воркере нет: доля считается нулём. */
  depthMissing?: boolean
  /** Высота рельефа «Фото» по узлам сетки (серая плоскость 0…255) для просмотра рядом с маской. */
  height?: { width: number; height: number; data: Uint8Array }
  /** Размер силуэта, мм. */
  size?: [number, number]
  /** Шаг сетки рельефа, мм, признак, что он увеличен из-за бюджета, и самый мелкий шаг в пределах бюджета. */
  cell?: number
  reduced?: boolean
  minCell?: number
  triangles?: number
  mountInfo?: MountInfo
  /** Надпись: размер коробки растра, мм; clipped — часть надписи вне материала (не строится). */
  text?: { w: number; h: number; clipped: boolean }
}

/** Изображения, доступные воркеру по id. */
export type ImageRegistry = Map<string, GrayImage>

/** Деталь листа печати: подпись, тело и положение в раскраске превью. */
export interface KeychainPart { label: string; col: number; row: number; solid: Manifold }

const eightDirs: [number, number][] = [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1]]

/** Положения крепления и штифтов, подсказки и проверки посадки по полю высот. */
function resolveMounts(p: KeychainParams, f: AnchorField, wMm: number, hMm: number): { info: MountInfo; pins: { x: number; y: number }[]; mount: MountInfo['mount'] } {
  const mo = p.mount, sp = p.split
  const wantMount = mo.style !== 'none'
  const pinsOn = sp.enabled && sp.pins > 0
  const mm = (rx: number, ry: number) => relToMm(rx, ry, wMm, hMm)
  const mountPos = wantMount ? mm(mo.x, mo.y) : null
  const exit = mo.style === 'channel' ? mm(mo.exitX, mo.exitY) : undefined
  const r = mo.diameter / 2

  // подсказки по месту крепления
  let candidates: Anchor[] = [], rejected: Rejected[] = []
  if (mo.style === 'hole' || mo.style === 'channel') {
    const q = findAnchors(f, { radius: r, minHeight: mo.style === 'channel' ? r + mo.minWall : mo.minWall, minRim: mo.minWall }, { count: 5, spacing: Math.max(4, mo.diameter * 2), near: undefined })
    candidates = q.accepted; rejected = q.rejected
    if (mo.style === 'channel') candidates = candidates.map((c) => ({ ...c, exit: nearestExit(f, c) ?? undefined }))
  } else if (mo.style === 'eyelet') {
    // ушко подсказывается у края: из центра по восьми направлениям до выхода из материала, центр ушка смещается наружу
    const R = mo.outer / 2
    // лучи идут из самого «толстого» места (центр габарита у ажурной фигуры может лежать вне материала)
    const origin = findAnchors(f, { radius: 1, minHeight: 0.05, minRim: 0 }, { count: 1, spacing: 1, rejectedSample: 0 }).accepted[0] ?? { x: 0, y: 0 }
    for (const [dx, dy] of eightDirs) {
      const e = exitRay(f, origin, { x: dx, y: dy })
      if (!e) continue
      const l = Math.hypot(dx, dy)
      const x = e.x + (dx / l) * (R - mo.minWall), y = e.y + (dy / l) * (R - mo.minWall)
      candidates.push({ x, y, margin: y, height: 0, rim: 0 })
    }
    candidates.sort((a, b) => b.margin - a.margin)
    candidates = candidates.slice(0, 5)
  }

  // штифты: заданные вручную (доли габарита) или лучшие места, не пересекающие крепление
  const pins: MountInfo['pins'] = []
  const issues: FitIssue[] = []
  if (pinsOn) {
    const req = { radius: sp.pinRadius, minHeight: sp.pinDepth + mo.minWall, minRim: mo.minWall }
    const manual = sp.pinPositions && sp.pinPositions.length === sp.pins ? sp.pinPositions : null
    if (manual) {
      for (const q of manual) { const m = mm(q.x, q.y); pins.push({ x: m.x, y: m.y, auto: false, used: true }) }
    } else {
      const avoid = mountPos && mo.style !== 'eyelet' ? [{ x: mountPos.x, y: mountPos.y, r: r + sp.pinRadius }] : []
      const q = findAnchors(f, req, { count: sp.pins, spacing: Math.max(5, sp.pinRadius * 6), avoid, rejectedSample: 0 })
      for (const a of q.accepted) pins.push({ x: a.x, y: a.y, auto: true, used: true })
      for (let i = q.accepted.length; i < sp.pins; i++) issues.push({ feature: `pin${i + 1}`, kind: 'pinTooBig', actual: 0, required: mo.minWall })
    }
  }
  // проверки посадки; поставленные вручную штифты, которые ломают поверхность, отвергаются и в геометрию не попадают
  const fit = fitChecks({
    field: f, minWall: mo.minWall, pinRadius: sp.pinRadius, pinDepth: sp.pinDepth, pins: pins.map((x) => ({ x: x.x, y: x.y })),
    mount: { style: mo.style, x: mountPos?.x ?? 0, y: mountPos?.y ?? 0, diameter: mo.diameter, outer: mo.outer, exit },
  })
  issues.push(...fit)
  for (const i of fit) if (i.kind === 'pinTooBig' || (i.kind === 'outside' && i.feature.startsWith('pin'))) { const idx = Number(i.feature.slice(3)) - 1; if (pins[idx]) pins[idx].used = false }
  return { info: { mount: mountPos ? { ...mountPos, exit } : null, pins, candidates, rejected, issues }, pins: pins.filter((x) => x.used), mount: mountPos ? { ...mountPos, exit } : null }
}

/** Лист печати: верхняя половина в начале, нижняя справа от неё через gap, свободные штифты рядом ниже. */
function layoutSheet(w: ManifoldToplevel, top: Manifold, bottom: Manifold, pins: Manifold[], gap: number): { parts: KeychainPart[]; sheet: { w: number; h: number }; shift: { x: number; y: number }; pinCentres: { x: number; y: number }[] } {
  const tb = top.boundingBox(), bb = bottom.boundingBox()
  const cyT = (tb.min[1] + tb.max[1]) / 2, cyB = (bb.min[1] + bb.max[1]) / 2
  const shift = { x: tb.max[0] + gap - bb.min[0], y: cyT - cyB }
  const bottomMoved = bottom.translate([shift.x, shift.y, 0])
  const mb = bottomMoved.boundingBox()
  const parts: KeychainPart[] = [{ label: 'top', col: 0, row: 0, solid: top }, { label: 'bottom', col: 1, row: 0, solid: bottomMoved }]
  let x = tb.min[0], y = tb.min[1] - gap
  let minY = Math.min(tb.min[1], mb.min[1])
  const pinCentres: { x: number; y: number }[] = []
  pins.forEach((pin, i) => {
    const b = pin.boundingBox()
    const moved = pin.translate([x - b.min[0], y - b.max[1], 0])
    const mb2 = moved.boundingBox()
    parts.push({ label: `pin${i + 1}`, col: i, row: 1, solid: moved })
    pinCentres.push({ x: (mb2.min[0] + mb2.max[0]) / 2, y: (mb2.min[1] + mb2.max[1]) / 2 })
    x = mb2.max[0] + 3
    minY = Math.min(minY, mb2.min[1])
  })
  const maxX = Math.max(tb.max[0], mb.max[0], ...parts.slice(2).map((q) => q.solid.boundingBox().max[0]))
  const maxY = Math.max(tb.max[1], mb.max[1])
  return { parts, sheet: { w: maxX - tb.min[0], h: maxY - minY }, shift, pinCentres }
}

/** Сборка частей: одна деталь A1 (односторонний рельеф) или лист из двух половин и штифтов. */
/** Разброс высоты рельефа под буквами (мм), до которого надпись строится точным путём. */
const TEXT_FLAT_TOL = 0.15

/**
 * Надпись точными телами. Рельеф: буквы выдавливаются от чуть ниже поверхности до её уровня + height. Гравировка: вырез от уровня
 * поверхности − depth (но не ниже минимальной высоты кромки) вверх. Часть букв над силуэтом и часть на подложке считаются
 * отдельно (у них разные уровни); буквы вне материала отбрасываются пересечением с контурами.
 */
function applyExactText(w: ManifoldToplevel, relief: Manifold, p: KeychainParams, text: CrossSection, sil: CrossSection, plate: CrossSection | null, rel: { min: number; max: number }): Manifold {
  const t = p.text, base = p.base.thickness, floor = p.relief.heightFloor
  const onRelief = text.intersect(sil)
  const onPlate = plate ? text.intersect(plate).subtract(sil) : null
  const prism = (cs: CrossSection, z0: number, z1: number) => w.Manifold.extrude(cs, Math.max(z1 - z0, 0.001)).translate([0, 0, z0])
  const parts: { cs: CrossSection; z0: number; z1: number }[] = []
  const mean = (rel.min + rel.max) / 2
  if (t.mode === 'emboss') {
    if (!onRelief.isEmpty()) parts.push({ cs: onRelief, z0: Math.max(0, rel.min - 0.05), z1: mean + t.height })
    if (onPlate && !onPlate.isEmpty()) parts.push({ cs: onPlate, z0: Math.max(0, base - 0.3), z1: base + t.height })
    let out = relief
    for (const q of parts) { const body = prism(q.cs, q.z0, q.z1); const merged = out.add(body); body.delete(); if (out !== relief) out.delete(); out = merged }
    if (out !== relief) relief.delete()
    return out
  }
  // гравировка: нижняя граница выреза не ниже минимальной высоты кромки (рельеф) или пола (подложка)
  const lo = p.relief.profile === 'engraved' ? floor : base + floor
  if (!onRelief.isEmpty()) parts.push({ cs: onRelief, z0: Math.max(mean - t.depth, lo), z1: rel.max + 1 })
  if (onPlate && !onPlate.isEmpty()) parts.push({ cs: onPlate, z0: Math.max(base - t.depth, floor), z1: base + 1 })
  let out = relief
  for (const q of parts) { const body = prism(q.cs, q.z0, q.z1); const cut = out.subtract(body); body.delete(); if (out !== relief) out.delete(); out = cut }
  if (out !== relief) relief.delete()
  return out
}

interface CoreResult { parts: KeychainPart[]; info: KeychainInfo; /** Две половины: верхняя собрана, нижняя и лист строятся в обёртке (там решается, нести ли надпись). */ halves?: { top: Manifold; pinCount: number; pins: { x: number; y: number }[] } }

/** Лежит ли точка (x, y) мм в материале силуэта (маска картинки или фигуры). */
function silhouetteAt(mask: Uint8Array, imgW: number, b: [number, number, number, number], wMm: number, hMm: number, x: number, y: number) {
  const px = Math.floor(b[0] + ((x + wMm / 2) / wMm) * (b[2] - b[0] + 1)), py = Math.floor(b[1] + ((hMm / 2 - y) / hMm) * (b[3] - b[1] + 1))
  return px >= b[0] && px <= b[2] && py >= b[1] && py <= b[3] && mask[py * imgW + px] === 1
}

/**
 * Где лежит надпись относительно материала: outside — часть букв вне силуэта (нужна подложка в сетке), clipped — часть букв вне
 * силуэта и вне подложки (не строится). Проверка по решётке 0.3 мм поверх повёрнутой коробки надписи.
 */
export function textRegion(raster: TextRaster, t: TextParams, wMm: number, hMm: number, inSilhouette: (x: number, y: number) => boolean, onPlate: (x: number, y: number) => boolean) {
  const cov = textSampler(raster, t, wMm, hMm)
  const box = textBoxMm(raster)
  const c = { x: (t.x - 0.5) * wMm, y: (t.y - 0.5) * hMm }
  const a = (t.rotation * Math.PI) / 180, ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a))
  const hx = (box.w * ca + box.h * sa) / 2, hy = (box.w * sa + box.h * ca) / 2
  const step = 0.3
  let outside = false, clipped = false
  for (let y = c.y - hy; y <= c.y + hy && !clipped; y += step) for (let x = c.x - hx; x <= c.x + hx; x += step) {
    if (cov(x, y) < 0.5 || inSilhouette(x, y)) continue
    outside = true
    if (!onPlate(x, y)) { clipped = true; break }
  }
  return { outside, clipped }
}

function buildKeychainCore(w: ManifoldToplevel, p: KeychainParams, registry: ImageRegistry, texts: TextRegistry, mattes: MatteRegistry = new Map(), depths: MatteRegistry = new Map()): CoreResult {
  const shape = p.origin.kind === 'shape' ? p.origin.shape : null
  let img: GrayImage, mask: Uint8Array, b: [number, number, number, number], wMm: number, hMm: number
  let depth: Matte | null = null
  let base: { threshold: number; photoLike: boolean; preview: MaskPreview | null; goneAreas?: number[]; aiMissing?: boolean; depthMissing?: boolean }
  let levels: GridInput['levels']
  if (shape) {
    // фигура: аналитическая маска ровно по габариту фигуры, без порога, дырок и яркости
    const sm = shapeMask(shape)
    img = { width: sm.width, height: sm.height, gray: sm.mask, alpha: null }
    mask = sm.mask
    b = [0, 0, sm.width - 1, sm.height - 1]
    wMm = sm.wMm; hMm = sm.hMm
    const sil: SilhouetteResult = { mask, threshold: 0, areas: [], areaId: new Int32Array(mask.length), goneAreas: [], photoLike: false }
    base = { threshold: 0, photoLike: false, preview: maskPreview(img, sil) }
  } else {
    const found = registry.get(p.imageId)
    if (!found) return { parts: [], info: { error: 'keychain.error.noImage', threshold: 0, photoLike: false, preview: null } }
    const crop = p.crop ?? fullCrop
    img = cropImage(found, crop)
    const rawMatte = p.silhouette.ai.matteId ? mattes.get(p.silhouette.ai.matteId) : undefined
    const matte = rawMatte && rawMatte.width === found.width && rawMatte.height === found.height ? cropPlane(rawMatte, crop) : rawMatte
    const rawDepth = p.source.kind === 'photo' && p.source.depthId ? depths.get(p.source.depthId) : undefined
    depth = rawDepth && rawDepth.width === found.width && rawDepth.height === found.height ? cropPlane(rawDepth, crop) : null
    const sil = buildSilhouette(img, p.silhouette, { matte, size: p.size })
    base = { threshold: sil.threshold, photoLike: sil.photoLike, preview: maskPreview(img, sil), ...(sil.goneAreas.length ? { goneAreas: sil.goneAreas } : {}), ...(sil.aiMissing ? { aiMissing: true } : {}), ...(p.source.kind === 'photo' && (p.source.mix?.depth ?? 0) > 0 && !depth ? { depthMissing: true } : {}) }
    const lv = new Map(sil.areas.filter((x) => x.mode === 'level').map((x) => [x.id, x.level]))
    if (lv.size) levels = { ids: sil.areaId, level: lv }
    mask = sil.mask
    const bb = maskBounds(sil.mask, img.width, img.height)
    if (!bb) return { parts: [], info: { ...base, error: 'keychain.error.emptyMask' } }
    b = bb
    const sz = sizeMm(p.size, b[2] - b[0] + 1, b[3] - b[1] + 1)
    wMm = sz.w; hMm = sz.h
  }
  const plate = plateSpec(p.base, wMm, hMm)
  if (plate.error) return { parts: [], info: { ...base, error: plate.error, size: [wMm, hMm] } }
  const needsField = p.mount.style !== 'none' || (p.split.enabled && p.split.pins > 0)
  // надпись: растр из реестра воркера (его кладёт рабочее пространство), покрытие в мм от центра габарита силуэта
  const traster = p.text?.enabled && p.text.maskId ? texts.get(p.text.maskId) : undefined
  let region = { outside: false, clipped: false }
  if (traster) {
    const sil = (x: number, y: number) => silhouetteAt(mask, img.width, b, wMm, hMm, x, y)
    const onPlate = (x: number, y: number) => {
      const sp = plate.spec
      if (!sp) return false
      if (sp.shape !== 'silhouette') return plateInside(sp, x, y, 0)
      if (sil(x, y)) return true
      // подложка «по силуэту»: в пределах смещения от края (проверка по кольцам вокруг точки)
      for (const r of [sp.offset * 0.5, sp.offset]) for (let k = 0; k < 16; k++) if (sil(x + r * Math.cos((k * Math.PI) / 8), y + r * Math.sin((k * Math.PI) / 8))) return true
      return false
    }
    region = textRegion(traster, p.text, wMm, hMm, sil, onPlate)
  }
  // Надпись строится двумя путями. Точный (по умолчанию): буквы — гладкие многоугольники, выдавленные до уровня поверхности под ними;
  // он возможен, когда рельеф под буквами ровный (плато, подложка). Запасной: рельеф неровный (скос, купол, яркость) — высота букв
  // берётся из узлов сетки, края получаются ступенчатыми.
  const patternBase = !!plate.spec && p.pattern.kind !== 'none' && p.pattern.scope === 'base'
  let gridText: GridInput['text'] | undefined
  let plateInGrid = patternBase
  // запас сетки вокруг силуэта изображения (пиксели): без запаса у края картинки гладкий контур невозможен — остаётся ступенчатый
  let inflate: { mpx: number; sx: number; sy: number } | null = null
  if (!shape && p.outline) {
    const sx = wMm / (b[2] - b[0] + 1), sy = hMm / (b[3] - b[1] + 1), mpx = Math.ceil((1.75 * effectiveCell(wMm, hMm, 1, p.quality).cell) / Math.min(sx, sy))
    if (b[0] - mpx >= 0 && b[1] - mpx >= 0 && b[2] + mpx <= img.width - 1 && b[3] + mpx <= img.height - 1) inflate = { mpx, sx, sy }
  }
  const build = () => {
    // Фигура без подложки в сетке строится с запасом m и обрезается по точному контуру: скругления не зависят от шага сетки.
    // Запас — полторы ячейки с поправкой на рост площади: так любая точка фигуры целиком лежит в блоках сетки.
    let rel = { img, mask, bounds: b, wMm, hMm, shift: 0 }
    if (shape && !plateInGrid) {
      const m = 1.75 * effectiveCell(wMm, hMm, 1, p.quality).cell
      const big = shapeMask(inflateShape(shape, m))
      rel = { img: { width: big.width, height: big.height, gray: big.mask, alpha: null }, mask: big.mask, bounds: [0, 0, big.width - 1, big.height - 1], wMm: big.wMm, hMm: big.hMm, shift: m }
    }
    // Изображение: сетка строится по маске, расширенной на запас, а рельеф потом обрезается гладким контуром: стена не зависит от ячейки
    if (!shape && !plateInGrid && inflate) {
      const mpx = inflate.mpx, bnd: [number, number, number, number] = [b[0] - mpx, b[1] - mpx, b[2] + mpx, b[3] + mpx]
      rel = { img, mask: dilate(mask, img.width, img.height, mpx), bounds: bnd, wMm: (bnd[2] - bnd[0] + 1) * inflate.sx, hMm: (bnd[3] - bnd[1] + 1) * inflate.sy, shift: mpx * Math.min(inflate.sx, inflate.sy) }
    }
    let count = 0
    for (let i = 0; i < rel.mask.length; i++) count += rel.mask[i]
    const fillSil = count / ((rel.bounds[2] - rel.bounds[0] + 1) * (rel.bounds[3] - rel.bounds[1] + 1))
    const fill = plateInGrid ? plate.spec!.area / (wMm * hMm) : fillSil
    const { cell, reduced, min } = effectiveCell(rel.wMm, rel.hMm, fill, p.quality)
    const gridInput = { img: rel.img, mask: rel.mask, bounds: rel.bounds, wMm: rel.wMm, hMm: rel.hMm, cell, p, plate: plate.spec, plateInGrid, edgeShift: rel.shift, exactRim: rel.shift > 0, levels, text: gridText, depth }
    const grid = buildGrid(gridInput)
    return { rel, cell, reduced, min, gridInput, grid, mesh: reliefMesh(grid, rel.wMm, rel.hMm) }
  }
  let built = build()
  const polys = traster ? textPolygons(traster, p.text, wMm, hMm) : []
  let exactText: { min: number; max: number } | null = null
  if (traster) {
    // высота рельефа под буквами: узлы силуэта, покрытые надписью; ровная (разброс ≤ допуска) — точный путь
    const cov = textSampler(traster, p.text, wMm, hMm)
    const g = built.grid
    let lo = Infinity, hi = -Infinity
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      const k = j * g.nx + i
      if (!g.solid[k]) continue
      const x = (i - g.i0) * g.dx - built.rel.wMm / 2, y = built.rel.hMm / 2 - (j - g.j0) * g.dy
      if (cov(x, y) < 0.5 || !silhouetteAt(mask, img.width, b, wMm, hMm, x, y)) continue
      lo = Math.min(lo, g.top[k]); hi = Math.max(hi, g.top[k])
    }
    if (hi - lo <= TEXT_FLAT_TOL || lo === Infinity) exactText = { min: lo === Infinity ? 0 : lo, max: hi === -Infinity ? 0 : hi }
    else {
      gridText = { cov, mode: p.text.mode, height: p.text.height, depth: p.text.depth }
      plateInGrid = patternBase || (!!plate.spec && region.outside)
      built = build()
    }
  }
  const { rel, cell, reduced, min, gridInput, grid, mesh } = built
  const raw = new w.Mesh({ numProp: 3, vertProperties: mesh.vertProperties, triVerts: mesh.triVerts })
  raw.merge()
  let relief = new w.Manifold(raw)
  // высота «Фото» для просмотра: максимум верха сетки → 255, вне силуэта 0
  let heightPreview: KeychainInfo['height']
  if (p.source.kind === 'photo') {
    const g = grid, z = new Uint8Array(g.nx * g.ny); let hi = 0
    for (let k = 0; k < z.length; k++) if (g.silBlocks && g.solid[k]) hi = Math.max(hi, g.top[k])
    for (let k = 0; k < z.length; k++) if (g.solid[k] && hi > 0) z[k] = Math.round(255 * Math.min(1, g.top[k] / hi))
    heightPreview = { width: g.nx, height: g.ny, data: z }
  }
  const info: KeychainInfo = { ...base, ...(heightPreview ? { height: heightPreview } : {}), size: [wMm, hMm], cell, reduced, minCell: min, triangles: mesh.triangles, ...(traster ? { text: { ...textBoxMm(traster), clipped: region.clipped } } : {}) }
  if (relief.status() !== 'NoError' || relief.isEmpty()) return { parts: [], info: { ...info, error: 'keychain.error.mesh' } }
  // точный контур фигуры (null у изображения): по нему обрезается рельеф и строится подложка по контуру
  let exact: CrossSection | null = shape ? shapeCrossSection(w, shape) : null
  if (!shape && rel.shift > 0 && p.outline) {
    const loops = traceImageOutline(mask, img.width, img.height, [rel.bounds[0], rel.bounds[1], rel.bounds[2] + 1, rel.bounds[3] + 1], rel.wMm, rel.hMm, p.outline)
    if (loops.length) exact = w.CrossSection.ofPolygons(loops, 'EvenOdd')
  }
  if (exact && rel.shift > 0) {
    const prism = w.Manifold.extrude(exact, relief.boundingBox().max[2] + 1)
    const clipped = relief.intersect(prism)
    prism.delete(); relief.delete()
    relief = clipped
    if (relief.status() !== 'NoError' || relief.isEmpty()) return { parts: [], info: { ...info, error: 'keychain.error.mesh' } }
    // бортик — точное кольцо между контуром и его сжатием: внутренний радиус тоже настоящая дуга, а не ступеньки сетки
    if (shape && shape.rim.enabled && shape.rim.height > 0) {
      const inner = exact.offset(-shape.rim.width, 'Round', 2, 256)
      const ring = inner.isEmpty() ? exact : exact.subtract(inner)
      const top = (p.relief.profile === 'engraved' ? p.base.thickness : p.base.thickness + p.relief.hmax) + shape.rim.height
      const wall = w.Manifold.extrude(ring, top)
      const merged = relief.add(wall)
      wall.delete(); relief.delete()
      relief = merged
    }
  }
  if (plate.spec && !plateInGrid) {
    const cs = plateCrossSection(w, plate.spec, grid, rel.wMm, rel.hMm, p.relief.profile === 'engraved', exact ?? undefined)
    if (!cs.isEmpty()) {
      const slab = w.Manifold.extrude(cs, p.base.thickness)
      const merged = relief.add(slab)
      slab.delete(); relief.delete()
      relief = merged
    }
  }
  if (exactText && polys.length) {
    const sil = exact ?? w.CrossSection.ofPolygons(silhouetteOutline(grid, rel.wMm, rel.hMm), 'EvenOdd')
    const plateFull = plate.spec ? plateCrossSection(w, plate.spec, grid, rel.wMm, rel.hMm, false, exact ?? undefined) : null
    relief = applyExactText(w, relief, p, w.CrossSection.ofPolygons(polys, 'EvenOdd'), sil, plateFull, exactText)
  }
  if (!needsField && !p.split.enabled) return { parts: [{ label: 'A1', col: 0, row: 0, solid: relief }], info }

  // поле для крепления: подложка должна быть в сетке, иначе места на подложке вне сетки не видны
  // у фигуры поле строится по точной маске без запаса (расстояния до края настоящие)
  const fgrid = (shape || rel.shift > 0) && needsField
    ? buildGrid({ img, mask, bounds: b, wMm, hMm, cell, p, plate: plate.spec, plateInGrid: true, text: gridText, ...(shape ? {} : { levels, depth }) })
    : !needsField || plateInGrid || !plate.spec ? grid : buildGrid({ ...gridInput, plateInGrid: true })
  const field = needsField ? anchorField(fgrid, wMm, hMm, cell) : null
  const res = field ? resolveMounts(p, field, wMm, hMm) : { info: { mount: null, pins: [], candidates: [], rejected: [], issues: [] } as MountInfo, pins: [] as { x: number; y: number }[], mount: null as MountInfo['mount'] }
  const zTop = relief.boundingBox().max[2]
  const mo = p.mount, sp = p.split
  const cuts: Manifold[] = []
  let solid = relief

  if (res.mount) {
    const c = res.mount
    if (mo.style === 'eyelet') {
      const R = mo.outer / 2
      const join = field ? lugJoin((x, y) => { const k = nodeIndex(field, x, y); return k !== null && fgrid.solid[k] === 1 }, c, mo.minWall, cell) : null
      const lug = lugSolid(w, c, mo.outer, join ? { x: join.x, y: join.y, r: Math.max(mo.minWall, 0.8) } : null, p.base.thickness)
      const merged = solid.add(lug)
      lug.delete(); solid.delete()
      solid = merged
      void R
    }
    if (mo.style === 'hole' || mo.style === 'eyelet') cuts.push(cylinderZ(w, c.x, c.y, mo.diameter / 2, -zTop - 1, zTop + 1))
    if (mo.style === 'channel' && c.exit) {
      const dx = c.exit.x - c.x, dy = c.exit.y - c.y, l = Math.hypot(dx, dy) || 1
      const over = mo.diameter / 2 + 1.5 // канал продолжается за точку выхода, чтобы открыться наружу
      cuts.push(cylinderAlong(w, c, { x: c.exit.x + (dx / l) * over, y: c.exit.y + (dy / l) * over }, mo.diameter / 2, 0))
    }
  }
  if (sp.enabled) for (const q of res.pins) cuts.push(cylinderZ(w, q.x, q.y, sp.pinRadius, -sp.pinDepth, sp.pinDepth))
  if (cuts.length) {
    const u = w.Manifold.union(cuts)
    const cut = solid.subtract(u)
    u.delete(); cuts.forEach((x) => x.delete())
    if (solid !== relief) solid.delete()
    solid = cut
  }
  const finalInfo: KeychainInfo = { ...info, mountInfo: res.info }
  if (!sp.enabled) return { parts: [{ label: 'A1', col: 0, row: 0, solid }], info: finalInfo }

  // две половины: верхнюю строит ядро, нижнюю и лист собирает обёртка
  return { parts: [], info: finalInfo, halves: { top: solid, pinCount: res.pins.length, pins: res.pins.map((q) => ({ x: q.x, y: q.y })) } }
}

/**
 * Модель Keychain. Две половины: нижняя — зеркало верхней относительно плоскости разъёма, затем поворот на 180° вокруг X (лицом
 * вниз на стол). Надпись только на верхней: для нижней ядро строится ещё раз без надписи.
 */
export function buildKeychainParts(w: ManifoldToplevel, p: KeychainParams, registry: ImageRegistry, texts: TextRegistry = new Map(), mattes: MatteRegistry = new Map(), depths: MatteRegistry = new Map()): { parts: KeychainPart[]; info: KeychainInfo; assembly?: Assembly } {
  const r = buildKeychainCore(w, p, registry, texts, mattes, depths)
  if (!r.halves) return { parts: r.parts, info: r.info }
  const sp = p.split
  const top = r.halves.top
  let source = top
  if (p.text?.enabled && p.text.maskId && texts.has(p.text.maskId)) {
    const plain = buildKeychainCore(w, { ...p, text: { ...p.text, enabled: false } }, registry, texts, mattes, depths)
    if (plain.halves) source = plain.halves.top
  }
  const bottom = source.mirror([0, 0, 1]).rotate([180, 0, 0])
  if (source !== top) source.delete()
  const loose = Array.from({ length: r.halves.pinCount }, () => pinSolid(w, 0, 0, pinRadiusLoose(sp.pinRadius, sp.clearance), pinLength(sp.pinDepth)))
  const sheet = layoutSheet(w, top, bottom, loose, sp.gap)
  const mountInfo = r.info.mountInfo ? { ...r.info.mountInfo, sheet: sheet.sheet } : undefined
  const len = pinLength(sp.pinDepth)
  const assembly: Assembly = { top: identity(), bottom: bottomAssembly(sheet.shift.x, sheet.shift.y) }
  sheet.pinCentres.forEach((c, i) => { assembly[`pin${i + 1}`] = pinAssembly(c, r.halves!.pins[i], len) })
  return { parts: sheet.parts, info: { ...r.info, ...(mountInfo ? { mountInfo } : {}) }, assembly }
}

function nodeIndex(f: AnchorField, x: number, y: number): number | null {
  const i = Math.round((x + f.wMm / 2) / f.dx + f.i0), j = Math.round((f.hMm / 2 - y) / f.dy + f.j0)
  return i >= 0 && j >= 0 && i < f.nx && j < f.ny ? j * f.nx + i : null
}

/** Совместимость: один Manifold (односторонняя деталь, а в режиме половин — верхняя половина) и сведения. */
export function buildKeychainSolid(w: ManifoldToplevel, p: KeychainParams, registry: ImageRegistry, texts: TextRegistry = new Map(), mattes: MatteRegistry = new Map(), depths: MatteRegistry = new Map()): { solid: Manifold | null; info: KeychainInfo } {
  const r = buildKeychainParts(w, p, registry, texts, mattes, depths)
  const first = r.parts[0]?.solid ?? null
  r.parts.slice(1).forEach((q) => q.solid.delete())
  return { solid: first, info: r.info }
}

export async function buildKeychain(p: KeychainParams, registry: ImageRegistry, wasmUrl?: string, texts?: TextRegistry, mattes?: MatteRegistry, depths?: MatteRegistry) {
  return buildKeychainSolid(await getWasm(wasmUrl), p, registry, texts, mattes, depths)
}

export async function buildKeychainSheet(p: KeychainParams, registry: ImageRegistry, wasmUrl?: string, texts?: TextRegistry, mattes?: MatteRegistry, depths?: MatteRegistry) {
  return buildKeychainParts(await getWasm(wasmUrl), p, registry, texts, mattes, depths)
}

