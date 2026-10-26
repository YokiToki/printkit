import { useCallback, useEffect, useRef, useState } from 'react'
import { getModelClient } from '../../app/useModel'
import { cropRect, fullCrop, type Crop, type Matte } from '../../geometry/keychain'
import { linearSample } from '../../geometry/photo/aiResample'
import type { GrayImage } from '../../geometry/raster/threshold'
import { usableModel } from '../../ml/choice'
import { MlAbortError } from '../../ml/mlClient'
import { modelById, type ModelSpec } from '../../ml/models'
import { getMlService, MlUnavailableError, type MlService } from '../../ml/service'
import { useCapabilities, useModelStore } from '../../ml/useMl'
import type { ImageStore, StoredColor, StoredDepth } from './imageStore'

/** Номер глубины в реестре воркера: один на изображение и модель. */
export const depthIdOf = (imageId: string, model: string) => `d:${imageId}:${model}`

/** Цветная копия, кадрированная окном `crop` (доли): картинка для сети со всеми пикселями окна. */
export function cropColor(c: StoredColor, crop: Crop): StoredColor {
  const [x0, y0, x1, y1] = cropRect(crop, c.width, c.height), w = x1 - x0, h = y1 - y0, rgb = new Uint8Array(w * h * 3)
  for (let j = 0; j < h; j++) rgb.set(c.rgb.subarray(((y0 + j) * c.width + x0) * 3, ((y0 + j) * c.width + x1) * 3), j * w * 3)
  return { width: w, height: h, rgb }
}

/**
 * Глубина окна (0…1, размер кадрированной цветной копии) → плоскость размера изображения: окно растягивается в свой прямоугольник
 * (билинейно), вне окна значения продолжаются от ближайшего края окна, так что при расширении кадра глубина остаётся пригодной.
 */
export function placeDepth(depth: Float32Array, dw: number, dh: number, crop: Crop, imageW: number, imageH: number): Matte {
  const [x0, y0, x1, y1] = cropRect(crop, imageW, imageH), data = new Uint8Array(imageW * imageH)
  for (let j = 0; j < imageH; j++) {
    const v = Math.min(y1 - 0.5, Math.max(y0 + 0.5, j + 0.5)), sy = ((v - y0) * dh) / (y1 - y0)
    for (let i = 0; i < imageW; i++) {
      const u = Math.min(x1 - 0.5, Math.max(x0 + 0.5, i + 0.5)), sx = ((u - x0) * dw) / (x1 - x0)
      data[j * imageW + i] = Math.round(Math.min(1, Math.max(0, linearSample(depth, dw, dh, sx, sy))) * 255)
    }
  }
  return { width: imageW, height: imageH, data }
}

/** Глубина для окна: сеть смотрит на кадрированную картинку, результат кладётся на всё изображение. */
export async function runDepth(ml: Pick<MlService, 'depthMap'>, spec: ModelSpec, color: StoredColor, crop: Crop, image: { width: number; height: number }): Promise<StoredDepth> {
  const c = cropColor(color, crop)
  const d = await ml.depthMap(spec, c.rgb, c.width, c.height)
  return { ...placeDepth(d, c.width, c.height, crop, image.width, image.height), crop: { ...crop } }
}

const same = (a: Crop, b: Crop) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6

export interface DepthControl {
  /** Модель глубины, которой можно запустить сеть сейчас (выбранная или первая готовая). */
  model: ModelSpec | null
  running: boolean
  error: string | null
  /** Плоскость, зарегистрированная в воркере, и окно, для которого она посчитана. */
  depth: StoredDepth | null
  /** Глубина посчитана для другого окна: пригодна, но для лучшего результата её стоит пересчитать. */
  staleCrop: boolean
  /** Глубина нужна (доля глубины > 0), а сохранённой нет. */
  lost: boolean
  run: () => Promise<void>
  restored: boolean
}

/**
 * Глубина для текущего изображения: запуск на кадре, сохранение, регистрация в воркере, запись в параметры источника;
 * восстановление после перезагрузки без сети; смена кадра глубину не стирает, а помечает. Параметры получают `depthId`
 * только после регистрации в воркере.
 */
export function useDepth({ imageId, image, store, crop, depthId, depthModel, wanted, onDepth, ml = getMlService() }: {
  imageId: string
  image: GrayImage | null
  store: ImageStore | null
  crop: Crop
  depthId: string
  depthModel: string
  /** Доля глубины в смеси больше нуля: только тогда отсутствие записи считается потерей. */
  wanted: boolean
  onDepth: (patch: { depthId: string; depthModel: string }) => void
  ml?: Pick<MlService, 'depthMap'>
}): DepthControl {
  const models = useModelStore(), caps = useCapabilities()
  const model = usableModel(models, caps, 'depth')
  const [depth, setDepth] = useState<StoredDepth | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const token = useRef(0)

  useEffect(() => {
    let live = true
    setDepth(null)
    const wantedModel = depthId && depthModel && imageId ? modelById(depthModel) : undefined
    if (!store || !image || !wantedModel) { setRestored(true); return }
    setRestored(false)
    void store.loadDepth(imageId, depthModel, wantedModel.revision).then((d) => {
      if (!live) return
      if (d && d.width === image.width && d.height === image.height) { getModelClient().registerDepth?.(depthId, d); setDepth(d) }
      setRestored(true)
    })
    return () => { live = false }
    // восстановление — по изображению, модели и номеру глубины
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, imageId, image, depthModel, depthId])

  const run = useCallback(async () => {
    const color = await store?.loadColor(imageId)
    if (!store || !image || !model) return
    if (!color) { setError('noColour'); return }
    const mine = ++token.current
    setRunning(true); setError(null)
    try {
      const d = await runDepth(ml, model, color, crop, image)
      if (mine !== token.current) return // начался новый запуск: побеждает последний
      await store.saveDepth(imageId, model.id, model.revision, d)
      const id = depthIdOf(imageId, model.id)
      getModelClient().registerDepth?.(id, d)
      setDepth(d)
      onDepth({ depthId: id, depthModel: model.id })
    } catch (e) {
      if (e instanceof MlAbortError || (e instanceof MlUnavailableError && e.reason === 'superseded')) return
      setError(e instanceof MlUnavailableError ? e.reason : 'failed')
    } finally { if (mine === token.current) setRunning(false) }
  }, [store, imageId, image, model, crop, ml, onDepth])

  const lost = wanted && !!depthId && restored && !depth
  return { model, running, error, depth, staleCrop: !!depth && !same(depth.crop, crop ?? fullCrop), lost, run, restored }
}
