import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconRuler,
  IconCopy,
  IconCheck,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import { useUnit, formatLength } from '../../../ui/units'
import { Button } from '../../../ui/Button'
import type { Vec3 } from '../../../geometry/mesh/measure'

export interface MeasurementItem {
  id: string
  kind: 'distance' | 'angle' | 'circle' | 'thickness'
  value: number
  residual?: number
  points: Vec3[]
}

export interface MeasurePanelProps {
  measurements: MeasurementItem[]
  onClear: () => void
  onRemoveItem?: (id: string) => void
  onClose?: () => void
}

export function MeasurePanel({
  measurements,
  onClear,
  onRemoveItem,
  onClose,
}: MeasurePanelProps) {
  const { t } = useTranslation()
  const { unit } = useUnit()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = (item: MeasurementItem) => {
    let text = ''
    if (item.kind === 'angle') {
      text = `${item.value.toFixed(1)}°`
    } else {
      text = `${formatLength(item.value, unit)} ${t(`units.${unit}`)}`
      if (item.residual !== undefined) {
        text += ` (residual: ${formatLength(item.residual, unit)} ${t(`units.${unit}`)})`
      }
    }

    navigator.clipboard?.writeText(text).catch(() => {})
    setCopiedId(item.id)
    setTimeout(() => {
      setCopiedId((curr) => (curr === item.id ? null : curr))
    }, 1500)
  }

  const formatItemValue = (item: MeasurementItem) => {
    if (item.kind === 'angle') {
      return `${item.value.toFixed(1)}°`
    }
    return `${formatLength(item.value, unit)} ${t(`units.${unit}`)}`
  }

  return (
    <div
      data-testid="measure-panel"
      className="flex flex-col gap-2 rounded-card border border-border bg-surface-1 p-3 shadow-float text-xs max-w-xs w-full"
    >
      <div className="flex items-center justify-between pb-1 border-b border-border">
        <div className="flex items-center gap-1.5 font-semibold text-text">
          <IconRuler size={16} className="text-accent" />
          <span>{t('mesh.measure.title', 'Measure')}</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text rounded cursor-pointer"
            aria-label={t('common.close', 'Close')}
          >
            <IconX size={14} />
          </button>
        )}
      </div>

      {measurements.length === 0 ? (
        <div className="py-2 text-text-muted text-[11px] leading-relaxed">
          {t('mesh.measure.pickPrompt', 'Click on the mesh to measure (snaps to vertex, edge, or face center)')}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
          {measurements.map((m) => (
            <div
              key={m.id}
              data-testid={`measurement-item-${m.id}`}
              className="flex items-center justify-between rounded border border-border bg-surface-2 p-1.5"
            >
              <div className="flex flex-col min-w-0 pr-1">
                <span className="text-[10px] uppercase font-semibold text-text-subtle">
                  {t(`mesh.measure.${m.kind}`, m.kind)}
                </span>
                <span className="font-mono text-text font-medium text-xs">
                  {formatItemValue(m)}
                </span>
                {m.residual !== undefined && (
                  <span className="text-[10px] text-text-muted">
                    {t('mesh.measure.residual', {
                      residual: formatLength(m.residual, unit),
                    })}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  data-testid={`copy-measurement-${m.id}`}
                  onClick={() => handleCopy(m)}
                  title={copiedId === m.id ? t('mesh.measure.copied') : t('mesh.measure.copy')}
                  className="p-1 rounded text-text-muted hover:text-text cursor-pointer"
                >
                  {copiedId === m.id ? (
                    <IconCheck size={14} className="text-success-text" />
                  ) : (
                    <IconCopy size={14} />
                  )}
                </button>
                {onRemoveItem && (
                  <button
                    type="button"
                    onClick={() => onRemoveItem(m.id)}
                    title={t('common.delete')}
                    className="p-1 rounded text-text-muted hover:text-error-text cursor-pointer"
                  >
                    <IconTrash size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {measurements.length > 0 && (
        <div className="pt-1 border-t border-border flex justify-end">
          <Button compact onClick={onClear} data-testid="clear-measurements-btn">
            {t('mesh.measure.clear', 'Clear measurements')}
          </Button>
        </div>
      )}
    </div>
  )
}
