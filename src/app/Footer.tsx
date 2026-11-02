import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconBrandGithub, IconCheck, IconCopy, IconHeartFilled } from '@tabler/icons-react'
import { reopenConsent } from './analytics'
import { APP_VERSION, CLOUDTIPS_URL, DONATION_ADDRESS, GITHUB_URL } from './site'

/** Подвал стартовых страниц: ссылка на исходники, адрес для пожертвований (USDT, TRC20) с кнопкой копирования и CloudTips в русской локали. В режимах его нет. */
export function Footer() {
  const { t, i18n } = useTranslation()
  const isRu = i18n.resolvedLanguage === 'ru'
  const [copied, setCopied] = useState(false)
  const address = useRef<HTMLElement>(null)
  const timer = useRef<number | undefined>(undefined)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(DONATION_ADDRESS)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // буфер недоступен: выделяем адрес, чтобы его можно было скопировать вручную
      const el = address.current
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r) }
    }
  }

  return (
    <footer aria-label={t('site.footer.label')} className="relative flex w-full max-w-[760px] flex-col items-center gap-2 border-t border-border pt-4 text-center text-xs text-text-muted">
      <p data-testid="footer-beta" className="m-0 max-w-[560px]">{t('site.beta.text')}</p>
      <div className="inline-flex items-center gap-1.5 font-medium text-text">
        <IconHeartFilled size={16} aria-hidden="true" data-testid="support-heart" className="text-error drop-shadow-[0_0_6px_var(--color-error)]" />
        {t('site.footer.support')}
      </div>
      <p className="m-0 max-w-[560px]">{t('site.footer.donate')}</p>
      <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
        <code ref={address} aria-label={t('site.footer.address')} data-testid="donation-address" className="min-w-0 rounded-control border border-border bg-surface-1 px-2 py-1 font-mono text-[10px] break-all min-[440px]:text-[11px] text-text select-all">{DONATION_ADDRESS}</code>
        <button type="button" onClick={copy} aria-label={t('site.footer.copy')} title={t('site.footer.copy')}
          className="inline-flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface-2 text-text-muted hover:bg-surface-3 hover:text-text">
          {copied ? <IconCheck size={16} stroke={1.75} /> : <IconCopy size={16} stroke={1.75} />}
        </button>
        <span role="status" className={copied ? 'text-left text-success-text' : 'sr-only'}>{copied ? t('site.footer.copied') : ''}</span>
        {isRu && (
          <>
            <span aria-hidden="true" data-testid="donation-divider" className="mx-1 h-5 w-px flex-none bg-border-strong" />
            <a href={CLOUDTIPS_URL} target="_blank" rel="noopener noreferrer" data-testid="cloudtips-link"
              className="inline-flex h-8 flex-none items-center justify-center rounded-control border border-border-strong bg-surface-2 px-3 text-xs font-medium text-text no-underline hover:bg-surface-3">
              {t('site.footer.cloudtips')}
            </a>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-text-muted no-underline hover:text-text">
          <IconBrandGithub size={14} stroke={1.75} />{t('site.footer.source')}
        </a>
        <button type="button" onClick={reopenConsent} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-text-muted underline hover:text-text">{t('site.footer.analytics')}</button>
        <span data-testid="footer-version" className="font-mono text-text-subtle">{t('site.version', { version: APP_VERSION })}</span>
      </div>
    </footer>
  )
}
