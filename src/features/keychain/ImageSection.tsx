import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconPhoto, IconUpload } from '@tabler/icons-react'
import { Section } from '../../ui/Section'
import { Banner } from '../../ui/Banner'

export interface ImageNotice { kind: 'info' | 'warn' | 'error'; text: string }

/** Выбор изображения: кнопка и зона перетаскивания. Ошибка не меняет текущий брелок. */
export function ImageSection({ name, notice, onFile, photoLike, children }: { name: string; notice: ImageNotice | null; onFile: (f: File) => void; photoLike: boolean; /** Кадр и контур: ниже выбора файла. */ children?: ReactNode }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }
  return (
    <Section title={t('keychain.image.title')} summary={name || undefined}>
      <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={drop}
        className={`flex flex-col gap-3 rounded-control ${over ? 'outline-2 outline-dashed outline-accent' : ''}`}>
        <button type="button" onClick={() => input.current?.click()}
          className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-accent bg-accent-muted px-3 font-medium text-white hover:brightness-110">
          <IconUpload size={16} stroke={1.75} />{name ? t('keychain.image.replace') : t('keychain.image.pick')}
        </button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" hidden data-testid="image-input"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
        <span className="inline-flex items-center gap-1.5 text-xs text-text-subtle"><IconPhoto size={14} stroke={1.75} />{name ? t('keychain.image.current', { name }) : t('keychain.image.drop')}</span>
        {notice && <Banner kind={notice.kind}>{notice.text}</Banner>}
        {photoLike && <Banner kind="warn">{t('keychain.image.photo')}</Banner>}
        {children}
      </div>
    </Section>
  )
}
