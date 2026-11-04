import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconFlask } from '@tabler/icons-react'
import { APP_VERSION } from './site'

/** Метка «beta» перед названием сайта: по нажатию показывает дисклеймер, Escape или нажатие снаружи закрывает. */
export function BetaBadge({ compact: _compact = false }: { compact?: boolean } = {}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: MouseEvent | TouchEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown) }
  }, [open])

  return (
    <span ref={root} className="relative flex-none">
      <button type="button" data-testid="beta-badge" aria-label={t('site.beta.label')} title={t('site.beta.label')} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-control border border-border bg-surface-2 text-text-muted hover:text-text hover:bg-surface-3">
        <IconFlask size={16} stroke={1.75} />
      </button>
      {open && (
        <div id={id} role="region" aria-label={t('site.beta.title')}
          className="fixed top-[56px] left-2 z-30 rounded-group border border-border-strong bg-surface-2 p-3 text-xs text-text shadow-float md:absolute md:top-8 md:left-0 md:w-80">
          <div className="mb-1 font-medium">{t('site.beta.title')}</div>
          <p className="m-0 text-text-muted">{t('site.beta.text')}</p>
          <div data-testid="beta-version" className="mt-1.5 font-mono text-text-subtle">{t('site.version', { version: APP_VERSION })}</div>
        </div>
      )}
    </span>
  )
}
