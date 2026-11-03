import { useTranslation } from 'react-i18next'
import { setConsent, useBannerVisible } from './analytics'

/** Всплывающая плашка согласия на аналитику в левом нижнем углу поверх интерфейса с скруглёнными углами. */
export function ConsentBanner() {
  const { t } = useTranslation()
  if (!useBannerVisible()) return null
  const btn = 'inline-flex h-9 min-w-24 cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface-2 px-4 font-medium text-text hover:bg-surface-3'
  return (
    <section role="region" aria-label={t('site.consent.label')} data-testid="consent-banner"
      className="fixed bottom-4 left-4 z-50 flex max-w-sm flex-col gap-3 rounded-2xl border border-border-strong bg-surface-1 p-4 text-xs text-text-muted shadow-float">
      <p className="m-0 text-left">{t('site.consent.text')}</p>
      <div className="flex flex-none gap-2">
        <button type="button" className={btn} onClick={() => setConsent('granted')}>{t('site.consent.accept')}</button>
        <button type="button" className={btn} onClick={() => setConsent('denied')}>{t('site.consent.decline')}</button>
      </div>
    </section>
  )
}
