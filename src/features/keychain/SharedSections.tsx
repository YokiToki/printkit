import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { validateKeychain, type KeychainInfo, type KeychainParams } from '../../geometry/keychain'
import { ProfileSection } from './ProfileSection'
import { DetailSection } from './DetailSection'
import { PatternSection } from './PatternSection'
import { QualitySection } from './QualitySection'
import { MountSection } from './MountSection'
import { SplitSection } from './SplitSection'
import { BaseSection } from './BaseSection'
import { TextSection } from './TextSection'
import { PlacementEditor } from './PlacementEditor'
import type { PlacementPatch } from './PlacementEditor'
import { mmToRelPos } from './place'
import type { PhotoPanel } from './PhotoReliefBlock'

/** Часть параметров, общая для режимов Изображение и Форма: сюда пишут общие секции. */
export type SharedParams = Pick<KeychainParams, 'source' | 'relief' | 'detail' | 'pattern' | 'base' | 'mount' | 'split' | 'text' | 'quality'>

/**
 * Секции, общие для обоих режимов Keychain: рельеф, детали, узор, подложка, крепление, половины, разрешение.
 * `S` — состояние режима (оно шире общей части); `params` — полные параметры для проверок.
 */
export function SharedSections<S extends SharedParams>({ params: p, info, onChange, imageOnly = true, defaults, photo }: {
  params: KeychainParams
  info: KeychainInfo | null
  onChange: Dispatch<SetStateAction<S>>
  /** Рельеф (профиль, источник высоты) и линии детали — только для изображения: у фигуры высота задаётся подложкой и бортиком. */
  imageOnly?: boolean
  /** Умолчания режима: подложка у формы тоньше, чем у изображения, и «изменено» считается от них. */
  defaults?: SharedParams
  /** Источник «Фото»: ход глубины и выбор предмета; без него (SVG, режим «Форма») источника «Фото» нет. */
  photo?: { panel: PhotoPanel; imageId: string }
}) {
  const { t } = useTranslation()
  const { errors } = validateKeychain(p)
  const err = (field: string) => { const e = errors.find((x) => x.field === field); return e ? t(e.key) : undefined }
  const patch = <K extends keyof SharedParams>(k: K) => (v: Partial<SharedParams[K]>) => onChange((o) => ({ ...o, [k]: { ...o[k], ...v } }))
  const place = (pt: PlacementPatch) => onChange((o) => {
    if (pt.mount) return { ...o, mount: { ...o.mount, x: pt.mount.x, y: pt.mount.y } }
    if (pt.text) return { ...o, text: { ...o.text, x: pt.text.x, y: pt.text.y } }
    if (pt.exit) return { ...o, mount: { ...o.mount, exitX: pt.exit.x, exitY: pt.exit.y } }
    if (pt.pin) {
      // первое ручное перемещение фиксирует автоматические положения всех штифтов, дальше правится выбранный
      const cur = o.split.pinPositions && o.split.pinPositions.length === o.split.pins ? o.split.pinPositions : (info?.mountInfo?.pins ?? []).map((q) => mmToRelPos(q, info?.size ?? [1, 1]))
      const next = cur.map((q, i) => (i === pt.pin!.index ? { x: pt.pin!.x, y: pt.pin!.y } : q))
      return { ...o, split: { ...o.split, pinPositions: next } }
    }
    return o
  })
  const plateError = info?.error === 'keychain.error.plateTooSmall' ? info.error : null
  return (
    <>
      {imageOnly && <ProfileSection relief={p.relief} source={p.source} error={err} onRelief={patch('relief')} onSource={patch('source')} cell={info?.cell ?? null} minCell={info?.minCell ?? null} onRaise={(c) => patch('quality')({ cell: c })}
        photo={photo ? { panel: photo.panel, params: p, apply: (f) => onChange((o) => ({ ...o, ...f(o as unknown as KeychainParams) })), info, imageId: photo.imageId } : undefined} />}
      {imageOnly && <DetailSection value={p.detail} error={err} onChange={patch('detail')} />}
      <PatternSection value={p.pattern} quality={p.quality} cell={info?.cell ?? null} minCell={info?.minCell ?? null} error={err} onChange={patch('pattern')} onRaise={(c) => patch('quality')({ cell: c })} />
      <TextSection value={p.text} error={err} splitOn={p.split.enabled} cell={info?.cell ?? null} minCell={info?.minCell ?? null} clipped={!!info?.text?.clipped}
        onChange={patch('text')} onRaise={(c) => patch('quality')({ cell: c })}
        editor={p.text.enabled && info?.size && info.preview && info.text ? <PlacementEditor params={p} info={info} onPlace={place} onPick={() => {}} rejectedShown={false} only="text" /> : null} />
      <BaseSection value={p.base} defaults={defaults?.base} error={err} plateError={plateError} onChange={patch('base')} />
      <MountSection params={p} info={info} error={err} onMount={patch('mount')} onPlace={place} />
      <SplitSection params={p} info={info} error={err} onSplit={patch('split')} />
      <QualitySection value={p.quality} effective={info?.cell ?? null} reduced={!!info?.reduced} error={err} onChange={patch('quality')} />
    </>
  )
}
