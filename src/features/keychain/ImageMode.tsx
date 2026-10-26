import { log } from '../../app/activityLog'
import { fmtSize } from '../../app/logText'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { usePersistedState } from '../../app/usePersistedState'
import { defaultKeychain, type AiSilhouetteParams, type KeychainParams } from '../../geometry/keychain'
import type { GrayImage } from '../../geometry/raster/threshold'
import { decodeColorImage, ImageError } from './decodeImage'
import { openImageStore, type ImageStore } from './imageStore'
import { downscaleColor, looksLikeLogo, useMatte } from './matte'
import { useDepth } from './depth'
import { boxOfPlane } from './cropMath'
import { CropEditor } from './CropEditor'
import { pictureStats } from '../../geometry/subjects'
import { hasAlpha } from '../../geometry/raster/threshold'
import { migrateKeychain } from './migrate'
import { KeychainPanel } from './KeychainPanel'
import { MaskPreview } from './MaskPreview'
import type { ImageNotice } from './ImageSection'
import { KeychainWorkspace } from './KeychainWorkspace'

const KEY = 'keychain.relief'
/** `subjectAuto` — автоматический выбор предмета для источника «Фото» (по умолчанию включён, правка значений его выключает). */
type State = KeychainParams & { imageName: string; subjectAuto?: boolean }
const defaults: State = { ...defaultKeychain, imageName: '' }

let counter = 0
const newImageId = () => `img${Date.now().toString(36)}${(counter++).toString(36)}`

/** Режим «Изображение» Keychain Master: изображение → силуэт → рельеф с подложкой. Параметры под ключом keychain.relief, пиксели изображения в IndexedDB. */
export function ImageMode() {
  const { t } = useTranslation()
  const [state, setState] = usePersistedState<State>(KEY, defaults, migrateKeychain)
  const { imageName, subjectAuto: auto, ...rest } = state
  const subjectAuto = auto !== false
  const key = JSON.stringify(rest)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const params = useMemo<KeychainParams>(() => rest, [key])
  const [image, setImage] = useState<GrayImage | null>(null)
  const [notice, setNotice] = useState<ImageNotice | null>(null)
  const [selectedArea, setSelectedArea] = useState<number | null>(null)
  const store = useRef<ImageStore | null>(null)
  const [imageStore, setImageStore] = useState<ImageStore | null>(null)

  // при открытии: хранилище и сохранённое изображение
  useEffect(() => {
    let cancelled = false
    void (async () => {
      store.current = await openImageStore()
      if (!cancelled) setImageStore(store.current)
      if (!params.imageId) return
      const saved = await store.current.load(params.imageId)
      if (cancelled) return
      if (saved) setImage(saved)
      else { setNotice({ kind: 'warn', text: t('keychain.image.lost') }); setState((o) => ({ ...o, imageId: '', imageName: '' })) }
    })()
    return () => { cancelled = true }
    // только при открытии режима
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onFile = useCallback(async (file: File) => {
    setNotice({ kind: 'info', text: t('keychain.image.loading', { name: file.name }) })
    try {
      const decoded = await decodeColorImage(file)
      log.info('image', 'log.image.imported', { name: file.name, size: fmtSize(file.size), width: decoded.image.width, height: decoded.image.height })
      if (decoded.downscaled) log.info('image', 'log.image.downscaled', { name: file.name, width: decoded.image.width, height: decoded.image.height })
      const id = newImageId()
      const old = params.imageId
      await store.current?.save(id, decoded.image)
      // цветная копия нужна нейросети, потом исходный файл уже не доступен; для SVG и без неё силуэт по ИИ не предлагается
      await store.current?.saveColor(id, downscaleColor(decoded.color.rgb, decoded.color.width, decoded.color.height))
      if (old) void store.current?.remove(old)
      setImage(decoded.image)
      // новое изображение: прежняя альфа ИИ к нему не относится (она ушла вместе со старым изображением), силуэт снова по яркости
      setState((o) => ({ ...o, imageId: id, imageName: file.name, crop: { x: 0, y: 0, w: 1, h: 1 }, subjectAuto: true, source: { ...o.source, depthId: '', depthModel: '' }, silhouette: { ...o.silhouette, areas: {}, source: 'brightness', ai: { ...o.silhouette.ai, model: '', matteId: '' } } }))
      const warns: string[] = []
      if (decoded.downscaled) warns.push(t('keychain.image.downscaled', { w: decoded.original.width, h: decoded.original.height, nw: decoded.image.width, nh: decoded.image.height }))
      if (store.current && !store.current.persistent) warns.push(t('keychain.image.notPersisted'))
      setNotice(warns.length ? { kind: 'warn', text: warns.join(' ') } : null)
    } catch (e) {
      const code = e instanceof ImageError ? e.code : 'decode'
      log.error('image', 'log.image.importFailed', { name: file.name }, `${code}${e instanceof Error && e.message ? `: ${e.message}` : ''}`)
      setNotice({ kind: 'error', text: t(`keychain.image.${code}`) })
    }
  }, [params.imageId, setState, t])

  // «Начать заново»: параметры по умолчанию, изображение убирается из модели (сам файл остаётся в хранилище)
  const startOver = () => { setState(defaults); setImage(null); setNotice(null); setSelectedArea(null) }
  const onAi = useCallback((patch: Partial<AiSilhouetteParams>) => setState((o) => ({ ...o, silhouette: { ...o.silhouette, source: 'ai', ...(o.silhouette.source !== 'ai' || (patch.matteId !== undefined && patch.matteId !== o.silhouette.ai.matteId) ? { areas: {} } : {}), ai: { ...o.silhouette.ai, ...patch } } })), [setState])
  const matte = useMatte({ imageId: params.imageId, image, store: imageStore, ai: params.silhouette.ai, source: params.silhouette.source, onAi })
  const isSvg = /\.svg$/i.test(imageName)
  const aiSource = useMemo(() => (image ? { control: matte, imageSize: { width: image.width, height: image.height }, transparent: hasAlpha(image), svg: isSvg, logo: looksLikeLogo(image) } : undefined), [matte, image, isSvg])
  const onDepth = useCallback((patch: { depthId: string; depthModel: string }) => setState((o) => ({ ...o, source: { ...o.source, ...patch } })), [setState])
  const depth = useDepth({ imageId: params.imageId, image, store: imageStore, crop: params.crop, depthId: params.source.depthId ?? '', depthModel: params.source.depthModel ?? '', wanted: params.source.kind === 'photo' && (params.source.mix?.depth ?? 0) > 0, onDepth })
  // габарит предмета по маске ИИ (доли изображения): для «По предмету» в кадре и для автоматического выбора предмета
  const subjectBox = useMemo(() => (matte.matte ? boxOfPlane(matte.matte.data, matte.matte.width, matte.matte.height) : null), [matte.matte])
  const stats = useMemo(() => {
    if (!image) return null
    const box: [number, number, number, number] | null = subjectBox ? [Math.floor(subjectBox.x0 * image.width), Math.floor(subjectBox.y0 * image.height), Math.ceil(subjectBox.x1 * image.width) - 1, Math.ceil(subjectBox.y1 * image.height) - 1] : null
    return pictureStats(image, box)
  }, [image, subjectBox])
  const photoPanel = useMemo(() => ({ depth, subjectAuto, onSubjectAuto: (on: boolean) => setState((o) => ({ ...o, subjectAuto: on })), stats }), [depth, subjectAuto, stats, setState])
  // источник «ИИ» или «Фото» без восстановленных данных в воркере: модель ждёт, чтобы не мелькнул силуэт или рельеф без них
  const hold = (params.silhouette.source === 'ai' && !!params.silhouette.ai.matteId && !matte.restored) || (params.source.kind === 'photo' && !!params.source.depthId && !depth.restored)
  const onDrop = (e: DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void onFile(f) }
  return (
    <KeychainWorkspace
      mode="image" params={params} image={image} onDrop={onDrop} onStartOver={startOver} hold={hold}
      overlay={(info) => (image ? <MaskPreview preview={info?.preview ?? null} selected={selectedArea} onSelect={setSelectedArea} matte={params.silhouette.source === 'ai' ? matte.matte : null} height={info?.height ? { width: info.height.width, height: info.height.height, data: info.height.data } : null}
        extra={image ? <CropEditor image={image} crop={params.crop} subjectBox={subjectBox} onChange={(c) => setState((o) => ({ ...o, crop: c }))} /> : null} /> : null)}
      panel={(info) => <KeychainPanel params={params} onChange={setState} imageName={imageName} hasImage={!!image} info={info} notice={notice} onFile={(f) => void onFile(f)} selectedArea={selectedArea} onSelectArea={setSelectedArea} aiSource={aiSource} image={image} subjectBox={subjectBox} photo={photoPanel} />}
    />
  )
}
