import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowsMaximize, IconChevronDown, IconChevronUp, IconX } from '@tabler/icons-react'
import { IconContrast, IconMountain } from '@tabler/icons-react'
import type { Matte, MaskPreview as Preview } from '../../geometry/keychain'

const css = (name: string, fallback: string) => (typeof document === 'undefined' ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback)

/** Номер области под точкой (доли ширины и высоты картинки, 0…1) или null: по плоскости labels предпросмотра. */
export function areaAt(preview: Preview, fx: number, fy: number): number | null {
  if (!(fx >= 0 && fx < 1 && fy >= 0 && fy < 1)) return null
  const i = Math.min(preview.width - 1, Math.floor(fx * preview.width)), j = Math.min(preview.height - 1, Math.floor(fy * preview.height))
  return preview.labels[j * preview.width + i] || null
}

/** Щелчок по canvas → номер области под курсором (или null, если щёлкнули мимо областей). */
function clickArea(preview: Preview, e: MouseEvent<HTMLCanvasElement>): number | null {
  const r = e.currentTarget.getBoundingClientRect()
  if (!r.width || !r.height) return null
  return areaAt(preview, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
}

/** Рисует маску в canvas; scale > 1 — крупный вид: пиксели маски укрупняются, номера областей растут вместе с ним. */
/** Серая мягкая альфа сети вместо маски: выборка по ближайшему пикселю в размер предпросмотра. */
function softImage(preview: Preview, soft: Matte): ImageData {
  const img = new ImageData(preview.width, preview.height)
  for (let j = 0; j < preview.height; j++) for (let i = 0; i < preview.width; i++) {
    const x = Math.min(soft.width - 1, Math.floor(((i + 0.5) * soft.width) / preview.width)), y = Math.min(soft.height - 1, Math.floor(((j + 0.5) * soft.height) / preview.height))
    const v = soft.data[y * soft.width + x]
    img.data.set([v, v, v, 255], (j * preview.width + i) * 4)
  }
  return img
}

function drawMask(c: HTMLCanvasElement, preview: Preview, scale: number, selected: number | null, soft: Matte | null = null) {
  const ctx = c.getContext('2d')
  if (!ctx) return // jsdom без canvas
  const colors = [css('--color-bg', '#0e1013'), css('--color-accent', '#7c9cff'), css('--color-warn-border', '#8a6d2b'), css('--color-accent-muted', '#25356b'), css('--color-success-text', '#a9e5c6')]
  const img = soft ? softImage(preview, soft) : new ImageData(preview.width, preview.height)
  const rgb = colors.map((hex) => { const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] })
  if (!soft) for (let i = 0; i < preview.data.length; i++) { const col = rgb[preview.data[i]] ?? rgb[0]; img.data.set([col[0], col[1], col[2], 255], i * 4) }
  if (scale === 1) ctx.putImageData(img, 0, 0)
  else {
    const tmp = document.createElement('canvas')
    tmp.width = preview.width; tmp.height = preview.height
    tmp.getContext('2d')?.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tmp, 0, 0, c.width, c.height)
  }
  if (soft) return // в мягком виде нет ни областей, ни их номеров
  // контур выбранной области: пиксели области, у которых есть сосед из другой области
  if (selected !== null) {
    ctx.fillStyle = '#ffd24a'
    const { width: w, height: h, labels } = preview
    const edge = Math.max(1, Math.round(scale * 0.6))
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (labels[j * w + i] !== selected) continue
      const out = (di: number, dj: number) => { const x = i + di, y = j + dj; return x < 0 || y < 0 || x >= w || y >= h || labels[y * w + x] !== selected }
      if (out(-1, 0) || out(1, 0) || out(0, -1) || out(0, 1)) ctx.fillRect(i * scale, j * scale, Math.max(edge, scale > 1 ? scale / 2 : 1), Math.max(edge, scale > 1 ? scale / 2 : 1))
    }
  }
  ctx.font = `bold ${Math.round(11 * Math.max(1, scale * 0.8))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const off = 0.7 * Math.max(1, scale * 0.6)
  for (const h of preview.areas) {
    const x = h.cx * scale, y = h.cy * scale
    ctx.fillStyle = '#000'; ctx.fillText(String(h.id), x + off, y + off)
    ctx.fillStyle = h.open ? '#fff' : '#cfd6e6'; ctx.fillText(String(h.id), x, y)
  }
}

/** Большой вид маски: ~70 % окна, закрывается кнопкой, Esc и щелчком снаружи. Тот же preview, поэтому обновляется вживую. */
function LargeMask({ preview, selected, onSelect, onClose, soft, extra }: { preview: Preview; selected: number | null; onSelect?: (id: number | null) => void; onClose: () => void; soft: Matte | null; extra: ReactNode }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLCanvasElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const scale = Math.max(1, Math.floor(1024 / Math.max(preview.width, preview.height, 1)))

  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  useEffect(() => { if (ref.current) drawMask(ref.current, preview, scale, selected, soft) }, [preview, scale, selected, soft])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="mask-large-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={t('keychain.preview.large')}
        style={{ width: extra ? 'min(94vw, 1040px)' : `min(var(--mask-w, 70vw), calc(var(--mask-h, 70vh) * ${preview.width / Math.max(preview.height, 1)}))` }}
        className="relative flex max-h-[94vh] flex-col gap-2 overflow-auto rounded-card border border-border bg-surface-1 p-3 shadow-float [--mask-h:70vh] [--mask-w:70vw] max-md:[--mask-h:80vh] max-md:[--mask-w:92vw]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-text">{t('keychain.preview.title')}</span>
          <button ref={closeRef} type="button" aria-label={t('keychain.preview.close')} onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-text-muted hover:bg-surface-3 hover:text-text">
            <IconX size={16} stroke={1.75} />
          </button>
        </div>
        {/* с редактором кадра маска и кадр лежат рядом (на узком экране друг под другом), и всё окно прокручивается: на экран не влезать нельзя */}
        <div className={extra ? 'flex flex-col gap-3 md:flex-row md:items-start' : ''}>
          <div className="min-w-0 flex-1">
            <canvas ref={ref} width={preview.width * scale} height={preview.height * scale} role="img" aria-label={t('keychain.preview.label')}
              onClick={(e) => onSelect?.(clickArea(preview, e))}
              className={`block h-auto w-full cursor-pointer rounded-xs [image-rendering:pixelated] ${extra ? 'mx-auto max-h-[calc(94vh-6rem)] object-contain' : ''}`} />
          </div>
          {extra && <div className="md:w-[320px] md:shrink-0" data-testid="mask-large-extra">{extra}</div>}
        </div>
      </div>
    </div>
  )
}

/** Предпросмотр маски силуэта с номерами дырок: фон, материал, залитая дырка, открытая дырка. Закрепляется в углу вьюпорта, сворачивается, увеличивается. */
export function MaskPreview({ preview, selected = null, onSelect, matte = null, height = null, extra = null }: { preview: Preview | null; selected?: number | null; onSelect?: (id: number | null) => void; /** Мягкая альфа сети (источник «ИИ»): даёт переключатель на серый вид. */ matte?: Matte | null; /** Высота рельефа «Фото» (серая плоскость): второй переключатель. */ height?: Matte | null; /** Дополнение увеличенного вида (редактор кадра). */ extra?: ReactNode }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLCanvasElement>(null)
  const enlargeRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(true)
  const [large, setLarge] = useState(false)
  const [view, setView] = useState<'mask' | 'soft' | 'height'>('mask')
  const soft = view === 'soft' && matte ? matte : view === 'height' && height ? height : null
  const softOn = view === 'soft', heightOn = view === 'height'

  useEffect(() => {
    if (ref.current && preview && open) drawMask(ref.current, preview, 1, selected, soft)
  }, [preview, open, selected, soft])

  const closeLarge = () => { setLarge(false); setTimeout(() => enlargeRef.current?.focus(), 0) }

  return (
    <div className="absolute top-4 left-4 z-[1] w-44 rounded-card border border-border bg-surface-1/90 shadow-float md:w-52" data-testid="mask-preview">
      <div className="flex items-center">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
          className="flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-between gap-1 rounded-tl-card border-0 bg-transparent px-2.5 text-xs font-medium text-text-muted hover:text-text">
          <span>{t('keychain.preview.title')}</span>{open ? <IconChevronUp size={14} stroke={1.75} /> : <IconChevronDown size={14} stroke={1.75} />}
        </button>
        {preview && matte && (
          <button type="button" aria-pressed={softOn} aria-label={t('keychain.preview.soft')} title={t('keychain.preview.soft')} onClick={() => setView((v) => (v === 'soft' ? 'mask' : 'soft'))}
            className={`flex h-8 w-8 flex-none cursor-pointer items-center justify-center border-0 bg-transparent ${softOn ? 'text-accent-text' : 'text-text-muted hover:text-text'}`}>
            <IconContrast size={14} stroke={1.75} />
          </button>
        )}
        {preview && height && (
          <button type="button" aria-pressed={heightOn} aria-label={t('keychain.photo.height')} title={t('keychain.photo.height')} onClick={() => setView((v) => (v === 'height' ? 'mask' : 'height'))}
            className={`flex h-8 w-8 flex-none cursor-pointer items-center justify-center border-0 bg-transparent ${heightOn ? 'text-accent-text' : 'text-text-muted hover:text-text'}`}>
            <IconMountain size={14} stroke={1.75} />
          </button>
        )}
        {preview && (
          <button ref={enlargeRef} type="button" aria-label={t('keychain.preview.enlarge')} title={t('keychain.preview.enlarge')} onClick={() => setLarge(true)}
            className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-tr-card border-0 bg-transparent text-text-muted hover:text-text">
            <IconArrowsMaximize size={14} stroke={1.75} />
          </button>
        )}
      </div>
      {open && (
        <div className="px-2 pb-2">
          {preview
            ? <canvas ref={ref} width={preview.width} height={preview.height} role="img" aria-label={t('keychain.preview.label')} onClick={(e) => onSelect?.(clickArea(preview, e))} className="block h-auto w-full cursor-pointer rounded-xs [image-rendering:pixelated]" />
            : <span className="text-xs text-text-subtle">{t('keychain.preview.empty')}</span>}
        </div>
      )}
      {large && preview && <LargeMask preview={preview} selected={selected} onSelect={onSelect} onClose={closeLarge} soft={soft} extra={extra} />}
    </div>
  )
}
