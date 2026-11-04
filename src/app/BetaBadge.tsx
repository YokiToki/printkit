import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconBeta } from '@tabler/icons-react'
import { APP_VERSION } from './site'

/** Метка «beta» перед названием сайта PrintKit: по нажатию показывает дисклеймер, Escape или нажатие снаружи закрывает. Без обводки. */
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
    <span ref={root} className="relative inline-flex items-center flex-none">
      <button type="button" data-testid="beta-badge" aria-label={t('site.beta.label')} title={t('site.beta.label')} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}
        className="inline-flex h-5 w-5 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-text-muted hover:text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-xs transition-colors">
        <IconBeta size={15} stroke={1.75} />
      </button>
      {open && (
        <div id={id} role="region" aria-label={t('site.beta.title')}
          className="fixed top-[56px] left-2 z-30 rounded-group border border-border-strong bg-surface-2 p-3 text-xs text-text shadow-float md:absolute md:top-7 md:left-0 md:w-80">
          <div className="mb-1 font-medium">{t('site.beta.title')}</div>
          <p className="m-0 text-text-muted">{t('site.beta.text')}</p>
          <div data-testid="beta-version" className="mt-1.5 font-mono text-text-subtle">{t('site.version', { version: APP_VERSION })}</div>
        </div>
      )}
    </span>
  )
}
