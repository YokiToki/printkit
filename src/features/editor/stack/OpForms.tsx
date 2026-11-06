import { useTranslation } from 'react-i18next'
import type {
  Op,
  BooleanOp,
  MirrorOp,
  LinearPatternOp,
  CircularPatternOp,
  OffsetOp,
  HollowOp,
} from '../../../editor/stack'
import type { EditorObject } from '../../../editor/scene'
import { LengthField } from '../../../ui/LengthField'
import { NumberField } from '../../../ui/NumberField'
import { SegmentedControl } from '../../../ui/SegmentedControl'
import { Toggle } from '../../../ui/Toggle'

export interface OpFormProps {
  op: Op
  allObjects: EditorObject[]
  currentObjectId: string
  onChange: (patch: Partial<Op>, mergeKey?: string) => void
  onEditFeature?: () => void
}

export function OpForm({
  op,
  allObjects,
  currentObjectId,
  onChange,
  onEditFeature,
}: OpFormProps) {
  const { t } = useTranslation()

  if (op.kind === 'boolean') {
    const p = (op as BooleanOp).params
    const availableTools = allObjects.filter((o) => o.id !== currentObjectId)

    return (
      <div className="space-y-3 pt-2 text-xs" data-testid={`op-form-${op.id}`}>
        <div className="space-y-1">
          <label className="text-text-muted font-medium block">{t('editor.op.mode')}</label>
          <SegmentedControl
            ariaLabel={t('editor.op.mode')}
            fill
            compact
            value={p.mode}
            options={[
              { value: 'union', label: t('editor.op.union') },
              { value: 'subtract', label: t('editor.op.subtract') },
              { value: 'intersect', label: t('editor.op.intersect') },
            ]}
            onChange={(m) => onChange({ params: { ...p, mode: m } }, `bool-mode-${op.id}`)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-text-muted font-medium block">{t('editor.op.tools')}</label>
          {availableTools.length === 0 ? (
            <p className="text-text-muted italic">{t('common.empty')}</p>
          ) : (
            <div className="space-y-1 max-h-32 overflow-y-auto border border-border rounded p-1.5 bg-surface-1">
              {availableTools.map((toolObj) => {
                const isSelected = p.tools.includes(toolObj.id)
                return (
                  <label
                    key={toolObj.id}
                    className="flex items-center gap-2 p-1 rounded hover:bg-surface-2 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      data-testid={`tool-checkbox-${toolObj.id}`}
                      checked={isSelected}
                      onChange={(e) => {
                        const nextTools = e.target.checked
                          ? [...p.tools, toolObj.id]
                          : p.tools.filter((id) => id !== toolObj.id)
                        onChange({ params: { ...p, tools: nextTools } })
                      }}
                      className="rounded border-border text-accent focus:ring-accent"
                    />
                    <span className="truncate text-text text-xs">{toolObj.name}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (op.kind === 'mirror') {
    const p = (op as MirrorOp).params
    const isCustomOrigin = typeof p.origin === 'number'
    const originMode = isCustomOrigin ? 'custom' : (p.origin as 'object' | 'bbox')

    return (
      <div className="space-y-3 pt-2 text-xs" data-testid={`op-form-${op.id}`}>
        <div className="space-y-1">
          <label className="text-text-muted font-medium block">{t('editor.op.plane')}</label>
          <SegmentedControl
            ariaLabel={t('editor.op.plane')}
            fill
            compact
            value={p.plane}
            options={[
              { value: 'XY', label: 'XY' },
              { value: 'YZ', label: 'YZ' },
              { value: 'XZ', label: 'XZ' },
            ]}
            onChange={(plane) => onChange({ params: { ...p, plane } })}
          />
        </div>

        <div className="space-y-1">
          <label className="text-text-muted font-medium block">{t('editor.op.origin')}</label>
          <SegmentedControl
            ariaLabel={t('editor.op.origin')}
            fill
            compact
            value={originMode}
            options={[
              { value: 'object', label: t('editor.op.originObject') },
              { value: 'bbox', label: t('editor.op.originBbox') },
              { value: 'custom', label: t('editor.op.distance') },
            ]}
            onChange={(mode) => {
              if (mode === 'custom') {
                onChange({ params: { ...p, origin: 0 } })
              } else {
                onChange({ params: { ...p, origin: mode } })
              }
            }}
          />
        </div>

        {isCustomOrigin && (
          <LengthField
            label={t('editor.op.distance')}
            value={p.origin as number}
            min={-5000}
            max={5000}
            step={1}
            onChange={(dist) => onChange({ params: { ...p, origin: dist } }, `mirror-dist-${op.id}`)}
          />
        )}

        <Toggle
          label={t('editor.op.merge')}
          checked={p.merge}
          onChange={(merge) => onChange({ params: { ...p, merge } })}
          compact
        />
      </div>
    )
  }

  if (op.kind === 'linearPattern') {
    const p = (op as LinearPatternOp).params

    return (
      <div className="space-y-3 pt-2 text-xs" data-testid={`op-form-${op.id}`}>
        <div className="space-y-1">
          <label className="text-text-muted font-medium block">{t('editor.op.axis')}</label>
          <SegmentedControl
            ariaLabel={t('editor.op.axis')}
            fill
            compact
            value={p.axis}
            options={[
              { value: 'x', label: 'X' },
              { value: 'y', label: 'Y' },
              { value: 'z', label: 'Z' },
            ]}
            onChange={(axis) => onChange({ params: { ...p, axis } })}
          />
        </div>

        <div className="space-y-1">
          <label className="text-text-muted font-medium block">{t('editor.op.mode')}</label>
          <SegmentedControl
            ariaLabel={t('editor.op.mode')}
            fill
            compact
            value={p.mode}
            options={[
              { value: 'spacing', label: t('editor.op.spacing') },
              { value: 'total', label: t('editor.op.total') },
            ]}
            onChange={(mode) => onChange({ params: { ...p, mode } })}
          />
        </div>

        <NumberField
          label={t('editor.op.count')}
          value={p.count}
          min={2}
          max={200}
          step={1}
          onChange={(count) => onChange({ params: { ...p, count } }, `lin-count-${op.id}`)}
        />

        <LengthField
          label={p.mode === 'spacing' ? t('editor.op.spacing') : t('editor.op.total')}
          value={p.step}
          min={0.1}
          max={5000}
          step={1}
          onChange={(step) => onChange({ params: { ...p, step } }, `lin-step-${op.id}`)}
        />

        <Toggle
          label={t('editor.op.symmetric')}
          checked={p.symmetric}
          onChange={(symmetric) => onChange({ params: { ...p, symmetric } })}
          compact
        />

        <Toggle
          label={t('editor.op.merge')}
          checked={p.merge}
          onChange={(merge) => onChange({ params: { ...p, merge } })}
          compact
        />
      </div>
    )
  }

  if (op.kind === 'circularPattern') {
    const p = (op as CircularPatternOp).params

    return (
      <div className="space-y-3 pt-2 text-xs" data-testid={`op-form-${op.id}`}>
        <div className="space-y-1">
          <label className="text-text-muted font-medium block">{t('editor.op.axis')}</label>
          <SegmentedControl
            ariaLabel={t('editor.op.axis')}
            fill
            compact
            value={p.axis}
            options={[
              { value: 'x', label: 'X' },
              { value: 'y', label: 'Y' },
              { value: 'z', label: 'Z' },
            ]}
            onChange={(axis) => onChange({ params: { ...p, axis } })}
          />
        </div>

        <NumberField
          label={t('editor.op.count')}
          value={p.count}
          min={2}
          max={200}
          step={1}
          onChange={(count) => onChange({ params: { ...p, count } }, `circ-count-${op.id}`)}
        />

        <NumberField
          label={t('editor.op.angle')}
          value={p.angle}
          min={1}
          max={360}
          step={15}
          onChange={(angle) => onChange({ params: { ...p, angle } }, `circ-angle-${op.id}`)}
        />

        <Toggle
          label={t('editor.op.merge')}
          checked={p.merge}
          onChange={(merge) => onChange({ params: { ...p, merge } })}
          compact
        />
      </div>
    )
  }

  if (op.kind === 'offset') {
    const p = (op as OffsetOp).params

    return (
      <div className="space-y-3 pt-2 text-xs" data-testid={`op-form-${op.id}`}>
        <LengthField
          label={t('editor.op.distance')}
          value={p.distance}
          min={-500}
          max={500}
          step={0.1}
          onChange={(distance) => onChange({ params: { ...p, distance } }, `offset-dist-${op.id}`)}
        />
      </div>
    )
  }

  if (op.kind === 'hollow') {
    const p = (op as HollowOp).params

    return (
      <div className="space-y-3 pt-2 text-xs" data-testid={`op-form-${op.id}`}>
        <LengthField
          label={t('editor.op.wall')}
          value={p.wall}
          min={0.1}
          max={100}
          step={0.1}
          onChange={(wall) => onChange({ params: { ...p, wall } }, `hollow-wall-${op.id}`)}
        />
      </div>
    )
  }

  if (op.kind === 'extrude' || op.kind === 'revolve') {
    return (
      <div className="pt-2 text-xs" data-testid={`op-form-${op.id}`}>
        {onEditFeature && (
          <button
            type="button"
            data-testid="op-edit-feature-btn"
            onClick={onEditFeature}
            className="w-full py-1.5 px-3 rounded bg-surface-3 hover:bg-surface-4 text-text text-center cursor-pointer border border-border"
          >
            {t('common.edit')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="pt-2 text-xs text-text-muted italic" data-testid={`op-form-${op.id}`}>
      {t('editor.op.unknown', 'Unknown operation')}
    </div>
  )
}
