import { log } from '../../../app/activityLog'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { detectPaper } from '../../../geometry/photo/detect'
import { guessPaper } from '../../../geometry/photo/aspect'
import { checkQuad, rectify, type Pt, type QuadCheck, type Rectified } from '../../../geometry/photo/homography'
import { paperSize, type Paper, type PaperOrientation, type PaperPreset } from '../../../geometry/photo/paper'
import { segment, type Segmentation } from '../../../geometry/photo/segment'
import type { GrayImage } from '../../../geometry/raster/threshold'
import { decodeColorImage, ImageError, type ColorImage, type ImageErrorCode } from '../../keychain/decodeImage'

export interface PhotoSettings {
  preset: PaperPreset
  orientation: PaperOrientation
  custom: { width: number; length: number }
  /** Углы листа на снимке (пиксели): левый верхний, правый верхний, правый нижний, левый нижний. */
  corners: Pt[]
  /** null — автоматическая чувствительность. */
  sensitivity: number | null
  margin: number
  /** Номера силуэтов, снятых с выбора. */
  excluded: number[]
  depth: number
  clearance: number
}

export const defaultPhotoSettings: PhotoSettings = {
  preset: 'a4', orientation: 'landscape', custom: { width: 210, length: 297 }, corners: [],
  sensitivity: null, margin: 3, excluded: [], depth: 10, clearance: 0.8,
}

/** Начальные углы: прямоугольник, отступивший от краёв снимка на 15 %. */
export const insetCorners = (w: number, h: number, k = 0.15): Pt[] => [[w * k, h * k], [w * (1 - k), h * k], [w * (1 - k), h * (1 - k)], [w * k, h * (1 - k)]]

/** Масштаб лёгкого превью выпрямленного листа на шаге углов, пикселей на мм: в ~7 раз меньше точек, чем у полного растра. */
export const PREVIEW_PX_PER_MM = 1.5
/** Превью во время движения угла: ещё в ~4.5 раза меньше точек, чтобы перетаскивание шло без рывков; после паузы заменяется чётким. */
export const FAST_PREVIEW_PX_PER_MM = 0.7

export interface PhotoImage { name: string; image: GrayImage; color: ColorImage; downscaled: boolean }

/** Как заданы углы: найдены автоматически, поиск не удался (стартовые углы) или ещё нет снимка. */
export type Detection = { status: 'auto'; confidence: number; preset: PaperPreset | null; orientation: PaperOrientation } | { status: 'failed' } | { status: 'none' }

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    if (ms <= 0) return // без задержки значение отдаётся напрямую (ниже), состояние не нужно
    const id = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return ms <= 0 ? value : v
}

export interface PhotoTrace {
  photo: PhotoImage | null
  settings: PhotoSettings
  set: (patch: Partial<PhotoSettings>) => void
  paper: Paper
  quad: QuadCheck
  /** Лёгкое превью выпрямленного листа: обновляется при каждом движении угла, пока идёт перетаскивание. */
  preview: Rectified | null
  /** Полное выпрямление и силуэты считаются только когда нужны (`needSilhouettes`), по настройкам, устоявшимся после паузы. */
  rectified: Rectified | null
  segmentation: Segmentation | null
  /** Нужны ли силуэты (шаг 3 окна): на шаге углов тяжёлый пересчёт не запускается. */
  needSilhouettes: (on: boolean) => void
  /** Идёт ли пересчёт полного растра и силуэтов. */
  computing: boolean
  error: ImageErrorCode | null
  /** Результат автоопределения листа при загрузке снимка. */
  detection: Detection
  loading: boolean
  /** Читает снимок и ищет лист; true — снимок прочитан. */
  load: (file: File) => Promise<boolean>
  /** Номера выбранных силуэтов. */
  selected: number[]
  toggle: (id: number) => void
}

/**
 * Состояние мастера «Из фото»: снимок, лист, углы, чувствительность и выбор силуэтов. Живёт в панели выреза, пока открыта
 * страница: закрытие и повторное открытие окна не теряют снимок и настройки. Тяжёлые шаги (выпрямление, силуэты) считаются
 * по настройкам, устоявшимся debounceMs после последнего изменения, так что перетаскивание угла не пересчитывает всё на каждом движении.
 */
export function usePhotoTrace(debounceMs = 120): PhotoTrace {
  const [photo, setPhoto] = useState<PhotoImage | null>(null)
  const [settings, setSettings] = useState<PhotoSettings>(defaultPhotoSettings)
  const [error, setError] = useState<ImageErrorCode | null>(null)
  const [loading, setLoading] = useState(false)
  const [detection, setDetection] = useState<Detection>({ status: 'none' })
  const set = useCallback((patch: Partial<PhotoSettings>) => setSettings((s) => ({ ...s, ...patch })), [])

  const paper = useMemo(() => paperSize(settings.preset, settings.orientation, settings.custom), [settings.preset, settings.orientation, settings.custom])
  const quad = photo ? checkQuad(settings.corners) : 'tooSmall'

  const load = useCallback(async (file: File): Promise<boolean> => {
    setLoading(true); setError(null)
    try {
      const d = await decodeColorImage(file)
      setPhoto({ name: file.name, image: d.image, color: d.color, downscaled: d.downscaled })
      // лист ищется сразу: углы, формат и ориентация предлагаются из снимка и остаются изменяемыми
      const found = detectPaper(d.color)
      const guess = found ? guessPaper(found.corners, d.image.width, d.image.height) : null
      setSettings((s) => ({
        ...s,
        corners: found ? found.corners : insetCorners(d.image.width, d.image.height),
        excluded: [],
        ...(guess ? { orientation: guess.orientation, ...(guess.preset ? { preset: guess.preset } : {}) } : {}),
      }))
      if (found) log.info('photo', 'log.photo.sheetFound', { paper: guess?.preset ? guess.preset.toUpperCase() : '?', confidence: Math.round(found.confidence * 100) })
      else log.warn('photo', 'log.photo.sheetNotFound')
      setDetection(found ? { status: 'auto', confidence: found.confidence, preset: guess?.preset ?? null, orientation: guess?.orientation ?? 'portrait' } : { status: 'failed' })
      return true
    } catch (e) {
      log.error('photo', 'log.image.importFailed', { name: file.name }, e instanceof ImageError ? e.code : String(e))
      setError(e instanceof ImageError ? e.code : 'decode')
      return false
    } finally { setLoading(false) }
  }, [])

  const [needSeg, setNeedSeg] = useState(false)
  const needSilhouettes = useCallback((on: boolean) => setNeedSeg(on), [])
  const stable = useDebounced({ corners: settings.corners, paper, margin: settings.margin, sensitivity: settings.sensitivity }, debounceMs)
  // превью в два уровня: во время движения угла — совсем лёгкое (следует за каждым движением), после паузы — чёткое
  const fast = useMemo(() => (photo && quad === 'ok' ? rectify(photo.image, settings.corners, paper, photo.color.rgb, FAST_PREVIEW_PX_PER_MM) : null), [photo, settings.corners, paper, quad])
  const sharp = useMemo(() => (photo ? rectify(photo.image, stable.corners, stable.paper, photo.color.rgb, PREVIEW_PX_PER_MM) : null), [photo, stable.corners, stable.paper])
  const settled = stable.corners === settings.corners && stable.paper === paper
  const preview = quad !== 'ok' ? null : settled && sharp ? sharp : fast
  // полный растр и силуэты — тяжёлые (доли секунды на листе A4): только на шаге силуэтов и после паузы в изменениях
  const rectified = useMemo(() => (needSeg && photo ? rectify(photo.image, stable.corners, stable.paper, photo.color.rgb) : null), [needSeg, photo, stable.corners, stable.paper])
  const segmentation = useMemo(
    () => (rectified ? segment(rectified, { margin: stable.margin, ...(stable.sensitivity === null ? {} : { sensitivity: stable.sensitivity }) }) : null),
    [rectified, stable.margin, stable.sensitivity],
  )
  const rectifiedLogged = useRef<Rectified | null>(null)
  useEffect(() => {
    if (!rectified || rectifiedLogged.current === rectified) return
    rectifiedLogged.current = rectified
    log.info('photo', 'log.photo.straightened', { width: rectified.image.width, height: rectified.image.height })
  }, [rectified])
  const segLogged = useRef<Segmentation | null>(null)
  useEffect(() => {
    if (!segmentation || segLogged.current === segmentation) return
    segLogged.current = segmentation
    const sizes = segmentation.silhouettes.map((s) => `${Math.round(s.widthMm)} × ${Math.round(s.heightMm)} mm`).join('; ')
    log.info('photo', 'log.photo.silhouettes', { count: segmentation.silhouettes.length }, sizes || undefined)
  }, [segmentation])
  const computing = needSeg && !!photo && quad === 'ok' && !segmentation
  const selected = useMemo(() => (segmentation?.silhouettes ?? []).map((s) => s.id).filter((id) => !settings.excluded.includes(id)), [segmentation, settings.excluded])
  const toggle = useCallback((id: number) => setSettings((s) => ({ ...s, excluded: s.excluded.includes(id) ? s.excluded.filter((x) => x !== id) : [...s.excluded, id] })), [])

  return { photo, settings, set, paper, quad, preview, rectified, segmentation, needSilhouettes, computing, error, detection, loading, load, selected, toggle }
}
