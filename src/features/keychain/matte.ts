import { useCallback, useEffect, useRef, useState } from 'react'
import { getModelClient } from '../../app/useModel'
import type { AiSilhouetteParams, Matte, SilhouetteSource } from '../../geometry/keychain'
import { linearSample } from '../../geometry/photo/aiResample'
import { midtoneShare, type GrayImage } from '../../geometry/raster/threshold'
import { usableModel } from '../../ml/choice'
import { MlAbortError } from '../../ml/mlClient'
import { modelById, type ModelSpec } from '../../ml/models'
import { getMlService, MlUnavailableError, type MlService } from '../../ml/service'
import { useCapabilities, useModelStore } from '../../ml/useMl'
import { COLOR_SIDE, type ImageStore, type StoredColor } from './imageStore'

/** Номер альфы в реестре воркера: один на изображение и модель. */
export const matteIdOf = (imageId: string, model: string) => `m:${imageId}:${model}`

/** Цветная копия не длиннее `side` по длинной стороне (усреднение блоков); меньше и равное остаётся как есть. */
export function downscaleColor(rgb: Uint8Array, w: number, h: number, side = COLOR_SIDE): StoredColor {
  const k = Math.min(1, side / Math.max(w, h))
  if (k === 1) return { width: w, height: h, rgb }
  const nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k)), out = new Uint8Array(nw * nh * 3)
  for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
    const x0 = Math.floor((i * w) / nw), x1 = Math.max(x0 + 1, Math.floor(((i + 1) * w) / nw)), y0 = Math.floor((j * h) / nh), y1 = Math.max(y0 + 1, Math.floor(((j + 1) * h) / nh))
    let r = 0, g = 0, b = 0, c = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const q = (y * w + x) * 3; r += rgb[q]; g += rgb[q + 1]; b += rgb[q + 2]; c++ }
    const q = (j * nw + i) * 3; out[q] = r / c; out[q + 1] = g / c; out[q + 2] = b / c
  }
  return { width: nw, height: nh, rgb: out }
}

/** Альфа сети (0…1, размер sw × sh) → мягкая альфа 0…255 размера изображения dw × dh, билинейно (без выдуманных деталей). */
export function toMatte(alpha: Float32Array, sw: number, sh: number, dw: number, dh: number): Matte {
  const data = new Uint8Array(dw * dh), same = sw === dw && sh === dh
  for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
    const v = same ? alpha[j * sw + i] : linearSample(alpha, sw, sh, ((i + 0.5) * sw) / dw, ((j + 0.5) * sh) / dh)
    data[j * dw + i] = Math.round(Math.min(1, Math.max(0, v)) * 255)
  }
  return { width: dw, height: dh, data }
}

/** Вся картинка через сеть: пропорции сохранены (поля среднего цвета, обрезка обратно делает prepost), результат — альфа размера изображения. */
export async function runMatte(ml: Pick<MlService, 'matteAlpha'>, spec: ModelSpec, color: StoredColor, target: { width: number; height: number }): Promise<Matte> {
  const alpha = await ml.matteAlpha(spec, color.rgb, color.width, color.height)
  return toMatte(alpha, color.width, color.height, target.width, target.height)
}

/** Рисунок или логотип на чистом фоне: рамка по краю одного цвета и почти нет полутонов. Для таких яркость обычно лучше и быстрее. */
export function looksLikeLogo(image: GrayImage): boolean {
  const { width: w, height: h, gray } = image
  if (w < 8 || h < 8) return false
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.02)), vals: number[] = []
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (i < band || j < band || i >= w - band || j >= h - band) vals.push(gray[j * w + i])
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length, sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
  return sd < 10 && midtoneShare(gray) < 0.15
}

export interface MatteControl {
  /** Модель, которой можно запустить сеть сейчас (выбранная или первая готовая). */
  model: ModelSpec | null
  running: boolean
  /** Ключ ошибки: noModel, unavailable, failed. */
  error: string | null
  /** Альфа, зарегистрированная в воркере (для серого просмотра), и модель, которой она получена. */
  matte: Matte | null
  matteModel: string
  /** Альфа выбранной модели потеряна (хранилище очищено), а силуэт ждёт запуска. */
  lost: boolean
  run: () => Promise<void>
}

/**
 * Альфа нейросети для текущего изображения: запуск (вся картинка → альфа размера изображения → хранилище → воркер → параметры),
 * восстановление после перезагрузки без сети. Параметры силуэта получают `source`, `ai.model` и `ai.matteId` только после того,
 * как альфа уже зарегистрирована в воркере, поэтому модель никогда не строится по «пустой» ссылке.
 */
export function useMatte({ imageId, image, store, ai, source, onAi, ml = getMlService() }: {
  imageId: string
  image: GrayImage | null
  store: ImageStore | null
  ai: AiSilhouetteParams
  source: SilhouetteSource
  /** Принять результат: источник «ИИ» и параметры альфы. */
  onAi: (patch: Partial<AiSilhouetteParams> & { model: string; matteId: string }) => void
  ml?: Pick<MlService, 'matteAlpha'>
}): MatteControl & { restored: boolean } {
  const models = useModelStore(), caps = useCapabilities()
  const model = usableModel(models, caps)
  const [matte, setMatte] = useState<Matte | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const token = useRef(0)

  // восстановление: сохранённая альфа читается из хранилища и регистрируется в воркере без запуска сети
  useEffect(() => {
    let live = true
    setMatte(null)
    const wanted = ai.model && ai.matteId && imageId ? modelById(ai.model) : undefined
    if (!store || !image || !wanted) { setRestored(true); return }
    setRestored(false)
    void store.loadMatte(imageId, ai.model, wanted.revision).then((m) => {
      if (!live) return
      if (m && m.width === image.width && m.height === image.height) { getModelClient().registerMatte?.(ai.matteId, m); setMatte(m) }
      setRestored(true)
    })
    return () => { live = false }
    // восстановление — по изображению, модели и номеру альфы
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, imageId, image, ai.model, ai.matteId])

  const run = useCallback(async () => {
    const color = await store?.loadColor(imageId)
    if (!store || !image || !model) return
    if (!color) { setError('noColour'); return }
    const mine = ++token.current
    setRunning(true); setError(null)
    try {
      const m = await runMatte(ml, model, color, image)
      if (mine !== token.current) return // пока шёл запуск, начался новый (побеждает последний)
      await store.saveMatte(imageId, model.id, model.revision, m)
      const matteId = matteIdOf(imageId, model.id)
      getModelClient().registerMatte?.(matteId, m)
      setMatte(m)
      onAi({ model: model.id, matteId, ...(ai.model === '' ? { threshold: model.maskDefaults.threshold, smooth: model.maskDefaults.smooth } : {}) })
    } catch (e) {
      if (e instanceof MlAbortError || (e instanceof MlUnavailableError && e.reason === 'superseded')) return
      setError(e instanceof MlUnavailableError ? e.reason : 'failed')
    } finally { if (mine === token.current) setRunning(false) }
  }, [store, imageId, image, model, ml, onAi, ai.model])

  const lost = source === 'ai' && !!ai.matteId && restored && !matte
  return { model, running, error, matte, matteModel: ai.model, lost, run, restored }
}

