import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { IconHistory } from '@tabler/icons-react'
import { PRODUCTS, productById } from './products'
import { readSession } from './lastSession'
import { ChoiceCard, StartLayout, useNumberHotkeys } from './StartLayout'
import { ModeArt } from './ModeArt'
import { Motivation } from './Motivation'

function relativeTime(ms: number, lng: string, justNow: string) {
  const sec = Math.round((ms - Date.now()) / 1000)
  if (Math.abs(sec) < 45) return justNow
  const rtf = new Intl.RelativeTimeFormat(lng, { numeric: 'auto' })
  const min = Math.round(sec / 60)
  if (Math.abs(min) < 60) return rtf.format(min, 'minute')
  const h = Math.round(min / 60)
  if (Math.abs(h) < 24) return rtf.format(h, 'hour')
  return rtf.format(Math.round(h / 24), 'day')
}

const PATHS = PRODUCTS.map((p) => p.path)

/** Корневая страница: выбор продукта (Gridfinity, Keychain или Rack). Вьюпорт здесь не монтируется и геометрия не считается. */
export function StartPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const last = useMemo(readSession, [])
  useNumberHotkeys(PATHS, navigate)

  const lastProduct = last ? productById(last.product) : undefined
  const lastMode = last?.mode ? lastProduct?.modes?.find((m) => m.id === last.mode) : undefined
  // «Продолжить» ведёт в режим Gridfinity или в раздел продукта без режимов
  const lastTo = lastMode?.path ?? lastProduct?.path
  const lastName = lastMode ? t(lastMode.labelKey) : lastProduct ? t(`products.${lastProduct.id}.name`) : ''
  return (
    <StartLayout tagline={t('start.tagline')} title={t('start.title')} after={<Motivation />}>
      <div className="relative flex flex-wrap justify-center gap-6">
        {PRODUCTS.map(({ id, path, artId }, i) => (
          <ChoiceCard key={id} to={path} testId={`card-${id}`} index={i + 1}
            art={<ModeArt id={artId} />}
            name={t(`products.${id}.name`)} desc={t(`products.${id}.desc`)} tags={[t(`products.${id}.tag1`), t(`products.${id}.tag2`)]} />
        ))}
      </div>
      {last && lastTo && (
        <Link to={lastTo} className="relative inline-flex h-10 items-center gap-2.5 rounded-full border border-border bg-surface-1/85 px-3.5 text-text-muted no-underline hover:text-text">
          <IconHistory size={16} stroke={1.75} />
          <span>{t('start.continue', { mode: lastName, size: last.size, when: relativeTime(last.savedAt, i18n.resolvedLanguage ?? 'en', t('time.justNow')) })}</span>
        </Link>
      )}
    </StartLayout>
  )
}
