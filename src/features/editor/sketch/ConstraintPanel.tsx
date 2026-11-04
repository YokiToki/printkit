import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconTrash,
  IconAlertTriangle,
  IconAlertCircle,
} from '@tabler/icons-react'
import type { Sketch, Constraint, LineCurve, CircleCurve, ArcCurve } from '../../../editor/sketch/model'
import { LengthField } from '../../../ui/LengthField'
import { NumberField } from '../../../ui/NumberField'

export interface ConstraintPanelProps {
  sketch: Sketch
  selectedCurveIds: string[]
  selectedPointIds: string[]
  conflicts?: {
    constraints?: string[]
    redundant?: string[]
  }
  onUpdateConstraint: (id: string, value: number) => void
  onDeleteConstraint: (id: string) => void
  onHoverConstraint?: (id: string | null) => void
  onFixConflict?: () => void
}

export function ConstraintPanel({
  sketch,
  selectedCurveIds,
  selectedPointIds,
  conflicts,
  onUpdateConstraint,
  onDeleteConstraint,
  onHoverConstraint,
  onFixConflict,
}: ConstraintPanelProps) {
  const { t } = useTranslation()

  const relevantPointIds = new Set([
    ...selectedPointIds,
    ...selectedCurveIds.flatMap((id) => {
      const c = sketch.curves[id]
      if (!c) return []
      if (c.kind === 'line') return [c.a, c.b]
      if (c.kind === 'arc') return [c.c, c.a, c.b]
      if (c.kind === 'circle') return [c.c]
      return []
    }),
  ])

  const relevantCurveIds = new Set(selectedCurveIds)

  // Filter constraints relevant to selection (or all if nothing selected)
  const relevantConstraints = sketch.constraints.filter((c) => {
    if (selectedCurveIds.length === 0 && selectedPointIds.length === 0) return true
    return c.refs.some((ref) => relevantCurveIds.has(ref) || relevantPointIds.has(ref))
  })

  // Dimensions vs Geometric constraints
  const dimensions = relevantConstraints.filter(
    (c) => c.kind === 'distance' || c.kind === 'radius' || c.kind === 'angle',
  )
  const geometric = relevantConstraints.filter(
    (c) => c.kind !== 'distance' && c.kind !== 'radius' && c.kind !== 'angle',
  )

  const hasConflicts = (conflicts?.constraints?.length ?? 0) > 0

  // Selection description
  let selectionTitle = t('sketch.properties.noSelection', 'Sketch')
  if (selectedCurveIds.length === 1) {
    const c = sketch.curves[selectedCurveIds[0]]
    if (c) {
      if (c.kind === 'line') selectionTitle = t('sketch.curve.line', 'Line')
      else if (c.kind === 'circle') selectionTitle = t('sketch.curve.circle', 'Circle')
      else if (c.kind === 'arc') selectionTitle = t('sketch.curve.arc', 'Arc')
    }
  } else if (selectedPointIds.length === 1) {
    selectionTitle = t('sketch.properties.point', 'Point')
  } else if (selectedCurveIds.length > 1 || selectedPointIds.length > 1) {
    selectionTitle = `${selectedCurveIds.length + selectedPointIds.length} ${t('sketch.properties.entities', 'entities')}`
  }

  return (
    <div data-testid="constraint-panel" className="flex flex-col gap-4 text-xs select-none">
      {/* Selection header */}
      <div className="border-b border-border pb-2">
        <h3 className="font-semibold text-text text-sm">{selectionTitle}</h3>
      </div>

      {/* Conflicts warning & Fix action */}
      {hasConflicts && (
        <div className="rounded-control bg-(--color-error-bg) border border-(--color-error-border) p-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-(--color-error-text) font-medium">
            <IconAlertCircle size={15} />
            <span>{t('sketch.conflict.title', 'Conflicting constraints')}</span>
          </div>
          {onFixConflict && (
            <button
              type="button"
              onClick={onFixConflict}
              className="mt-1 self-start px-2 py-0.5 rounded-(--radius-xs) bg-(--color-error) text-white font-medium hover:brightness-110 cursor-pointer"
            >
              {t('sketch.conflict.fix', 'Fix conflicts')}
            </button>
          )}
        </div>
      )}

      {/* Dimensions section */}
      {dimensions.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="font-medium text-text-muted uppercase text-[10px] tracking-wider">
            {t('sketch.properties.dimensions', 'Dimensions')}
          </h4>
          <div className="flex flex-col gap-2">
            {dimensions.map((d) => {
              const isConflict = conflicts?.constraints?.includes(d.id)
              const isRedundant = conflicts?.redundant?.includes(d.id)

              return (
                <div
                  key={d.id}
                  onMouseEnter={() => onHoverConstraint?.(d.id)}
                  onMouseLeave={() => onHoverConstraint?.(null)}
                  className={`flex flex-col gap-1 p-2 rounded-control border bg-surface-2 ${
                    isConflict
                      ? 'border-(--color-error-border)'
                      : isRedundant
                      ? 'border-(--color-warn-border)'
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text capitalize">{d.kind}</span>
                    <button
                      type="button"
                      onClick={() => onDeleteConstraint(d.id)}
                      title={t('common.delete', 'Delete')}
                      className="text-text-muted hover:text-(--color-error-text) cursor-pointer"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>

                  {d.kind === 'angle' ? (
                    <NumberField
                      label={t('sketch.properties.angle', 'Angle')}
                      value={d.value ?? 0}
                      onChange={(v) => onUpdateConstraint(d.id, v)}
                      min={0.1}
                      max={359.9}
                      unit="°"
                      digits={1}
                    />
                  ) : (
                    <LengthField
                      label={d.kind === 'radius' ? t('sketch.properties.radius', 'Radius') : t('sketch.properties.distance', 'Distance')}
                      value={d.value ?? 0}
                      onChange={(v) => onUpdateConstraint(d.id, v)}
                      min={0.01}
                      max={10000}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Geometric constraints section */}
      {geometric.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="font-medium text-text-muted uppercase text-[10px] tracking-wider">
            {t('sketch.properties.constraints', 'Constraints')}
          </h4>
          <div className="flex flex-col gap-1">
            {geometric.map((c) => {
              const isConflict = conflicts?.constraints?.includes(c.id)
              const isRedundant = conflicts?.redundant?.includes(c.id)

              return (
                <div
                  key={c.id}
                  onMouseEnter={() => onHoverConstraint?.(c.id)}
                  onMouseLeave={() => onHoverConstraint?.(null)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-control border bg-surface-2 ${
                    isConflict
                      ? 'border-(--color-error-border) text-(--color-error-text)'
                      : isRedundant
                      ? 'border-(--color-warn-border) text-(--color-warn-text)'
                      : 'border-border text-text'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-text-muted">
                      {c.kind.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="capitalize">{c.kind}</span>
                    {isConflict && (
                      <span className="text-[10px] font-medium text-(--color-error-text)">
                        ({t('sketch.conflict.badge', 'conflict')})
                      </span>
                    )}
                    {isRedundant && (
                      <span className="text-[10px] font-medium text-(--color-warn-text)">
                        ({t('sketch.redundant.badge', 'redundant')})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteConstraint(c.id)}
                    title={t('common.delete', 'Delete')}
                    className="text-text-muted hover:text-(--color-error-text) cursor-pointer"
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
