import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { compareSilhouettes, outlinesPx } from '../../../geometry/photo/compare'
import type { Segmentation } from '../../../geometry/photo/segment'
import { formatLength, useUnit } from '../../../ui/units'

/** Пунктирные контуры силуэтов другого движка поверх выпрямленного листа (SVG в координатах растра, кладётся поверх холста). */
export function CompareOverlay({ other, width, height }: { other: Segmentation; width: number; height: number }) {
  const { t } = useTranslation()
  const outlines = useMemo(() => outlinesPx(other), [other])
  return (
    <svg data-testid="compare-overlay" role="img" aria-label={t('cutout.photo.ai.compareLabel')} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      {outlines.map((o) => <polygon key={o.id} data-testid="compare-outline" points={o.points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke="var(--color-warn-text, #f5a623)" strokeWidth={Math.max(2, width / 400)} strokeDasharray={`${Math.max(8, width / 80)} ${Math.max(6, width / 110)}`} />)}
    </svg>
  )
}

/** Таблица размеров по инструментам: классика, ИИ, разность. */
export function CompareTable({ classic, ai }: { classic: Segmentation; ai: Segmentation }) {
  const { t } = useTranslation()
  const { unit } = useUnit()
  const rows = useMemo(() => compareSilhouettes(classic, ai), [classic, ai])
  const f = (w?: number, h?: number) => (w === undefined || h === undefined ? '—' : `${formatLength(w, unit)} × ${formatLength(h, unit)}`)
  const d = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${formatLength(v, unit)}`)
  return (
    <table data-testid="compare-table" aria-label={t('cutout.photo.ai.compareTable')} className="w-full border-collapse text-[11px]">
      <thead><tr className="text-left text-text-muted"><th className="py-0.5 pr-2 font-medium">{t('cutout.photo.ai.tool')}</th><th className="pr-2 font-medium">{t('cutout.photo.ai.classic')}</th><th className="pr-2 font-medium">{t('cutout.photo.ai.ai')}</th><th className="font-medium">Δ</th></tr></thead>
      <tbody className="font-mono">
        {rows.map((r, i) => (
          <tr key={i} data-testid="compare-row"><td className="py-0.5 pr-2">{r.classic?.id ?? r.ai?.id}</td><td className="pr-2">{f(r.classic?.widthMm, r.classic?.heightMm)}</td><td className="pr-2">{f(r.ai?.widthMm, r.ai?.heightMm)}</td><td>{d(r.dW)} / {d(r.dH)}</td></tr>
        ))}
      </tbody>
    </table>
  )
}
