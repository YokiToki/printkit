import type { ReactNode } from 'react'

export interface SegmentOption<T extends string> { value: T; label: ReactNode; icon?: ReactNode }

export function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel, fill, accent, compact }: {
  options: SegmentOption<T>[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
  fill?: boolean
  accent?: boolean
  compact?: boolean
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={`gap-0.5 rounded-group border border-border bg-bg p-0.5 ${fill ? 'flex' : 'inline-flex'} ${compact ? 'h-9 items-center md:h-8' : ''}`}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
            className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-control border-0 text-center leading-tight ${
              compact ? 'h-full min-w-6 whitespace-nowrap px-2 text-xs font-medium' : fill ? 'min-h-8 min-w-0 flex-1 px-1.5 py-1' : 'min-h-8 min-w-8 whitespace-nowrap px-3'
            } ${
              on ? (accent ? 'bg-accent-muted text-white shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]') : 'bg-transparent text-text-muted hover:text-text'}`}
          >
            {o.icon}{o.label}
          </button>
        )
      })}
    </div>
  )
}
