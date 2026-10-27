import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { validateKeychain, type KeychainInfo, type KeychainParams } from '../../geometry/keychain'
import { useRef } from 'react'
import { IconUpload } from '@tabler/icons-react'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { ImageSection, type ImageNotice } from './ImageSection'
import { SilhouetteSection, type AiSource } from './SilhouetteSection'
import { SizeSection } from './SizeSection'
import { SharedSections } from './SharedSections'
import { CropEditor } from './CropEditor'
import { OutlineControls } from './OutlineControls'
import type { Box } from './cropMath'
import type { PhotoPanel } from './PhotoReliefBlock'
import type { GrayImage } from '../../geometry/raster/threshold'
import { defaultOutline } from '../../geometry/imageOutline'

export interface KeychainPanelProps {
  params: KeychainParams
  onChange: Dispatch<SetStateAction<KeychainParams & { imageName: string }>>
  imageName: string
  hasImage: boolean
  info: KeychainInfo | null
  notice: ImageNotice | null
  onFile: (f: File) => void
  /** Выбранная область (подсвечена на маске и в списке) и её смена. */
  selectedArea?: number | null
  onSelectArea?: (id: number | null) => void
  /** Источник силуэта «ИИ»: ход запуска и сведения об изображении. */
  aiSource?: AiSource
  /** Изображение, габарит предмета (по маске ИИ) и ход глубины: для кадра, контура и источника «Фото». */
  image?: GrayImage | null
  subjectBox?: Box | null
  photo?: PhotoPanel
}

/** Кнопка выбора изображения в подсказке пустого режима: тот же обработчик, что у секции «Изображение». */
function PickImageButton({ onFile }: { onFile: (f: File) => void }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button primary onClick={() => input.current?.click()}><IconUpload size={16} stroke={1.75} />{t('keychain.image.pick')}</Button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" hidden data-testid="image-input-empty"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
    </>
  )
}

/** Панель режима «Изображение»: изображение, силуэт, размер, затем общие секции (рельеф … разрешение). Макета нет: собрана из компонентов ui/. */
export function KeychainPanel({ params: p, onChange, imageName, hasImage, info, notice, onFile, selectedArea = null, onSelectArea, aiSource, image = null, subjectBox = null, photo }: KeychainPanelProps) {
  const { t } = useTranslation()
  const { errors } = validateKeychain(p)
  const err = (field: string) => { const e = errors.find((x) => x.field === field); return e ? t(e.key) : undefined }
  const patch = <K extends 'silhouette' | 'size'>(k: K) => (v: Partial<KeychainParams[K]>) => onChange((o) => ({ ...o, [k]: { ...o[k], ...v } }))
  const otherError = info?.error && info.error !== 'keychain.error.plateTooSmall' && info.error !== 'keychain.error.noImage' ? info.error : null

  return (
    <>
      {/* без изображения секция «Изображение» свёрнута, поэтому первый шаг — кнопка прямо в подсказке; ошибка первого файла видна здесь же */}
      <ImageSection name={imageName} notice={hasImage ? notice : null} onFile={onFile} photoLike={!!info?.photoLike && p.source.kind === 'distance' && p.silhouette.source !== 'ai'}>
        {hasImage && image && (
          <>
            <CropEditor image={image} crop={p.crop} subjectBox={subjectBox} onChange={(c) => onChange((o) => ({ ...o, crop: c }))} />
            <OutlineControls value={p.outline ?? defaultOutline} onChange={(v) => onChange((o) => ({ ...o, outline: { ...(o.outline ?? defaultOutline), ...v } }))} count={info?.outlineVertices} />
          </>
        )}
      </ImageSection>
      {!hasImage ? (
        <div className="flex flex-col gap-3 p-4">
          <Banner>{t('keychain.empty')}</Banner>
          <PickImageButton onFile={onFile} />
          {notice && <Banner kind={notice.kind}>{notice.text}</Banner>}
        </div>
      ) : (
        <>
          {otherError && <div className="px-4 pt-3"><Banner kind="warn">{t(otherError)}</Banner></div>}
          <SilhouetteSection value={p.silhouette} threshold={info?.threshold ?? null} preview={info?.preview ?? null} heightFloor={p.relief.heightFloor} goneAreas={info?.goneAreas ?? []} selected={selectedArea} onSelect={onSelectArea} onChange={patch('silhouette')} aiSource={aiSource} />
          <SizeSection value={p.size} resolved={info?.size ?? null} error={err} onChange={patch('size')} />
          <SharedSections params={p} info={info} onChange={onChange} photo={photo && !aiSource?.svg ? { panel: photo, imageId: p.imageId } : undefined} />
        </>
      )}
    </>
  )
}
