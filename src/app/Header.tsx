import { NavLink, Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { IconBrandGithub, IconChevronDown, IconCpu } from '@tabler/icons-react'
import { useActivityLog } from './activityLog'
import { openModelManager } from '../features/ml/managerState'
import { GITHUB_URL } from './site'
import { PRODUCTS, productOf, type Product } from './products'
import { Logo } from './Logo'
import { BetaBadge } from './BetaBadge'
import { SegmentedControl } from '../ui/SegmentedControl'
import { useUnit } from '../ui/units'
import { LANGUAGES, type Language } from '../i18n'

/** Верхняя панель: логотип с названием продукта, переключатель продуктов и режимов (если у продукта они есть), единицы и язык. */
export function Header() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const product = productOf(pathname)
  const { unit, setUnit } = useUnit()
  const lang = (i18n.resolvedLanguage ?? 'en') as Language
  return (
    <header className="relative z-10 flex h-[52px] flex-none items-center gap-1 border-b border-border bg-surface-1 px-2 max-[400px]:[&_[role=group]_button]:px-2 min-[440px]:gap-2 md:gap-1 lg:gap-4 md:px-4">
      <Link to="/" aria-label={t('app.logoLabel')} className="flex h-8 items-center gap-2 font-display text-[13px] font-semibold tracking-tight text-text no-underline">
        <Logo />{product
          ? <span className="hidden whitespace-nowrap lg:inline">{t(`products.${product.id}.name`)}</span>
          : <span data-testid="site-name" className="hidden whitespace-nowrap min-[440px]:inline">{t('app.title')}</span>}
      </Link>
      <BetaBadge compact={!!product} />
      {product && <ProductSwitcher active={product} />}
      {product?.modes && (
        <>
          <nav aria-label={t('modes.label')} className="ml-2 hidden gap-0.5 lg:ml-6 rounded-group border border-border bg-bg p-0.5 md:inline-flex">
            {product.modes.map(({ id, path, Icon, labelKey }) => (
              <NavLink key={id} to={path} className={({ isActive }) =>
                `inline-flex h-8 items-center gap-1.5 rounded-control px-2 no-underline lg:px-3 ${isActive ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]' : 'text-text-muted hover:text-text'}`}>
                <Icon size={16} stroke={1.75} />{t(labelKey)}
              </NavLink>
            ))}
          </nav>
          <MobileModeSelect product={product} />
        </>
      )}
      <span className="hidden flex-1 md:block" />
      <SegmentedControl ariaLabel={t('units.label')} value={unit} onChange={setUnit}
        options={[{ value: 'mm', label: t('units.mm') }, { value: 'in', label: t('units.in') }]} />
      <SegmentedControl ariaLabel={t('language.label')} value={lang} onChange={(l) => void i18n.changeLanguage(l)}
        options={LANGUAGES.map((l) => ({ value: l, label: l.toUpperCase() }))} />
      <ModelsButton />
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label={t('site.github')} title={t('site.github')}
        className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-group border border-border bg-bg text-text-muted no-underline hover:text-text md:h-8 md:w-8">
        <IconBrandGithub size={16} stroke={1.75} />
      </a>
    </header>
  )
}

/** На узком экране режимы выбираются выпадающим списком. */
function MobileModeSelect({ product }: { product: Product }) {
  const { t } = useTranslation()
  return (
    <details className="relative md:hidden min-[440px]:min-w-0 min-[440px]:flex-1">
      <summary aria-label={t('modes.label')} className="flex h-10 cursor-pointer list-none items-center justify-between gap-1 rounded-control border border-border-strong bg-surface-2 px-2 max-[440px]:px-1.5">
        <ModeIcon product={product} /><span className="hidden min-w-0 truncate font-medium min-[440px]:inline"><ModeName product={product} /></span><IconChevronDown size={16} stroke={1.75} className="flex-none" />
      </summary>
      <ul aria-label={t('modes.label')} className="absolute top-11 right-0 left-0 z-20 m-0 list-none rounded-group border border-border-strong bg-surface-2 p-1 shadow-float">
        {(product.modes ?? []).map(({ id, path, Icon, labelKey }) => (
          <li key={id}><NavLink to={path} className="flex h-10 items-center gap-2 rounded-control px-3 text-text no-underline hover:bg-surface-3"
            onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}><Icon size={16} stroke={1.75} />{t(labelKey)}</NavLink></li>
        ))}
      </ul>
    </details>
  )
}

function ModeIcon({ product }: { product: Product }) {
  const { pathname: path } = useLocation()
  const modes = product.modes ?? []
  const Icon = (modes.find((m) => path.startsWith(m.path)) ?? modes[0]).Icon
  return <Icon size={16} stroke={1.75} className="flex-none" />
}

function ModeName({ product }: { product: Product }) {
  const { t } = useTranslation()
  const { pathname: path } = useLocation()
  const mode = (product.modes ?? []).find((m) => path.startsWith(m.path))
  return <>{mode ? t(mode.labelKey) : t('modes.label')}</>
}

const linkClass = (isActive: boolean) =>
  `inline-flex h-8 items-center gap-1.5 rounded-control px-3 no-underline ${isActive ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]' : 'text-text-muted hover:text-text'}`

/** Переключатель продуктов: сегменты на широком экране, выпадающий список (только значок) на узком. Макета нет: собран из тех же классов, что переключатель режимов. */
function ProductSwitcher({ active }: { active: Product }) {
  const { t } = useTranslation()
  return (
    <>
      <nav aria-label={t('products.label')} className="ml-2 hidden gap-0.5 rounded-group lg:ml-4 border border-border bg-bg p-0.5 md:inline-flex">
        {PRODUCTS.map(({ id, path, Icon }) => (
          <NavLink key={id} to={path} aria-label={t(`products.${id}.name`)} title={t(`products.${id}.name`)} aria-current={id === active.id ? 'page' : undefined} className={() => linkClass(id === active.id)}>
            <Icon size={16} stroke={1.75} /><span className="hidden whitespace-nowrap min-[1400px]:inline">{t(`products.${id}.name`)}</span>
          </NavLink>
        ))}
      </nav>
      <details className="relative md:hidden">
        <summary aria-label={`${t('products.label')}: ${t(`products.${active.id}.name`)}`} className="flex h-10 cursor-pointer list-none items-center gap-1 rounded-control border border-border-strong bg-surface-2 px-2 max-[440px]:px-1.5">
          <active.Icon size={16} stroke={1.75} /><IconChevronDown size={14} stroke={1.75} />
        </summary>
        <ul aria-label={t('products.label')} className="absolute top-11 left-0 z-20 m-0 min-w-48 list-none rounded-group border border-border-strong bg-surface-2 p-1 shadow-float">
          {PRODUCTS.map(({ id, path, Icon }) => (
            <li key={id}><NavLink to={path} aria-current={id === active.id ? 'page' : undefined} className="flex h-10 items-center gap-2 rounded-control px-3 text-text no-underline hover:bg-surface-3"
              onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}><Icon size={16} stroke={1.75} />{t(`products.${id}.name`)}</NavLink></li>
          ))}
        </ul>
      </details>
    </>
  )
}

/** Кнопка менеджера моделей ИИ: всегда видна, не зависит от режима; точка-индикатор, пока идёт загрузка модели или запуск ИИ. */
function ModelsButton() {
  const { t } = useTranslation()
  const busy = useActivityLog().jobs.some((j) => j.source === 'ai')
  return (
    <button type="button" onClick={openModelManager} aria-label={t('ml.button')} title={t('ml.button')}
      className="relative inline-flex h-10 w-10 flex-none cursor-pointer items-center justify-center rounded-group border border-border bg-bg text-text-muted hover:text-text md:h-8 md:w-8">
      <IconCpu size={16} stroke={1.75} />
      {busy && <span data-testid="models-busy" aria-hidden className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />}
    </button>
  )
}
