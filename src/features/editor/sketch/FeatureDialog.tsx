import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconBoxModel,
  IconRotate,
  IconCheck,
  IconX,
  IconAlertCircle,
} from '@tabler/icons-react'
import type {
  Feature,
  ExtrudeFeature,
  RevolveFeature,
} from '../../../geometry/features/evaluate'
import type { EdgeBreak } from '../../../geometry/features/extrude'
import type { Sketch, LineCurve } from '../../../editor/sketch/model'
import type { EditorObject } from '../../../editor/scene'
import { LengthField } from '../../../ui/LengthField'
import { NumberField } from '../../../ui/NumberField'
import { SegmentedControl } from '../../../ui/SegmentedControl'

export interface FeatureDialogProps {
  kind: 'extrude' | 'revolve'
  sketches: Sketch[]
  objects?: EditorObject[]
  initialFeature?: Feature
  initialSketchId?: string
  targetObjectId?: string
  featureIndex?: number
  onApply: (feature: Feature, targetObjectId?: string, featureIndex?: number) => void
  onCancel: () => void
}

export function FeatureDialog({
  kind,
  sketches,
  objects = [],
  initialFeature,
  initialSketchId,
  targetObjectId: initialTargetObjectId,
  featureIndex,
  onApply,
  onCancel,
}: FeatureDialogProps) {
  const { t } = useTranslation()

  // Selected sketch
  const defaultSketchId =
    initialFeature?.sketch ??
    initialFeature?.sketchId ??
    initialSketchId ??
    sketches[0]?.id ??
    ''
  const [sketchId, setSketchId] = useState<string>(defaultSketchId)

  // Target body (if op !== 'new')
  const featureBodies = useMemo(
    () => objects.filter((o) => o.source.kind === 'feature' || o.source.kind === 'primitive'),
    [objects],
  )
  const [targetId, setTargetId] = useState<string>(
    initialTargetObjectId ?? featureBodies[0]?.id ?? '',
  )

  // Operation: new | join | cut | intersect
  const initialOp = initialFeature?.op ?? (featureBodies.length > 0 && initialTargetObjectId ? 'join' : 'new')
  const [op, setOp] = useState<'new' | 'join' | 'cut' | 'intersect'>(initialOp)

  // Extrude params
  const initialExtrude = initialFeature?.kind === 'extrude' ? (initialFeature as ExtrudeFeature) : null
  const [side, setSide] = useState<'one' | 'symmetric' | 'two'>(initialExtrude?.side ?? 'one')
  const [d1, setD1] = useState<number>(initialExtrude?.d1 ?? 10)
  const [d2, setD2] = useState<number>(initialExtrude?.d2 ?? 10)

  // Top / bottom edge break
  const [topKind, setTopKind] = useState<'none' | 'chamfer' | 'fillet'>(initialExtrude?.top?.kind ?? 'none')
  const [topSize, setTopSize] = useState<number>(initialExtrude?.top?.size ?? 1)
  const [bottomKind, setBottomKind] = useState<'none' | 'chamfer' | 'fillet'>(initialExtrude?.bottom?.kind ?? 'none')
  const [bottomSize, setBottomSize] = useState<number>(initialExtrude?.bottom?.size ?? 1)

  // Revolve params
  const initialRevolve = initialFeature?.kind === 'revolve' ? (initialFeature as RevolveFeature) : null
  const [revolveAxisType, setRevolveAxisType] = useState<'planeX' | 'planeY' | 'line'>(() => {
    if (initialRevolve?.axis.kind === 'line') return 'line'
    if (initialRevolve?.axis.kind === 'planeAxis') {
      return initialRevolve.axis.axis === 'y' ? 'planeY' : 'planeX'
    }
    return 'planeY'
  })
  const [lineCurveId, setLineCurveId] = useState<string>(() => {
    if (initialRevolve?.axis.kind === 'line') {
      return initialRevolve.axis.curve ?? initialRevolve.axis.curveId ?? ''
    }
    return ''
  })
  const [angle, setAngle] = useState<number>(initialRevolve?.angle ?? 360)

  // Sketch lines for revolve axis
  const activeSketch = sketches.find((s) => s.id === sketchId)
  const sketchLines = useMemo(() => {
    if (!activeSketch) return []
    return Object.values(activeSketch.curves).filter((c): c is LineCurve => c.kind === 'line')
  }, [activeSketch])

  const isValid = useMemo(() => {
    if (!sketchId) return false
    if (kind === 'extrude') {
      if (d1 <= 0) return false
      if (side === 'two' && d2 <= 0) return false
      return true
    }
    if (kind === 'revolve') {
      if (angle <= 0 || angle > 360) return false
      if (revolveAxisType === 'line' && !lineCurveId) return false
      return true
    }
    return false
  }, [kind, sketchId, d1, d2, side, angle, revolveAxisType, lineCurveId])

  const handleApply = () => {
    if (!isValid) return

    let feat: Feature
    if (kind === 'extrude') {
      const top: EdgeBreak | undefined = topKind !== 'none' ? { kind: topKind, size: topSize } : undefined
      const bottom: EdgeBreak | undefined = bottomKind !== 'none' ? { kind: bottomKind, size: bottomSize } : undefined

      const extrudeFeat: ExtrudeFeature = {
        kind: 'extrude',
        sketch: sketchId,
        sketchId,
        op,
        side,
        d1,
        ...(side === 'two' ? { d2 } : {}),
        ...(top ? { top } : {}),
        ...(bottom ? { bottom } : {}),
      }
      feat = extrudeFeat
    } else {
      let axisDef: RevolveFeature['axis']
      if (revolveAxisType === 'line') {
        axisDef = { kind: 'line', curve: lineCurveId, curveId: lineCurveId }
      } else {
        axisDef = { kind: 'planeAxis', axis: revolveAxisType === 'planeY' ? 'y' : 'x' }
      }

      const revolveFeat: RevolveFeature = {
        kind: 'revolve',
        sketch: sketchId,
        sketchId,
        op,
        axis: axisDef,
        angle,
      }
      feat = revolveFeat
    }

    onApply(feat, op === 'new' ? undefined : targetId, featureIndex)
  }

  return (
    <div data-testid="feature-dialog" className="flex flex-col h-full bg-surface-1 text-xs select-none">
      {/* Dialog Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2 bg-surface-2 font-medium">
        <div className="flex items-center gap-1.5 text-text">
          {kind === 'extrude' ? <IconBoxModel size={16} /> : <IconRotate size={16} />}
          <span className="font-semibold">
            {kind === 'extrude' ? t('sketch.feature.extrude', 'Extrude') : t('sketch.feature.revolve', 'Revolve')}
          </span>
        </div>
        <button
          type="button"
          data-testid="feature-dialog-cancel-btn"
          onClick={onCancel}
          className="p-1 text-text-muted hover:text-text rounded cursor-pointer"
        >
          <IconX size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Sketch selection */}
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-text-muted">{t('sketch.feature.sketch', 'Sketch')}</label>
          {sketches.length === 0 ? (
            <div className="flex items-center gap-1.5 text-error-text text-[11px]">
              <IconAlertCircle size={14} />
              <span>{t('sketch.feature.noSketches', 'No sketches available. Create a sketch first.')}</span>
            </div>
          ) : (
            <select
              data-testid="feature-dialog-sketch-select"
              value={sketchId}
              onChange={(e) => setSketchId(e.target.value)}
              className="h-8 rounded-control border border-border bg-bg px-2 text-xs text-text outline-none cursor-pointer"
            >
              {sketches.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Operation selection */}
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-text-muted">{t('sketch.feature.operation', 'Operation')}</label>
          <SegmentedControl<'new' | 'join' | 'cut' | 'intersect'>
            ariaLabel={t('sketch.feature.operation', 'Operation')}
            value={op}
            onChange={setOp}
            fill
            size="sm"
            options={[
              { value: 'new', label: t('sketch.feature.opNew', 'New') },
              { value: 'join', label: t('sketch.feature.opJoin', 'Join') },
              { value: 'cut', label: t('sketch.feature.opCut', 'Cut') },
              { value: 'intersect', label: t('sketch.feature.opIntersect', 'Intersect') },
            ]}
          />
        </div>

        {/* Target Body selection if not 'new' */}
        {op !== 'new' && featureBodies.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-text-muted">{t('sketch.feature.targetBody', 'Target Body')}</label>
            <select
              data-testid="feature-dialog-target-select"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="h-8 rounded-control border border-border bg-bg px-2 text-xs text-text outline-none cursor-pointer"
            >
              {featureBodies.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {kind === 'extrude' && (
          <>
            {/* Side selection */}
            <div className="flex flex-col gap-1.5">
              <label className="font-medium text-text-muted">{t('sketch.feature.side', 'Direction')}</label>
              <SegmentedControl<'one' | 'symmetric' | 'two'>
                ariaLabel={t('sketch.feature.side', 'Direction')}
                value={side}
                onChange={setSide}
                fill
                size="sm"
                options={[
                  { value: 'one', label: t('sketch.feature.sideOne', 'One Side') },
                  { value: 'symmetric', label: t('sketch.feature.sideSymmetric', 'Symmetric') },
                  { value: 'two', label: t('sketch.feature.sideTwo', 'Two Sides') },
                ]}
              />
            </div>

            {/* Distance 1 */}
            <div className="flex flex-col gap-1.5">
              <LengthField
                label={t('sketch.feature.distance', 'Distance')}
                value={d1}
                min={0.01}
                max={10000}
                step={1}
                onChange={(val) => setD1(val)}
              />
            </div>

            {/* Distance 2 (if two-sided) */}
            {side === 'two' && (
              <div className="flex flex-col gap-1.5">
                <LengthField
                  label={t('sketch.feature.distance2', 'Distance 2')}
                  value={d2}
                  min={0.01}
                  max={10000}
                  step={1}
                  onChange={(val) => setD2(val)}
                />
              </div>
            )}

            {/* Edge Breaks: Top & Bottom */}
            <div className="border-t border-border pt-3 space-y-3">
              <div className="flex flex-col gap-1.5">
                <label className="font-medium text-text-muted">{t('sketch.feature.topEdge', 'Top Edge')}</label>
                <SegmentedControl<'none' | 'chamfer' | 'fillet'>
                  ariaLabel={t('sketch.feature.topEdge', 'Top Edge')}
                  value={topKind}
                  onChange={setTopKind}
                  fill
                  size="sm"
                  options={[
                    { value: 'none', label: t('common.none', 'None') },
                    { value: 'chamfer', label: t('sketch.feature.chamfer', 'Chamfer') },
                    { value: 'fillet', label: t('sketch.feature.fillet', 'Fillet') },
                  ]}
                />
                {topKind !== 'none' && (
                  <LengthField
                    label={t('sketch.feature.topEdgeSize', 'Top Edge Size')}
                    value={topSize}
                    min={0.01}
                    max={100}
                    step={0.5}
                    onChange={(val) => setTopSize(val)}
                  />
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-medium text-text-muted">{t('sketch.feature.bottomEdge', 'Bottom Edge')}</label>
                <SegmentedControl<'none' | 'chamfer' | 'fillet'>
                  ariaLabel={t('sketch.feature.bottomEdge', 'Bottom Edge')}
                  value={bottomKind}
                  onChange={setBottomKind}
                  fill
                  size="sm"
                  options={[
                    { value: 'none', label: t('common.none', 'None') },
                    { value: 'chamfer', label: t('sketch.feature.chamfer', 'Chamfer') },
                    { value: 'fillet', label: t('sketch.feature.fillet', 'Fillet') },
                  ]}
                />
                {bottomKind !== 'none' && (
                  <LengthField
                    label={t('sketch.feature.bottomEdgeSize', 'Bottom Edge Size')}
                    value={bottomSize}
                    min={0.01}
                    max={100}
                    step={0.5}
                    onChange={(val) => setBottomSize(val)}
                  />
                )}
              </div>
            </div>
          </>
        )}

        {kind === 'revolve' && (
          <>
            {/* Axis selection */}
            <div className="flex flex-col gap-1.5">
              <label className="font-medium text-text-muted">{t('sketch.feature.axis', 'Axis')}</label>
              <SegmentedControl<'planeY' | 'planeX' | 'line'>
                ariaLabel={t('sketch.feature.axis', 'Axis')}
                value={revolveAxisType}
                onChange={setRevolveAxisType}
                fill
                size="sm"
                options={[
                  { value: 'planeY', label: 'Plane Y' },
                  { value: 'planeX', label: 'Plane X' },
                  { value: 'line', label: t('sketch.feature.sketchLine', 'Line') },
                ]}
              />

              {revolveAxisType === 'line' && (
                <div className="mt-1">
                  {sketchLines.length === 0 ? (
                    <span className="text-[11px] text-error-text">
                      {t('sketch.feature.noLinesInSketch', 'Sketch has no lines to use as an axis')}
                    </span>
                  ) : (
                    <select
                      data-testid="feature-dialog-axis-line-select"
                      value={lineCurveId}
                      onChange={(e) => setLineCurveId(e.target.value)}
                      className="w-full h-8 rounded-control border border-border bg-bg px-2 text-xs text-text outline-none cursor-pointer"
                    >
                      <option value="">{t('sketch.feature.selectLine', '-- Select Line --')}</option>
                      {sketchLines.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.id}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* Angle */}
            <div className="flex flex-col gap-1.5">
              <NumberField
                label={t('sketch.feature.angle', 'Angle')}
                value={angle}
                min={1}
                max={360}
                step={15}
                unit="°"
                onChange={(val) => setAngle(val)}
              />
            </div>
          </>
        )}
      </div>

      {/* Dialog Footer Actions */}
      <div className="flex items-center justify-end gap-2 border-t border-border p-3 bg-surface-2">
        <button
          type="button"
          data-testid="feature-dialog-cancel"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-control border border-border bg-surface-1 text-text hover:bg-surface-3 cursor-pointer font-medium"
        >
          {t('common.cancel', 'Cancel')}
        </button>
        <button
          type="button"
          data-testid="feature-dialog-apply"
          disabled={!isValid}
          onClick={handleApply}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-accent text-accent-on hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-semibold shadow-xs"
        >
          <IconCheck size={15} stroke={2.5} />
          <span>{t('common.apply', 'Apply')}</span>
        </button>
      </div>
    </div>
  )
}
