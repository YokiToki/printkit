import { log } from '../../app/activityLog'
import { fmtSize } from '../../app/logText'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { usePersistedState } from '../../app/usePersistedState'
import { defaultKeychain, type KeychainParams } from '../../geometry/keychain'
import type { GrayImage } from '../../geometry/raster/threshold'
import { decodeImage, ImageError } from './decodeImage'
import { openImageStore, type ImageStore } from './imageStore'
import { migrateKeychain } from './migrate'
import { KeychainPanel } from './KeychainPanel'
import { MaskPreview } from './MaskPreview'
import type { ImageNotice } from './ImageSection'
import { KeychainWorkspace } from './KeychainWorkspace'

const KEY = 'keychain.relief'
type State = KeychainParams & { imageName: string }
const defaults: State = { ...defaultKeychain, imageName: '' }

let counter = 0
const newImageId = () => `img${Date.now().toString(36)}${(counter++).toString(36)}`

/** Режим «Изображение» Keychain Master: изображение → силуэт → рельеф с подложкой. Параметры под ключом keychain.relief, пиксели изображения в IndexedDB. */
export function ImageMode() {
  const { t } = useTranslation()
  const [state, setState] = usePersistedState<State>(KEY, defaults, migrateKeychain)
  const { imageName, ...rest } = state
  const key = JSON.stringify(rest)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const params = useMemo<KeychainParams>(() => rest, [key])
  const [image, setImage] = useState<GrayImage | null>(null)
  const [notice, setNotice] = useState<ImageNotice | null>(null)
  const [selectedArea, setSelectedArea] = useState<number | null>(null)
  const store = useRef<ImageStore | null>(null)

  // при открытии: хранилище и сохранённое изображение
  useEffect(() => {
    let cancelled = false
    void (async () => {
      store.current = await openImageStore()
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
      const decoded = await decodeImage(file)
      log.info('image', 'log.image.imported', { name: file.name, size: fmtSize(file.size), width: decoded.image.width, height: decoded.image.height })
      if (decoded.downscaled) log.info('image', 'log.image.downscaled', { name: file.name, width: decoded.image.width, height: decoded.image.height })
      const id = newImageId()
      const old = params.imageId
      await store.current?.save(id, decoded.image)
      if (old) void store.current?.remove(old)
      setImage(decoded.image)
      setState((o) => ({ ...o, imageId: id, imageName: file.name, silhouette: { ...o.silhouette, areas: {} } }))
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
  const onDrop = (e: DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void onFile(f) }
  return (
    <KeychainWorkspace
      mode="image" params={params} image={image} onDrop={onDrop} onStartOver={startOver}
      overlay={(info) => (image ? <MaskPreview preview={info?.preview ?? null} selected={selectedArea} onSelect={setSelectedArea} /> : null)}
      panel={(info) => <KeychainPanel params={params} onChange={setState} imageName={imageName} hasImage={!!image} info={info} notice={notice} onFile={(f) => void onFile(f)} selectedArea={selectedArea} onSelectArea={setSelectedArea} />}
    />
  )
}
