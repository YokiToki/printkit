import type { ProductHue } from './products'

/** Логотип сайта; грани берут цвет из токенов --color-logo-* по оттенку продукта (по умолчанию синий, тёмный контур общий). */
export function Logo({ hue = 'gridfinity' }: { hue?: ProductHue }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" data-hue={hue}>
      <path d="M2 8.5 12 14v5L2 13.5z" className="logo-left" /><path d="M22 8.5 12 14v5l10-5.5z" className="logo-right" />
      <g stroke="var(--color-surface-1)" strokeWidth=".8" strokeLinejoin="round">
        <path d="M12 3l5 2.75-5 2.75-5-2.75z" className="logo-top" /><path d="M17 5.75l5 2.75-5 2.75-5-2.75z" className="logo-top" opacity=".6" />
        <path d="M12 8.5l5 2.75-5 2.75-5-2.75z" className="logo-top" /><path d="M7 5.75l5 2.75-5 2.75-5-2.75z" className="logo-top" opacity=".6" />
      </g>
    </svg>
  )
}
