import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Segmentation } from '../../../geometry/photo/segment'
import type { ModelSpec } from '../../../ml/models'
import { Banner } from '../../../ui/Banner'
import { Button } from '../../../ui/Button'
import { LengthField } from '../../../ui/LengthField'
import { NumberField } from '../../../ui/NumberField'
import { formatLength, useUnit } from '../../../ui/units'

/** Две настройки маски; null — значения модели по умолчанию. Лишние поля вызывающего (secondPass) игнорируются. */
export interface MaskValues { threshold: number | null; smooth: number | null; secondPass?: boolean }

/** Насколько должен уменьшиться силуэт относительно значений модели по умолчанию, чтобы показать подсказку про тонкие детали, мм. */
export const THIN_SHRINK_MM = 1

/**
 * Настройка маски сети: «Охват края» (порог: ниже порог — контур растёт в мягкую зону) и «Гладкость контура» (радиус сглаживания альфы
 * в мм). Оба применяются к кэшированной альфе, модель заново не запускается. Значения по умолчанию у каждой модели свои; «Сбросить»
 * возвращает их. Серый вид мягкой альфы и изменение размеров каждого силуэта помогают подобрать значения.
 */
export function MaskTuning({ model, ai, onChange, alpha, size, active, baseline }: {
  model: ModelSpec
  ai: MaskValues
  onChange: (patch: Partial<MaskValues>) => void
  /** Мягкая альфа для серого просмотра: 0…1 (Float32Array) или 0…255 (Uint8Array). */
  alpha: Float32Array | Uint8Array | null
  size: { width: number; height: number } | null
  active: Segmentation | null
  baseline: Segmentation | null
}) {
  const { t } = useTranslation()
  const { unit } = useUnit()
  const [showAlpha, setShowAlpha] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const threshold = ai.threshold ?? model.maskDefaults.threshold, smooth = ai.smooth ?? model.maskDefaults.smooth
  const touched = ai.threshold !== null || ai.smooth !== null
  const reach = Math.round((1 - threshold) * 100)

  useEffect(() => {
    const c = canvas.current
    if (!showAlpha || !c || !alpha || !size) return
    c.width = size.width; c.height = size.height
    const ctx = c.getContext('2d'); if (!ctx) return
    const img = ctx.createImageData(size.width, size.height)
    for (let i = 0; i < alpha.length; i++) { const v = Math.round(alpha[i] * (alpha instanceof Uint8Array ? 1 : 255)); img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255 }
    ctx.putImageData(img, 0, 0)
  }, [showAlpha, alpha, size])

  // изменение размера каждого силуэта относительно значений модели по умолчанию (парные по номеру: нумерация сверху вниз одна и та же)
  const rows = (active?.silhouettes ?? []).map((s) => {
    const b = baseline?.silhouettes.find((x) => x.id === s.id)
    return { id: s.id, dW: b ? s.widthMm - b.widthMm : 0, dH: b ? s.heightMm - b.heightMm : 0 }
  })
  const shrunk = rows.some((r) => r.dW < -THIN_SHRINK_MM || r.dH < -THIN_SHRINK_MM)
  const sign = (v: number) => `${v > 0 ? '+' : ''}${formatLength(v, unit)}`

  return (
    <div className="flex flex-col gap-2" data-testid="mask-tuning">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <NumberField label={t('cutout.photo.ai.reach')} value={reach} min={5} max={95} step={5} unit="%" digits={0} onChange={(v) => onChange({ threshold: 1 - v / 100 })} />
        <LengthField label={t('cutout.photo.ai.smoothness')} value={smooth} min={0} max={3} step={0.1} onChange={(v) => onChange({ smooth: v })} />
        <input type="range" min={5} max={95} step={1} value={reach} aria-label={`${t('cutout.photo.ai.reach')} (${t('cutout.photo.ai.sliderSuffix')})`}
          onChange={(e) => onChange({ threshold: 1 - Number(e.target.value) / 100 })} className="w-full cursor-pointer accent-accent" />
        <input type="range" min={0} max={3} step={0.05} value={smooth} aria-label={`${t('cutout.photo.ai.smoothness')} (${t('cutout.photo.ai.sliderSuffix')})`}
          onChange={(e) => onChange({ smooth: Number(e.target.value) })} className="w-full cursor-pointer accent-accent" />
      </div>
      <p className="m-0 text-[11px] leading-snug text-text-subtle">{t('cutout.photo.ai.reachHint')} {t('cutout.photo.ai.smoothnessHint')}</p>
      {!alpha && <p className="m-0 text-[11px] leading-snug text-text-subtle">{t('cutout.photo.ai.tuneHint')}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => onChange({ threshold: null, smooth: null })} disabled={!touched}>{t('cutout.photo.ai.reset')}</Button>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted"><input type="checkbox" checked={showAlpha} onChange={(e) => setShowAlpha(e.target.checked)} disabled={!alpha} />{t('cutout.photo.ai.showMask')}</label>
      </div>
      {showAlpha && alpha && <canvas ref={canvas} data-testid="alpha-canvas" aria-label={t('cutout.photo.ai.maskLabel')} role="img" className="block w-full rounded-control border border-border bg-bg" style={{ aspectRatio: size ? `${size.width} / ${size.height}` : undefined }} />}
      {touched && rows.length > 0 && (
        <ul aria-label={t('cutout.photo.ai.changes')} className="m-0 flex list-none flex-col gap-0.5 p-0 font-mono text-[11px] text-text-muted">
          {rows.map((r) => <li key={r.id} data-testid={`change-${r.id}`}>{t('cutout.photo.silhouette', { n: r.id })}: {sign(r.dW)} × {sign(r.dH)} {t(`units.${unit}`)}</li>)}
        </ul>
      )}
      {shrunk && <Banner kind="warn">{t('cutout.photo.ai.thinHint')}</Banner>}
    </div>
  )
}
