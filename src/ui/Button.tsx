import type { ButtonHTMLAttributes } from 'react'

export function Button({ primary, danger, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; danger?: boolean }) {
  return (
    <button
      type="button" {...rest}
      className={`inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border px-3.5 font-medium disabled:cursor-default disabled:opacity-50 ${
        primary ? 'border-accent bg-accent font-semibold text-accent-on'
        : danger ? 'border-error-border bg-error-bg text-error-text hover:bg-error/20'
        : 'border-border-strong bg-surface-2 text-text hover:bg-surface-3'} ${className}`}
    />
  )
}
