import { useId, useState, type ReactNode } from 'react'
import { IconChevronDown, IconChevronRight, IconRefresh } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

/**
 * Сворачиваемая секция параметров. Всегда стартует свёрнутой: раскрытие — действие пользователя (не сохраняется). `modified`
 * подсвечивает сводку оранжевым и добавляет «изменено» в доступное имя кнопки, чтобы состояние не передавалось одним цветом.
 */
export function Section({
  title,
  summary,
  modified = false,
  onReset,
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  title: string
  summary?: string
  modified?: boolean
  onReset?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const toggle = () => {
    if (isControlled) {
      onOpenChange?.(!open)
    } else {
      setInternalOpen(!open)
    }
  }
  const bodyId = useId()
  const ib = 'inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-text-muted hover:bg-surface-3 hover:text-text'
  return (
    <section className="border-b border-border">
      <div className="flex min-h-11 items-center gap-1.5 py-1.5 pr-2 pl-3">
        <button type="button" className={ib} aria-expanded={open} aria-controls={bodyId}
          aria-label={`${open ? t('common.collapse') : t('common.expand')}: ${title}${modified ? ` (${t('common.changed')})` : ''}`} onClick={toggle}>
          {open ? <IconChevronDown size={16} stroke={1.75} /> : <IconChevronRight size={16} stroke={1.75} />}
        </button>
        <span className="whitespace-nowrap font-semibold">{title}</span>
        {summary && <span data-modified={modified || undefined} className={`ml-auto min-w-0 truncate text-right text-xs ${modified ? 'text-changed' : 'text-text-subtle'}`}>{summary}</span>}
        {onReset && open && (
          <button type="button" className={ib} aria-label={`${t('common.reset')}: ${title}`} onClick={onReset}><IconRefresh size={16} stroke={1.75} /></button>
        )}
      </div>
      {open && <div id={bodyId} className="flex flex-col gap-3 px-4 pt-1 pb-4">{children}</div>}
    </section>
  )
}
