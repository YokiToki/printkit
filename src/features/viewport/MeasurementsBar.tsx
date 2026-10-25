import { modelBounds, type ModelResult } from '../../geometry/model'
import { useTranslation } from 'react-i18next'
import { StatusBar } from './StatusBar'
import { formatLength, useUnit } from '../../ui/units'

/** Габариты модели X/Y/Z в выбранной единице и строка состояния (журнал событий). */
export function MeasurementsBar({ model }: { model: ModelResult | null }) {
  const { t } = useTranslation()
  const { unit } = useUnit()
  const b = model && model.parts.length ? modelBounds(model) : null
  const dim = (i: number) => (b ? formatLength(b.max[i] - b.min[i], unit) : '–')
  return (
    <div className="absolute inset-x-0 bottom-0 flex h-9 items-center gap-3 border-t md:gap-5 border-border bg-bg/90 px-4 font-mono text-xs text-text-muted">
      <span className="shrink-0">X {dim(0)}</span><span className="shrink-0">Y {dim(1)}</span><span className="shrink-0">Z {dim(2)} {t(`units.${unit}`)}</span>
      <StatusBar hasModel={!!model} />
    </div>
  )
}
