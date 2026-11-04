import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { IconBrandGithub } from '@tabler/icons-react'
import { GITHUB_URL } from './site'
import { productOf } from './products'
import { Logo } from './Logo'
import { BetaBadge } from './BetaBadge'
import { SegmentedControl } from '../ui/SegmentedControl'
import { useUnit } from '../ui/units'
import { LANGUAGES, type Language } from '../i18n'

const ENGLISH_PRODUCT_NAMES: Record<string, string> = {
  editor: 'Editor',
  gridfinity: 'Gridfinity',
  keychain: 'Keychain',
  rack: 'Rack',
}

const ENGLISH_MODE_NAMES: Record<string, string> = {
  box: 'Box',
  baseplate: 'Baseplate',
  cutout: 'Cutout',
  image: 'Image',
  shape: 'Shape',
  panel: 'Panel',
  case: 'Enclosure',
  shelf: 'Shelf',
}

/** Верхняя панель: логотип, beta-иконка и хлебные крошки (PrintKit / Product / Mode) в шрифте font-display, единицы и язык. */
export function Header() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const product = productOf(pathname)
  const mode = product?.modes?.find((m) => pathname.startsWith(m.path))
  const { unit, setUnit } = useUnit()
  const lang = (i18n.resolvedLanguage ?? 'en') as Language

  const productName = product ? (ENGLISH_PRODUCT_NAMES[product.id] ?? product.id) : null
  const modeName = mode ? (ENGLISH_MODE_NAMES[mode.id] ?? mode.id) : null

  return (
    <header className="relative z-10 flex h-[52px] flex-none items-center gap-2 border-b border-border bg-surface-1 px-2 min-[440px]:gap-3 md:px-4">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center">
        <ol className="flex min-w-0 items-center gap-1.5 sm:gap-2 m-0 p-0 list-none font-display text-[12px] sm:text-[13px] font-semibold tracking-tight">
          <li className="flex items-center gap-1.5">
            <Link to="/" tabIndex={-1} aria-hidden="true" className="flex items-center text-text no-underline hover:text-accent">
              <Logo hue={product?.hue} />
            </Link>
            <BetaBadge />
            <Link to="/" aria-label={t('app.logoLabel')} className="flex items-center text-text no-underline hover:text-accent">
              <span data-testid="site-name">PrintKit</span>
            </Link>
          </li>
          {product && (
            <>
              <li aria-hidden="true" className="text-text-subtle select-none">/</li>
              <li className="flex items-center min-w-0">
                {mode ? (
                  <Link to={product.path} className="text-text-muted hover:text-text no-underline truncate max-w-[100px] sm:max-w-none">
                    {productName}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-text truncate max-w-[120px] sm:max-w-none">
                    {productName}
                  </span>
                )}
              </li>
            </>
          )}
          {mode && (
            <>
              <li aria-hidden="true" className="text-text-subtle select-none">/</li>
              <li className="flex items-center min-w-0">
                <span aria-current="page" className="text-text truncate max-w-[100px] sm:max-w-none">
                  {modeName}
                </span>
              </li>
            </>
          )}
        </ol>
      </nav>
      <span className="flex-1 min-w-2" />
      <SegmentedControl compact ariaLabel={t('units.label')} value={unit} onChange={setUnit}
        options={[{ value: 'mm', label: t('units.mm') }, { value: 'in', label: t('units.in') }]} />
      <SegmentedControl compact ariaLabel={t('language.label')} value={lang} onChange={(l) => void i18n.changeLanguage(l)}
        options={LANGUAGES.map((l) => ({ value: l, label: l.toUpperCase() }))} />
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label={t('site.github')} title={t('site.github')}
        className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-group border border-border bg-bg text-text-muted no-underline hover:text-text max-[440px]:hidden">
        <IconBrandGithub size={16} stroke={1.75} />
      </a>
    </header>
  )
}
