import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { IconArrowRight } from '@tabler/icons-react'
import { Footer } from './Footer'

/** Каркас стартовых страниц: сетка на фоне, подпись, заголовок и карточки. Вьюпорт здесь не монтируется и геометрия не считается. */
export function StartLayout({ tagline, title, after, children }: { tagline: string; title: string; /** Отдельный блок под карточками, над подвалом (на корневой странице — мотивация). */ after?: ReactNode; children: ReactNode }) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center-safe gap-7 overflow-auto px-6 pt-5 pb-7">
      <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:repeating-linear-gradient(30deg,rgba(124,156,255,.09)_0_1px,transparent_1px_56px),repeating-linear-gradient(150deg,rgba(124,156,255,.09)_0_1px,transparent_1px_56px)] [mask-image:radial-gradient(ellipse_at_50%_55%,#000_15%,transparent_70%)]" />
      <div className="relative flex flex-col items-center gap-3 text-center">
        <span className="rounded-xl border border-border-strong bg-surface-1/80 px-2.5 py-1 font-mono text-xs text-text-muted">{tagline}</span>
        <h1 className="m-0 font-display text-[38px] leading-[1.1] font-semibold tracking-tighter">{title}</h1>
      </div>
      {children}
      {after}
      <Footer />
    </main>
  )
}

/** Карточка выбора (продукта или режима): арт сверху, название, описание, теги и стрелка; вся карточка — ссылка. */
export function ChoiceCard({ to, testId, index, art, name, desc, tags }: { to: string; testId: string; index: number; art: ReactNode; name: string; desc: string; tags: string[] }) {
  const { t } = useTranslation()
  const tag = 'inline-flex h-[22px] items-center rounded-full bg-surface-3 px-2 font-mono text-xs text-text-muted'
  return (
    <Link to={to} data-testid={testId} aria-label={t('start.open', { name })} className="group relative flex h-[470px] w-[380px] max-w-full flex-col gap-3.5 rounded-2xl border border-border bg-gradient-to-b from-[#1a1f26] to-[#14181d] p-5 text-text no-underline transition-all hover:-translate-y-1 hover:border-accent hover:shadow-[0_0_0_1px_var(--color-accent),0_24px_60px_-20px_rgba(124,156,255,.5)] focus-visible:-translate-y-1 focus-visible:border-accent">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-card border border-border bg-[radial-gradient(ellipse_at_50%_60%,#222a36_0%,#0e1115_75%)]">
        <span className="absolute top-2.5 left-3 font-mono text-xs text-text-subtle">{String(index).padStart(2, '0')}</span>
        <kbd aria-hidden className="absolute top-2.5 right-3 inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-xs border border-b-2 border-border-strong bg-surface-1 px-1.5 font-mono text-xs text-text-muted">{index}</kbd>
        {art}
      </div>
      {/* текст занимает место четырёх строк описания у всех карточек: рамка рисунка (flex-1) одной высоты на любой странице и в любом языке */}
      <div className="min-h-[114px]">
        <div className="font-display text-xl font-semibold tracking-tight">{name}</div>
        <div className="mt-1.5 text-sm text-text-muted">{desc}</div>
      </div>
      <div className="flex items-center gap-1.5">
        {tags.map((x) => <span key={x} className={tag}>{x}</span>)}<span className="flex-1" />
        <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border border-border-strong text-text-muted group-hover:border-accent group-hover:bg-accent group-hover:text-accent-on"><IconArrowRight size={16} stroke={1.75} /></span>
      </div>
    </Link>
  )
}

/** Клавиши 1…n открывают n-й вариант. */
export function useNumberHotkeys(paths: string[], go: (path: string) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const path = paths[Number(e.key) - 1]
      if (path) go(path)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paths, go])
}
