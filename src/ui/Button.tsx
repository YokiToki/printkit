import type { ButtonHTMLAttributes } from 'react'

export function Button({
  primary,
  danger,
  compact,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; danger?: boolean; compact?: boolean }) {
  return (
    <button
      type="button" {...rest}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-control border font-medium transition-transform duration-150 active:scale-[0.97] disabled:active:scale-100 disabled:cursor-default disabled:opacity-50 ${
        compact ? 'h-6.5 px-2 text-xs' : 'h-9 px-3.5'
      } ${
        primary ? 'border-accent bg-accent font-semibold text-accent-on'
        : danger ? 'border-error-border bg-error-bg text-error-text hover:bg-error/20'
        : 'border-border-strong bg-surface-2 text-text hover:bg-surface-3'} ${className}`}
    />
  )
}
