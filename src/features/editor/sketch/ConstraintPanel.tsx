import { useTranslation } from 'react-i18next'
import {
  IconTrash,
  IconAlertCircle,
  IconPlus,
  IconRulerMeasure,
  IconCheck,
} from '@tabler/icons-react'
import type { Sketch, Constraint } from '../../../editor/sketch/model'
import {
  entityRef,
  measureCurve,
  sketchBounds,
  hasDimension,
} from '../../../editor/sketch/measure'
import { LengthField } from '../../../ui/LengthField'
import { NumberField } from '../../../ui/NumberField'
import { useUnit, formatLength, toDisplay } from '../../../ui/units'

export interface ConstraintPanelProps {
  sketch: Sketch
  selectedCurveIds: string[]
  selectedPointIds: string[]
  conflicts?: {
    constraints?: string[]
    redundant?: string[]
  }
  dof?: number
  onUpdateConstraint: (id: string, value: number) => void
  onDeleteConstraint: (id: string) => void
  onAddConstraint?: (kind: Constraint['kind']) => void
  onHoverConstraint?: (id: string | null) => void
  onFixConflict?: () => void
}

function formatRef(sketch: Sketch, refId: string, t: (key: any, def?: any) => any): string {
  const ref = entityRef(sketch, refId)
  if (!ref) return refId
  if (ref.kind === 'point') return `${t('sketch.properties.point', 'Point')} ${ref.index}`
  if (ref.kind === 'line') return `${t('sketch.curve.line', 'Line')} ${ref.index}`
  if (ref.kind === 'circle') return `${t('sketch.curve.circle', 'Circle')} ${ref.index}`
  if (ref.kind === 'arc') return `${t('sketch.curve.arc', 'Arc')} ${ref.index}`
  return refId
}

export function ConstraintPanel({
  sketch,
  selectedCurveIds,
  selectedPointIds,
  conflicts,
  dof,
  onUpdateConstraint,
  onDeleteConstraint,
  onAddConstraint,
  onHoverConstraint,
  onFixConflict,
}: ConstraintPanelProps) {
  const { t } = useTranslation()
  const { unit } = useUnit()

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
  const isSingleCurve = selectedCurveIds.length === 1 && selectedPointIds.length === 0
  const isSinglePoint = selectedPointIds.length === 1 && selectedCurveIds.length === 0
  const isTwoPoints = selectedPointIds.length === 2 && selectedCurveIds.length === 0
  const isNothingSelected = selectedCurveIds.length === 0 && selectedPointIds.length === 0

  // Selection description
  let selectionTitle = t('sketch.properties.noSelection', 'Sketch')
  if (isSingleCurve) {
    const c = sketch.curves[selectedCurveIds[0]]
    const ref = entityRef(sketch, selectedCurveIds[0])
    const kindName =
      c?.kind === 'line'
        ? t('sketch.curve.line', 'Line')
        : c?.kind === 'circle'
        ? t('sketch.curve.circle', 'Circle')
        : t('sketch.curve.arc', 'Arc')
    selectionTitle = ref ? `${kindName} ${ref.index}` : kindName
  } else if (isSinglePoint) {
    const ref = entityRef(sketch, selectedPointIds[0])
    selectionTitle = ref ? `${t('sketch.properties.point', 'Point')} ${ref.index}` : t('sketch.properties.point', 'Point')
  } else if (selectedCurveIds.length > 0 || selectedPointIds.length > 0) {
    selectionTitle = `${selectedCurveIds.length + selectedPointIds.length} ${t('sketch.properties.entities', 'entities')}`
  }

  // Single curve measurement
  const singleCurveMeasure = isSingleCurve ? measureCurve(sketch, selectedCurveIds[0]) : null
  const singleCurveHasDim = isSingleCurve ? hasDimension(sketch, selectedCurveIds[0]) : false

  // Overall bounds
  const bounds = isNothingSelected ? sketchBounds(sketch) : null
  const curveCount = Object.keys(sketch.curves).length
  const pointCount = Object.keys(sketch.points).length

  return (
    <div data-testid="constraint-panel" className="p-4 flex flex-col gap-4 text-xs select-none">
      {/* Header */}
      <div className="border-b border-border pb-2 flex items-center justify-between">
        <h3 className="font-semibold text-text text-sm">{selectionTitle}</h3>
        {dof !== undefined && (
          <span className="font-mono text-[11px] text-text-muted">
            {dof === 0 ? (
              <span className="text-(--color-success-text) font-medium flex items-center gap-1">
                <IconCheck size={12} stroke={2.5} />
                {t('sketch.properties.fullyDefined', 'Fully defined')}
              </span>
            ) : (
              t('sketch.properties.dofStatus', { count: dof, defaultValue: `${dof} DoF` })
            )}
          </span>
        )}
      </div>

      {/* Conflicts warning & Fix action */}
      {hasConflicts && (
        <div className="rounded-control bg-(--color-error-bg) border border-(--color-error-border) p-2.5 flex flex-col gap-1.5">
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

      {/* Overall sketch dimensions card (when nothing is selected) */}
      {isNothingSelected && (
        <div className="flex flex-col gap-2 p-3 rounded-control border border-border bg-surface-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-text uppercase text-[10px] tracking-wider text-text-muted">
              {t('sketch.properties.overallDimensions', 'Overall dimensions')}
            </span>
            <IconRulerMeasure size={14} className="text-text-muted" />
          </div>

          {bounds ? (
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between py-1 border-b border-border">
                <span className="text-text-muted">{t('sketch.properties.width', 'Width')}</span>
                <span className="font-mono font-medium text-text">
                  {formatLength(bounds.width, unit)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border">
                <span className="text-text-muted">{t('sketch.properties.height', 'Height')}</span>
                <span className="font-mono font-medium text-text">
                  {formatLength(bounds.height, unit)}
                </span>
              </div>
              <div className="flex justify-between py-1 text-text-muted text-[11px]">
                <span>X</span>
                <span className="font-mono">
                  {toDisplay(bounds.minX, unit).toFixed(1)} … {toDisplay(bounds.maxX, unit).toFixed(1)} {unit}
                </span>
              </div>
              <div className="flex justify-between py-1 text-text-muted text-[11px]">
                <span>Y</span>
                <span className="font-mono">
                  {toDisplay(bounds.minY, unit).toFixed(1)} … {toDisplay(bounds.maxY, unit).toFixed(1)} {unit}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-text-muted italic text-[11px]">
              {t('sketch.error.emptySketch', 'Sketch is empty')}
            </span>
          )}

          <div className="pt-2 border-t border-border flex justify-between text-[11px] text-text-muted">
            <span>{t('sketch.properties.curvesCount', { count: curveCount, defaultValue: `${curveCount} curves` })}</span>
            <span>{t('sketch.properties.pointsCount', { count: pointCount, defaultValue: `${pointCount} points` })}</span>
          </div>
        </div>
      )}

      {/* Selected curve live measurements */}
      {isSingleCurve && singleCurveMeasure && (
        <div className="flex flex-col gap-2 p-3 rounded-control border border-border bg-surface-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-text uppercase text-[10px] tracking-wider text-text-muted">
              {t('sketch.properties.measurements', 'Measurements')}
            </span>
            <span className="font-mono text-[11px] text-text-muted">
              {t('sketch.curve.line', 'Line')}
            </span>
          </div>

          {singleCurveMeasure.kind === 'length' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between py-1 border-b border-border">
                <span className="text-text-muted">{t('sketch.properties.length', 'Length')}</span>
                <span className="font-mono font-medium text-text">
                  {formatLength(singleCurveMeasure.length, unit)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border">
                <span className="text-text-muted">{t('sketch.properties.angle', 'Angle')}</span>
                <span className="font-mono font-medium text-text">
                  {singleCurveMeasure.angleDeg.toFixed(1)}°
                </span>
              </div>
              {!singleCurveHasDim && onAddConstraint && (
                <button
                  type="button"
                  onClick={() => onAddConstraint('distance')}
                  className="mt-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-control border border-accent/40 bg-accent/10 text-accent font-medium hover:bg-accent/20 cursor-pointer text-xs"
                >
                  <IconPlus size={13} stroke={2.5} />
                  <span>{t('sketch.properties.addDimension', 'Add dimension')}</span>
                </button>
              )}
            </div>
          )}

          {singleCurveMeasure.kind === 'radius' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between py-1 border-b border-border">
                <span className="text-text-muted">{t('sketch.properties.diameter', 'Diameter')}</span>
                <span className="font-mono font-medium text-text">
                  Ø {formatLength(singleCurveMeasure.radius * 2, unit)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border">
                <span className="text-text-muted">{t('sketch.properties.radius', 'Radius')}</span>
                <span className="font-mono font-medium text-text">
                  R {formatLength(singleCurveMeasure.radius, unit)}
                </span>
              </div>
              {!singleCurveHasDim && onAddConstraint && (
                <button
                  type="button"
                  onClick={() => onAddConstraint('radius')}
                  className="mt-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-control border border-accent/40 bg-accent/10 text-accent font-medium hover:bg-accent/20 cursor-pointer text-xs"
                >
                  <IconPlus size={13} stroke={2.5} />
                  <span>{t('sketch.properties.addDimension', 'Add dimension')}</span>
                </button>
              )}
            </div>
          )}

          {singleCurveMeasure.kind === 'arc' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between py-1 border-b border-border">
                <span className="text-text-muted">{t('sketch.properties.radius', 'Radius')}</span>
                <span className="font-mono font-medium text-text">
                  R {formatLength(singleCurveMeasure.radius, unit)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border">
                <span className="text-text-muted">{t('sketch.properties.arcLength', 'Arc length')}</span>
                <span className="font-mono font-medium text-text">
                  {formatLength((singleCurveMeasure.sweepDeg * Math.PI / 180) * singleCurveMeasure.radius, unit)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border">
                <span className="text-text-muted">{t('sketch.properties.sweep', 'Sweep angle')}</span>
                <span className="font-mono font-medium text-text">
                  {singleCurveMeasure.sweepDeg.toFixed(1)}°
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selected point coordinates */}
      {isSinglePoint && (
        <div className="flex flex-col gap-2 p-3 rounded-control border border-border bg-surface-2">
          <span className="font-medium text-text uppercase text-[10px] tracking-wider text-text-muted">
            {t('sketch.properties.point', 'Point')}
          </span>
          {(() => {
            const p = sketch.points[selectedPointIds[0]]
            if (!p) return null
            return (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-text-muted">X</span>
                  <span className="font-mono font-medium text-text">
                    {formatLength(p.x, unit)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-text-muted">Y</span>
                  <span className="font-mono font-medium text-text">
                    {formatLength(p.y, unit)}
                  </span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* 2 selected points distance */}
      {isTwoPoints && (
        <div className="flex flex-col gap-2 p-3 rounded-control border border-border bg-surface-2">
          <span className="font-medium text-text uppercase text-[10px] tracking-wider text-text-muted">
            {t('sketch.properties.distance', 'Distance')}
          </span>
          {(() => {
            const p1 = sketch.points[selectedPointIds[0]]
            const p2 = sketch.points[selectedPointIds[1]]
            if (!p1 || !p2) return null
            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
            return (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-text-muted">{t('sketch.properties.distance', 'Distance')}</span>
                  <span className="font-mono font-medium text-text">
                    {formatLength(dist, unit)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border text-[11px] text-text-muted">
                  <span>ΔX / ΔY</span>
                  <span className="font-mono">
                    {toDisplay(Math.abs(p2.x - p1.x), unit).toFixed(1)} / {toDisplay(Math.abs(p2.y - p1.y), unit).toFixed(1)} {unit}
                  </span>
                </div>
                {onAddConstraint && (
                  <button
                    type="button"
                    onClick={() => onAddConstraint('distance')}
                    className="mt-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-control border border-accent/40 bg-accent/10 text-accent font-medium hover:bg-accent/20 cursor-pointer text-xs"
                  >
                    <IconPlus size={13} stroke={2.5} />
                    <span>{t('sketch.properties.addDimension', 'Add dimension')}</span>
                  </button>
                )}
              </div>
            )
          })()}
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
              const targets = d.refs.map((r) => formatRef(sketch, r, t)).join(', ')

              return (
                <div
                  key={d.id}
                  onMouseEnter={() => onHoverConstraint?.(d.id)}
                  onMouseLeave={() => onHoverConstraint?.(null)}
                  className={`flex flex-col gap-1.5 p-2.5 rounded-control border bg-surface-2 transition-colors ${
                    isConflict
                      ? 'border-(--color-error-border)'
                      : isRedundant
                      ? 'border-(--color-warn-border)'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <span className="font-medium text-text capitalize">{d.kind}</span>
                      {targets && (
                        <span className="font-mono text-[11px] text-text-muted truncate">
                          · {targets}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteConstraint(d.id)}
                      title={t('common.delete', 'Delete')}
                      className="text-text-muted hover:text-(--color-error-text) cursor-pointer shrink-0 ml-1"
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
          <div className="flex flex-col gap-1.5">
            {geometric.map((c) => {
              const isConflict = conflicts?.constraints?.includes(c.id)
              const isRedundant = conflicts?.redundant?.includes(c.id)
              const targets = c.refs.map((r) => formatRef(sketch, r, t)).join(', ')

              return (
                <div
                  key={c.id}
                  onMouseEnter={() => onHoverConstraint?.(c.id)}
                  onMouseLeave={() => onHoverConstraint?.(null)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-control border bg-surface-2 transition-colors ${
                    isConflict
                      ? 'border-(--color-error-border) text-(--color-error-text)'
                      : isRedundant
                      ? 'border-(--color-warn-border) text-(--color-warn-text)'
                      : 'border-border text-text hover:border-accent/50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[11px] font-bold text-text-muted shrink-0">
                      {c.kind.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="capitalize shrink-0">{c.kind}</span>
                    {targets && (
                      <span className="font-mono text-[11px] text-text-muted truncate">
                        ({targets})
                      </span>
                    )}
                    {isConflict && (
                      <span className="text-[10px] font-medium text-(--color-error-text) shrink-0">
                        ({t('sketch.conflict.badge', 'conflict')})
                      </span>
                    )}
                    {isRedundant && (
                      <span className="text-[10px] font-medium text-(--color-warn-text) shrink-0">
                        ({t('sketch.redundant.badge', 'redundant')})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteConstraint(c.id)}
                    title={t('common.delete', 'Delete')}
                    className="text-text-muted hover:text-(--color-error-text) cursor-pointer shrink-0 ml-1.5"
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
