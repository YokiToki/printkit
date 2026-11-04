import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

/**
 * Окно подтверждения необратимого действия. Фокус уходит на «Отмена» (безопасная кнопка), Esc и щелчок по затемнению отменяют,
 * Tab не выходит из окна. Вернуть фокус на кнопку, открывшую окно, должен вызывающий (он знает, что открывало).
 */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel, danger, onConfirm, onCancel }: {
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleId = useId(), bodyId = useId()
  const root = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  useEffect(() => { cancel.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel(); return }
      if (e.key !== 'Tab') return
      const items = [...(root.current?.querySelectorAll<HTMLElement>('button') ?? [])]
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overscroll-contain" data-testid="confirm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div ref={root} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}
        className="flex w-full max-w-sm flex-col gap-3 rounded-card border border-border-strong bg-surface-1 p-4 shadow-float overscroll-contain">
        <h2 id={titleId} className="m-0 text-[15px] font-semibold text-balance">{title}</h2>
        <p id={bodyId} className="m-0 text-sm text-text-muted text-pretty">{children}</p>
        <div className="flex justify-end gap-2">
          <button ref={cancel} type="button" onClick={onCancel}
            className="inline-flex h-9 cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface-2 px-3.5 font-medium text-text hover:bg-surface-3">{cancelLabel}</button>
          <Button primary={!danger} danger={danger} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
