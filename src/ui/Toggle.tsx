import { useId } from 'react'

export function Toggle({ label, checked, onChange, disabled, compact }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  compact?: boolean
}) {
  const id = useId()
  return (
    <div className={`flex items-center justify-between gap-2.5 ${compact ? 'min-h-6 text-xs' : 'min-h-8'}`}>
      <span id={id} className="text-text">{label}</span>
      <button
        type="button" role="switch" aria-checked={checked} aria-labelledby={id} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 cursor-pointer rounded-full border transition-colors disabled:opacity-40 ${
          compact ? 'h-4.5 w-8' : 'h-5 w-9'
        } ${checked ? 'border-accent bg-accent' : 'border-border-strong bg-surface-3'}`}
      >
        <span
          className={`absolute rounded-full transition-all ${
            compact ? 'top-0.5 h-3 w-3' : 'top-0.5 h-3.5 w-3.5'
          } ${
            checked
              ? compact ? 'left-[16px] bg-accent-on' : 'left-[18px] bg-accent-on'
              : 'left-0.5 bg-text-muted'
          }`}
        />
      </button>
    </div>
  )
}
