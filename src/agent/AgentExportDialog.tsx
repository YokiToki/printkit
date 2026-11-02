import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '../ui/Button'
import { fmtSize } from '../app/logText'
import type { ExportDialogPrompt } from './tools/confirm'

/**
 * Окно подтверждения экспорта от агента: список файлов с размерами и предупреждение при переполнении плиты.
 * Фокус изначально на безопасной кнопке «Отмена», клавиша Esc и щелчок вне окна отклоняют запрос,
 * кнопка «Скачать» запускает скачивание.
 */
export function AgentExportDialog({
  prompt,
  onConfirm,
  onDecline,
}: {
  prompt: ExportDialogPrompt
  onConfirm: () => void
  onDecline: () => void
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const bodyId = useId()
  const root = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancel.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onDecline()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...(root.current?.querySelectorAll<HTMLElement>('button') ?? [])]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onDecline])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      data-testid="agent-export-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDecline()
      }}
    >
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="flex w-full max-w-md flex-col gap-3 rounded-card border border-border-strong bg-surface-1 p-4 shadow-float"
      >
        <h2 id={titleId} className="m-0 text-[15px] font-semibold">
          {t('agent.exportTitle')}
        </h2>
        <p id={bodyId} className="m-0 text-sm text-text-muted">
          {t('agent.exportPrompt')}
        </p>

        <ul
          data-testid="agent-export-file-list"
          className="m-0 list-none flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-control border border-border bg-surface-2 p-2 font-mono text-xs"
        >
          {prompt.files.map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-3">
              <span className="truncate text-text">{f.name}</span>
              <span className="shrink-0 text-text-muted">{fmtSize(f.bytes)}</span>
            </li>
          ))}
        </ul>

        {prompt.overflow && (
          <div className="flex items-center gap-1.5 text-xs text-warn-text">
            <IconAlertTriangle size={14} className="shrink-0" aria-hidden />
            <span>{t('export.overflow', { n: 1 })}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            ref={cancel}
            type="button"
            onClick={onDecline}
            className="inline-flex h-9 cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface-2 px-3.5 font-medium text-text hover:bg-surface-3"
          >
            {t('log.cancel')}
          </button>
          <Button primary onClick={onConfirm}>
            {t('agent.download')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
